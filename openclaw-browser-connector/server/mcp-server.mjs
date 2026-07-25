#!/usr/bin/env node
/**
 * MCP Server — 将 Browser Connector 的多客户端能力注册为 OpenClaw 工具。
 *
 * 工具列表：
 * 1. douyin_collect_comments — 采集评论
 * 2. douyin_browse_feed       — 浏览推荐流，发现热门视频
 * 3. douyin_list_clients       — 查看所有客户端状态和能力
 * 4. douyin_check_login        — 检查指定客户端是否已登录抖音
 *
 * Agent 通过这些工具感知各客户端的状态，智能选择用哪个客户端执行什么操作。
 */

const RELAY_URL = process.env.BROWSER_RELAY_URL || 'http://127.0.0.1:6008';

// 导入时间解析（让后端 LLM 理解时间语义）
let _parseUserIntent;
async function getParser() {
  if (!_parseUserIntent) {
    const mod = await import('./llm-parser.mjs');
    _parseUserIntent = mod.parseUserIntent;
  }
  return _parseUserIntent;
}

// 导入 LLM 采集引擎
let _llmCollect;
async function getLLMCollector() {
  if (!_llmCollect) {
    const mod = await import('./llm-collector.mjs');
    _llmCollect = mod.llmCollect;
  }
  return _llmCollect;
}

function log(level, msg) { console.error(`[mcp:${level}] ${msg}`); }

// ── 评论摘要 ────────────────────────────────

function makeCommentSummary(comments) {
  if (!comments || comments.length === 0) return { uniqueUsers: 0, avgLikes: 0, topKeywords: [] };
  const users = new Set(comments.map(c => c.nickname));
  const avgLikes = Math.round((comments.reduce((s, c) => s + (c.likes || 0), 0) / comments.length) * 10) / 10;
  const wordFreq = {};
  for (const c of comments) {
    (c.content || '').split('').forEach(ch => {
      if (/[一-龥]/.test(ch)) wordFreq[ch] = (wordFreq[ch] || 0) + 1;
    });
  }
  const topKeywords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  return { uniqueUsers: users.size, avgLikes, topKeywords };
}

// ── Relay API 封装 ────────────────────────────

