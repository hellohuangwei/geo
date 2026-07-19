import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9222';
const MAX_CONCURRENT_VIDEO = 1;
const SEARCH_SCROLL_STEP = 900;
const COMMENT_SCROLL_STEP = 720;
const MAX_EMPTY_COMMENT_API = 3;

const args = process.argv.slice(2);
const keyword = (args[0] === '--json' || args[0] === '--stream' ? '' : args[0]) || '';
const targetCount = parseInt(args[1]) || 100;
const jsonMode = args.includes('--json');
const streamMode = args.includes('--stream');

const progressLog = [];

function plog(type, msg) {
  const entry = { time: new Date().toISOString(), type, msg };
  progressLog.push(entry);
  if (jsonMode) console.error('[DEBUG]', msg);
  else console.log(`[${type}]`, msg);
}

function log(...msgs) {
  if (jsonMode) console.error('[DEBUG]', ...msgs);
  else console.log(...msgs);
}

function jsonOut(data) {
  console.log('===JSON_START===');
  console.log(JSON.stringify({ comments: data, progress: progressLog }));
  console.log('===JSON_END===');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkLoginStatus(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    const loginText = /登录|扫码登录|密码登录|手机号登录|请先登录|立即登录/.test(bodyText);
    const loginModal = document.querySelector('[class*="login-modal"], [class*="LoginModal"], [class*="login-mask"], [class*="passport"]');
    const avatar = document.querySelector('[data-e2e="user-avatar"], [class*="avatar"], img[class*="avatar"], [class*="user-info"] img');
    const userMenu = document.querySelector('[data-e2e="user-info"], [class*="user-center"], [class*="account"], [class*="Account"]');
    if (loginModal) return false;
    if ((avatar || userMenu) && !loginText) return true;
    return document.cookie.includes('passport_csrf_token') || document.cookie.includes('sessionid');
  }).catch(() => false);
}
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1) + min); }
function tryGet(fn, fallback) { try { return fn(); } catch { return fallback; } }
function now() { return Date.now(); }
function avg(values) { return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0; }


class CommentCache {
  constructor() {
    this.keys = new Set();
  }

  add(item) {
    const key = `${item.videoUrl || ''}|${item.nickname || ''}|${item.content || ''}`;
    if (!item.content || this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }
}

class VideoCache {
  constructor(page, keyword) {
    this.page = page;
    this.keyword = keyword || '';
    this._hasSearchResults = false;
    this.items = [];
    this.hrefs = new Set();
    this.visitedVideoIds = new Set();
    this.cursor = 0;
    this._idQueue = [];
    this._onResponse = null;
  }

  // ---- 核心：从抖音 API 响应中提取视频 ID（不依赖 DOM） ----
  _handleResponse(response) {
    const url = response.url();
    if (!url.includes('douyin.com')) return;
    // 区分搜索 API 和普通 feed/推荐 API
    const isSearchApi = /search\/item|search\/video|general\/search/i.test(url);
    const isFeedOrRecommend = /\/feed\/|homepage\/feed|recommend/i.test(url) && !isSearchApi;
    const isOtherAweme = /(\/aweme\/|item_list|\/v\d\/feed)/i.test(url) && !isSearchApi && !isFeedOrRecommend;
    // 有关键词搜索时：只使用搜索 API 结果，忽略推荐/feed 混入的无关视频
    if (this.keyword) {
      if (isFeedOrRecommend) {
        if (this._hasSearchResults) return;
        if (this.items.length > 0) return;
      }
      if (!isSearchApi && !isOtherAweme) return;
    } else {
      if (!isSearchApi && !isFeedOrRecommend && !isOtherAweme) return;
    }
    response.json().then(json => {
      const ids = extractAwemeIds(json);
      if (ids.length > 0 && isSearchApi) this._hasSearchResults = true;
      for (const id of ids) {
        const href = `https://www.douyin.com/video/${id}`;
        if (this.hrefs.has(href) || this.visitedVideoIds.has(id)) continue;
        this.hrefs.add(href);
        this._idQueue.push({ href, id, text: '', index: this.items.length, top: 0, left: 0, width: 0, height: 0, fromSearch: isSearchApi });
      }
    }).catch(() => {});
  }

  async prime() {
    // 1) 拦截 API 响应获取视频 ID
    this._onResponse = this._handleResponse.bind(this);
    this.page.on('response', this._onResponse);
    log('  VideoCache: response interception ON');

    // 2) 滚动触发 feed 加载
    await this._scrollToLoad(5);

    // 3) DOM 回退
    await this._appendDomLinks();

    // 将拦截到的 ID 放入 items
    this._flushQueue();
    log(`  VideoCache prime: ${this.items.length} videos`);
  }

  _flushQueue() {
    for (const item of this._idQueue) {
      if (this.visitedVideoIds.has(item.id)) continue;
      this.items.push(item);
    }
    this._idQueue = [];
  }

  async _scrollToLoad(rounds) {
    for (let i = 0; i < rounds; i++) {
      await this.page.evaluate((step) => {
        const s = document.scrollingElement || document.documentElement;
        if (s) s.scrollTop += step;
      }, SEARCH_SCROLL_STEP).catch(() => {});
      await sleep(400);
      this._flushQueue();
      if (this.items.length > 0) return;
    }
  }

