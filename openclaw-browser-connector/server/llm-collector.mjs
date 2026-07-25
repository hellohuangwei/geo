/**
 * LLM Collector — ReAct 风格自适应采集引擎。
 *
 * 用 DeepSeek API 做采集决策。不再硬编码"搜索→排序→逐个采集"，
 * 而是让 LLM 观察每一步结果，自适应规划下一步。
 *
 * 自适应原理：
 *   硬编码逻辑 = 预定义的 if/else 规则，遇到什么情况都是同一套流程。
 *   本引擎 = 每步把当前状态 + 上步结果喂给 LLM 做决策，
 *   LLM 像人一样观察→判断→行动，所以能处理硬编码覆盖不了的场景。
 *
 * 工具调用通过 relay /call HTTP API 中转 → Windows bridge 执行。
 */

const LLM_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-pro';
const LLM_KEY = process.env.LLM_API_KEY || 'YOUR_DEEPSEEK_API_KEY';
const RELAY_URL = process.env.BROWSER_RELAY_URL || 'http://127.0.0.1:6008';
const MAX_LLM_ITERATIONS = 25; // 防止无限循环

// 给 LLM 的决策上下文长度
const MAX_CONTEXT_TOOLS = 30; // 历史中最多保留最近 30 条 tool result

// ── 工具定义（给 LLM 的 function calling schema）──

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_videos',
      description: '在抖音搜索视频，返回按热度排序的视频列表（含标题、作者、点赞、链接）。搜索无结果时返回空列表。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词，如"小龙虾"、"学车"、"装修"。可以尝试不同的词来扩大范围' },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_video',
      description: '打开一个视频详情页并激活评论区。返回视频标题、评论数状态、是否能正常访问。如果返回 needsLogin=true 则说明需要登录。调用此函数后可以用 collect_comments 提取评论。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '完整的视频 URL，如 https://www.douyin.com/video/123456789' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_comments',
      description: '滚动并提取当前已打开视频的评论区内容。每次调用滚动2-3轮然后返回新评论。如果连续调用返回空结果说明这个视频的评论已经采完了。重复调用直到 new.length===0 或采集量足够。',
      parameters: {
        type: 'object',
        properties: {
          max_new: { type: 'number', description: '期望本轮新采集的评论数，默认15。返回的评论数可能少于此数。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_state',
      description: '查看当前采集状态：已采集总数、目标数、当前在哪个视频、已搜索过的关键词、耗时等。在做决策前先调用它。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_collection',
      description: '结束采集任务。达到目标时调用 status="done"，如果无法达到目标但已经尽力则调用 status="partial"。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: "done（完成）、partial（部分完成）、failed（失败）" },
          reason: { type: 'string', description: '简短说明结束原因' },
        },
        required: ['status', 'reason'],
      },
    },
  },
];

// ── System Prompt ───────────────────────────────

function buildSystemPrompt(goal) {
  return `你是抖音评论采集员。你要采集「${goal.keyword || '指定关键词'}」的${goal.count}条评论${goal.timeRange ? `（${goal.timeRange.value}${goal.timeRange.unit === 'months' ? '个月' : goal.timeRange.unit === 'weeks' ? '周' : goal.timeRange.unit === 'days' ? '天' : '年'}内）` : ''}。

## 你的能力
你可以调用函数操作浏览器。每一步你会看到上一步的结果，然后决定下一步做什么。不是按固定流程走，而是像人一样看情况做判断。

## 可调用的函数
1. **search_videos(keyword)** → 搜索视频，返回列表(标题/作者/点赞/链接)。无结果时返回空列表。
2. **open_video(url)** → 打开视频页，激活评论区，返回标题和初始评论数。如果返回 needsLogin=true 则需要登录。
3. **collect_comments(max_new)** → 滚动评论区，提取新评论。返回新增条数和评论样本。同一视频可多次调用，返回空说明此视频已采完。
4. **get_state()** → 查看当前进度和状态。
5. **finish_collection(status, reason)** → 结束采集。

## 决策方式（重要！每步都是根据实际数据做判断）
你需要观察每步返回的**具体数据**来做决定，而不是机械重复：

### 根据搜索结果做判断
- 搜索结果多且标题相关 → 按点赞从高到低依次打开
- 搜索结果少或标题不太相关 → 换个词搜索（去掉修饰词、换近义词、或缩短关键词）
- 搜索返回0条 → 立即换词，不要反复搜同一个词

### 根据视频内容做判断
- open_video 返回的标题跟关键词无关 → 跳过这个视频
- 初始评论数=0 → 跳过这个视频（不用浪费时间 scroll）
- 评论样本看起来是刷的（全是"666""好评""支持"之类的模板） → 跳过

### 根据采集结果做判断
- collect_comments 连续2次返回 new=0 → 该视频已采完，换下一个
- 评论质量好（真实用户在讨论） → 多采几轮
- 累计数量接近目标 → 采集完当前视频就结束
- 一个视频采了5轮还有很多新评论 → 继续采这个视频

### 进度判断
- 达到目标 → finish_collection("done")
- 所有视频都采完了还不够 → finish_collection("partial"，说明情况）
- 连续换了几个搜索词都没结果 → finish_collection("partial")

## 重要
- 每步决策前尽量先 get_state() 了解进度
- 一个视频采了2-3轮 collect_comments 还没新鲜评论就换视频
- 不要反复搜同一个关键词
- 数量够了马上 finish，不要画蛇添足`;
}