async function call(method, params = {}, timeout = 120000, clientId = null) {
  // ★ 动态超时：批量操作（发多条消息）给更长的时间
  const dynamicTimeout = params._batchSize
    ? Math.max(timeout, params._batchSize * 15000)  // 每条消息 15s 预算
    : timeout;
  const body = { method, params, timeout: dynamicTimeout };
  if (clientId) body.clientId = clientId;
  const res = await fetch(`${RELAY_URL}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Unknown error');
  return data.result;
}

/**
 * 导航到指定 URL 并验证是否被重定向。
 * 如果被重定向到非目标域名（如登录页），抛出错误。
 * 返回实际落地页 URL。
 */
async function navigateTo(target, url, { waitUntil = 'load', timeout = 25000, allowRedirect = true } = {}) {
  const result = await call('browser.navigate', { url, waitUntil, timeout }, timeout, target);
  const finalUrl = result.url || '';
  const expectedHost = new URL(url).hostname;
  let actualHost;
  try { actualHost = new URL(finalUrl).hostname; } catch { actualHost = ''; }

  if (result.redirected && actualHost !== expectedHost) {
    log('warn', `导航被重定向: ${url.slice(0, 80)} → ${finalUrl.slice(0, 80)}`);
    // 常见重定向目标
    if (finalUrl.includes('login') || finalUrl.includes('passport')) {
      throw new Error(`抖音跳转到登录页，请确认客户端已登录`);
    }
    if (!allowRedirect) {
      throw new Error(`导航被重定向到: ${finalUrl}`);
    }
  }
  return finalUrl;
}

async function getHealth() {
  const res = await fetch(`${RELAY_URL}/health`);
  return res.json();
}

// ── 时间过滤工具 ────────────────────────────────

function timeRangeToCutoff(timeRange) {
  if (!timeRange || !timeRange.value || !timeRange.unit) return null;
  const msPerUnit = {
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000,
  };
  const ms = timeRange.value * (msPerUnit[timeRange.unit] || msPerUnit.months);
  return Date.now() - ms;
}

function filterCommentsByTime(comments, timeRange) {
  const cutoff = timeRangeToCutoff(timeRange);
  if (!cutoff) return { kept: comments, dropped: 0 };
  const kept = [];
  let dropped = 0;
  for (const c of comments) {
    if (!c.publishedAt) { kept.push(c); continue; }
    const date = new Date(c.publishedAt);
    if (!isNaN(date.getTime()) && date.getTime() >= cutoff) {
      kept.push(c);
    } else {
      dropped++;
    }
  }
  if (dropped > 0) {
    log('info', `⏳ 时间过滤: ${comments.length} → ${kept.length} (丢 ${dropped} 条, 要求 ${timeRange.value}${timeRange.unit}内)`);
  }
  return { kept, dropped };
}

// ── 抖音采集（LLM 驱动）────

async function doCollect({ keyword, count = 100, clientId = null, timeRange = null }) {
  const llmCollect = await getLLMCollector();
  return llmCollect({ keyword, count, clientId, timeRange });
}

// ── 旧的 doCollect 替代桩（不再使用）────
async function _doCollect_old({ keyword, count = 100, clientId = null, onProgress = null, timeRange = null }) {
  // 如果有时间范围，多采 50% 补偿过滤损失
  const targetCount = timeRange ? Math.min(Math.ceil(count * 1.5), 500) : count;

  const health = await getHealth();
  // 选客户端
  let target = clientId;
  if (!target) {
    for (const c of (health.clients || [])) {
      if (c.douyinLoggedIn) { target = c.clientId; break; }
    }
  }
  if (!target) throw new Error('没有可用的已登录客户端');

  // 检查登录
  const { loggedIn } = await call('browser.checkLogin', {}, 30000, target);
  if (!loggedIn) throw new Error(`客户端 ${target} 未登录抖音`);

  log('info', `开始采集: "${keyword}" 目标: ${count} 条${timeRange ? ` (时间限制: ${timeRange.value}${timeRange.unit}内)` : ''}`);

  // ── 第1步：搜索视频（浏览器滚动 + DOM 提取）──
  const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`;
  log('info', `导航到搜索页: ${searchUrl}`);
  const landedUrl = await navigateTo(target, searchUrl);
  log('info', `落地页: ${landedUrl.slice(0, 80)}`);
  await call('browser.randomDelay', { min: 1000, max: 2000 }, 5000, target);

  // 等待搜索结果加载
  try {
    await call('browser.waitForSelector', { selector: 'a[href*="/video/"]', timeout: 10000 }, 10000, target);
  } catch {
    log('warn', '搜索页未找到视频链接，可能无结果');
  }

  // 模拟人类滚动加载更多搜索结果
  const scrollRounds = Math.max(1, Math.ceil(targetCount / 8));
  for (let i = 0; i < Math.min(scrollRounds, 6); i++) {
    await call('browser.humanScroll', { totalPx: 800 + Math.floor(Math.random() * 400) }, 15000, target);
    await call('browser.randomDelay', { min: 400, max: 800 }, 5000, target);
  }

  // 从 DOM 提取搜索结果
  let searchVideos = [];
  try {
    const result = await call('browser.extractSearchVideos', { maxVideos: 50 }, 30000, target);
    searchVideos = result.videos || [];
  } catch (err) {
    log('warn', `extractSearchVideos 失败: ${err.message}`);
  }

  // 降级：用 getHtml + 解析
  if (searchVideos.length === 0) {
    log('warn', 'DOM 提取为空，尝试 HTML 降级解析');
    try {
      const { html } = await call('browser.getHtml', { maxLen: 300000 }, 15000, target);
      searchVideos = parseSearchHtml(html, 50);
    } catch { /* ignore */ }
  }

  log('info', `搜索发现 ${searchVideos.length} 个视频`);

  // ── 第2步：按点赞数降序排列 ──
  function parseLikes(v) {
    const raw = String(v.likes || '0').replace(/[,\s]/g, '');
    if (raw.endsWith('w') || raw.endsWith('万')) return parseFloat(raw) * 10000;
    if (raw.endsWith('k') || raw.endsWith('K')) return parseFloat(raw) * 1000;
    return parseFloat(raw) || 0;
  }
  searchVideos.sort((a, b) => parseLikes(b) - parseLikes(a));
  const topVideos = searchVideos.slice(0, Math.min(Math.ceil(targetCount / 5), 15)); // 每个视频预计 10+ 条评论

  log('info', `按点赞排序后取前 ${topVideos.length} 个视频开始采集`);

  // ── 第3步：逐个视频采集评论（浏览器滚动评论区）──
  const all = [];
  const dedup = new Set();

  for (let vi = 0; vi < topVideos.length && all.length < targetCount; vi++) {
    if (all.length >= targetCount) break;
    const v = topVideos[vi];
    const videoUrl = `https://www.douyin.com/video/${v.videoId}`;

    log('info', `[${vi + 1}/${topVideos.length}] 采集: ${v.title.slice(0, 30)} (👍${v.likes})  累计: ${all.length}/${targetCount}`);

    try {
      // 导航到视频页
      await navigateTo(target, videoUrl, { allowRedirect: false });
      await call('browser.randomDelay', { min: 1000, max: 2000 }, 5000, target);

      // 多策略激活评论区（来自 douyin-automation.mjs）
      await call('browser.activateCommentPanel', {}, 15000, target);
      await call('browser.randomDelay', { min: 500, max: 1000 }, 5000, target);

      // 滚动评论区加载评论（多轮滚动直到无新内容）
      const maxRounds = 6;
      let dryRounds = 0;

      for (let round = 0; round < maxRounds && dryRounds < 2; round++) {
        // 滚动评论区
        await call('browser.scrollComments', {
          px: 500 + Math.floor(Math.random() * 300),
          rounds: 2,
          pauseMin: 400,
          pauseMax: 900,
        }, 15000, target);

        // 提取当前可见评论
        const need = targetCount - all.length;
        const { comments = [] } = await call('browser.extractCommentsDOM', {
          maxComments: Math.min(need + 20, 100),
        }, 20000, target);

        // 去重 + 合并（附上作品链、评论链、作者主页链）
        let newInRound = 0;
        for (const c of comments) {
          if (all.length >= targetCount) break;
          const key = `${v.videoId}|${c.nickname}|${c.content}`;
          if (!dedup.has(key)) {
            dedup.add(key);
            all.push({
              ...c,
              videoUrl,
              videoTitle: v.title,
              videoAuthor: v.author,
              commentUrl: c.cid ? `${videoUrl}?comment_id=${c.cid}` : videoUrl,
              profileUrl: c.douyinId ? `https://www.douyin.com/user/${c.douyinId}` : '',
            });
            newInRound++;
          }
        }

        if (newInRound === 0) {
          dryRounds++;
        } else {
          dryRounds = 0;
        }

        // 达到目标立即停止滚动
        if (all.length >= targetCount) break;
      }

      log('info', `  → 累计 ${all.length}/${targetCount} 条评论`);
    } catch (err) {
      log('warn', `视频 ${v.videoId} 采集失败: ${err.message}`);
    }

    // 视频间随机停顿（模拟人类行为）
    if (all.length < targetCount && vi < topVideos.length - 1) {
      const delay = 2000 + Math.floor(Math.random() * 5000);
      log('info', `等待 ${(delay / 1000).toFixed(1)}s 后处理下一个视频...`);
      await call('browser.randomDelay', { min: 2000, max: 5000 }, 10000, target);
    }
  }

  log('info', `采集完成: ${all.length} 条评论 / ${topVideos.length} 个视频`);

  // ── 时间范围过滤 ──
  let finalComments = all;
  if (timeRange) {
    const { kept, dropped } = filterCommentsByTime(all, timeRange);
    finalComments = kept.slice(0, count);
    if (dropped > 0) {
      log('info', `⏳ 时间过滤后: ${finalComments.length} 条 (目标 ${count}, 多采了 ${all.length} 条中过滤掉 ${dropped} 条)`);
    }
  }

  return { keyword, total: finalComments.length, timeRange: timeRange || undefined, comments: finalComments };
}

// ── 视频搜索 ──────────────────────────────────

async function doSearch({ keyword, count = 20, sortBy = 'hot', clientId = null }) {
  const health = await getHealth();
  // 选客户端
  let target = clientId;
  if (!target) {
    for (const c of (health.clients || [])) {
      if (c.douyinLoggedIn) { target = c.clientId; break; }
    }
  }
  if (!target) throw new Error('没有可用的已登录客户端');

  // 检查登录
  const { loggedIn } = await call('browser.checkLogin', {}, 10000, target);
  if (!loggedIn) throw new Error(`客户端 ${target} 未登录抖音`);

  // 导航到搜索结果页
  const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`;
  await navigateTo(target, searchUrl);
  await call('browser.randomDelay', { min: 800, max: 1500 }, 5000, target);

  // 等待搜索结果
  try {
    await call('browser.waitForSelector', { selector: 'a[href*="/video/"]', timeout: 10000 }, 10000, target);
  } catch {
    // 可能没有结果
  }

  // 多滚几次加载更多
  const scrollRounds = Math.max(1, Math.ceil(count / 8));
  for (let i = 0; i < Math.min(scrollRounds, 5); i++) {
    await call('browser.humanScroll', { totalPx: 800 + Math.floor(Math.random() * 400) }, 15000, target);
    await call('browser.randomDelay', { min: 400, max: 800 }, 5000, target);
  }

  // 提取视频列表
  let videos = [];
  try {
    const result = await call('browser.extractSearchVideos', { maxVideos: count, keyword }, 30000, target);
    videos = result.videos || [];
  } catch (err) {
    // 降级：用 getHtml 手动提取
    console.error('[mcp] extractSearchVideos 失败，降级:', err.message);
    try {
      const { html } = await call('browser.getHtml', { maxLen: 200000 }, 15000, target);
      videos = parseSearchHtml(html, count);
    } catch {
      videos = [];
    }
  }

  return {
    ok: true,
    keyword,
    total: videos.length,
    videos: videos.slice(0, count).map(v => ({
      title: v.title || '',
      author: v.author || '',
      likes: v.likes || '',
      playCount: v.playCount || '',
      videoId: v.videoId || '',
      url: v.videoId ? `https://www.douyin.com/video/${v.videoId}` : '',
    })),
    hint: videos.length === 0
      ? `搜索"${keyword}"未找到视频。可能关键词太偏或页面结构变化。`
      : `找到 ${videos.length} 个关于"${keyword}"的视频。可选择感兴趣的视频用 douyin_collect_comments 深入采集评论。`,
  };
}

