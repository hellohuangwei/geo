#!/usr/bin/env node
/**
 * Browser Bridge v3 — 统一 Windows 客户端。
 *
 * puppeteer-core 连接本地浏览器 (Chrome/Edge/任何 Chromium 内核)
 * WebSocket 连接服务器 relay，接收指令，返回结果。
 *
 * v3 新特性:
 *   - 完整 server push 事件处理 (taskProgress / taskCompleted / analysis)
 *   - 采集完成后自动下载 CSV + JSON 到本地
 *   - 采集过程中实时推送进度给 relay
 *   - 心跳保活 + 自动重连
 *
 * 用法:
 *   node bridge.mjs --server wss://<IP>:8443/ws --token <token>
 *   node bridge.mjs --server wss://<IP>:8443/ws --token <token> --cdp http://127.0.0.1:9222 --client-id my-pc
 */

import puppeteer from 'puppeteer-core';
import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// ── CLI 参数 ──────────────────────────────────────

const argv = process.argv.slice(2);
const get = (flag, env) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : process.env[env];

const SERVER   = get('--server',   'BRIDGE_SERVER')   || 'ws://127.0.0.1:6008/ws';
const TOKEN    = get('--token',    'BRIDGE_TOKEN')    || 'openclaw-browser-bridge';
const CDP_URL  = get('--cdp',      'BRIDGE_CDP')      || 'http://127.0.0.1:9222';
const CLIENT   = get('--client-id','BRIDGE_CLIENT_ID') || os.hostname();
const RESULT_DIR = process.env.BRIDGE_RESULT_DIR || path.join(os.homedir(), 'Desktop', 'douyin-results');

// ── 状态 ──────────────────────────────────────────

let ws = null;
let browser = null;
let page = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let clientId = CLIENT;
let reconnectAttempts = 0;           // 重连次数（用于指数退避）
const RECONNECT_BASE_MS = 2000;      // 基础重连间隔 2s
const RECONNECT_MAX_MS   = 60000;    // 最大重连间隔 60s
const state = {
  douyinLoggedIn: false,
  lastCompletedTask: null,
  analysisLog: [],
  currentTask: null,
};

// ── 工具函数 ──────────────────────────────────────

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${level}] ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1) + min); }

function now() { return Date.now(); }

function avg(values) { return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0; }

async function humanPause(opts = {}) {
  await sleep(rand(opts.min || 200, opts.max || 600));
}

// ── 评论去重缓存 ──────────────────────────────────

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

// ── 评论标准化 ────────────────────────────────────

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

// ── 标题-关键词匹配 ──────────────────────────────

function singleTermMatch(term, title) {
  const t = term.replace(/\s+/g, '').toLowerCase();
  const tl = title.replace(/\s+/g, '').toLowerCase();
  if (!t || !tl) return 0;

  // 完整子串匹配
  if (tl.includes(t)) return 1.0;

  // 中文 bigram 匹配
  if (t.length >= 2) {
    const bigrams = [];
    for (let i = 0; i < t.length - 1; i++) bigrams.push(t.substring(i, i + 2));
    const matched = bigrams.filter(bg => tl.includes(bg)).length;
    const bigramScore = matched / bigrams.length;
    if (bigramScore >= 0.5) return bigramScore;
  }

  // 字符集匹配
  const matchedChars = t.split('').filter(c => tl.includes(c)).length;
  const charRatio = matchedChars / t.length;

  // 惩罚：关键词比标题长很多
  if (t.length > tl.length * 2) return charRatio * 0.6;

  return charRatio;
}

function computeTitleMatch(keyword, title) {
  const kw = keyword.replace(/\s+/g, '').toLowerCase();
  const tl = title.replace(/\s+/g, '').toLowerCase();
  if (!kw || !tl) return { score: 0, method: 'empty' };

  const terms = keyword.split(/[\s,，、]+/).filter(t => t.length > 0);
  const allTerms = terms.length > 1 ? terms : [keyword.trim()];

  const termScores = allTerms.map(term => singleTermMatch(term, title));
  const avgScore = termScores.reduce((a, b) => a + b, 0) / termScores.length;

  let method = termScores.length > 1 ? 'multi-term' : 'single';
  let finalScore = avgScore;
  if (termScores.some(s => s >= 0.95)) finalScore = Math.max(finalScore, 0.9);
  if (allTerms.some(t => tl.includes(t.toLowerCase().replace(/\s+/g, ''))))
    finalScore = Math.max(finalScore, 0.95);

  return { score: finalScore, method };
}

// ── 消息工厂 ──────────────────────────────────────

let _seq = 0;
function seq() { return `req_${++_seq}_${Date.now()}`; }

function respond(id, result = null, error = null) {
  return JSON.stringify({ id, type: 'res', result, error });
}

function emit(event, data = {}) {
  return JSON.stringify({ id: seq(), type: 'event', event, data });
}

// ── 主入口 ────────────────────────────────────────

async function main() {
  log('info', `Browser Bridge v3 (puppeteer-core)`);
  log('info', `clientId=${clientId}  server=${SERVER}  cdp=${CDP_URL}`);
  log('info', `结果目录: ${RESULT_DIR}`);

  await connectBrowser();
  connectServer();
}

// ── 浏览器连接 ────────────────────────────────────

async function connectBrowser() {
  for (let i = 1; i <= 5; i++) {
    try {
      browser = await puppeteer.connect({
        browserURL: CDP_URL,
        defaultViewport: null,
      });

      const pages = await browser.pages();
      page = pages.find(p => {
        try { return p.url().includes('douyin.com'); } catch { return false; }
      }) || pages[0] || await browser.newPage();

      log('ok', `浏览器已连接 (${pages.length} tabs, current: ${page.url().slice(0, 60)})`);
      return;
    } catch (e) {
      if (i < 5) {
        log('warn', `CDP 连接失败 ${i}/5, 2s 后重试 → ${e.message.slice(0, 80)}`);
        await sleep(2000);
      } else {
        log('err', '无法连接浏览器。请先启动: msedge --remote-debugging-port=9222  或  chrome --remote-debugging-port=9222');
        process.exit(1);
      }
    }
  }
}

// ── 服务器连接 ────────────────────────────────────

function connectServer() {
  const url = `${SERVER}?token=${encodeURIComponent(TOKEN)}&clientId=${encodeURIComponent(clientId)}`;
  log('info', `连接 relay...`);

  ws = new WebSocket(url);

  ws.on('open', onOpen);
  ws.on('message', onMessage);
  ws.on('close', onClose);
  ws.on('error', onError);
  ws.on('pong', () => {});
}

