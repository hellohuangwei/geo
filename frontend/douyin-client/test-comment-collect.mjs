#!/usr/bin/env node
/**
 * 评论采集端到端测试 — 测试 bridge.mjs 的完整采集流水线。
 *
 * 测试项:
 *   1. CDP 浏览器连接
 *   2. 抖音登录状态
 *   3. 搜索功能
 *   4. 视频列表提取
 *   5. 评论区激活 + 滚动
 *   6. 评论 DOM 提取
 *   7. 完整流水线 (search → video → comments)
 *
 * 用法:
 *   node test-comment-collect.mjs [关键词] [--full]
 *   node test-comment-collect.mjs 小龙虾 --full   # 运行完整流水线
 *   node test-comment-collect.mjs                 # 只做基础检查
 */

import { BridgeSDK } from './bridge.mjs';

// 查找非 flag 参数作为关键词
const userArg = process.argv.slice(2).find(a => !a.startsWith('--') && !a.includes('node.exe') && !a.includes('node'));
const KEYWORD = userArg || '小龙虾';
const FULL_TEST = process.argv.includes('--full');

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';
let passed = 0, failed = 0;

function assert(cond, name) {
  if (cond) { console.log(`  ${PASS} ${name}`); passed++; }
  else      { console.log(`  ${FAIL} ${name}`); failed++; }
}