  // DOM 回退：查找 <a href="/video/..."> 标签
  async _appendDomLinks() {
    this._flushQueue();
    const before = this.items.length;
    const links = await this.page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href*="/video/"]')];
      return anchors.map((a, idx) => {
        const rect = a.getBoundingClientRect();
        return {
          href: a.href,
          text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 120),
          index: idx,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      }).filter(it => it.href && it.href.includes('/video/'));
    }).catch(() => []);

    for (const item of links) {
      const id = videoIdFromUrl(item.href);
      if (!id || this.hrefs.has(item.href) || this.visitedVideoIds.has(id)) continue;
      this.hrefs.add(item.href);
      this.items.push({ ...item, id });
    }
    const added = this.items.length - before;
    if (added > 0) log(`  VideoCache DOM +${added}, total ${this.items.length}`);
  }

  async ensureAvailable() {
    this._flushQueue();
    if (this.cursor < this.items.length) return true;
    for (let i = 0; i < 8 && this.cursor >= this.items.length; i++) {
      await this._scrollToLoad(1);
      this._flushQueue();
      if (this.cursor < this.items.length) return true;
      await this._appendDomLinks();
    }
    return this.cursor < this.items.length;
  }

  async next() {
    while (await this.ensureAvailable()) {
      const item = this.items[this.cursor++];
      if (!item || this.visitedVideoIds.has(item.id)) continue;
      this.visitedVideoIds.add(item.id);
      return item;
    }
    return null;
  }

  detach() {
    if (this._onResponse) {
      this.page.off('response', this._onResponse);
      this._onResponse = null;
    }
  }
}

// ---- 从抖音 API JSON 中提取 aweme_id ----
function extractAwemeIds(obj) {
  const ids = [];
  const seen = new Set();
  function visit(node, depth) {
    if (!node || typeof node !== 'object' || ids.length > 300 || depth > 12) return;
    // 标准抖音视频 ID 字段
    for (const key of ['aweme_id', 'awemeId', 'awemeid', 'item_id']) {
      const v = node[key];
      if ((typeof v === 'string' && v.length > 15) || (typeof v === 'number' && v > 1000000)) {
        const s = String(v);
        if (!seen.has(s)) { seen.add(s); ids.push(s); }
      }
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
    } else {
      const vals = Object.values(node);
      for (const v of vals) {
        if (v && typeof v === 'object') visit(v, depth + 1);
      }
    }
  }
  visit(obj, 0);
  log(`  extractAwemeIds: found ${ids.length} ids`);
  return ids;
}