// 降级方案：从 HTML 中解析搜索结果
function parseSearchHtml(html, maxCount) {
  const videos = [];
  // 匹配 /video/123456 链接
  const videoRe = /\/video\/(\d+)/g;
  const seen = new Set();
  let m;
  while ((m = videoRe.exec(html)) !== null) {
    const id = m[1];
    if (id && !seen.has(id)) {
      seen.add(id);
      // 尝试提取标题（链接附近的文字）
      const pos = m.index;
      const context = html.slice(Math.max(0, pos - 500), pos + 200);
      const titleM = context.match(/>([^<]{5,100})<\/[a]>[^<]*$/);
      videos.push({
        title: titleM ? titleM[1].trim() : '',
        author: '',
        likes: '',
        playCount: '',
        videoId: id,
      });
      if (videos.length >= maxCount) break;
    }
  }
  return videos;
}

// ── MCP 协议 ──────────────────────────────────

async function main() {
  process.stdin.setEncoding('utf-8');
  let buffer = '';

  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }

      if (msg.method === 'tools/list') {
        respond(msg, { tools: listTools() });
      } else if (msg.method === 'tools/call') {
        await handleToolCall(msg);
      } else if (msg.method === 'initialize') {
        respond(msg, {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'douyin-multi-client', version: '2.0.0' },
          capabilities: { tools: {} },
        });
      }
    }
  });

  // 启动时检查 Relay
  try {
    const h = await getHealth();
    console.error(`[mcp] Relay: ${h.clients?.length || 0} 个客户端在线`);
  } catch { console.error('[mcp] ⚠️  Relay 未运行'); }
}