async function onOpen() {
  log('ok', 'relay 已连接');
  reconnectAttempts = 0; // 连接成功，重置退避计数

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.ping();
  }, 30000);

  let loginOk = false;
  try { loginOk = await checkLogin(); } catch {}
  state.douyinLoggedIn = loginOk;

  send(emit('client.ready', {
    clientId, platform: process.platform, arch: process.arch,
    node: process.version, cdpUrl: CDP_URL, douyinLoggedIn: loginOk,
  }));

  if (!loginOk) {
    log('warn', '抖音未登录，请在浏览器中扫码登录 douyin.com');
    send(emit('client.loginRequired', { clientId }));
  }
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(data); } catch (e) { log('err', `发送失败: ${e.message}`); }
  }
}

// ── 消息处理 ──────────────────────────────────────

async function onMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  // 处理服务器推送事件 (v3 新增)
  if (msg.type === 'event') {
    handleServerEvent(msg);
    return;
  }

  // 处理请求
  if (msg.type !== 'req') return;

  log('req', `${msg.method} ${JSON.stringify(msg.params || {}).slice(0, 80)}`);

  try {
    if (!page || page.isClosed()) {
      const pages = await browser.pages();
      page = pages[0] || await browser.newPage();
    }
    const result = await dispatch(msg.method, msg.params || {});
    send(respond(msg.id, result));
  } catch (e) {
    log('err', `${msg.method}: ${e.message}`);
    send(respond(msg.id, null, e.message));
  }
}

// ── 服务器事件处理 (v3 新增) ─────────────────────

function handleServerEvent(msg) {
  const { event, data } = msg;

  switch (event) {
    case 'server.taskProgress':
      state.currentTask = {
        taskId: data.taskId,
        keyword: data.keyword,
        phase: data.phase,
      };
      log('progress', `[${data.taskId}] ${data.phase}: ${data.message || ''}${data.collected !== undefined ? ` (${data.collected}条)` : ''}`);
      break;

    case 'server.taskCompleted': {
      log('ok', `\n${'='.repeat(50)}`);
      log('ok', `任务完成: ${data.taskId}`);
      log('ok', `  关键词: ${data.keyword}`);
      log('ok', `  状态:   ${data.status}`);
      log('ok', `  总数:   ${data.total || '?'} 条`);
      log('ok', `  耗时:   ${data.elapsedSec || '?'}s`);
      if (data.summary) {
        log('ok', `  独立用户: ${data.summary.uniqueUsers}`);
        log('ok', `  平均点赞: ${data.summary.avgLikes}`);
        log('ok', `  Top关键词: ${(data.summary.topKeywords || []).join(', ')}`);
      }
      if (data.error) {
        log('err', `  错误: ${data.error}`);
      }
      if (data.links) {
        log('ok', `  结果: ${data.links.result}`);
        log('ok', `  导出: ${data.links.csv}`);
        log('ok', `  Excel: ${data.links.xls}`);
      }
      log('ok', `${'='.repeat(50)}\n`);

      // 保存任务元信息
      if (data.status === 'done' && data.total > 0) {
        state.lastCompletedTask = {
          taskId: data.taskId,
          keyword: data.keyword,
          total: data.total,
          summary: data.summary,
          collectedAt: data.collectedAt,
          links: data.links,
        };
        // ★ 自动下载结果到本地
        downloadTaskResult(data);
      }
      break;
    }

    case 'server.analysis':
      state.analysisLog.push({
        ts: data.ts || new Date().toISOString(),
        taskId: data.taskId,
        phase: data.phase,
        message: data.message,
        collected: data.collected,
        decision: data.decision,
        reasoning: data.reasoning,
      });
      if (state.analysisLog.length > 500) state.analysisLog.shift();

      log('analysis', `[${data.phase}] ${data.message}${data.decision ? ` → ${data.decision}` : ''}`);
      if (data.reasoning) log('analysis', `  推理: ${data.reasoning}`);
      break;

    default:
      log('info', `事件: ${event} ${JSON.stringify(data).slice(0, 200)}`);
  }
}

// ── 自动下载结果 (v3 新增) ───────────────────────