async function antiDetect(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    delete Object.getPrototypeOf(navigator).webdriver;
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5], configurable: false });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    const origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (params) => (
      params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : origQuery(params)
    );
    window.chrome = { runtime: {}, loadTimes() {}, csi() {} };
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  });

  const cdpSession = await page.context().newCDPSession(page).catch(() => null);
  if (cdpSession) {
    await cdpSession.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        if (window.__proto__) delete window.__proto__._puppeteer_;
      `
    }).catch(() => {});
  }
}


async function main() {
  plog('start', `关键词: "${keyword || '(当前页面)'}"  目标: ${targetCount} 条`);

  // 连接当前 Edge，必须已开启 --remote-debugging-port=9222
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    log('Connected to existing Edge');
  } catch {
    throw new Error('请先启动带 --remote-debugging-port=9222 的 Edge 浏览器');
  }

  const ctx = browser.contexts()[0];
  let searchPage = null;
  let commentCollector = null;

  try {
    // 后台静默模式：在后台标签页操作抖音，不跳转、不抢焦点，用户始终留在 GEO 页面
  const existingDouyinPage = ctx.pages().find(p => {
    const u = tryGet(() => p.url(), '');
    return u.includes('douyin.com') && !u.includes('/video/');
  });
  if (existingDouyinPage) {
    searchPage = existingDouyinPage;
    log('Reusing existing Douyin tab (background)');
  } else {
    searchPage = await ctx.newPage();
    log('Opened Douyin tab (background)');
  }
  await antiDetect(searchPage);
  // 后台导航到抖音，不切前台
  if (!tryGet(() => searchPage.url(), '').includes('douyin.com')) {
    await searchPage.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  }
  let initialLoggedIn = await checkLoginStatus(searchPage);
  if (!initialLoggedIn) {
    // 未登录时才切到前台让用户扫码登录
    log('Not logged in, bringing Douyin to front for login...');
    await searchPage.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await searchPage.bringToFront().catch(() => {});
    plog('login', 'Waiting up to 90s for manual login...');
    for (let i = 0; i < 60; i++) {
      await sleep(1500);
      if (await checkLoginStatus(searchPage)) {
        initialLoggedIn = true;
        log('Login detected!');
        break;
      }
    }
    if (!initialLoggedIn) throw new Error('Douyin login required');
  }
  const searchStart = now();
  if (keyword) {
    const normalizedKeyword = keyword.trim();
    const searchUrl = buildSearchUrl(normalizedKeyword);
    log(`Automation keyword: "${normalizedKeyword}"`);
    // 后台搜索：优先用搜索框 API（无需前台），否则 URL 导航（也在后台完成）
    const onDouyin = tryGet(() => searchPage.url(), '').includes('douyin.com');
    if (onDouyin && await forceSearchKeyword(searchPage, normalizedKeyword)) {
      log('Local search via search box (background)');
    } else {
      log('Fallback: full page navigation (background)');
      await searchPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    }
    await searchPage.locator('a[href*="/video/"]').first().waitFor({ timeout: 12000 }).catch(() => {});
    await clearDouyinSearchState(searchPage, normalizedKeyword);
    const verified = await verifySearchKeyword(searchPage, normalizedKeyword);
    log(`  Visible keyword after submit: "${verified.visibleKeyword || '(not found)'}"`);
    log(`  URL keyword after submit: "${verified.urlKeyword || '(not found)'}"`);
    if (!verified.ok) {
      const actual = `visible="${verified.visibleKeyword || ''}", urlKeyword="${verified.urlKeyword || ''}", url="${verified.currentUrl || tryGet(() => searchPage.url(), '')}"`;
      throw new Error(`Douyin search keyword mismatch. expected="${normalizedKeyword}", actual ${actual}`);
    }
  } else {
    await searchPage.goto('https://www.douyin.com/jingxuan', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await searchPage.locator('a[href*="/video/"]').first().waitFor({ timeout: 12000 }).catch(() => {});
  }
  plog('search', `搜索页就绪，耗时 ${now() - searchStart}ms`);

  const videoCache = new VideoCache(searchPage, keyword);
  await videoCache.prime();
  if (videoCache.items.length === 0) {
    log('No video links found on search page');
    if (jsonMode) jsonOut([]);
    return;
  }

  const commentCache = new CommentCache();
  commentCollector = createCommentCollector(ctx);
  commentCollector.start();

  const allComments = [];
  const stats = { videoTimes: [], commentTimes: [], apiTimes: [] };
  let stopped = false;
  let videoCount = 0;

  async function worker(workerId) {
    while (!stopped && allComments.length < targetCount) {
      const video = await videoCache.next();
      if (!video) break;
      const start = now();
      videoCount++;
      const videoId = video.id || videoIdFromUrl(video.href || '');
      const videoUrl = `https://www.douyin.com/video/${videoId}`;
      log(`\n--- Worker ${workerId} Video ${videoCount} --- ${videoUrl.substring(0, 80)}`);

      // 局部刷新模式：直接在搜索页调用抖音评论 API，不打开新标签、不跳转页面
      const batch = await collectVideoComments(ctx, searchPage, commentCollector, commentCache, keyword, videoUrl, stats);
      for (const item of batch) {
        if (allComments.length >= targetCount) break;
        allComments.push(item);
      }

      stats.videoTimes.push(now() - start);
      log(`  +${batch.length} comments | Total: ${allComments.length}/${targetCount} | video ${now() - start}ms`);

      if (streamMode && batch.length > 0) {
        console.log('===BATCH_START===');
        console.log(JSON.stringify({
          batch: videoCount,
          videoUrl,
          comments: batch,
          accumulated: allComments.length,
          target: targetCount,
          done: allComments.length >= targetCount,
        }));
        console.log('===BATCH_END===');
      }

      if (batch.length > 0) {
        plog('collect', `视频${videoCount}: +${batch.length}条  累计: ${allComments.length}/${targetCount}`);
      } else {
        plog('skip', `视频${videoCount}: 无评论`);
      }

      if (allComments.length >= targetCount) {
        stopped = true;
        break;
      }
    }
  }

  await Promise.all(Array.from({ length: MAX_CONCURRENT_VIDEO }, (_, i) => worker(i + 1)));

  const finalComments = allComments.slice(0, targetCount);
  const totalTime = stats.videoTimes.reduce((a, b) => a + b, 0);
  plog('stats', `API平均耗时 ${avg(stats.apiTimes)}ms，视频平均耗时 ${avg(stats.videoTimes)}ms，评论平均耗时 ${avg(stats.commentTimes)}ms`);
  log(`\nDone: ${finalComments.length} total comments, ${videoCount} videos (target: ${targetCount})`);
  log(`Avg/video=${avg(stats.videoTimes)}ms Avg/comment=${finalComments.length ? Math.round(totalTime / finalComments.length) : 0}ms`);

  if (streamMode) {
    console.log('===DONE===');
    console.log(JSON.stringify({ total: finalComments.length, target: targetCount, progress: progressLog }));
  } else if (jsonMode) {
    jsonOut(finalComments);
  } else {
    finalComments.forEach((c, i) => {
      console.log(`[${i + 1}] ${c.nickname}  ${c.publishedAt || ''}`);
      console.log(`    ${c.content.substring(0, 120)}`);
    });
  }

  } finally {
    if (commentCollector) {
      try { commentCollector.stop(); } catch {}
    }
    // 局部刷新模式：采集过程不创建新标签页，无需清理
    log('Collection complete, browser stays open with all tabs intact');
  }

  setTimeout(() => process.exit(0), 250);
}


async function collectVideoCommentsLegacy(searchPage, commentCache, kw, videoUrl, stats) {
  const commentStart = now();

  const videoId = videoIdFromUrl(videoUrl);
  if (!videoId) {
    log('  No videoId from url: ' + videoUrl);
    return [];
  }

  // 局部刷新模式：直接在搜索页静默调用抖音评论 API，无需打开视频页面
  let allComments = await fetchCommentApi(searchPage, videoId);

  if (allComments.length === 0) {
    // 重试：可能是网络波动
    log('  First API call empty, retrying...');
    await sleep(2000);
    allComments = await fetchCommentApi(searchPage, videoId);
  }

  // 去重
  const deduped = [];
  for (const item of allComments) {
    const normalized = { ...item, keyword: kw, videoUrl };
    if (!commentCache.add(normalized)) continue;
    deduped.push(normalized);
  }
  stats.commentTimes.push(now() - commentStart);
  log(`  Comments collected: ${deduped.length}`);
  return deduped;
}

