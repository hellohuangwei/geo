#!/usr/bin/env node
/**
 * 抖音登录助手 — 在本地浏览器打开抖音，引导用户扫码登录。
 *
 * 纯 CDP 协议实现，不依赖 playwright-core（避免版本兼容问题）。
 *
 * 用法:
 *   node login.mjs
 *   node login.mjs --cdp http://127.0.0.1:9222
 */

import WebSocket from 'ws';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { spawn, spawnSync } from 'child_process';

const CDP = process.env.BRIDGE_CDP || 'http://127.0.0.1:9222';
const argv = process.argv.slice(2);
const cdpHttp = argv.includes('--cdp') ? argv[argv.indexOf('--cdp') + 1] : CDP;
const COOKIE_FILE = join(homedir(), '.douyin-cookies.json');

// ── CDP 客户端 ──────────────────────────────────────────────
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.ws = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('open', () => resolve());
      this.ws.on('error', (e) => reject(e));
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(`${msg.error.message || JSON.stringify(msg.error)}`));
          else resolve(msg.result);
        }
      });
    });
  }

  async send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.ws?.close(); }
}

// ── 辅助 ────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url) {
  const resp = await fetch(url);
  return resp.json();
}

// ── 浏览器调试模式自动启动 ────────────────────────────────

/**
 * 查找 Edge/Chrome 可执行文件路径。
 * 优先级: Edge (x86) → Edge (x64) → LocalAppData Edge → PATH 中的 msedge/chrome
 */
function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    'msedge',   // PATH 查找
    'chrome',   // fallback: Chrome
  ];
  for (const c of candidates) {
    // 全路径 → 检查文件是否存在；纯命令名 → spawnSync 验证
    if (c.includes('\\') || c.includes('/')) {
      if (existsSync(c)) return c;
    } else {
      try {
        const r = spawnSync(c, ['--version'], { timeout: 3000 });
        if (r.status === 0) return c;
      } catch { /* 不存在 */ }
    }
  }
  return candidates[0]; // 最终 fallback，让 spawn 报错
}

/**
 * 确保 CDP 调试端口可达。端口不可达时自动用临时 profile 启动 Edge。
 * 不杀主浏览器 — 使用独立的 user-data-dir 避免文件锁冲突。
 *
 * @param {string} cdpHttp  CDP HTTP 地址，如 http://127.0.0.1:9222
 * @param {number} port     调试端口号
 */
async function ensureCdp(cdpHttp, port = 9222) {
  // 先尝试连接，已开启就直接返回
  try {
    const v = await fetchJson(`${cdpHttp}/json/version`);
    console.log(`   ✓ 浏览器调试端口已就绪 (${v.Browser})`);
    return;
  } catch {
    console.log('   ⚠ 浏览器调试端口未开启，自动启动…');
  }

  const edgePath = findEdge();
  const userDataDir = join(tmpdir(), `edge-cdp-${Date.now()}`);
  mkdirSync(userDataDir, { recursive: true });
  console.log(`   → 启动: "${edgePath}" --remote-debugging-port=${port}`);
  console.log(`   → user-data-dir: ${userDataDir}`);

  const child = spawn(edgePath, [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    'https://www.douyin.com/',
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref(); // 主进程退出后浏览器继续运行

  // 轮询等待端口可达，最长 60s
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const v = await fetchJson(`${cdpHttp}/json/version`);
      console.log(`   ✓ 浏览器就绪 (${v.Browser}, 耗时 ${i + 1}s)\n`);
      return;
    } catch { /* 还没就绪 */ }
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`   等待浏览器启动… ${i + 1}s / 60s\r`);
    }
  }

  console.error('\n\n❌ 浏览器启动超时。请手动启动:\n');
  console.error('   msedge --remote-debugging-port=9222\n');
  process.exit(1);
}