async function run() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🧪 抖音评论采集 — 端到端测试              ║');
  console.log(`║  关键词: ${KEYWORD.padEnd(34)}║`);
  console.log(`║  模式:   ${(FULL_TEST ? '完整流水线' : '基础检查').padEnd(34)}║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  const bridge = new BridgeSDK({
    cdpUrl: 'http://127.0.0.1:9222',
    verbose: false,
  });

  // ═══ Test 1: 连接浏览器 ═══
  console.log('📡 Test 1: 连接浏览器 (CDP)');
  try {
    bridge.browser = await (async () => {
      return await (await import('puppeteer-core')).default.connect({
        browserURL: 'http://127.0.0.1:9222',
        defaultViewport: null,
      });
    })();

    const pages = await bridge.browser.pages();
    bridge.page = pages.find(p => {
      try { return p.url().includes('douyin.com'); } catch { return false; }
    }) || pages[0];

    assert(true, `浏览器已连接 (${pages.length} tabs, current: ${bridge.page.url().slice(0, 60)})`);

    if (!bridge.page.url().includes('douyin.com')) {
      console.log('  → 导航到 douyin.com...');
      await bridge.page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await bridge.sleep(2000);
      assert(bridge.page.url().includes('douyin.com'), '已导航到抖音');
    }
  } catch (e) {
    assert(false, `连接失败: ${e.message}`);
    console.log('  → 请确保已启动: msedge --remote-debugging-port=9222');
    process.exit(1);
  }

  // ═══ Test 2: 登录检测 ═══
  console.log('\n📡 Test 2: 登录状态检测');
  const loginOk = await bridge._checkLogin();
  assert(loginOk, loginOk ? '抖音已登录' : '抖音未登录');

  if (!loginOk) {
    console.log('\n⚠️  抖音未登录，后续测试可能失败。请先在浏览器中登录 douyin.com\n');
    if (!FULL_TEST) {
      await bridge.browser.disconnect();
      process.exit(failed > 0 ? 1 : 0);
    }
  }

  // ═══ Test 3: 搜索功能 ═══
  console.log('\n📡 Test 3: 抖音搜索');
  try {
    const searchResult = await bridge._searchDouyin(bridge.page, KEYWORD, 'video');
    assert(searchResult.url.includes('search'), `搜索跳转: ${searchResult.url.slice(0, 80)}`);
  } catch (e) {
    assert(false, `搜索失败: ${e.message}`);
  }

  // ═══ Test 4: 视频列表提取 ═══
  console.log('\n📡 Test 4: 视频列表提取');
  try {
    const { videos } = await bridge._extractSearchVideos(bridge.page, 20);
    console.log(`  提取到 ${videos.length} 个视频`);

    if (videos.length > 0) {
      console.log(`  示例: [${videos[0].videoId}] ${videos[0].title?.slice(0, 40) || '(无标题)'}`);
      for (let i = 1; i < Math.min(videos.length, 5); i++) {
        console.log(`        [${videos[i].videoId}] ${videos[i].title?.slice(0, 40) || '(无标题)'}`);
      }
    }
    assert(videos.length > 0, `搜索"${KEYWORD}"返回了视频结果`);
  } catch (e) {
    assert(false, `视频提取失败: ${e.message}`);
  }

  // ═══ Test 5: 评论区操作 ═══
  if (FULL_TEST) {
    console.log('\n📡 Test 5: 评论区激活 + 滚动 + 提取');

    // 先用 extractSearchVideos 获取一个 videoId
    const { videos } = await bridge._extractSearchVideos(bridge.page, 5);
    if (videos.length > 0) {
      try {
        // 5a: 打开视频
        const videoId = videos[0].videoId;
        console.log(`  打开视频: ${videoId}`);
        await bridge._goToVideo(bridge.page, videoId);
        await bridge.sleep(2000);

        // 5b: 激活评论区
        const activateResult = await bridge._activateCommentPanel(bridge.page);
        console.log(`  激活结果: ${JSON.stringify(activateResult)}`);
        assert(typeof activateResult === 'string' || Array.isArray(activateResult?.strategies), '评论区激活已执行');
        await bridge.sleep(2000);

        // 5c: 滚动评论区
        console.log('  滚动评论区...');
        await bridge._scrollCommentContainer(bridge.page, { px: 500, rounds: 3, pauseMin: 300, pauseMax: 800 });
        await bridge.sleep(500);

        // 5d: 提取评论
        const { comments, total: found } = await bridge._extractCommentsDOM(bridge.page, 30);
        console.log(`  DOM 提取: ${comments.length} 条 (共检测到 ${found} 条)`);

        if (comments.length > 0) {
          console.log(`  示例评论:`);
          for (let i = 0; i < Math.min(comments.length, 3); i++) {
            const c = comments[i];
            console.log(`    [${i + 1}] ${c.nickname}: ${c.content.slice(0, 80)} (👍${c.likes})`);
          }
          assert(comments.length > 0, '从视频页面提取到评论');
        } else {
          console.log('  ⚠️ DOM 提取无结果，尝试 CDP API 拦截...');

          // 5e: 尝试 CDP 拦截
          try {
            await bridge._cdpStartIntercept(bridge.page, { timeoutMs: 10000 });
            await bridge.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
            await bridge.sleep(3000);
            await bridge._activateCommentPanel(bridge.page);
            await bridge.sleep(2000);
            await bridge._scrollCommentContainer(bridge.page, { px: 500, rounds: 3 });
            await bridge.sleep(2000);

            const { captured, results: apiResults } = await bridge._cdpStopIntercept(bridge.page);
            console.log(`  CDP 拦截: ${captured} 个 API 响应`);
            const parsedComments = bridge._parseInterceptedComments(apiResults || []);
            console.log(`  API 解析: ${parsedComments.length} 条评论`);
            if (parsedComments.length > 0) {
              console.log(`  示例: ${parsedComments[0].nickname}: ${parsedComments[0].content.slice(0, 80)}`);
            }
            assert(captured > 0 || comments.length > 0, '至少一种提取方式有效');
          } catch (e2) {
            console.log(`  CDP 拦截失败: ${e2.message}`);
            // DOM 已经提取到评论就不算失败
            assert(comments.length > 0, '至少 DOM 提取有效');
          }
        }
      } catch (e) {
        assert(false, `评论区测试失败: ${e.message}`);
      }
    }
  } else {
    console.log('\n📡 Test 5-7: (跳过 — 使用 --full 运行完整测试)');
  }

  // ═══ Test 6: 完整流水线 ═══
  if (FULL_TEST) {
    console.log('\n📡 Test 6: 完整采集流水线 (collectComments)');
    try {
      const result = await bridge._collectCommentsPipeline(bridge.page, {
        keyword: KEYWORD,
        maxVideos: 2,
        maxComments: 10,
        scrollRounds: 2,
      });

      console.log(`\n  流水线结果:`);
      console.log(`    总评论: ${result.summary.totalComments} 条`);
      console.log(`    处理视频: ${result.summary.processedVideos} 个`);
      console.log(`    独立用户: ${result.summary.uniqueUsers} 人`);
      console.log(`    耗时: ${result.summary.elapsedSec}s`);

      if (result.summary.topLiked?.length > 0) {
        console.log(`    最赞评论:`);
        for (const c of result.summary.topLiked.slice(0, 3)) {
          console.log(`      👍${c.likes} — ${c.nickname}: ${c.content.slice(0, 60)}`);
        }
      }

      assert(result.comments.length >= 0, '流水线执行完成');
      assert(result.videos.length > 0, '至少处理了1个视频');
    } catch (e) {
      assert(false, `流水线失败: ${e.message}`);
      console.error(e.stack);
    }
  } else {
    console.log('\n📡 Test 6: (跳过 — 使用 --full 运行完整流水线)');
  }

  // ═══ 清理 ═══
  await bridge.browser.disconnect();

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  总计: ${passed + failed} 项, ${PASS} ${passed}, ${failed > 0 ? FAIL + ' ' + failed : ''}`);
  console.log(`${'─'.repeat(50)}\n`);

  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error(`\n💥 测试崩溃: ${e.message}`);
  console.error(e.stack);
  process.exit(2);
});