// ---- 直接 fetch 抖音评论 API（后台静默请求，模拟视频详情页发起）----
async function collectVideoComments(ctx, searchPage, commentCollector, commentCache, kw, videoUrl, stats) {
  const commentStart = now();

  const videoId = videoIdFromUrl(videoUrl);
  if (!videoId) {
    log('  No videoId from url: ' + videoUrl);
    return [];
  }

  let detailPage = null;
  let allComments = [];

  try {
    detailPage = await ctx.newPage();
    await antiDetect(detailPage).catch(() => {});
    const marker = commentCollector.mark(detailPage);
    log('  Opening video detail page for comment collection...');
    await detailPage.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch((e) => {
      log(`  Video detail navigation warning: ${e.message}`);
    });
    await detailPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await activateCommentPanel(detailPage);
    allComments = await commentCollector.collectVideo(detailPage, kw, videoUrl, marker, stats);

    if (allComments.length === 0) {
      log('  Detail page intercept empty, trying detail-page API fetch...');
      allComments = await fetchCommentApi(detailPage, videoId, stats);
    }
  } finally {
    if (detailPage) {
      await detailPage.close().catch(() => {});
    }
  }

  if (allComments.length === 0) {
    log('  Detail page returned empty, retrying from search page API...');
    await sleep(1000);
    allComments = await fetchCommentApi(searchPage, videoId, stats);
  }

  const deduped = [];
  for (const item of allComments) {
    const normalized = { ...item, keyword: kw, videoUrl };
    if (!commentCache.add(normalized)) continue;
    deduped.push(normalized);
  }
  stats.commentTimes.push(now() - commentStart);
  log(`  Comments collected: ${deduped.length}`);
  return deduped;
}

async function fetchCommentApi(page, videoId, stats = null) {
  const all = [];
  let cursor = 0;
  const MAX_PAGES = 30;
  const PAGE_SIZE = 50;
  const videoUrl = `https://www.douyin.com/video/${videoId}`;

  for (let p = 0; p < MAX_PAGES; p++) {
    const apiUrl = `https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=${videoId}&cursor=${cursor}&count=${PAGE_SIZE}&item_type=0`;
    const result = await page.evaluate(async ({ url, referer }) => {
      try {
        const res = await fetch(url, {
          credentials: 'include',
          headers: {
            'Referer': referer,
            'Accept': 'application/json, text/plain, */*',
          },
        });
        const text = await res.text();
        return JSON.parse(text);
      } catch (e) {
        return { _error: e.message };
      }
    }, { url: apiUrl, referer: videoUrl }).catch(() => ({ _error: 'evaluate failed' }));

    if (result._error) { log(`  API page ${p} error: ${result._error}`); break; }

    const comments = result.comments || [];
    for (const c of comments) {
      const user = c.user || {};
      all.push({
        nickname: user.nickname || '抖音用户',
        douyinId: user.sec_uid || user.unique_id || user.short_id || user.uid || '',
        avatarUrl: user.avatar_thumb?.url_list?.[0] || user.avatar_medium?.url_list?.[0] || '',
        content: String(c.text || '').trim().slice(0, 500),
        publishedAt: c.create_time ? new Date(c.create_time * 1000).toISOString() : '',
        likes: c.digg_count || 0,
        replyCount: c.reply_comment_total || 0,
      });
    }

    log(`  API page ${p}: ${comments.length} comments, cursor=${cursor}, has_more=${result.has_more}`);

    if (comments.length === 0) break;
    if (!result.has_more) break;
    cursor = result.cursor;
    await sleep(rand(150, 400));
  }

  return all;
}


