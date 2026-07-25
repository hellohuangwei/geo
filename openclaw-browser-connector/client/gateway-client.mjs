#!/usr/bin/env node
/**
 * OpenClaw Gateway Client — Windows 前端直连卡多
 *
 * 通过 OpenAI 兼容 HTTP API 与智能体对话，支持多客户端并发。
 *
 * 用法:
 *   node gateway-client.mjs                       交互式对话
 *   node gateway-client.mjs --message "查抖音热点"  单次对话
 *   node gateway-client.mjs --stream              流式输出
 *   node gateway-client.mjs --client-id my-pc-1   指定客户端 ID（多客户端隔离）
 */

import readline from 'readline';
import os from 'os';

// ══════════════════════════════════════════════════════
// 配置
// ══════════════════════════════════════════════════════

const CONFIG = {
  baseUrl: process.env.GATEWAY_URL || 'https://u347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443',
  token:  process.env.GATEWAY_TOKEN || 'ddc54cec5905da1c1b8ea3255c161b66f1456a1df0c5b2dd',
  model:  process.env.GATEWAY_MODEL || 'openclaw',
  clientId: process.env.GATEWAY_CLIENT_ID || os.hostname(),
};

// ══════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════

const API = `${CONFIG.baseUrl}/v1/chat/completions`;

/** 发送消息（同步模式） */
async function chat(messages, opts = {}) {
  const sessionKey = `agent:main:${opts.clientId || CONFIG.clientId}`;

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.token}`,
      'Content-Type': 'application/json',
      'x-openclaw-session-key': sessionKey,
    },
    body: JSON.stringify({
      model: CONFIG.model,
      messages,
      max_tokens: opts.maxTokens || 2000,
      temperature: opts.temperature,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gateway error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    usage: data.usage,
    model: data.model,
  };
}

/** 发送消息（流式 SSE 模式） */
async function chatStream(messages, opts = {}) {
  const sessionKey = `agent:main:${opts.clientId || CONFIG.clientId}`;

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.token}`,
      'Content-Type': 'application/json',
      'x-openclaw-session-key': sessionKey,
    },
    body: JSON.stringify({
      model: CONFIG.model,
      messages,
      max_tokens: opts.maxTokens || 2000,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gateway error ${res.status}: ${err}`);
  }

  // 逐行解析 SSE
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 最后一行可能不完整

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') continue;

      try {
        const chunk = JSON.parse(json);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          // 实时打印（调用方可替换为自己的 onToken 回调）
          if (opts.onToken) {
            opts.onToken(delta, fullContent);
          } else {
            process.stdout.write(delta);
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  return { content: fullContent };
}

// ══════════════════════════════════════════════════════
// 多客户端并发管理器
// ══════════════════════════════════════════════════════

class GatewayPool {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || CONFIG.baseUrl;
    this.token   = opts.token   || CONFIG.token;
    this.model   = opts.model   || CONFIG.model;
  }

  /**
   * 并发发送到多个客户端（共享同一个 Token，不同 session）
   *
   * @param {Array<{clientId: string, messages: Array}>} tasks
   * @returns {Promise<Array<{clientId: string, content: string}>>}
   */
  async broadcast(tasks) {
    const results = await Promise.allSettled(
      tasks.map(task =>
        (async () => {
          const res = await chat(task.messages, { clientId: task.clientId });
          return { clientId: task.clientId, content: res.content };
        })()
      )
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { clientId: tasks[i].clientId, error: r.reason?.message || String(r.reason) };
    });
  }
}

// ══════════════════════════════════════════════════════
// 交互式对话终端
// ══════════════════════════════════════════════════════

async function interactiveLoop() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[36m你 > \x1b[0m',
  });

  const history = []; // 只保留当前会话的上下文

  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  🤖 卡多 (OpenClaw Gateway)         ║`);
  console.log(`║  客户端: ${CONFIG.clientId.padEnd(26)}║`);
  console.log(`║  输入消息开始对话，输入 /exit 退出   ║`);
  console.log(`╚══════════════════════════════════════╝\n`);

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }
    if (input === '/exit' || input === '/quit') break;
    if (input === '/clear') { history.length = 0; console.log('✅ 上下文已清除\n'); rl.prompt(); continue; }

    // 添加到历史
    history.push({ role: 'user', content: input });

    console.log('');
    try {
      const useStream = process.argv.includes('--stream');
      if (useStream) {
        process.stdout.write('\x1b[33m卡多 > \x1b[0m');
        const result = await chatStream(history, { clientId: CONFIG.clientId });
        history.push({ role: 'assistant', content: result.content });
        console.log('\n');
      } else {
        process.stdout.write('\x1b[33m卡多 > \x1b[0m');
        const result = await chat(history, { clientId: CONFIG.clientId });
        console.log(result.content + '\n');
        history.push({ role: 'assistant', content: result.content });
      }
    } catch (e) {
      console.log(`\x1b[31m❌ ${e.message}\x1b[0m\n`);
      history.pop(); // 移除失败的消息
    }

    rl.prompt();
  }

  rl.close();
  console.log('\n👋 再见!\n');
}

// ══════════════════════════════════════════════════════
// 主入口
// ══════════════════════════════════════════════════════

const argv = process.argv.slice(2);
const hasArg = (flag) => argv.includes(flag);
const getArg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

// 覆盖配置
const clientId = getArg('--client-id') || CONFIG.clientId;
if (getArg('--client-id')) CONFIG.clientId = clientId;

async function main() {
  const message = getArg('--message') || getArg('-m');
  const isStream = hasArg('--stream') || hasArg('-s');

  if (message) {
    // ── 单次对话模式 ──
    const messages = [{ role: 'user', content: message }];

    if (isStream) {
      process.stdout.write('卡多 > ');
      await chatStream(messages, { clientId, onToken: undefined });
      console.log('');
    } else {
      const result = await chat(messages, { clientId });
      console.log(result.content);
    }
  } else {
    // ── 交互模式 ──
    await interactiveLoop();
  }
}

main().catch(err => {
  console.error(`\x1b[31mFatal: ${err.message}\x1b[0m`);
  process.exit(1);
});

// ══════════════════════════════════════════════════════
// 导出（作为模块被其他脚本引用时）
// ══════════════════════════════════════════════════════

export { chat, chatStream, GatewayPool, CONFIG };