async function downloadTaskResult(data) {
  const serverBase = SERVER.replace(/\/ws$/, '').replace(/^ws/, 'http');
  const taskId = data.taskId;
  const keyword = data.keyword || 'export';
  const safeName = keyword.replace(/[^\w一-鿿]/g, '_').slice(0, 20);

  try {
    if (!fs.existsSync(RESULT_DIR)) {
      fs.mkdirSync(RESULT_DIR, { recursive: true });
    }

    // 1. 下载 CSV
    const csvUrl = `${serverBase}/api/tasks/${taskId}/export?format=csv&token=${encodeURIComponent(TOKEN)}`;
    log('download', `📥 CSV: ${csvUrl}`);
    try {
      const csvRes = await fetch(csvUrl);
      if (csvRes.ok) {
        const csvPath = path.join(RESULT_DIR, `${safeName}_${taskId}.csv`);
        fs.writeFileSync(csvPath, await csvRes.text(), 'utf-8');
        log('ok', `✅ CSV 已保存: ${csvPath}`);
      } else {
        log('warn', `CSV 下载失败 (HTTP ${csvRes.status})`);
      }
    } catch (e) {
      log('warn', `CSV 下载异常: ${e.message}`);
    }

    // 2. 下载 JSON
    const jsonUrl = `${serverBase}/api/tasks/${taskId}/result?token=${encodeURIComponent(TOKEN)}&size=500`;
    log('download', `📥 JSON: ${jsonUrl}`);
    try {
      const jsonRes = await fetch(jsonUrl);
      if (jsonRes.ok) {
        const jsonPath = path.join(RESULT_DIR, `${safeName}_${taskId}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(await jsonRes.json(), null, 2), 'utf-8');
        log('ok', `✅ JSON 已保存: ${jsonPath}`);
      } else {
        log('warn', `JSON 下载失败 (HTTP ${jsonRes.status})`);
      }
    } catch (e) {
      log('warn', `JSON 下载异常: ${e.message}`);
    }

    // 3. 下载 Excel
    const xlsUrl = `${serverBase}/api/tasks/${taskId}/export?token=${encodeURIComponent(TOKEN)}`;
    log('download', `📥 Excel: ${xlsUrl}`);
    try {
      const xlsRes = await fetch(xlsUrl);
      if (xlsRes.ok) {
        const xlsPath = path.join(RESULT_DIR, `${safeName}_${taskId}.xls`);
        fs.writeFileSync(xlsPath, await xlsRes.text(), 'utf-8');
        log('ok', `✅ Excel 已保存: ${xlsPath}`);
      }
    } catch (e) {
      log('warn', `Excel 下载异常: ${e.message}`);
    }

    log('ok', `\n📁 所有结果已保存到: ${RESULT_DIR}\n`);
  } catch (err) {
    log('err', `下载结果失败: ${err.message}`);
  }
}

// ── 重连逻辑 ──────────────────────────────────────

function onClose(code) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts), RECONNECT_MAX_MS);
  log('warn', `relay 断开 (code=${code}), ${(delay/1000).toFixed(1)}s 后重连 (第${reconnectAttempts + 1}次)...`);
  scheduleReconnect(delay);
}

function onError(e) {
  log('err', e.message);
}

function scheduleReconnect(delay = 5000) {
  if (reconnectTimer) return;
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectServer();
  }, delay);
}

// ── 指令分发 ──────────────────────────────────────

async function dispatch(method, params) {
  switch (method) {

    // ── 导航 ──
    case 'browser.navigate': {
      const navOpts = {
        waitUntil: params.waitUntil || 'domcontentloaded',
        timeout: params.timeout || 20000,
      };
      try {
        // 保留自然 referrer
        const cur = tryGetUrl();
        if (cur && !cur.startsWith('about:') && cur !== params.url) navOpts.referer = cur;
      } catch {}
      await page.goto(params.url, navOpts);
      await sleep(800); // 等 JS 重定向完成
      const finalUrl = page.url();
      const redirected = normalizeUrl(finalUrl) !== normalizeUrl(params.url);
      return { url: finalUrl, redirected };
    }

    case 'browser.reload':
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return { url: page.url() };

    case 'browser.goHome':
      await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await humanPause();
      return { url: page.url() };

    // ── 交互 ──
    case 'browser.click':
      await page.click(params.selector, { timeout: 5000 });
      await humanPause();
      return { ok: true };

    case 'browser.humanClick':
      await humanPause();
      await page.click(params.selector, { timeout: 5000 });
      await humanPause();
      return { ok: true };

    case 'browser.type':
      await page.evaluate(({ sel, txt }) => {
        const el = document.querySelector(sel);
        if (el) { el.focus(); el.value = ''; el.value = txt; el.dispatchEvent(new Event('input', { bubbles: true })); }
      }, { sel: params.selector, txt: params.text });
      await humanPause();
      return { ok: true };

    case 'browser.scroll':
      await page.evaluate(px => {
        const el = document.scrollingElement || document.documentElement;
        if (el) el.scrollTop += px;
      }, params.px || 500);
      await humanPause();
      return { ok: true };

    case 'browser.scrollFeed':
      await page.evaluate(px => {
        const el = document.scrollingElement || document.documentElement;
        if (el) el.scrollTop += px;
      }, params.px || 800);
      await humanPause();
      return { ok: true };

    case 'browser.humanScroll':
      await humanScroll(params);
      return { ok: true };

    case 'browser.pressKey':
      await page.keyboard.press(params.key);
      return { ok: true };

    // ── 等待 ──
    case 'browser.waitForSelector':
      try {
        await page.waitForSelector(params.selector, { timeout: params.timeout || 10000 });
        return { found: true };
      } catch {
        return { found: false };
      }

    case 'browser.randomDelay':
      await humanPause(params);
      return { ok: true };

    // ── 查询 ──
    case 'browser.getUrl':
      return { url: page.url() };

    case 'browser.getText':
      return { text: (await page.evaluate(() => document.body?.innerText || '')).slice(0, params.maxLen || 10000) };

    case 'browser.getHtml':
      return { html: (await page.evaluate(() => document.documentElement.outerHTML)).slice(0, params.maxLen || 100000) };

    case 'browser.screenshot':
      const buf = await page.screenshot({ type: 'png', fullPage: params.fullPage || false });
      return { screenshot: buf.toString('base64') };

    // ── 登录 / Cookie ──
    case 'browser.checkLogin': {
      const wasLoggedIn = state.douyinLoggedIn;
      const loggedIn = await checkLogin();
      state.douyinLoggedIn = loggedIn;
      if (!loggedIn && wasLoggedIn) send(emit('client.loginRequired', { clientId }));
      else if (loggedIn && !wasLoggedIn) send(emit('client.loginDone', { clientId }));
      return { loggedIn };
    }

    case 'browser.getCookies':
      return { cookies: await getCookies(params.urls) };

    // ── 抖音专用 ──
    case 'browser.extractComments':
      return await extractCommentsDOM(page, params.maxComments || 100);

    case 'browser.extractCommentsDOM':
      return await extractCommentsDOM(page, params.maxComments || 100);

    case 'browser.fetchCommentApi':
      return await fetchCommentApi(page, params.videoId, params);

    case 'browser.collectVideoComments':
      return await collectVideoComments(page, params.videoUrl, params.keyword, params);

    case 'browser.matchTitle':
      return computeTitleMatch(params.keyword || '', params.title || '');

    case 'browser.activateCommentPanel':
      return { result: await activateCommentPanel(page) };

    case 'browser.scrollComments':
      return await scrollCommentContainer(page, params);

    case 'browser.extractVideoIds':
      return await extractVideoIds(page, params.scrollRounds || 5);

    case 'browser.extractSearchVideos':
      return await extractSearchVideos(page, params.maxVideos || 30);

    case 'browser.extractFeedVideos':
      return await extractFeedVideos(page, params.maxVideos || 20, params.scrollRounds || 3);

    case 'browser.interceptApi':
      return await interceptApi(page, params);

    case 'browser.postComment':
      return await postComment(page, params);

    case 'browser.like':
      return await doLike(page);

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

// ── 登录检测 ──────────────────────────────────────

async function checkLogin() {
  try {
    const cdp = await page.createCDPSession();
    const { cookies } = await cdp.send('Network.getCookies', {
      urls: ['https://www.douyin.com', 'https://creator.douyin.com'],
    });
    await cdp.detach().catch(() => {});

    const keys = ['passport_csrf_token','sessionid','sessionid_ss','sso_uid','sid_guard','uid_tt','sid_tt','odin_tt','ttwid'];
    const found = cookies.filter(c => keys.some(k => c.name === k || c.name.toLowerCase().includes(k.toLowerCase())));

    if (found.length >= 2) { log('ok', `已登录 (cookie: ${found.map(c=>c.name).join(', ')})`); return true; }

    const domOk = await page.evaluate(() => {
      const body = document.body?.innerText || '';
      if (/登录|扫码登录|密码登录|请先登录|立即登录/.test(body)) return false;
      const modal = document.querySelector('[class*="login-modal"], [class*="login-mask"]');
      if (modal && modal.offsetParent !== null) return false;
      return !!document.querySelector('[data-e2e="user-avatar"], [class*="avatar"]');
    }).catch(() => false);

    if (domOk) { log('ok', '已登录 (DOM)'); return true; }
    log('info', '未登录');
    return false;
  } catch (e) {
    log('err', `checkLogin: ${e.message}`);
    return false;
  }
}

async function getCookies(urls) {
  const u = urls || ['https://www.douyin.com', 'https://creator.douyin.com'];
  try {
    const cdp = await page.createCDPSession();
    const { cookies } = await cdp.send('Network.getCookies', { urls: u });
    await cdp.detach().catch(() => {});
    return cookies;
  } catch (e) {
    return [];
  }
}

// ── 评论区操作 ────────────────────────────────────

async function activateCommentPanel(page) {
  // 先滚动到评论区区域
  await page.evaluate(() => {
    const s = document.scrollingElement || document.documentElement;
    if (s) s.scrollTop += 400;
  }).catch(() => {});
  await sleep(400);

  const result = await page.evaluate(() => {
    // 策略 0: 点击排序标签（"按热度"/"按时间"等）
    const sortLabels = [...document.querySelectorAll('*')].filter(el => {
      const text = (el.innerText || el.textContent || '').trim();
      const rect = el.getBoundingClientRect();
      return (text === '按热度' || text === '按时间' || text === '综合' || text === '最新')
        && rect.width > 10 && rect.height > 8 && rect.width < 200;
    });
    if (sortLabels.length > 0) { sortLabels[0].click(); return 'clicked-sort:' + sortLabels[0].innerText; }

    // 策略 1: CSS 选择器找评论按钮
    const selectors = [
      '[data-e2e*="comment"]', '[aria-label*="评论"]', '[aria-label*="comment" i]',
      'button[class*="comment" i]', '[role="button"][class*="comment" i]',
      '[class*="CommentIcon"]', '[class*="comment-icon"]', '.comment-tab', '[class*="CommentTab"]',
    ];
    for (const sel of selectors) {
      const candidates = [...document.querySelectorAll(sel)].filter(e => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return cs.display !== 'none' && cs.visibility !== 'hidden'
          && r.width >= 12 && r.height >= 12 && r.width <= 260 && r.height <= 260
          && r.bottom > 0 && r.top < window.innerHeight;
      });
      if (candidates.length > 0) { candidates[0].click(); return 'clicked-selector:' + sel; }
    }

    // 策略 2: 精确文本"评论"
    const allEls = [...document.querySelectorAll('span, div, button, a, p, li')];
    for (const el of allEls) {
      const text = (el.innerText || el.textContent || '').trim();
      const r = el.getBoundingClientRect();
      if ((text === '评论' || text === '评论区' || /^\d+\.?\d*万?条?评论$/.test(text))
          && r.width > 15 && r.height > 10 && r.width < 400
          && r.bottom > 0 && r.top < window.innerHeight) {
        el.click(); return 'clicked-text:' + text;
      }
    }

    // 策略 3: 宽泛匹配含"评论"的元素
    const broadEls = [...document.querySelectorAll('*')];
    for (const el of broadEls) {
      const text = (el.innerText || '').slice(0, 50).trim();
      if (text.includes('评论') || text.includes('条评')) {
        const r = el.getBoundingClientRect();
        if (r.width > 10 && r.height > 10 && r.width < 400
            && r.bottom > 0 && r.top < window.innerHeight) {
          el.click(); return 'clicked-broad:' + text.substring(0, 20);
        }
      }
    }

    // 策略 4: 尝试点击评论区容器内的子元素
    const commentContainers = [...document.querySelectorAll('[class*="comment" i], [class*="Comment"], [id*="comment" i], [id*="Comment"]')];
    for (const container of commentContainers) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100 && rect.bottom > 0 && rect.top < window.innerHeight) {
        const clickable = container.querySelector('button, a, [role="button"], [onclick], span, div');
        if (clickable) { clickable.click(); return 'clicked-container-child'; }
        container.click();
        return 'clicked-container';
      }
    }

    return 'not-found';
  }).catch(() => 'error');

  log('info', `  Comment activation: ${result}`);

  // 策略 5: 等待 DOM 变化确认激活
  try {
    await page.evaluate((ms) => new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; observer.disconnect(); resolve(true); };
      const observer = new MutationObserver(finish);
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      setTimeout(finish, ms);
    }), 600);
  } catch {}

  return result;
}

async function scrollCommentContainer(page, { px = 600, rounds = 2, pauseMin = 300, pauseMax = 800 } = {}) {
  for (let i = 0; i < rounds; i++) {
    const result = await page.evaluate((step) => {
      // 优先找专门包含评论的滚动容器
      const candidates = [...document.querySelectorAll('div, section, main, ul, aside')].filter(el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const scrollable = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 50;
        return scrollable && r.width > 200 && r.height > 120;
      });

      // 按包含评论关键字和位置评分排序
      const scored = candidates.map(el => {
        const text = (el.innerText || '').slice(0, 500);
        const r = el.getBoundingClientRect();
        let score = el.scrollHeight - el.clientHeight; // 基础分：可滚动量
        if (text.includes('评论') || text.includes('条评') || text.includes('回复')) score += 10000;
        if (text.includes('按热度') || text.includes('按时间')) score += 5000;
        if (r.left > window.innerWidth * 0.3) score += 3000; // 偏右侧（评论区常见位置）
        return { el, score };
      });
      scored.sort((a, b) => b.score - a.score);

      const target = scored[0]?.el || document.scrollingElement || document.documentElement;
      const before = target.scrollTop;
      target.scrollTop += step;
      return { moved: target.scrollTop !== before, top: target.scrollTop, max: target.scrollHeight - target.clientHeight };
    }, px).catch(() => ({ moved: false, top: 0, max: 0 }));

    if (!result.moved || result.top >= result.max - 5) break;
    await sleep(rand(pauseMin, pauseMax));
  }
  return { ok: true };
}

// ── DOM 提取 ──────────────────────────────────────

async function extractCommentsDOM(page, maxComments) {
  return page.evaluate((maxCnt) => {
    const results = [];
    const seen = new Set();

    // 找一个评论区容器，策略从精确到宽泛
    const containers = [
      ...document.querySelectorAll('[class*="comment-list"], [class*="CommentList"], [class*="comment-container"], [class*="CommentContainer"]'),
      ...document.querySelectorAll('[data-e2e*="comment-list"], [class*="comment_wrapper"], [class*="comment-wrapper"]'),
    ];

    // 候选：从容器中找每条评论
    let allCandidates = [];
    for (const container of containers) {
      const items = container.querySelectorAll('div, li, section, article');
      for (const item of items) {
        const r = item.getBoundingClientRect();
        if (r.width >= 100 && r.height >= 20) allCandidates.push(item);
      }
    }

    // 宽泛查找带 comment-item 类名的
    const commentItems = document.querySelectorAll('[class*="comment-item"], [class*="CommentItem"], [class*="comment_item"]');
    for (const item of commentItems) allCandidates.push(item);

    // 去重 DOM 元素
    allCandidates = [...new Set(allCandidates)];

    for (const el of allCandidates) {
      if (results.length >= maxCnt) break;

      const nameEl = el.querySelector('[class*="name"], [class*="nickname"], [class*="author"], [class*="username"], a[href*="/user/"]');
      const contentEl = el.querySelector('[class*="content"], [class*="text"], [class*="desc"], [class*="message"], [class*="body"]');
      const timeEl = el.querySelector('[class*="time"], [class*="date"], time');
      const likeEl = el.querySelector('[class*="like"], [class*="digg"]');
      const cidMatch = (el.innerHTML || '').match(/comment_id[=:](\d+)/);

      const nickname = (nameEl?.innerText || '').trim().slice(0, 40) || '抖音用户';
      const content = (contentEl?.innerText || el.innerText || '').trim().slice(0, 500);
      const publishedAt = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText || '').trim() : '';
      const likes = likeEl ? parseInt((likeEl.innerText || '0').replace(/[^0-9]/g, '')) || 0 : 0;
      const cid = cidMatch ? cidMatch[1] : '';

      if (content.length < 2) continue;
      const key = `${nickname}|${content}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ nickname, content, publishedAt, likes, cid });
    }

    // 如果还是空的，回退到文本结构解析
    if (results.length === 0) {
      const allEls = [...document.querySelectorAll('div, p, span, li')];
      for (const el of allEls) {
        if (results.length >= maxCnt) break;
        const text = (el.innerText || '').trim();
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.height < 15) continue;
        if (text.length < 5 || text.length > 2000) continue;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length >= 2 && lines[0].length <= 30 && lines[1].length >= 3) {
          const key = `${lines[0]}|${lines.slice(1).join(' ')}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ nickname: lines[0].trim(), content: lines.slice(1).join(' ').trim(), publishedAt: '', likes: 0, cid: '' });
        }
      }
    }

    return { comments: results.slice(0, maxCnt), total: results.length };
  }, maxComments).catch(() => ({ comments: [], total: 0 }));
}

async function extractSearchVideos(page, maxVideos) {
  return page.evaluate((maxCnt) => {
    const videos = [];
    const seen = new Set();

    // 从搜索结果卡片提取
    const cards = document.querySelectorAll([
      '[class*="search-item"]', '[class*="SearchItem"]',
      '[class*="video-card"]', '[class*="VideoCard"]',
      'a[href*="/video/"]',
    ].join(','));

    for (const card of cards) {
      if (videos.length >= maxCnt) break;

      // 处理 <a> 标签（可能是视频链接本身也可能是卡片内的链接）
      let videoHref = '';
      let videoId = '';
      if (card.tagName === 'A' && card.href.includes('/video/')) {
        videoHref = card.href;
      } else {
        const link = card.querySelector('a[href*="/video/"]');
        if (link) videoHref = link.href;
      }
      const m = videoHref.match(/\/video\/(\d+)/);
      if (!m) continue;
      videoId = m[1];
      if (seen.has(videoId)) continue;
      seen.add(videoId);

      // 提取标题
      const titleEl = card.querySelector('[class*="title"], [class*="desc"], [class*="text"], [data-e2e*="title"]');
      let title = titleEl ? (titleEl.innerText || titleEl.getAttribute('title') || '').trim() : '';

      // 提取作者
      const authorEl = card.querySelector('[class*="author"], [class*="nickname"], [class*="name"], [data-e2e*="author"]');
      const author = authorEl ? authorEl.innerText.trim() : '';

      // 提取点赞
      const likeEl = card.querySelector('[class*="like"], [class*="digg"], [class*="count"]');
      const likes = likeEl ? (likeEl.innerText || '').trim() : '';

      const playEl = card.querySelector('[class*="play"], [class*="view"]');
      const playCount = playEl ? (playEl.innerText || '').trim() : '';

      videos.push({ title: title.slice(0, 120), author, likes, playCount, videoId });
    }

    return { videos };
  }, maxVideos).catch(() => ({ videos: [] }));
}

async function extractVideoIds(page, scrollRounds) {
  const ids = new Set();
  for (let i = 0; i < scrollRounds; i++) {
    const batch = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/video/"]')]
        .map(a => { const m = a.href.match(/\/video\/(\d+)/); return m?.[1]; }).filter(Boolean)
    ).catch(() => []);
    batch.forEach(id => ids.add(id));
    if (i < scrollRounds - 1) {
      await page.evaluate(px => {
        const el = document.scrollingElement || document.documentElement;
        if (el) el.scrollTop += px;
      }, 800);
      await sleep(500);
    }
  }
  return { videoIds: [...ids], total: ids.size };
}

async function extractFeedVideos(page, maxVideos, scrollRounds) {
  for (let i = 0; i < scrollRounds; i++) {
    await page.evaluate(px => {
      const el = document.scrollingElement || document.documentElement;
      if (el) el.scrollTop += px;
    }, 800);
    await sleep(500);
  }
  return extractSearchVideos(page, maxVideos);
}

// ── 直接调用抖音评论 API（最可靠方式）────────────

async function fetchCommentApi(page, videoId, opts = {}) {
  const all = [];
  let cursor = opts.cursor || 0;
  const MAX_PAGES = opts.maxPages || 30;
  const PAGE_SIZE = opts.pageSize || 50;
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

    if (result._error) { log('warn', `  API page ${p} error: ${result._error}`); break; }

    const comments = result.comments || [];
    for (const c of comments) {
      all.push(normalizeComment(c));
    }

    log('info', `  API page ${p}: ${comments.length} comments, cursor=${cursor}, has_more=${result.has_more}`);

    if (comments.length === 0) break;
    if (!result.has_more) break;
    cursor = result.cursor;
    await sleep(rand(150, 400));
  }

  return all;
}

// ── 完整单视频评论采集（三层回退）───────────────

/**
 * 采集单个视频的评论 — 融合三层策略：
 *   1. 直接调 fetchCommentApi（最可靠）
 *   2. API 拦截（监听浏览器自然请求）
 *   3. DOM 提取（最后兜底）
 */
async function collectVideoComments(page, videoUrl, keyword, opts = {}) {
  const commentCache = opts.cache || new CommentCache();

  const videoId = videoIdFromUrl(videoUrl);
  if (!videoId) {
    log('warn', '  No videoId from url: ' + videoUrl);
    return [];
  }

  // 1. 导航到视频详情页
  log('info', `  Opening video: ${videoUrl.slice(0, 70)}`);
  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (e) {
    log('warn', `  Navigation warning: ${e.message}`);
    try { await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }); } catch {}
  }
  await sleep(600);
  try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}

  // 2. 提取标题并匹配关键词
  if (keyword) {
    const videoTitle = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      if (ogTitle) return ogTitle.trim();
      const h1 = document.querySelector('h1')?.innerText || '';
      if (h1) return h1.trim();
      return (document.title || '').trim();
    }).catch(() => '');
    log('info', `  Title: "${videoTitle?.slice(0, 60) || '(unknown)'}"`);

    if (videoTitle) {
      const minMatchRatio = parseFloat(process.env.DOUYIN_TITLE_MATCH_THRESHOLD) || 0.5;
      const matchResult = computeTitleMatch(keyword, videoTitle);
      log('info', `  Title match: score=${(matchResult.score * 100).toFixed(0)}% method=${matchResult.method}`);
      if (matchResult.score < minMatchRatio) {
        log('info', `  SKIP: title doesn't match keyword (${(matchResult.score * 100).toFixed(0)}% < ${(minMatchRatio * 100).toFixed(0)}%)`);
        return [];
      }
    }
  }

  // 3. 检查评论数
  const commentCount = await page.evaluate(() => {
    const body = document.body?.innerText || '';
    const match = body.match(/(\d+\.?\d*[万亿]?)\s*(?:条?评论|条回复)/);
    return match ? match[1] : null;
  }).catch(() => null);
  if (commentCount === '0' || commentCount === '0.0') {
    log('info', '  SKIP: video has no comments');
    return [];
  }

  // 4. 激活评论区
  const activated = await activateCommentPanel(page);
  log('info', `  Comment activation: ${activated}`);

  // 5. 尝试直接 API（最可靠）
  let allComments = await fetchCommentApi(page, videoId, opts);

  // 6. API 为空 → 回退到 DOM 提取
  if (allComments.length === 0) {
    log('info', '  API returned empty, trying DOM extraction...');

    // 先滚动评论区触发加载
    for (let i = 0; i < 3; i++) {
      await scrollCommentContainer(page, { px: 600, rounds: 1 });
      await sleep(500);
    }

    const domResult = await extractCommentsDOM(page, opts.maxComments || 200);
    if (domResult.comments?.length > 0) {
      allComments = domResult.comments.map(c => ({
        ...c,
        douyinId: c.douyinId || '',
        avatarUrl: c.avatarUrl || '',
        replyCount: c.replyCount || 0,
      }));
      log('info', `  DOM extracted ${allComments.length} comments`);
    }
  }

  // 7. 重试一次 API
  if (allComments.length === 0) {
    log('info', '  Retrying API call after delay...');
    await sleep(1500);
    allComments = await fetchCommentApi(page, videoId, opts);
  }

  // 8. 去重
  const deduped = [];
  for (const item of allComments) {
    const normalized = { ...item, keyword, videoUrl };
    if (!commentCache.add(normalized)) continue;
    deduped.push(normalized);
  }

  log('info', `  Collected: ${deduped.length} comments (after dedup)`);
  return deduped;
}