async function activateCommentPanel(page) {
  // 先滚动页面让评论区可见（评论区通常在视频下方或右侧）
  await page.evaluate(() => {
    const s = document.scrollingElement || document.documentElement;
    if (s) s.scrollTop += 400; // 滚动到评论区区域
  }).catch(() => {});
  await sleep(400);

  const activated = await page.evaluate(() => {
    // 策略 0：先尝试点击评论区排序标签（"按热度"/"按时间"），这能直接激活评论区
    const sortLabels = [...document.querySelectorAll('*')].filter(el => {
      const text = (el.innerText || el.textContent || '').trim();
      const rect = el.getBoundingClientRect();
      return (text === '按热度' || text === '按时间' || text === '综合' || text === '最新')
        && rect.width > 10 && rect.height > 8 && rect.width < 200;
    });
    if (sortLabels.length > 0) {
      sortLabels[0].click();
      return 'clicked-sort:' + sortLabels[0].innerText;
    }

    // 策略 1：CSS 选择器
    const directSelectors = [
      '[data-e2e*="comment"]',
      '[aria-label*="评论"]',
      '[aria-label*="comment" i]',
      'button[class*="comment" i]',
      '[role="button"][class*="comment" i]',
      '[class*="comment" i][class*="icon" i]',
      '[class*="CommentIcon"]',
      '[class*="comment-icon"]',
      '.comment-tab',
      '[class*="CommentTab"]',
    ];
    for (const selector of directSelectors) {
      const candidates = [...document.querySelectorAll(selector)].filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width >= 12
          && rect.height >= 12
          && rect.width <= 260
          && rect.height <= 260
          && rect.bottom > 0
          && rect.top < window.innerHeight;
      });
      if (candidates.length > 0) {
        candidates[0].click();
        return 'clicked-selector:' + selector;
      }
    }

    // 策略 2：精确文本匹配 "评论"
    const allEls = [...document.querySelectorAll('span, div, button, a, p, li')];
    for (const el of allEls) {
      const text = (el.innerText || el.textContent || '').trim();
      const rect = el.getBoundingClientRect();
      if ((text === '评论' || text === '评论区' || /^\d+条?评论$/.test(text) || /^\d+\.?\d*万?条?评论$/.test(text))
          && rect.width > 15 && rect.height > 10 && rect.width < 400
          && rect.bottom > 0 && rect.top < window.innerHeight) {
        el.click();
        return 'clicked-text:' + text;
      }
    }

    // 策略 3：宽泛查找含 "评论" 的元素
    const broadEls = [...document.querySelectorAll('*')];
    for (const el of broadEls) {
      const text = (el.innerText || '').slice(0, 50).trim();
      if (text.includes('评论') || text.includes('条评')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10 && rect.width < 400
            && rect.bottom > 0 && rect.top < window.innerHeight) {
          el.click();
          return 'clicked-broad:' + text.substring(0, 20);
        }
      }
    }

    // 策略 4：尝试点击评论区容器内的元素
    const commentContainers = [...document.querySelectorAll('[class*="comment" i], [class*="Comment"], [id*="comment" i], [id*="Comment"]')];
    for (const container of commentContainers) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100 && rect.bottom > 0 && rect.top < window.innerHeight) {
        // 在容器内找可点击的元素
        const clickable = container.querySelector('button, a, [role="button"], [onclick], span, div');
        if (clickable) {
          clickable.click();
          return 'clicked-container-child';
        }
        container.click();
        return 'clicked-container';
      }
    }

    return 'not-found';
  }).catch(() => 'error');
  log(`  Comment activation: ${activated}`);

  // 激活后等待评论 API 加载
  await waitForMutationOrTimeout(page, 600);
}

async function scrollCommentContainer(page) {
  return page.evaluate((step) => {
    // 优先找专门包含评论的滚动容器
    const candidates = [...document.querySelectorAll('div, section, main, ul, aside')].filter(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      // 必须有垂直滚动条或可滚动
      const isScrollable = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 50;
      if (!isScrollable) return false;
      // 必须在可见区域内或有合理尺寸
      return rect.width > 200 && rect.height > 120;
    });

    // 按包含评论关键字和位置评分排序
    const scored = candidates.map(el => {
      const text = (el.innerText || '').slice(0, 500);
      const rect = el.getBoundingClientRect();
      let score = el.scrollHeight - el.clientHeight; // 基础分：可滚动量
      if (text.includes('评论') || text.includes('条评') || text.includes('回复')) score += 10000;
      if (text.includes('按热度') || text.includes('按时间')) score += 5000;
      if (rect.left > window.innerWidth * 0.3) score += 3000; // 偏右侧（评论区常见位置）
      return { el, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const target = scored[0]?.el
      || document.scrollingElement
      || document.documentElement;
    const before = target.scrollTop;
    target.scrollTop += step;
    return { moved: target.scrollTop !== before, top: target.scrollTop, max: target.scrollHeight - target.clientHeight };
  }, COMMENT_SCROLL_STEP).catch(() => ({ moved: false, top: 0, max: 0 }));
}

function buildSearchUrl(value) {
  return `https://www.douyin.com/search/${encodeURIComponent(value)}?type=video&source=normal_search`;
}

function normalizeKeywordText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, '').trim();
}

function sameKeyword(left, right) {
  return normalizeKeywordText(left) === normalizeKeywordText(right);
}

function keywordFromSearchUrl(url) {
  const match = String(url || '').match(/\/search\/([^/?#]+)/);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

async function readSearchKeyword(page) {
  return page.evaluate(() => {
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 80
        && rect.height > 12
        && rect.top < 180;
    }
    function fieldScore(el) {
      const rect = el.getBoundingClientRect();
      const text = [
        el.getAttribute('placeholder'),
        el.getAttribute('aria-label'),
        el.getAttribute('class'),
        el.getAttribute('id'),
        el.getAttribute('type'),
      ].join(' ').toLowerCase();
      let score = 0;
      if (text.includes('search') || text.includes('搜索') || text.includes('keyword')) score += 100;
      if (rect.top < 120) score += 20;
      score += Math.min(rect.width, 500) / 10;
      return score;
    }
    const fields = [...document.querySelectorAll('input, textarea, [contenteditable="true"]')]
      .filter(isVisible)
      .sort((a, b) => fieldScore(b) - fieldScore(a));
    for (const field of fields) {
      const value = 'value' in field ? field.value : field.innerText || field.textContent || '';
      if (String(value || '').trim()) return String(value).trim();
    }
    return '';
  }).catch(() => '');
}

async function forceSearchKeyword(page, expectedKeyword) {
  const changed = await page.evaluate((kw) => {
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 80
        && rect.height > 12
        && rect.top < 180;
    }
    function fieldScore(el) {
      const rect = el.getBoundingClientRect();
      const text = [
        el.getAttribute('placeholder'),
        el.getAttribute('aria-label'),
        el.getAttribute('class'),
        el.getAttribute('id'),
        el.getAttribute('type'),
      ].join(' ').toLowerCase();
      let score = 0;
      if (text.includes('search') || text.includes('搜索') || text.includes('keyword')) score += 100;
      if (rect.top < 120) score += 20;
      score += Math.min(rect.width, 500) / 10;
      return score;
    }
    const field = [...document.querySelectorAll('input, textarea, [contenteditable="true"]')]
      .filter(isVisible)
      .sort((a, b) => fieldScore(b) - fieldScore(a))[0];
    if (!field) return false;
    field.focus();
    if ('value' in field) {
      const setterSource = field.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(setterSource, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(field, '');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        nativeSetter.call(field, kw);
      } else {
        field.value = '';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.value = kw;
      }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      field.textContent = '';
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
      field.textContent = kw;
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: kw }));
    }
    return true;
  }, expectedKeyword).catch(() => false);

  if (changed) {
    await page.keyboard.press('Enter').catch(() => {});
    await Promise.race([
      page.waitForResponse(r => r.url().includes('douyin.com') && /search|aweme|feed|post|item/i.test(r.url()), { timeout: 3000 }).catch(() => null),
      page.locator('a[href*="/video/"]').first().waitFor({ timeout: 3000 }).catch(() => null),
    ]);
  }
}