// ── 工具列表 ──────────────────────────────────

function listTools() {
  return [
    {
      name: 'douyin_collect_comments',
      description: '从抖音采集指定关键词的评论。Agent 会自动选择合适的已登录客户端执行。支持自然语言意图，如"帮我采集小龙虾的评论"、"找3个月内的想学车的学员"（时间范围会自动解析）。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词，可包含时间语义如"近3个月的驾校学员"' },
          count: { type: 'number', description: '目标评论数，默认 100', default: 100 },
          clientId: { type: 'string', description: '指定客户端 ID（可选，不指定则自动选）' },
        },
        required: ['keyword'],
      },
    },
    {
      name: 'douyin_browse_feed',
      description: '在指定客户端的抖音推荐流中浏览视频，发现热门内容和趋势。适合用户想"看看最近什么火"的场景。',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: '客户端 ID（可选，默认第一个已登录的）' },
          count: { type: 'number', description: '浏览视频数量，默认 20', default: 20 },
        },
      },
    },
    {
      name: 'douyin_list_clients',
      description: '列出所有已连接的客户端及其状态（在线、抖音是否已登录、正在执行的任务等）。Agent 在分配任务前应先用此工具了解各客户端能力。',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'douyin_check_login',
      description: '检查指定客户端是否已登录抖音。如果用户说"登录"或"扫码"，Agent 应引导用户在对应客户端的浏览器中完成登录。',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: '客户端 ID（可选，默认查全部）' },
        },
      },
    },
    {
      name: 'douyin_post_comment',
      description: '在视频评论区发布评论。⚠️ 有风控风险，仅在用户明确要求时使用。需要客户端已登录且当前在视频详情页。',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '评论内容，不超过500字' },
          clientId: { type: 'string', description: '客户端 ID（可选，默认第一个已登录的）' },
          videoUrl: { type: 'string', description: '视频链接（可选，如果不在视频页则先导航过去）' },
        },
        required: ['text'],
      },
    },
    {
      name: 'douyin_search_videos',
      description: '搜索指定关键词的视频列表，返回标题、作者、点赞数、播放量、链接。适合探索话题热度、发现热门内容。Agent 可用此工具了解某个话题下有哪些热门视频，再决定是否深入采集评论。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' },
          count: { type: 'number', description: '返回视频数量，默认 20', default: 20 },
          sortBy: { type: 'string', description: '排序方式：hot(最热，默认) 或 latest(最新)', default: 'hot' },
          clientId: { type: 'string', description: '指定客户端 ID（可选，不指定则自动选择）' },
        },
        required: ['keyword'],
      },
    },
  ];
}