function videoIdFromUrl(url) {
  const match = String(url || '').match(/\/video\/([^/?#]+)/);
  return match ? match[1] : '';
}

// ── API 拦截 ──────────────────────────────────────

async function interceptApi(page, { urlPattern = '/comment/list/', timeout = 8000 } = {}) {
  return page.evaluate(({ pattern, ms }) => new Promise(resolve => {
    const results = [];
    const timer = setTimeout(() => {
      window.fetch = orig;
      resolve(results);
    }, ms);

    const orig = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const resp = await orig(...args);
      if (url.includes(pattern)) {
        try {
          const clone = resp.clone();
          const data = await clone.json();
          results.push({ url, data });
        } catch {}
      }
      return resp;
    };

    setTimeout(() => {
      clearTimeout(timer);
      window.fetch = orig;
      resolve(results);
    }, ms);
  }), { pattern: urlPattern, ms: timeout }).catch(() => []);
}

// ── 发布评论 ──────────────────────────────────────

async function postComment(page, { text }) {
  const result = await page.evaluate(async (txt) => {
    const input = document.querySelector('[contenteditable="true"], [class*="comment-input"], textarea, [class*="CommentInput"]');
    if (!input) return { posted: false, error: '找不到评论输入框' };
    input.focus();
    if (input.contentEditable === 'true') {
      input.innerText = txt;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } else {
      input.value = txt;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 500));
    const submit = document.querySelector('[class*="submit"], [class*="send"], button[class*="post"], [data-e2e*="submit"]');
    if (submit) submit.click();
    return { posted: true, text: txt };
  }, text).catch(e => ({ posted: false, error: e.message }));
  return result;
}

async function doLike(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('[class*="like-icon"], [class*="LikeIcon"], [data-e2e="like-icon"]');
    if (btn) { btn.click(); return { liked: true }; }
    return { liked: false, error: 'like button not found' };
  }).catch(() => ({ liked: false }));
}