async function verifySearchKeyword(page, expectedKeyword) {
  const currentUrl = tryGet(() => page.url(), '');
  const urlKeyword = keywordFromSearchUrl(currentUrl);
  const visibleKeyword = await readSearchKeyword(page);
  const visibleOk = visibleKeyword ? sameKeyword(visibleKeyword, expectedKeyword) : true;
  const urlOk = sameKeyword(urlKeyword, expectedKeyword);
  return { ok: urlOk && visibleOk, currentUrl, urlKeyword, visibleKeyword };
}

async function clearDouyinSearchState(page, expectedKeyword) {
  await page.evaluate((kw) => {
    const keepKeys = ['token', 'login', 'user', 'passport', 'csrf', 'sso'];
    const removeIfSearchState = (storage) => {
      for (const key of Object.keys(storage)) {
        const lower = key.toLowerCase();
        const shouldKeep = keepKeys.some(item => lower.includes(item));
        const looksLikeSearch = lower.includes('search')
          || lower.includes('keyword')
          || lower.includes('query')
          || lower.includes('history')
          || lower.includes('suggest');
        if (looksLikeSearch && !shouldKeep) storage.removeItem(key);
      }
    };
    try { removeIfSearchState(window.sessionStorage); } catch {}
    try { removeIfSearchState(window.localStorage); } catch {}
    try { window.history.replaceState(null, '', `/search/${encodeURIComponent(kw)}?type=video&source=normal_search`); } catch {}
  }, expectedKeyword).catch(() => {});
}

async function scrapeCommentsFromDOM(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // 策略1：查找评论列表容器中的所有评论项
    const commentContainers = document.querySelectorAll([
      '[class*="comment-list"]', '[class*="commentList"]',
      '[class*="CommentList"]', '[class*="comment-container"]',
      '[class*="commentContainer"]', '[class*="CommentContainer"]',
      '[data-e2e*="comment-list"]', '[class*="comment_wrapper"]',
      '[class*="comment-wrapper"]',
    ].join(','));

    const allCandidates = [];

    if (commentContainers.length > 0) {
      // 从评论区容器内找每条评论
      for (const container of commentContainers) {
        const items = container.querySelectorAll('div, li, section, article');
        for (const item of items) {
          const rect = item.getBoundingClientRect();
          if (rect.width < 100 || rect.height < 20) continue;
          allCandidates.push(item);
        }
      }
    }

    // 策略2：直接找页面中所有疑似评论块的元素
    const commentBlocks = document.querySelectorAll([
      '[class*="comment-item"]', '[class*="commentItem"]',
      '[class*="CommentItem"]', '[class*="comment_item"]',
      '[class*="comment-row"]', '[class*="commentRow"]',
      '[class*="CommentRow"]',
    ].join(','));
    for (const block of commentBlocks) {
      allCandidates.push(block);
    }

    // 策略3：宽泛查找所有含 comment 类的元素组合
    if (allCandidates.length === 0) {
      const broadBlocks = document.querySelectorAll([
        '[class*="comment"]', '[class*="Comment"]',
        '[data-e2e*="comment"]',
      ].join(','));
      for (const block of broadBlocks) {
        const rect = block.getBoundingClientRect();
        if (rect.width > 120 && rect.height > 20 && rect.width < 1200) {
          allCandidates.push(block);
        }
      }
    }

    // 从候选元素中提取评论
    for (const el of allCandidates) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text.length < 3 || text.length > 3000) continue;

      // 尝试找到昵称和内容
      const nameEls = el.querySelectorAll([
        '[class*="name"]', '[class*="nickname"]', '[class*="author"]',
        '[class*="user"]', '[class*="Name"]', '[class*="Nickname"]',
        '[class*="Author"]', '[class*="username"]', '[class*="userName"]',
        'a[href*="/user/"]',
      ].join(','));
      const contentEls = el.querySelectorAll([
        '[class*="content"]', '[class*="text"]', '[class*="desc"]',
        '[class*="Content"]', '[class*="Text"]', '[class*="Desc"]',
        '[class*="message"]', '[class*="Message"]', '[class*="body"]',
        'p', 'span',
      ].join(','));

      let name = '';
      let content = '';

      // 取第一个非空昵称
      for (const n of nameEls) {
        const t = (n.innerText || n.textContent || '').trim();
        if (t.length >= 1 && t.length <= 40) { name = t; break; }
      }

      // 取最长的文本段作为内容
      for (const c of contentEls) {
        const t = (c.innerText || c.textContent || '').trim();
        if (t.length > content.length && t.length >= 2 && t.length <= 2000) {
          content = t;
        }
      }

      // 如果没有明确的昵称，尝试从文本结构推断
      if (!name && content) {
        // 可能昵称和内容都在一个元素里
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length >= 2 && lines[0].length <= 40) {
          name = lines[0].trim();
          content = lines.slice(1).join(' ').trim();
        }
      }

      if (content.length < 2) continue;
      if (!name) name = '抖音用户';

      const key = `${name}|${content}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // 尝试提取时间和点赞数
      const timeEl = el.querySelector('[class*="time"], [class*="date"], [class*="Time"], [class*="Date"], time');
      const likeEl = el.querySelector('[class*="like"], [class*="digg"], [class*="Like"], [class*="Digg"]');
      const publishedAt = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText || '').trim() : '';
      const likes = likeEl ? parseInt((likeEl.innerText || '0').replace(/[^0-9]/g, '')) || 0 : 0;

      results.push({ nickname: name, douyinId: '', content, publishedAt, likes, replyCount: 0 });
    }

    // 策略4：最后的回退 - 搜索任何包含「回复」「展开」等评论区特征词的元素
    if (results.length === 0) {
      const allEls = [...document.querySelectorAll('div, p, span, li')];
      for (const el of allEls) {
        const text = (el.innerText || '').trim();
        const rect = el.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 15) continue;
        if (text.length < 5 || text.length > 2000) continue;
        // 评论区常见的特征：包含昵称+内容的模式
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if (lines.length >= 2 && lines[0].length <= 30 && lines[1].length >= 3) {
          const name = lines[0].trim();
          const content = lines.slice(1).join(' ').trim();
          if (content.length < 2) continue;
          const key = `${name}|${content}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ nickname: name, douyinId: '', content, publishedAt: '', likes: 0, replyCount: 0 });
        }
      }
    }

    return results;
  }).catch(() => []);
}

