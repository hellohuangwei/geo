import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9222';

async function connect() {
  console.log('Connecting to Edge...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('douyin.com'))
    || browser.contexts()[0]?.pages()[0]
    || await browser.contexts()[0]?.newPage();

  await page.bringToFront();
  return { browser, page };
}

async function searchDouyin(page, keyword) {
  const q = encodeURIComponent(keyword);
  const url = `https://www.douyin.com/search/${q}?type=video`;
  console.log(`Navigating: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for search result cards to appear
  try {
    await page.waitForSelector('.search-result-card', { timeout: 10000 });
  } catch {
    await page.waitForTimeout(5000);
  }
  console.log('Search page loaded');
}

async function clickVideo(page, index = 0) {
  // Try clicking video links directly (search page uses <a href="/video/...">)
  return page.evaluate((idx) => {
    // First try <a> links to /video/
    const videoLinks = [...document.querySelectorAll('a[href*="/video/"]')]
      .filter(a => {
        const r = a.getBoundingClientRect();
        return r.width > 100 && r.height > 100;
      });
    if (videoLinks.length > 0 && idx < videoLinks.length) {
      // Dispatch click with mouse event for SPA navigation
      videoLinks[idx].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      // Also try regular click
      videoLinks[idx].click();
      return { ok: true, total: videoLinks.length, index: idx, method: 'video-link' };
    }

    // Fallback: search cards
    const cards = [...document.querySelectorAll('.search-result-card, .waterfall-videoCardContainer')]
      .filter(c => {
        const r = c.getBoundingClientRect();
        return r.width > 200 && r.height > 150;
      });
    if (cards.length > 0 && idx < cards.length) {
      cards[idx].click();
      return { ok: true, total: cards.length, index: idx, method: 'card' };
    }

    return { ok: false, total: 0 };
  }, index);
}

async function openComments(page) {
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const btn = document.querySelector('[data-e2e*="comment"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
}

async function scrollComments(page, rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
}

async function extractComments(page) {
  return page.evaluate(() => {
    const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l);

    // Find "评论(N)" section
    let start = lines.findIndex(l => /^评论\s*\d*$/.test(l) || /^评论\(\d+\)$/.test(l));
    if (start < 0) start = 0;

    const comments = [];
    let i = start + 1;

    while (i < lines.length - 2 && comments.length < 50) {
      const a = lines[i] || '';
      const b = lines[i + 1] || '';
      const c = lines[i + 2] || '';

      // Pattern: short text (username) + longer text (content) + "X周前·地点"
      const isTime = /\d+[周月天年小时分钟]前/.test(b) || /\d+[周月天年小时分钟]前/.test(c);
      const hasLocation = (b.includes('·') && b.length < 30) || (c.includes('·') && c.length < 30);
      const aLooksLikeName = a.length >= 2 && a.length < 40 && !a.includes(' ') && !a.includes('·');
      const bLooksLikeContent = b.length > 3 && b.length < 500 && !b.startsWith('@') && !/\d+[周月天年小时分钟]前/.test(b);

      // Skip UI elements
      const isSkip = (s) => {
        const skips = ['下载 APP', '© 抖音', '许可证', '举报', '展开', '留下你的精彩评论',
                       '相关搜索', '//', '认证徽章', '读屏标签', '手机随时看'];
        return skips.some(k => s.includes(k)) || s.startsWith('@');
      };

      if (!isSkip(a) && !isSkip(b)) {
        if (aLooksLikeName && bLooksLikeContent && (isTime || hasLocation)) {
          const meta = isTime ? b : c;
          const contentLine = isTime ? c : b;
          const metaParts = meta.split('·');
          const time = metaParts[0]?.trim() || '';
          const location = metaParts[1]?.trim() || '';

          if (contentLine && contentLine.length > 2) {
            comments.push({
              nickname: a, content: contentLine.substring(0, 300), time, location, likes: 0,
            });
            i += 3;
            continue;
          }
        }
      }
      i++;
    }

    return comments;
  });
}

function printComments(comments) {
  console.log(`\n===== ${comments.length} COMMENTS =====\n`);
  comments.forEach((c, i) => {
    console.log(`[${i + 1}] ${c.nickname}  ${c.time}  ${c.location}  ❤${c.likes}`);
    console.log(`    ${c.content.substring(0, 150)}`);
    console.log();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0] || '';
  const maxVideos = parseInt(args[1]) || 3;
  const commentsPerVideo = parseInt(args[2]) || 20;

  console.log(`Keyword: "${keyword || '(use current page)'}"  Videos: ${maxVideos}  Comments/video: ${commentsPerVideo}\n`);

  const { browser, page } = await connect();

  // Navigate if keyword provided
  if (keyword) {
    await searchDouyin(page, keyword);
  } else {
    console.log('Using current page:', page.url());
  }

  // Process videos
  for (let v = 0; v < maxVideos; v++) {
    console.log(`\n========== Video ${v + 1}/${maxVideos} ==========`);

    if (keyword || v > 0) {
      const clickResult = await clickVideo(page, v);
      console.log('Click result:', JSON.stringify(clickResult));
      if (!clickResult.ok) { console.log('No more videos'); break; }
    }

    await page.waitForTimeout(5000);
    console.log('URL:', page.url());

    if (!page.url().includes('modal_id') && !page.url().includes('/video/')) {
      console.log('Not on video detail, retrying...');
      // Try clicking link directly
      await page.evaluate((idx) => {
        const links = [...document.querySelectorAll('a[href*="/video/"]')]
          .filter(a => a.getBoundingClientRect().width > 100);
        if (links[idx]) links[idx].click();
      }, v);
      await page.waitForTimeout(5000);
    }

    const commentOpened = await openComments(page);
    console.log('Comments opened:', commentOpened);

    if (commentOpened) {
      await scrollComments(page, Math.max(3, commentsPerVideo / 5));
      const comments = await extractComments(page);
      printComments(comments);
    }

    // Close modal to go back to search results
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    console.log('Back to search results');
  }

  console.log('\n===== DONE =====');
  // Keep browser open
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