// ── Relay 调用封装 ─────────────────────────────

async function relayCall(method, params = {}, timeout = 30000, clientId = null) {
  const body = { method, params, timeout };
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

async function getHealth() {
  const res = await fetch(`${RELAY_URL}/health`);
  return res.json();
}

// ── 工具执行器 ────────────────────────────────

function makeToolExecutor(clientId, state, allComments, dedupSet, onAnalysis) {
  return async function executeTool(name, args) {
    switch (name) {

      case 'search_videos': {
        const keyword = args.keyword.trim();
        state.keyword = keyword;
        state.searchedKeywords.push(keyword);
        state.currentVideo = null;

        onAnalysis('search', `搜索: "${keyword}"`);

        const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`;
        await relayCall('browser.navigate', { url: searchUrl, waitUntil: 'domcontentloaded', timeout: 20000 }, 25000, clientId);
        await relayCall('browser.randomDelay', { min: 800, max: 1500 }, 5000, clientId);

        // 等搜索结果加载
        try {
          await relayCall('browser.waitForSelector', { selector: 'a[href*="/video/"]', timeout: 8000 }, 10000, clientId);
        } catch { /* 可能无结果 */ }

        // 人类滚动加载更多
        for (let i = 0; i < 4; i++) {
          await relayCall('browser.humanScroll', { totalPx: 700 + Math.floor(Math.random() * 400) }, 15000, clientId);
          await relayCall('browser.randomDelay', { min: 300, max: 600 }, 5000, clientId);
        }

        // 提取搜索结果
        let videos = [];
        try {
          const result = await relayCall('browser.extractSearchVideos', { maxVideos: 30 }, 30000, clientId);
          videos = (result.videos || []).map(v => ({
            videoId: v.videoId,
            title: (v.title || '').slice(0, 80),
            author: v.author || '',
            likes: v.likes || '0',
            playCount: v.playCount || '',
            url: v.videoId ? `https://www.douyin.com/video/${v.videoId}` : '',
          }));
        } catch (e) {
          // 降级：HTML 解析
          try {
            const { html } = await relayCall('browser.getHtml', { maxLen: 200000 }, 15000, clientId);
            const seen = new Set();
            const re = /\/video\/(\d+)/g;
            let m;
            while ((m = re.exec(html)) !== null && videos.length < 30) {
              if (!seen.has(m[1])) { seen.add(m[1]); videos.push({ videoId: m[1], title: '', author: '', likes: '', playCount: '', url: `https://www.douyin.com/video/${m[1]}` }); }
            }
          } catch {}
        }

        // 按点赞排序
        function parseLikes(v) {
          const raw = String(v.likes || '0').replace(/[,\s]/g, '');
          if (raw.endsWith('w') || raw.endsWith('万')) return parseFloat(raw) * 10000;
          if (raw.endsWith('k') || raw.endsWith('K')) return parseFloat(raw) * 1000;
          return parseFloat(raw) || 0;
        }
        videos.sort((a, b) => parseLikes(b) - parseLikes(a));

        state.searchResults = videos;
        state.videoCursor = 0;

        onAnalysis('search_done', `找到 ${videos.length} 个视频，已按点赞排序${videos.length > 0 ? `，Top1: ${videos[0].title} (👍${videos[0].likes})` : ''}`);

        return JSON.stringify({
          total: videos.length,
          top_videos: videos.slice(0, 10).map(v => ({
            videoId: v.videoId,
            title: v.title,
            author: v.author,
            likes: v.likes,
            url: v.url,
          })),
          hint: videos.length === 0 ? '搜索无结果，试试更短或更通用的关键词' : `共${videos.length}个视频`,
        });
      }

      case 'open_video': {
        const url = args.url;
        const videoId = (url.match(/\/video\/(\d+)/) || [])[1] || 'unknown';
        state.currentVideo = { url, videoId };
        state.videoCursor++;

        onAnalysis('open_video', `打开视频: ${url.slice(0, 60)}`);

        await relayCall('browser.navigate', { url, waitUntil: 'domcontentloaded', timeout: 25000 }, 25000, clientId);
        await relayCall('browser.randomDelay', { min: 800, max: 1500 }, 5000, clientId);

        // 获取标题
        let title = '';
        try {
          const { text } = await relayCall('browser.getText', { maxLen: 2000 }, 10000, clientId);
          title = (text || '').split('\n')[0]?.slice(0, 80) || '';
        } catch {}

        // 激活评论区
        try {
          await relayCall('browser.activateCommentPanel', {}, 15000, clientId);
          await relayCall('browser.randomDelay', { min: 400, max: 800 }, 5000, clientId);
        } catch (e) {
          return JSON.stringify({ videoId, title, url, error: '无法激活评论区，页面可能需要登录', needsLogin: true });
        }

        // 快速检查评论（多取几条让 LLM 判断质量）
        let initialComments = [];
        try {
          const { comments } = await relayCall('browser.extractCommentsDOM', { maxComments: 8 }, 15000, clientId);
          initialComments = comments || [];
        } catch {}

        state.dryRoundsOnCurrentVideo = 0;

        // 把前几条实际评论内容给 LLM 看，让它判断质量
        const samples = initialComments.slice(0, 5).map(c =>
          `${c.nickname}: ${(c.content || '').slice(0, 50)}`
        );

        onAnalysis('video_opened', `${title || videoId} — ${initialComments.length} 条可见评论`);

        return JSON.stringify({
          videoId,
          title: title || '(未获取到标题)',
          url,
          initialCommentCount: initialComments.length,
          commentSamples: samples,
          // 帮 LLM 快速判断
          verdict: initialComments.length === 0 ? 'NO_COMMENTS'
            : initialComments.length < 3 ? 'FEW_COMMENTS'
            : 'HAS_COMMENTS',
        });
      }

      case 'collect_comments': {
        const maxNew = args.max_new || 15;
        if (!state.currentVideo) return JSON.stringify({ error: '请先调用 open_video 打开一个视频' });

        onAnalysis('collect', `滚动采集评论 (目标${maxNew}条)...`);

        // 滚动评论
        try {
          await relayCall('browser.scrollComments', {
            px: 500 + Math.floor(Math.random() * 300),
            rounds: 2 + Math.floor(Math.random() * 2),
            pauseMin: 300, pauseMax: 700,
          }, 15000, clientId);
        } catch {}

        // 提取评论
        let newComments = [];
        try {
          const result = await relayCall('browser.extractCommentsDOM', { maxComments: maxNew + 10 }, 20000, clientId);
          newComments = result.comments || [];
        } catch {}

        // 去重
        const fresh = [];
        for (const c of newComments) {
          const key = `${state.currentVideo.videoId}|${c.nickname}|${c.content}`;
          if (!dedupSet.has(key)) {
            dedupSet.add(key);
            fresh.push(c);
          }
        }

        // 更新状态
        const beforeCount = allComments.length;
        for (const c of fresh) {
          allComments.push({
            ...c,
            videoUrl: state.currentVideo.url,
            videoTitle: state.currentVideo.title || '',
            commentUrl: c.cid ? `${state.currentVideo.url}?comment_id=${c.cid}` : state.currentVideo.url,
          });
        }

        if (fresh.length === 0) {
          state.dryRoundsOnCurrentVideo = (state.dryRoundsOnCurrentVideo || 0) + 1;
        } else {
          state.dryRoundsOnCurrentVideo = 0;
        }

        const reachedEnd = state.dryRoundsOnCurrentVideo >= 2;

        onAnalysis('collected', `+${fresh.length} 条 | 累计 ${allComments.length}/${state.targetCount}${reachedEnd ? ' | 已采完' : ''}`);

        // 返回实际评论样本给 LLM，让它判断内容质量
        const samples = fresh.slice(0, 5).map(c =>
          `${c.nickname}: ${(c.content || '').slice(0, 60)}`
        );

        return JSON.stringify({
          new: fresh.length,
          totalCollected: allComments.length,
          target: state.targetCount,
          reachedEnd,
          dryRounds: state.dryRoundsOnCurrentVideo,
          samples,  // LLM 可据此判断评论质量
          hint: reachedEnd ? '此视频评论区已采完。' :
                fresh.length === 0 ? `连续${state.dryRoundsOnCurrentVideo}轮无新评论。` :
                `新增${fresh.length}条有效评论，可继续或换视频。`,
        });
      }

      case 'get_state': {
        const videosToGo = state.searchResults.length > 0
          ? state.searchResults.length - Math.max(0, state.videoCursor)
          : 0;

        return JSON.stringify({
          collected: allComments.length,
          target: state.targetCount,
          remaining: Math.max(0, state.targetCount - allComments.length),
          percentage: Math.round((allComments.length / state.targetCount) * 100),
          currentVideo: state.currentVideo ? {
            url: state.currentVideo.url,
            videoId: state.currentVideo.videoId,
          } : null,
          searchedKeywords: state.searchedKeywords,
          searchResultsAvailable: state.searchResults.length,
          videosProcessed: Math.max(0, state.videoCursor),
          videosRemaining: Math.max(0, videosToGo),
          dryRoundsOnCurrentVideo: state.dryRoundsOnCurrentVideo || 0,
          topRemainingVideos: state.searchResults.slice(Math.max(0, state.videoCursor), Math.max(0, state.videoCursor) + 5).map(v => ({
            videoId: v.videoId, title: v.title?.slice(0, 50), likes: v.likes,
          })),
          hint: allComments.length >= state.targetCount ? '已达到目标！可以 finish_collection' :
                state.dryRoundsOnCurrentVideo >= 2 ? '当前视频已采完，换下个视频或搜索新词' :
                '继续当前视频采集或换视频',
        });
      }

      case 'finish_collection': {
        state.finishStatus = args.status;
        state.finishReason = args.reason;
        return JSON.stringify({ status: args.status, reason: args.reason, totalCollected: allComments.length });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  };
}

