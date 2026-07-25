#!/usr/bin/env node
/**
 * 抖音评论采集 — 客户端对话式 CLI（LLM 理解意图）。
 *
 * 用法：
 *   对话模式:  node collect-cli.mjs
 *   快速模式:  node collect-cli.mjs 帮我采集200条小龙虾的评论
 */

import readline from 'readline';

const API_BASE = process.env.COLLECT_API || 'https://uu347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443';
const API_TOKEN = process.env.COLLECT_TOKEN || 'sk-67843c97f8ea4110a0f55dc56ed9a245';

// ── 快速模式 ──────────────────────────────────

const quickMsg = process.argv.slice(2).join(' ');
if (quickMsg) {
  console.log(`🐉 "${quickMsg}"\n`);
  const result = await doChat(quickMsg);
  if (result?.taskId) await pollTask(result);
  process.exit(0);
}

// ── 对话模式 ──────────────────────────────────

console.log('┌─────────────────────────────────────────┐');
console.log('│  🐉 抖音评论采集 — AI 对话式            │');
console.log('│  直接说人话，我来理解你的意图            │');
console.log('│  例如: "帮我采集小龙虾的评论"            │');
console.log('└─────────────────────────────────────────┘\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

while (true) {
  const msg = await ask('\n💬 你想采集什么？("exit" 退出): ');
  if (!msg.trim()) continue;
  if (msg.toLowerCase() === 'exit') break;

  const result = await doChat(msg.trim());
  if (result?.taskId) await pollTask(result);

  // 如果 LLM 返回了 reply 但没有 taskId (没理解)，继续对话
  if (result?.reply && !result?.taskId) {
    console.log(`\n🤖 ${result.reply}`);
  }
}

rl.close();
console.log('👋 再见！');
process.exit(0);

// ── 发自然语言消息给服务端 LLM 解析 ──────────

async function doChat(message) {
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.log(`❌ 连接失败: ${err.message}`);
    return null;
  }
}

// ── 轮询任务进度 ─────────────────────────────

async function pollTask(task) {
  let dots = 0;
  while (true) {
    const res = await fetch(`${API_BASE}/api/tasks/${task.taskId}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    const t = await res.json();
    const p = t.progress;

    if (t.status === 'done') {
      process.stdout.write(`\r✅ 采集完成！${p?.collected || '?'} 条，${p?.elapsed || '?'}     \n`);
      // 获取结果
      const rRes = await fetch(`${API_BASE}/api/tasks/${task.taskId}/result?page=1&size=${task.count || 100}`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      });
      const r = await rRes.json();
      if (r.ok) {
        console.log(`\n📋 评论预览:\n${'─'.repeat(70)}`);
        r.comments.slice(0, 10).forEach((c, i) => {
          const content = c.content.length > 45 ? c.content.slice(0, 45) + '…' : c.content;
          console.log(`  ${i + 1}. [${c.nickname}] ${content}  👍${c.likes}`);
          if (c.commentUrl) console.log(`     💬 ${c.commentUrl}`);
          if (c.profileUrl) console.log(`     👤 ${c.profileUrl}`);
        });
        if (r.totalComments > 10) console.log(`  ... 还有 ${r.totalComments - 10} 条`);
        console.log('─'.repeat(70));
        // 保存
        const fs = await import('fs');
        const fn = `douyin-${task.keyword || 'result'}-${new Date().toISOString().slice(0, 10)}.json`;
        fs.writeFileSync(fn, JSON.stringify(r.comments || r, null, 2), 'utf-8');
        console.log(`💾 已保存: ${fn}\n`);
      }
      break;
    }
    if (t.status === 'failed') {
      console.log(`\n❌ 失败: ${t.error}\n`);
      break;
    }
    if (p && p.collected !== undefined) {
      const pct = Math.round((p.collected / p.target) * 100);
      const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
      process.stdout.write(`\r  [${bar}] ${pct}% ${p.collected}/${p.target} ${p.elapsed}`);
    } else {
      process.stdout.write(`\r  排队中${'.'.repeat(dots % 4)}   `);
      dots++;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}