// ── 工具调用分发 ──────────────────────────────

async function handleToolCall(msg) {
  const { name, arguments: args = {} } = msg.params || {};

  try {
    switch (name) {

      case 'douyin_collect_comments': {
        // 用 LLM 解析 keyword 中的时间语义（如"3个月内想学车的"）
        const parseUserIntent = await getParser();
        const intent = await parseUserIntent(args.keyword);
        const result = await doCollect({
          keyword: intent.keyword || args.keyword,
          count: args.count || intent.count || 100,
          clientId: args.clientId,
          timeRange: intent.timeRange || null,
        });

        // 构建增强的返回给卡多的内容
        const base = process.env.PUBLIC_BASE_URL || 'https://uu347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443';
        const summary = makeCommentSummary(result.comments || []);

        respond(msg, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              keyword: result.keyword,
              total: result.total,
              target: result.target,
              status: result.status || 'done',
              elapsedSec: result.elapsedSec,
              finishReason: result.finishReason,
              iterations: result.iterations, // LLM 决策轮数
              timeRange: result.timeRange || undefined,
              summary,
              // ★ 下载链接（卡多可告知用户）
              downloadLinks: {
                csv: `${base}/api/tasks/${result.taskId || 'latest'}/export?format=csv`,
                xls: `${base}/api/tasks/${result.taskId || 'latest'}/export`,
                json: `${base}/api/tasks/${result.taskId || 'latest'}/result`,
              },
              // 评论预览（前10条）
              preview: (result.comments || []).slice(0, 10).map(c => ({
                nickname: c.nickname,
                content: c.content?.slice(0, 60),
                likes: c.likes || 0,
                publishedAt: c.publishedAt || '',
              })),
              // 完整评论（当条数不太多时）
              comments: (result.comments || []).length <= 50
                ? result.comments.map(c => ({
                    nickname: c.nickname,
                    content: c.content,
                    likes: c.likes || 0,
                    publishedAt: c.publishedAt || '',
                    videoUrl: c.videoUrl || '',
                    videoTitle: c.videoTitle || '',
                    commentUrl: c.commentUrl || '',
                    profileUrl: c.profileUrl || '',
                  }))
                : undefined,
              hint: (result.comments || []).length > 50
                ? `共${result.total}条评论，数据较多。用户可访问下载链接获取完整数据，文件会自动下载到桌面 douyin-results 目录。`
                : `采集完成，${result.total}条评论。文件已推送到 Windows 客户端自动下载。`,
            }),
          }],
        });
        break;
      }

      case 'douyin_browse_feed': {
        const health = await getHealth();
        let clientId = args.clientId;
        if (!clientId) {
          const loggedIn = (health.clients || []).filter(c => c.douyinLoggedIn);
          if (!loggedIn.length) throw new Error('没有已登录抖音的客户端');
          clientId = loggedIn[0].clientId;
        }

        await call('browser.goHome', {}, 15000, clientId);
        const { videos = [] } = await call('browser.extractFeedVideos', {
          maxVideos: args.count || 20, scrollRounds: 5,
        }, 30000, clientId);

        respond(msg, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              clientId,
              count: videos.length,
              videos: videos.map(v => ({
                videoId: v.videoId,
                title: v.title,
                author: v.author,
                likes: v.likes,
                url: `https://www.douyin.com/video/${v.videoId}`,
              })),
            }),
          }],
        });
        break;
      }

      case 'douyin_list_clients': {
        const health = await getHealth();
        const clients = (health.clients || []).map(c => ({
          clientId: c.clientId,
          ip: c.ip,
          connectedAt: c.connectedAt,
          douyinLoggedIn: c.douyinLoggedIn,
          status: c.douyinLoggedIn ? 'ready' : 'login_required',
          capabilities: c.douyinLoggedIn
            ? ['collect_comments', 'browse_feed', 'search', 'post_comment', 'like']
            : ['needs_login'],
        }));

        respond(msg, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              total: clients.length,
              ready: clients.filter(c => c.douyinLoggedIn).length,
              clients,
              hint: clients.length === 0
                ? '暂无客户端连接。用户需要在其 Windows 上运行 browser-bridge。'
                : clients.filter(c => c.douyinLoggedIn).length === 0
                  ? '客户端已连接但都未登录抖音。请用户在浏览器中扫码登录。'
                  : `有 ${clients.filter(c => c.douyinLoggedIn).length} 个客户端可用。`,
            }),
          }],
        });
        break;
      }

      case 'douyin_check_login': {
        if (args.clientId) {
          try {
            const { loggedIn } = await call('browser.checkLogin', {}, 10000, args.clientId);
            respond(msg, {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  ok: true, clientId: args.clientId, loggedIn,
                  hint: loggedIn ? '客户端已登录，可以执行所有操作' : '客户端未登录，需要扫码登录',
                }),
              }],
            });
          } catch {
            respond(msg, {
              content: [{ type: 'text', text: JSON.stringify({ ok: true, clientId: args.clientId, loggedIn: false, error: '客户端未连接' }) }],
            });
          }
        } else {
          const health = await getHealth();
          const status = (health.clients || []).map(c => ({ clientId: c.clientId, loggedIn: c.douyinLoggedIn }));
          respond(msg, {
            content: [{
              type: 'text',
              text: JSON.stringify({ ok: true, clients: status }),
            }],
          });
        }
        break;
      }

      case 'douyin_post_comment': {
        const health = await getHealth();
        let cid = args.clientId;
        if (!cid) {
          const loggedIn = (health.clients || []).filter(c => c.douyinLoggedIn);
          if (!loggedIn.length) throw new Error('没有已登录的客户端');
          cid = loggedIn[0].clientId;
        }

        // 如果指定了视频链接，先导航过去
        if (args.videoUrl) {
          await call('browser.navigate', { url: args.videoUrl, waitUntil: 'domcontentloaded', timeout: 20000 }, 20000, cid);
          await new Promise(r => setTimeout(r, 1500));
          try { await call('browser.humanClick', { selector: '[class*="comment"]' }, 8000, cid); } catch {}
          await new Promise(r => setTimeout(r, 600));
        }

        const result = await call('browser.postComment', { text: args.text }, 15000, cid);
        respond(msg, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              clientId: cid,
              posted: result.posted,
              text: result.text,
              warning: '评论已发布。请注意抖音评论有频率限制，频繁操作可能导致账号受限。',
            }),
          }],
        });
        break;
      }

      case 'douyin_search_videos': {
        const searchResult = await doSearch({
          keyword: args.keyword,
          count: args.count || 20,
          sortBy: args.sortBy || 'hot',
          clientId: args.clientId,
        });
        respond(msg, {
          content: [{
            type: 'text',
            text: JSON.stringify(searchResult),
          }],
        });
        break;
      }

      default:
        respond(msg, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true });
    }
  } catch (err) {
    respond(msg, { content: [{ type: 'text', text: err.message }], isError: true });
  }
}

function respond(req, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
}

main().catch(err => { console.error('[mcp] Fatal:', err); process.exit(1); });