// ── LLM 调用 ───────────────────────────────────

async function callLLM(messages) {
  // 控制上下文长度：system prompt + 最近 N 条 tool 交互
  const systemMsgs = messages.filter(m => m.role === 'system');
  const tailMsgs = messages.filter(m => m.role !== 'system').slice(-MAX_CONTEXT_TOOLS * 2);

  const trimmed = [...systemMsgs, ...tailMsgs];

  const res = await fetch(LLM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: trimmed,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

// ── 主入口 ─────────────────────────────────────

/**
 * LLM 驱动的评论采集。
 *
 * @param {Object} goal - { keyword, count, timeRange, clientId }
 * @param {Function} onAnalysis - 回调，推送分析事件给 relay/bridge
 * @returns {Object} { keyword, total, comments, finishStatus, finishReason, decisionLog }
 */
export async function llmCollect({ keyword, count = 100, timeRange = null, clientId = null, onAnalysis = null } = {}) {
  const startTime = Date.now();
  const allComments = [];
  const dedupSet = new Set();
  const decisionLog = [];

  const state = {
    keyword,
    targetCount: count,
    searchedKeywords: [],
    searchResults: [],
    videoCursor: 0,
    currentVideo: null,
    dryRoundsOnCurrentVideo: 0,
    finishStatus: null,
    finishReason: null,
  };

  const say = (phase, msg, extra = {}) => {
    console.log(`[llm-collector] [${phase}] ${msg}`);
    if (onAnalysis) onAnalysis({ phase, message: msg, ...extra });
  };

  // ── 检查连接 ──
  const health = await getHealth();
  let target = clientId;
  if (!target) {
    for (const c of (health.clients || [])) {
      if (c.douyinLoggedIn) { target = c.clientId; break; }
    }
  }
  if (!target) throw new Error('没有可用的已登录客户端');
  say('init', `客户端: ${target}`);

  // 确认登录
  const { loggedIn } = await relayCall('browser.checkLogin', {}, 10000, target);
  if (!loggedIn) throw new Error('客户端未登录抖音');
  say('init', '抖音已登录');

  const executeTool = makeToolExecutor(target, state, allComments, dedupSet,
    (phase, msg, extra) => say(phase, msg, { ...extra, collected: allComments.length }));

  // ── LLM 对话循环 ──
  const messages = [
    { role: 'system', content: buildSystemPrompt({ keyword, count, timeRange }) },
    { role: 'user', content: `开始采集。关键词: "${keyword}"，目标: ${count} 条评论。请先搜索视频。` },
  ];

  let iteration = 0;
  let finished = false;

  while (iteration < MAX_LLM_ITERATIONS && !finished) {
    iteration++;

    let response;
    try {
      response = await callLLM(messages);
    } catch (e) {
      say('error', `LLM 调用失败 (第${iteration}轮): ${e.message}`);
      // 如果已经有一些结果，继续尝试；否则失败
      if (allComments.length > 0) {
        say('warn', `LLM 故障但已有 ${allComments.length} 条结果，使用降级策略完成`);
        break;
      }
      throw new Error(`LLM 调用失败且无已采集数据: ${e.message}`);
    }

    const choice = response.choices?.[0];
    if (!choice) {
      say('warn', `LLM 返回空 (第${iteration}轮)`);
      break;
    }

    const msg = choice.message;

    // 检查是否有 tool_calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // 记录 LLM 的思考（如果有 content）
      if (msg.content) {
        messages.push({ role: 'assistant', content: msg.content });
        decisionLog.push({ iteration, type: 'thought', content: msg.content });
      }

      // 添加 assistant 的 tool_calls 消息
      messages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      });

      // 执行每个工具调用
      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name;
        const fnArgs = JSON.parse(tc.function.arguments || '{}');

        say('decision', `${fnName}(${JSON.stringify(fnArgs).slice(0, 80)})`, {
          decision: fnName,
          reasoning: msg.content?.slice(0, 120) || '',
        });

        decisionLog.push({ iteration, type: 'tool_call', name: fnName, args: fnArgs });

        const result = await executeTool(fnName, fnArgs);

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });

        if (fnName === 'finish_collection') {
          finished = true;
          break;
        }
      }
    } else if (msg.content) {
      // LLM 返回了纯文本（可能是思考/总结）
      messages.push({ role: 'assistant', content: msg.content });
      decisionLog.push({ iteration, type: 'thought', content: msg.content });

      // 检查文本中是否隐含 "采集够了" 之类的信号
      if (/达到了|够了|完成了|结束|停止|finish|done|完成/.test(msg.content) && allComments.length > 0) {
        say('decision', 'LLM 文本暗示采集完成，触发 finish', { decision: 'finish', reasoning: msg.content.slice(0, 120) });
        finished = true;
      } else if (allComments.length >= count) {
        // 数量已达标但 LLM 没调 finish，强制结束
        say('decision', '数量已达标，强制结束', { decision: 'force_finish', reasoning: `已采集 ${allComments.length} >= ${count}` });
        finished = true;
      }
    } else {
      // 空响应
      say('warn', `LLM 返回空消息 (第${iteration}轮)`);
      break;
    }
  }

  // ── LLM 循环结束 ──

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const finalStatus = allComments.length >= count ? 'done'
    : allComments.length > 0 ? 'partial'
    : 'failed';

  const result = {
    keyword,
    collectedAt: new Date().toISOString(),
    total: allComments.length,
    target: count,
    elapsedSec: elapsed,
    status: finalStatus,
    finishReason: state.finishReason || (allComments.length >= count ? '达到目标数量' : allComments.length > 0 ? '部分完成' : '采集失败'),
    iterations: iteration,
    decisionLog,
    comments: allComments.slice(0, count),
  };

  say(finalStatus === 'done' ? 'done' : 'warn',
    `结束: ${result.total}/${result.target} 条 | ${elapsed}s | ${iteration} 轮决策`,
    { decision: finalStatus, reasoning: result.finishReason });

  return result;
}