// ── 主流程 ──────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  🎬 抖音登录助手 v3.1 (纯CDP + 自动调试)');
  console.log('═══════════════════════════════════════════\n');

  // 1. 确保浏览器调试端口就绪（自动启动）
  console.log(`[1/5] 检查浏览器 CDP 端点 ${cdpHttp} …`);
  await ensureCdp(cdpHttp);

  // 获取浏览器信息
  const version = await fetchJson(`${cdpHttp}/json/version`);
  console.log(`   浏览器: ${version.Browser}\n`);

  // 2. 选择一个页面
  console.log('[2/5] 选择/创建标签页…');
  const targets = await fetchJson(`${cdpHttp}/json`);
  let pageTarget = targets.find(t => t.url?.includes('douyin.com') && t.type === 'page');

  if (!pageTarget) {
    // 没有抖音页面 — 创建一个新的
    // 先随便找个 page target 或拿第一个 page
    const anyPage = targets.find(t => t.type === 'page');
    const wsUrl = anyPage?.webSocketDebuggerUrl || version.webSocketDebuggerUrl;

    if (!pageTarget) {
      // 通过浏览器级别的 CDP 创建新页面
      const browser = new CDPClient(version.webSocketDebuggerUrl);
      await browser.connect();
      const result = await browser.send('Target.createTarget', { url: 'about:blank' });
      const newTargetId = result.targetId;
      browser.close();

      // 等待新 target 出现
      await sleep(500);
      const updatedTargets = await fetchJson(`${cdpHttp}/json`);
      pageTarget = updatedTargets.find(t => t.id === newTargetId);
      if (!pageTarget) {
        console.error('   ❌ 无法创建新标签页');
        process.exit(1);
      }
    }
  }
  console.log(`   ✓ 使用页面: ${pageTarget.url}\n`);

  // 3. 连接到页面
  console.log('[3/5] 打开抖音…');
  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');

  // 导航到抖音
  await cdp.send('Page.navigate', { url: 'https://www.douyin.com/' });
  // 等待页面加载
  await cdp.send('Page.waitForLoadEvent', { eventName: 'DOMContentLoaded' }).catch(() => {});
  await sleep(2000);

  // 4. 检查登录状态
  const already = await checkLoginCDP(cdp);
  if (already) {
    await saveCookiesCDP(cdp);
    cdp.close();
    console.log('\n✅ 已登录，Cookie 已保存到:');
    console.log(`   ${COOKIE_FILE}\n`);
    console.log('现在可以启动 bridge 了:  node bridge.mjs\n');
    return;
  }

  // 5. 等待扫码
  console.log('[4/5] 请在浏览器中扫码登录…\n');

  const start = Date.now();
  const TIMEOUT = 120; // 秒

  while (Date.now() - start < TIMEOUT * 1000) {
    await sleep(3000);

    if (await checkLoginCDP(cdp)) {
      console.log('\n   ✓ 登录成功！\n');
      await saveCookiesCDP(cdp);
      cdp.close();
      console.log('[5/5] Cookie 已保存\n');
      console.log('═══════════════════════════════════════════');
      console.log('  ✅ 登录完成！');
      console.log('═══════════════════════════════════════════\n');
      console.log('接下来启动 bridge:  node bridge.mjs\n');
      return;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 10 === 0) {
      process.stdout.write(`   等待扫码… ${elapsed}s / ${TIMEOUT}s\r`);
    }
  }

  cdp.close();
  console.log('\n\n❌ 登录超时，请重试\n');
  process.exit(1);
}

// ── CDP 版登录检测 ─────────────────────────────────────────
async function checkLoginCDP(cdp) {
  try {
    // 通过 CDP Network.getCookies 检测（能读到 HttpOnly）
    const { cookies } = await cdp.send('Network.getCookies', {
      urls: ['https://www.douyin.com', 'https://creator.douyin.com'],
    });

    const keys = [
      'passport_csrf_token', 'sessionid', 'sessionid_ss',
      'sso_uid', 'sid_guard', 'uid_tt', 'sid_tt', 'odin_tt', 'ttwid',
    ];
    const found = cookies.filter(c =>
      keys.some(k => c.name === k || c.name.toLowerCase().includes(k.toLowerCase()))
    );
    if (found.length >= 2) return true;

    // DOM 检测
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const body = document.body?.innerText || '';
        if (/登录|扫码登录|密码登录|请先登录/.test(body)) return false;
        const modal = document.querySelector('[class*="login-modal"], [class*="login-mask"]');
        if (modal && modal.offsetParent !== null) return false;
        return !!document.querySelector('[data-e2e="user-avatar"], [class*="avatar"]');
      })()`,
      returnByValue: true,
    });
    return result?.value === true;
  } catch {
    return false;
  }
}

// ── CDP 版保存 Cookie ──────────────────────────────────────
async function saveCookiesCDP(cdp) {
  const { cookies } = await cdp.send('Network.getCookies', {
    urls: ['https://www.douyin.com', 'https://creator.douyin.com'],
  });
  // 扩展获取所有域的 cookie
  const allCookies = await cdp.send('Network.getAllCookies').catch(() => ({ cookies: [] }));

  // 合并去重
  const seen = new Set(cookies.map(c => c.name));
  for (const c of allCookies.cookies) {
    if (!seen.has(c.name)) cookies.push(c);
  }

  writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf-8');
}

main().catch((e) => {
  console.error('\n❌ 错误:', e.message);
  process.exit(1);
});