function createCommentCollector(ctx) {
  const pageIds = new WeakMap();
  let nextPageId = 1;
  const events = [];
  const seen = new Set();
  const attachedPages = new Set();

  function pageKey(page) {
    if (!pageIds.has(page)) pageIds.set(page, nextPageId++);
    return pageIds.get(page);
  }

  async function onResponse(response) {
    const url = response.url();
    if (!isCommentApiUrl(url)) return;
    const apiStart = now();
    let page = null;
    try { page = response.frame().page(); } catch {}
    const key = page ? pageKey(page) : 0;
    log(`  [API] ${url.substring(0, 120)}`);
    try {
      const json = await response.json();
      const apiCost = now() - apiStart;
      const payload = extractCommentPayload(json);
      const rawComments = payload.comments;
      const batch = [];
      for (const raw of rawComments) {
        const item = normalizeComment(raw);
        if (!item.content) continue;
        const dedupeKey = `${item.nickname}|${item.content}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        batch.push(item);
      }
      log(`  [API] parsed ${batch.length}, hasMore=${payload.hasMore}, cost=${apiCost}ms`);
      events.push({
        pageKey: key,
        createdAt: now(),
        apiCost,
        hasMore: payload.hasMore,
        cursor: payload.cursor,
        total: batch.length,
        empty: batch.length === 0,
        items: batch,
      });
    } catch (e) {
      events.push({ pageKey: key, createdAt: now(), apiCost: now() - apiStart, hasMore: undefined, empty: true, items: [] });
    }
  }

  function attach(page) {
    if (!page || attachedPages.has(page)) return;
    attachedPages.add(page);
    pageKey(page);
    page.on('response', onResponse);
  }

  function onPage(page) { attach(page); }

  return {
    start() {
      for (const p of ctx.pages()) attach(p);
      ctx.on('page', onPage);
    },
    mark(page) {
      attach(page);
      return { index: events.length, pageKey: pageKey(page) };
    },
    stop() {
      ctx.off('page', onPage);
      for (const p of attachedPages) {
        try { p.off('response', onResponse); } catch {}
      }
    },
    async collectVideo(page, kw, videoUrl, marker, stats) {
      attach(page);
      const collected = [];
      let cursor = marker?.index ?? events.length;
      let emptyApis = 0;

      for (let round = 0; round < 24; round++) {
        const event = await waitForEvent(events, marker?.pageKey ?? pageKey(page), cursor, round === 0 ? 5000 : 2500);
        cursor = event ? event.nextIndex : events.length;
        if (event?.event) {
          stats.apiTimes.push(event.event.apiCost || 0);
          if (event.event.items?.length) {
            appendEventItems(event.event, collected);
            emptyApis = 0;
          } else {
            emptyApis++;
          }
          if (event.event.hasMore === false || emptyApis >= MAX_EMPTY_COMMENT_API) break;
        } else {
          emptyApis++;
          if (emptyApis >= MAX_EMPTY_COMMENT_API) break;
        }
        const scrolled = await scrollCommentContainer(page);
        if (!scrolled.moved || scrolled.top >= scrolled.max - 5) {
          emptyApis++;
          if (emptyApis >= MAX_EMPTY_COMMENT_API) break;
        }
      }

      if (collected.length === 0) {
        log('  API intercept returned 0, trying DOM scrape...');
        const domComments = await scrapeCommentsFromDOM(page);
        if (domComments.length > 0) {
          log(`  DOM scraped ${domComments.length} comments`);
          for (const item of domComments) collected.push(item);
        }
      }

      return collected.map(item => ({ ...item, keyword: kw, videoUrl }));
    },
  };
}

function appendEventItems(event, collected) {
  if (!event || !event.items) return;
  for (const item of event.items) collected.push(item);
}

async function waitForEvent(events, pageKey, startIndex, timeoutMs) {
  const start = now();
  let cursor = startIndex;
  while (now() - start < timeoutMs) {
    while (events.length > cursor) {
      const event = events[cursor];
      cursor++;
      if (event.pageKey === pageKey) return { event, nextIndex: cursor };
    }
    await sleep(120);
  }
  return null;
}

async function waitForNonEmptyEvent(events, startIndex, timeoutMs) {
  const start = now();
  let cursor = startIndex;
  while (now() - start < timeoutMs) {
    while (events.length > cursor) {
      const event = events[cursor++];
      if (event && !event.empty && event.items?.length > 0) return event;
    }
    await sleep(120);
  }
  return null;
}

async function waitForMutationOrTimeout(page, timeoutMs) {
  return page.evaluate((ms) => new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      resolve(true);
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setTimeout(finish, ms);
  }), timeoutMs).catch(() => sleep(Math.min(timeoutMs, 300)));
}

function isCommentApiUrl(url) {
  const text = url.toLowerCase();
  if (!text.includes('douyin.com')) return false;
  // 精准匹配抖音评论 API：/aweme/v1/web/comment/list/  和  /aweme/v1/web/comment/list/reply/
  if (text.includes('/comment/list/')) return true;
  if (text.includes('/comment/list/reply/')) return true;
  // 更宽泛的回退匹配
  if (text.includes('comment') && text.includes('/aweme/')) return true;
  return false;
}

function extractCommentPayload(value) {
  const payload = { comments: [], hasMore: undefined, cursor: undefined };
  const commentKeys = ['comments', 'comment_list', 'reply_comments', 'replyList', 'item_list', 'items'];
  const hasMoreKeys = ['has_more', 'hasMore', 'has_more_reply', 'has_more_comments', 'more'];
  const cursorKeys = ['cursor', 'max_cursor', 'next_cursor', 'page_cursor'];

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    for (const key of hasMoreKeys) {
      if (typeof node[key] === 'boolean') payload.hasMore = node[key];
    }
    for (const key of cursorKeys) {
      if (typeof node[key] === 'number' || typeof node[key] === 'string') payload.cursor = node[key];
    }
    for (const key of commentKeys) {
      const candidate = node[key];
      if (Array.isArray(candidate) && candidate.length > 0) {
        payload.comments = candidate;
        return;
      }
    }
    for (const child of Object.values(node)) {
      if (payload.comments.length > 0) break;
      if (child && typeof child === 'object') visit(child);
    }
  }

  visit(value);
  if (payload.comments.length === 0) payload.comments = extractCommentObjects(value);
  return payload;
}

function extractCommentObjects(value, found = []) {
  if (!value || found.length >= 500) return found;
  if (Array.isArray(value)) {
    for (const item of value) extractCommentObjects(item, found);
    return found;
  }
  if (typeof value !== 'object') return found;
  const content = value.text || value.content || value.comment_text || value.desc;
  const user = value.user || value.user_info || value.comment_user;
  if (typeof content === 'string' && content.trim().length > 0 && user && typeof user === 'object') found.push(value);
  for (const [key, child] of Object.entries(value)) {
    if (found.length >= 500) break;
    if (key === 'user' || key === 'user_info' || key === 'comment_user') continue;
    if (child && typeof child === 'object') extractCommentObjects(child, found);
  }
  return found;
}

function normalizeComment(raw) {
  const user = raw.user || raw.user_info || raw.comment_user || {};
  const createTime = Number(raw.create_time || raw.createTime || 0);
  return {
    nickname: String(user.nickname || user.nick_name || raw.nickname || '抖音用户'),
    douyinId: String(user.unique_id || user.short_id || user.sec_uid || user.uid || ''),
    avatarUrl: user.avatar_thumb?.url_list?.[0] || user.avatar_medium?.url_list?.[0] || '',
    content: String(raw.text || raw.content || raw.comment_text || raw.desc || '').trim().slice(0, 500),
    publishedAt: createTime > 0 ? new Date(createTime * 1000).toISOString() : undefined,
    likes: parseInt(String(raw.digg_count ?? raw.like_count ?? raw.likes ?? 0), 10) || 0,
    replyCount: parseInt(String(raw.reply_comment_total ?? raw.reply_count ?? 0), 10) || 0,
  };
}

function videoIdFromUrl(url) {
  const match = String(url || '').match(/\/video\/([^/?#]+)/);
  return match ? match[1] : '';
}

main().catch(err => {
  console.error('Error:', err.message);
  if (jsonMode) jsonOut([]);
  process.exit(1);
});
