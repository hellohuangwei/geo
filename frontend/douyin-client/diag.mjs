#!/usr/bin/env node
/**
 * 抖音登录诊断工具 — 逐步排查 CDP → 页面 → Cookie → 登录状态
 *
 * 用法: node diag.mjs
 */

import WebSocket from 'ws';

const CDP_HTTP = process.env.BRIDGE_CDP || 'http://127.0.0.1:9222';
const LOGIN_KEYS = [
  'passport_csrf_token','sessionid','sessionid_ss','sso_uid',
  'sid_guard','uid_tt','sid_tt','odin_tt','ttwid',
];

// ── 工具函数 ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

// ── CDP WebSocket 客户端 ──
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
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
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

// ── 主流程 ──
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  🔍 抖音登录诊断工具');
  console.log('═══════════════════════════════════════════\n');

  // ═══ Step 1: CDP 端口可达性 ═══
  console.log('【1】检查 CDP 调试端口...');
  let version;
  try {
    version = await fetchJson(`${CDP_HTTP}/json/version`);
    console.log(`   ✅ CDP 可达 — ${version.Browser}`);
    console.log(`   WebSocket: ${version.webSocketDebuggerUrl}\n`);
  } catch (e) {
    console.log(`   ❌ CDP 端口不可达: ${e.message}`);
    console.log('   → 请用以下命令启动浏览器:');
    console.log('     msedge --remote-debugging-port=9222\n');
    process.exit(1);
  }

  // ═══ Step 2: 列出所有标签页 ═══
  console.log('【2】列出所有标签页...');
  const targets = await fetchJson(`${CDP_HTTP}/json`);
  const pages = targets.filter(t => t.type === 'page');
  console.log(`   共 ${pages.length} 个页面:\n`);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const isDouyin = p.url.includes('douyin.com') ? ' 🎬 抖音' : '';
    console.log(`   [${i}] ${p.title || '(无标题)'}${isDouyin}`);
    console.log(`       URL: ${p.url.slice(0, 100)}`);
    console.log('');
  }

  // ═══ Step 3: 找抖音页面 ═══
  const douyinPage = pages.find(p => p.url.includes('douyin.com'));
  if (!douyinPage) {
    console.log('【3】⚠️  没有找到抖音页面!');
    console.log('   → 请在浏览器中打开 https://www.douyin.com/ 并登录\n');

    // 尝试创建一个
    console.log('   尝试通过浏览器级 CDP 创建新页面...');
    const browser = new CDPClient(version.webSocketDebuggerUrl);
    try {
      await browser.connect();
      const result = await browser.send('Target.createTarget', { url: 'https://www.douyin.com/' });
      console.log(`   ✅ 已创建新标签页, targetId=${result.targetId}`);
      await sleep(3000);
      browser.close();
    } catch (e) {
      console.log(`   ❌ 创建失败: ${e.message}`);
      browser.close();
      process.exit(1);
    }
  } else {
    console.log(`【3】✅ 找到抖音页面: ${douyinPage.title}`);
    console.log(`   URL: ${douyinPage.url.slice(0, 100)}\n`);
  }

  // 重新获取 targets（可能已创建新页面）
  const targets2 = await fetchJson(`${CDP_HTTP}/json`);
  const douyinTarget = targets2.find(t => t.url.includes('douyin.com') && t.type === 'page');
  if (!douyinTarget) {
    console.log('   ❌ 仍然没有抖音页面, 退出\n');
    process.exit(1);
  }

  // ═══ Step 4: 连接抖音页面并通过 CDP 获取 Cookie ═══
  console.log('【4】CDP 获取 Cookie...');
  const cdp = new CDPClient(douyinTarget.webSocketDebuggerUrl);
  await cdp.connect();

  // 4a: 先 enable Network
  await cdp.send('Network.enable').catch(() => {});
  console.log('   Network.enable 已发送');

  // 4b: 按 URL 获取
  const { cookies: urlCookies } = await cdp.send('Network.getCookies', {
    urls: ['https://www.douyin.com', 'https://creator.douyin.com', 'https://live.douyin.com'],
  });
  console.log(`   Network.getCookies(urls) → ${urlCookies.length} 个 cookie`);
  console.log(`   名称: [${urlCookies.map(c => c.name).join(', ')}]`);

  // 4c: 全局获取
  const { cookies: allCookies } = await cdp.send('Network.getAllCookies');
  console.log(`   Network.getAllCookies → ${allCookies.length} 个 cookie`);

  // 4d: 筛选登录 cookie
  const matchLogin = (cookies) => cookies.filter(c =>
    LOGIN_KEYS.some(k => c.name === k || c.name.toLowerCase().includes(k.toLowerCase()))
  );
  const urlMatch = matchLogin(urlCookies);
  const allMatch = matchLogin(allCookies);

  console.log(`\n   匹配登录 cookie (url): ${urlMatch.length} 个 → [${urlMatch.map(c => `${c.name}(${c.domain})`).join(', ')}]`);
  console.log(`   匹配登录 cookie (all): ${allMatch.length} 个 → [${allMatch.map(c => `${c.name}(${c.domain})`).join(', ')}]`);

  // ═══ Step 5: DOM 检测 ═══
  console.log('\n【5】DOM 登录检测...');
  const { result: domResult } = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      var body = document.body?.innerText || '';
      var info = {};

      // 5a: body 文本检测
      info.bodyHasLogin = /(立即登录|扫码登录|密码登录|请先登录)/.test(body.slice(0, 2000));
      info.bodySample = body.slice(0, 300);

      // 5b: 弹窗检测
      var modal = document.querySelector('[class*="login-modal"], [class*="login-mask"], [class*="loginModal"]');
      info.hasLoginModal = !!modal;

      // 5c: 用户头像
      var avatar = document.querySelector('[data-e2e="user-avatar"], [class*="avatar"], [class*="Avatar"]');
      info.hasAvatar = !!avatar;

      // 5d: localStorage
      try {
        info.localUid = localStorage.getItem('uid') || localStorage.getItem('user_id') || '';
      } catch(e) { info.localUid = ''; }

      // 5e: document.cookie
      info.docCookieKeys = document.cookie.split(';').map(function(c) { return c.trim().split('=')[0]; }).filter(Boolean);

      return JSON.stringify(info);
    })()`,
    returnByValue: true,
  });

  let domInfo = {};
  try { domInfo = JSON.parse(domResult?.value || '{}'); } catch {}
  console.log(`   body 含登录词: ${domInfo.bodyHasLogin}`);
  console.log(`   有登录弹窗:   ${domInfo.hasLoginModal}`);
  console.log(`   有用户头像:   ${domInfo.hasAvatar}`);
  console.log(`   localStorage uid: ${domInfo.localUid || '(空)'}`);
  console.log(`   document.cookie 键: [${(domInfo.docCookieKeys || []).join(', ')}]`);
  console.log(`   body 预览: ${(domInfo.bodySample || '').slice(0, 200)}`);

  cdp.close();

  // ═══ Step 6: 结论 ═══
  console.log('\n═══════════════════════════════════════════');
  console.log('  📋 诊断结论');
  console.log('═══════════════════════════════════════════');

  const cookieOk = urlMatch.length >= 2 || allMatch.length >= 2;
  const domOk = domInfo.hasAvatar && !domInfo.hasLoginModal && !domInfo.bodyHasLogin;
  const localOk = !!domInfo.localUid;

  console.log(`   Cookie 检测: ${cookieOk ? '✅ 已登录' : '❌ 未检测到登录 cookie'}`);
  console.log(`   DOM 检测:    ${domOk ? '✅ 已登录' : '❌ 页面显示未登录'}`);
  console.log(`   localStorage:${localOk ? '✅ 已登录' : '❌ 无登录信息'}`);

  if (!cookieOk && !domOk && !localOk) {
    console.log('\n   ⚠️  所有检测均失败! 可能原因:');
    console.log('   1. 浏览器中确实未登录 douyin.com');
    console.log('   2. 抖音已登出但浏览器仍显示缓存页面');
    console.log('   3. 登录 cookie 的域名不匹配');
    console.log('\n   建议:');
    console.log('   1. 在浏览器中打开 https://www.douyin.com/');
    console.log('   2. 确认页面右上角有你的头像/昵称');
    console.log('   3. 如果没有 → 点击登录按钮扫码登录');
    console.log('   4. 重新运行本诊断: node diag.mjs\n');
  } else if (!cookieOk) {
    console.log('\n   ⚠️  Cookie 检测失败但 DOM/存储检测通过');
    console.log('   → cookie 可能是 HttpOnly 或域名过滤导致');
    console.log('   → bridge 会使用 DOM 检测作为 fallback\n');
  }

  // 列出所有 cookie 的名称（调试用）
  if (allCookies.length > 0) {
    console.log(`\n   浏览器全部 ${allCookies.length} 个 cookie 名称:`);
    const names = [...new Set(allCookies.map(c => c.name))].sort();
    for (const n of names) {
      const c = allCookies.find(x => x.name === n);
      console.log(`     ${n}  → domain=${c.domain}, path=${c.path}, httpOnly=${c.httpOnly}`);
    }
  }
  console.log('');
}

main().catch(e => {
  console.error(`\n❌ 诊断失败: ${e.message}`);
  process.exit(1);
});