// ── 人感操作 ──────────────────────────────────────

async function humanScroll({ totalPx = 500, stepsMin = 3, stepsMax = 8, pauseMin = 200, pauseMax = 600 } = {}) {
  const steps = rand(stepsMin, stepsMax);
  const perStep = Math.round(totalPx / steps);
  for (let i = 0; i < steps; i++) {
    await page.evaluate(px => {
      const el = document.scrollingElement || document.documentElement;
      if (el) el.scrollTop += px;
    }, perStep + rand(-20, 20));
    await sleep(rand(pauseMin, pauseMax));
  }
}

// ── 辅助函数 ──────────────────────────────────────

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}`.replace(/\/$/, '');
  } catch { return u; }
}

function tryGetUrl() {
  try { return page.url(); } catch { return ''; }
}

// ── 启动 ──────────────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1].endsWith('bridge.mjs') ||
  process.argv[1].endsWith('bridge')
);
if (isMain) {
  main().catch(err => {
    log('err', `Fatal: ${err.message}`);
    process.exit(1);
  });
}

// ══════════════════════════════════════════════════════
// BridgeSDK class — for vite plugin import
// ══════════════════════════════════════════════════════

export class BridgeSDK {
  constructor(opts = {}) {
    this.server   = opts.server   || 'ws://127.0.0.1:6008/ws';
    this.token    = opts.token    || 'openclaw-browser-bridge';
    this.cdpUrl   = opts.cdpUrl   || opts.cdp || 'http://127.0.0.1:9222';
    this.clientId = opts.clientId || (typeof os !== 'undefined' ? os.hostname() : 'sdk');
    this.resultDir = opts.resultDir || path.join(os.homedir(), 'Desktop', 'douyin-results');
    this.localPort = opts.localPort || 0;
    this.verbose  = opts.verbose !== false;

    this._cbReady         = opts.onReady;
    this._cbLoginRequired = opts.onLoginRequired;
    this._cbLoginDone     = opts.onLoginDone;
    this._cbStatus        = opts.onStatus;
    this._cbTaskProgress  = opts.onTaskProgress;
    this._cbTaskCompleted = opts.onTaskCompleted;

    this.ws = null;
    this.browser = null;
    this.page = null;
    this._running = false;
    this.localWss = null;
    this.localHttp = null;
    this.localClients = new Set();

    this.state = { douyinLoggedIn: false };
  }

  _log(level, msg) {
    if (!this.verbose && level === 'info') return;
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] [${level}] ${msg}`);
  }

  getStatus() {
    return {
      running: this._running,
      relayConnected: this.ws && this.ws.readyState === 1,
      browserConnected: this.browser != null,
      douyinLoggedIn: this.state.douyinLoggedIn,
    };
  }

  async start() {
    if (this._running) return;
    this._running = true;
    this._log('info', `BridgeSDK clientId=${this.clientId} server=${this.server}`);

    if (this.localPort > 0) {
      await new Promise((resolve) => {
        const srv = http.createServer();
        const wss = new WebSocketServer({ server: srv });
        wss.on('connection', (ws) => {
          this.localClients.add(ws);
          this._sendLocal(ws, { type: 'bridge_status', ...this.getStatus() });
          ws.on('message', (raw) => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.type === 'getStatus') this._sendLocal(ws, { type: 'bridge_status', ...this.getStatus() });
              else if (msg.type === 'startTask') this._handleStartTask(msg, ws);
            } catch {}
          });
          ws.on('close', () => this.localClients.delete(ws));
        });
        srv.listen({ port: this.localPort, host: '127.0.0.1' }, () => {
          this.localHttp = srv;
          this.localWss = wss;
          this._log('ok', `Local WS: ws://127.0.0.1:${srv.address().port}`);
          resolve();
        });
        srv.on('error', (e) => { this._log('err', `Local WS: ${e.message}`); resolve(); });
      });
    }

    this._connectBrowser();
    this._connectServer();
  }

  async stop() {
    this._running = false;
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    if (this.localWss) { try { this.localWss.close(); } catch {} this.localWss = null; }
    if (this.localHttp) { try { this.localHttp.close(); } catch {} this.localHttp = null; }
    if (this.browser) { try { await this.browser.disconnect(); } catch {} this.browser = null; this.page = null; }
    this.localClients.clear();
  }

  _sendLocal(ws, data) { try { if (ws.readyState === 1) ws.send(JSON.stringify(data)); } catch {} }

  _broadcastLocal(data) {
    if (!this.localWss) return;
    const payload = JSON.stringify(data);
    for (const ws of this.localClients) {
      try { if (ws.readyState === 1) ws.send(payload); } catch {}
    }
  }

  _handleStartTask(msg, ws) {
    const keyword = msg.keyword || '';
    const targetCount = msg.targetCount || 100;
    if (!keyword) { this._sendLocal(ws, { type: 'error', message: 'missing keyword' }); return; }

    this._log('info', `Task: "${keyword}" x ${targetCount}`);

    const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'douyin-automation.mjs');
    const child = spawn('node', [scriptPath, keyword, String(targetCount), '--stream'], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this._broadcastLocal({ type: 'taskProgress', keyword, phase: 'starting', message: `Starting: "${keyword}" x ${targetCount}`, collected: 0 });

    let buffer = '';
    let collectedTotal = 0;
    let lastComments = [];
    let taskCompletedSent = false;

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('===BATCH_START===') || line.startsWith('===BATCH_END===') || line.startsWith('===DONE===')) continue;
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('[')) continue;
        try {
          const data = JSON.parse(trimmed);
          if (data.accumulated !== undefined) {
            collectedTotal = data.accumulated;
            // Inject videoUrl and userUrl into each comment
            const enriched = (data.comments || []).map(c => ({
              ...c,
              videoUrl: c.videoUrl || data.videoUrl || '',
              userUrl: c.douyinId ? `https://www.douyin.com/user/${c.douyinId}` : '',
            }));
            if (enriched.length) lastComments = enriched;
            if (data.done) taskCompletedSent = true;
            this._broadcastLocal({
              type: data.done ? 'taskCompleted' : 'taskProgress', keyword,
              message: `Collected ${data.accumulated}/${data.target}`,
              collected: data.accumulated, total: data.done ? data.accumulated : undefined,
              status: data.done ? 'done' : undefined, comments: enriched,
              videoUrl: data.videoUrl, links: {},
            });
          } else if (data.total !== undefined && !taskCompletedSent) {
            collectedTotal = data.total;
            taskCompletedSent = true;
            this._broadcastLocal({ type: 'taskCompleted', keyword, total: data.total, status: 'done', comments: lastComments, links: {} });
          }
        } catch {}
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) this._log('warn', `[script stderr] ${text.slice(0, 300)}`);
    });

    child.on('close', (code) => {
      this._log('info', `Script exited code=${code} collected=${collectedTotal}`);
      if (collectedTotal === 0) {
        this._broadcastLocal({ type: 'taskCompleted', keyword, total: 0, status: 'error', error: code !== 0 ? `Script exit code ${code}` : 'No comments collected' });
      } else if (code === 0 && !taskCompletedSent) {
        this._broadcastLocal({ type: 'taskCompleted', keyword, total: collectedTotal, status: 'done', comments: lastComments, links: {} });
      }
    });

    child.on('error', (err) => {
      this._log('err', `Script spawn failed: ${err.message}`);
      this._broadcastLocal({ type: 'taskCompleted', keyword, total: 0, status: 'error', error: err.message });
    });
  }

  async _connectBrowser() {
    let attempt = 0;
    while (this._running) {
      attempt++;
      try {
        this.browser = await puppeteer.connect({ browserURL: this.cdpUrl, defaultViewport: null });
        const pages = await this.browser.pages();
        const douyinPage = pages.find(p => { try { return p.url().includes('douyin.com'); } catch { return false; } });
        this.page = douyinPage || pages[0] || await this.browser.newPage();
        this._log('ok', `Browser connected (${pages.length} tabs)`);

        try {
          const loginOk = await this._checkLogin();
          const wasLoggedIn = this.state.douyinLoggedIn;
          this.state.douyinLoggedIn = loginOk;
          if (loginOk && !wasLoggedIn) { this._cbLoginDone?.(); }
        } catch {}
        this._broadcastLocal({ type: 'bridge_status', ...this.getStatus() });
        return;
      } catch (e) {
        const delay = Math.min(2000 * Math.pow(2, Math.min(attempt - 1, 5)), 30000);
        await sleep(delay);
      }
    }
  }

  async _checkLogin() {
    if (!this.page) return false;
    const LOGIN_KEYS = ['passport_csrf_token','sessionid','sessionid_ss','sso_uid','sid_guard','uid_tt','sid_tt','odin_tt','ttwid'];

    try {
      const cdp = await this.page.createCDPSession();
      await cdp.send('Network.enable').catch(() => {});
      const { cookies } = await cdp.send('Network.getCookies', { urls: ['https://www.douyin.com', 'https://creator.douyin.com'] });
      await cdp.detach().catch(() => {});
      const found = cookies.filter(c => LOGIN_KEYS.some(k => c.name === k || c.name.toLowerCase().includes(k.toLowerCase())));
      if (found.length >= 2) { this._log('ok', `Logged in (cookie: ${found.map(c=>c.name).join(', ')})`); return true; }
    } catch {}

    // Only do DOM check if already on douyin.com
    const curUrl = (() => { try { return this.page.url(); } catch { return ''; } })();
    if (curUrl.includes('douyin.com')) {
      try {
        const domOk = await this.page.evaluate(() => {
          const body = document.body?.innerText || '';
          if (/(login|Login|LOGIN)/.test(body.slice(0, 1000))) return false;
          return !!document.querySelector('[data-e2e="user-avatar"], [class*="avatar"]');
        }).catch(() => false);
        if (domOk) { this._log('ok', 'Logged in (DOM)'); return true; }
      } catch {}
    }
    return false;
  }

  _connectServer() {
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    const url = `${this.server}?token=${encodeURIComponent(this.token)}&clientId=${encodeURIComponent(this.clientId)}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', async () => {
      this._log('ok', 'Relay connected');
      let loginOk = false;
      if (this.page && !this.page.isClosed()) {
        try { loginOk = await this._checkLogin(); } catch {}
      }
      this.state.douyinLoggedIn = loginOk;
      this.ws.send(JSON.stringify({ id: `ready_${Date.now()}`, type: 'event', event: 'client.ready', data: { clientId: this.clientId, douyinLoggedIn: loginOk } }));
      this._broadcastLocal({ type: 'bridge_status', ...this.getStatus() });
      if (this._cbReady) this._cbReady({ loginOk });
      if (!loginOk) {
        this._log('warn', 'Douyin not logged in');
        this.ws.send(JSON.stringify({ id: `lr_${Date.now()}`, type: 'event', event: 'client.loginRequired', data: { clientId: this.clientId } }));
        this._cbLoginRequired?.();
      }
    });

    this.ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'req') {
        try {
          if (!this.page || this.page.isClosed()) {
            const pages = await this.browser.pages();
            this.page = pages.find(p => { try { return p.url().includes('douyin.com'); } catch { return false; } }) || pages[0] || await this.browser.newPage();
          }
          const result = await this._dispatch(msg.method, msg.params || {});
          this.ws.send(JSON.stringify({ id: msg.id, type: 'res', result }));
        } catch (e) {
          this.ws.send(JSON.stringify({ id: msg.id, type: 'res', error: e.message }));
        }
      }
    });

    this.ws.on('close', () => {
      if (this._running) setTimeout(() => this._connectServer(), 5000);
    });
  }

  async _dispatch(method, params) {
    const p = this.page;
    switch (method) {
      case 'browser.navigate':
        await p.goto(params.url, { waitUntil: params.waitUntil || 'domcontentloaded', timeout: params.timeout || 20000 });
        return { url: p.url() };
      case 'browser.checkLogin': {
        const loggedIn = await this._checkLogin();
        this.state.douyinLoggedIn = loggedIn;
        return { loggedIn };
      }
      case 'browser.getCookies':
        try {
          const cdp = await p.createCDPSession();
          const { cookies } = await cdp.send('Network.getCookies', { urls: params.urls || ['https://www.douyin.com'] });
          await cdp.detach().catch(() => {});
          return { cookies };
        } catch { return { cookies: [] }; }
      case 'browser.extractComments':
      case 'browser.extractCommentsDOM':
        return await p.evaluate((max) => {
          const results = [];
          const seen = new Set();
          const containers = document.querySelectorAll('[class*="comment-list"], [class*="CommentList"], [class*="comment-container"]');
          const candidates = [];
          for (const c of containers) {
            for (const item of c.querySelectorAll('div, li')) {
              if (item.getBoundingClientRect().width >= 100) candidates.push(item);
            }
          }
          document.querySelectorAll('[class*="comment-item"], [class*="CommentItem"]').forEach(e => candidates.push(e));
          for (const el of [...new Set(candidates)]) {
            const text = (el.innerText || '').trim();
            if (text.length < 3) continue;
            const nameEl = el.querySelector('[class*="name"], [class*="nickname"], [class*="author"], a[href*="/user/"]');
            const nickname = (nameEl?.innerText || '').trim().slice(0, 40) || 'user';
            const key = `${nickname}|${text.slice(0, 30)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({ nickname, content: text.slice(0, 500), likes: 0 });
          }
          return { comments: results.slice(0, max || 100) };
        }, params.maxComments || 100).catch(() => ({ comments: [] }));
      case 'browser.extractSearchVideos':
        return await p.evaluate((max) => {
          const videos = [];
          const seen = new Set();
          document.querySelectorAll('a[href*="/video/"]').forEach(a => {
            const m = a.href.match(/\/video\/(\d+)/);
            if (m && !seen.has(m[1]) && videos.length < max) { seen.add(m[1]); videos.push({ videoId: m[1] }); }
          });
          return { videos };
        }, params.maxVideos || 30).catch(() => ({ videos: [] }));
      case 'browser.activateCommentPanel':
        await p.evaluate(() => {
          const s = document.scrollingElement || document.documentElement;
          if (s) s.scrollTop += 400;
        });
        await sleep(500);
        return { ok: true };
      case 'browser.scrollComments':
        for (let i = 0; i < (params.rounds || 2); i++) {
          await p.evaluate((px) => {
            const s = document.scrollingElement || document.documentElement;
            if (s) s.scrollTop += px;
          }, params.px || 600);
          await sleep(400);
        }
        return { ok: true };
      case 'browser.getUrl': return { url: p.url() };
      case 'browser.scroll':
        await p.evaluate((px) => { const s = document.scrollingElement || document.documentElement; if (s) s.scrollTop += px; }, params.px || 500);
        return { ok: true };
      case 'browser.randomDelay':
        await sleep(rand(params.min || 200, params.max || 600));
        return { ok: true };
      case 'browser.waitForSelector':
        try { await p.waitForSelector(params.selector, { timeout: params.timeout || 10000 }); return { found: true }; }
        catch { return { found: false }; }
      case 'browser.screenshot': {
        const buf = await p.screenshot({ type: 'png', fullPage: params.fullPage || false });
        return { screenshot: buf.toString('base64') };
      }
      default: throw new Error(`Unknown method: ${method}`);
    }
  }
}
