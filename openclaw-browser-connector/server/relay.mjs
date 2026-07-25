/**
 * Browser Relay + API Server — 合并版（单端口，配合公网映射）。
 *
 * 职责：
 * - WebSocket: 接受多个 Windows 客户端连接（每客户端唯一 clientId）
 * - REST API: 对外提供采集任务提交/查询接口
 * - Worker: 串行执行队列中的采集任务
 * - 全部在一个端口上（默认 6008，对应公网映射）
 *
 * 公网地址:
 *   WS:  wss://uu347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443/ws?token=...&clientId=xxx
 *   API: https://uu347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443/api/collect
 */

import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import { exec } from 'child_process';
import { makeRequest, makeResponse, makeEvent, SERVER_EVENTS } from '../protocol.mjs';
import { llmCollect } from './llm-collector.mjs';
import {
  createTask, getTask, updateTask, deleteTask, saveResult, getResult,
  listTasks, getNextQueued, getQueueLength, cleanupOldTasks, checkTimeout,
  resultPath,
} from './task-manager.mjs';
import { parseUserIntent } from './llm-parser.mjs';

const PORT = process.env.BROWSER_RELAY_PORT || 6008;
const AUTH_TOKEN = process.env.BROWSER_RELAY_TOKEN || 'openclaw-browser-bridge';
const API_TOKEN = process.env.DOUYIN_API_TOKEN || AUTH_TOKEN;

// ── 多客户端状态池 ───────────────────────────

/** @type {Map<string, { ws, clientId, ip, connectedAt, douyinLoggedIn, pending: Map }>} */
const clients = new Map();

function clientSummary(client) {
  return {
    clientId: client.clientId,
    ip: client.ip,
    connectedAt: client.connectedAt,
    douyinLoggedIn: client.douyinLoggedIn,
    pending: client.pending.size,
  };
}

// ── HTTP Server ──────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.end();

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // ══════════════════════════════════════════
  // 公开端点（不需要 API_TOKEN）
  // ══════════════════════════════════════════

  // GET /health — 客户端列表
  if (req.method === 'GET' && path === '/health') {
    const list = [...clients.values()].map(clientSummary);
    return res.end(JSON.stringify({
      ok: true,
      totalClients: clients.size,
      onlineClients: [...clients.values()].filter(c => c.douyinLoggedIn).length,
      clients: list,
    }));
  }

  // GET /clients/:id — 单个客户端详情
  const clientMatch = path.match(/^\/clients\/(.+)$/);
  if (req.method === 'GET' && clientMatch) {
    const cid = decodeURIComponent(clientMatch[1]);
    const client = clients.get(cid);
    if (!client) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok: false, error: `Client not found: ${cid}` }));
    }
    return res.end(JSON.stringify({ ok: true, client: clientSummary(client) }));
  }

  // POST /call — 浏览器指令（供 Skill 内部调用）
  if (req.method === 'POST' && path === '/call') {
    const body = await readBody(req);
    const { method, params = {}, timeout = 120000, clientId } = body; // ★ 默认 120s（多消息场景需要更长时间）

    if (!method) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'missing method' }));
    }

    let target;
    if (clientId) {
      target = clients.get(clientId);
      if (!target) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ error: `Client '${clientId}' not connected` }));
      }
    } else {
      for (const c of clients.values()) {
        if (c.douyinLoggedIn) { target = c; break; }
      }
      if (!target) for (const c of clients.values()) { target = c; break; }
      if (!target) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ error: 'No client connected' }));
      }
    }

    try {
      const result = await sendToClient(target, method, params, timeout);
      res.end(JSON.stringify({ ok: true, result, clientId: target.clientId }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: err.message, clientId: target.clientId }));
    }
    return;
  }

  // ══════════════════════════════════════════
  // API 端点（需要 API_TOKEN 鉴权）
  // ══════════════════════════════════════════

  if (path.startsWith('/api/')) {
    const auth = req.headers['authorization'] || '';
    const tokenParam = url.searchParams.get('token') || '';
    const token = auth.replace(/^Bearer\s+/i, '') || tokenParam;
    if (token !== API_TOKEN) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: 'unauthorized — 请提供有效的 Bearer token 或 ?token= 参数' }));
    }

    // POST /api/collect — 提交采集任务
    if (req.method === 'POST' && path === '/api/collect') {
      const body = await readBody(req);
      const { keyword, count = 100, clientId = null, timeRange = null } = body;

      if (!keyword || !keyword.trim()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, error: 'keyword 为必填项' }));
      }

      const task = createTask({ keyword: keyword.trim(), count, clientId, timeRange });
      const queuePos = getQueueLength();

      res.statusCode = 201;
      return res.end(JSON.stringify({
        ok: true,
        taskId: task.taskId,
        status: 'queued',
        queuePosition: queuePos,
        keyword: task.keyword,
        count: task.count,
        createdAt: task.createdAt,
        links: {
          self: `/api/tasks/${task.taskId}`,
          result: `/api/tasks/${task.taskId}/result`,
        },
      }));
    }

    // POST /api/chat — 自然语言采集（LLM 理解意图）
    if (req.method === 'POST' && path === '/api/chat') {
      const body = await readBody(req);
      const { message } = body;

      if (!message || !message.trim()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, error: 'message 为必填项，例如: {"message":"帮我采集小龙虾的评论"}' }));
      }

      console.log(`[api/chat] 收到: "${message}"`);
      const intent = await parseUserIntent(message.trim());

      if (!intent.keyword) {
        return res.end(JSON.stringify({
          ok: false,
          reply: intent.reply || '无法理解你的请求，请尝试说"采集小龙虾评论100条"',
        }));
      }

      // 有有效意图，创建任务
      const task = createTask({ keyword: intent.keyword, count: intent.count || 100, timeRange: intent.timeRange || null });
      const queuePos = getQueueLength();

      const trPart = intent.timeRange ? ` (${intent.timeRange.value}${intent.timeRange.unit === 'months' ? '个月' : intent.timeRange.unit === 'weeks' ? '周' : intent.timeRange.unit === 'days' ? '天' : '年'}内)` : '';
      res.statusCode = 201;
      return res.end(JSON.stringify({
        ok: true,
        reply: `好的！正在采集「${intent.keyword}」${trPart}的评论，目标 ${intent.count} 条。任务ID: ${task.taskId}`,
        taskId: task.taskId,
        keyword: task.keyword,
        count: task.count,
        queuePosition: queuePos,
        links: {
          self: `/api/tasks/${task.taskId}`,
          result: `/api/tasks/${task.taskId}/result`,
        },
      }));
    }

    // POST /api/agent/chat — 前端直连 Agent（走 OpenClaw Skill 体系）
    if (req.method === 'POST' && path === '/api/agent/chat') {
      const body = await readBody(req);
      const { message, sessionKey } = body;

      if (!message || !message.trim()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, error: 'message 为必填项' }));
      }

      // 检查是否是导出/下载相关请求，附带上可用任务信息
      const isExportRequest = /导出|下载|excel|csv|表格|xls|export|download/i.test(message);
      const completedTask = isExportRequest ? getLatestDoneTask() : null;

      const key = sessionKey || `web-${Date.now()}`;
      const cmd = `openclaw agent --session-key agent:main:${key} --message ${JSON.stringify(message.trim())} --json --timeout 600`;
      console.log(`[api/agent] → ${message.trim().slice(0, 60)}...`);

      try {
        const reply = await new Promise((resolve, reject) => {
          exec(cmd, { timeout: 610000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout.trim());
          });
        });

        let parsed;
        try { parsed = JSON.parse(reply); } catch { parsed = { text: reply }; }

        // 从 OpenClaw 深嵌套中提取回答文本
        const text = parsed?.result?.payloads?.[0]?.text
                  || parsed?.result?.finalAssistantVisibleText
                  || parsed?.text
                  || parsed?.reply
                  || reply;

        console.log(`[api/agent] ← ${text.slice(0, 60)}...`);

        const response = { ok: true, sessionKey: key, reply: text };

        // 如果用户请求导出，自动附带下载链接
        if (completedTask) {
          const base = process.env.PUBLIC_BASE_URL || `https://uu347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443`;
          response.tasks = [{
            taskId: completedTask.taskId,
            keyword: completedTask.keyword,
            total: completedTask.progress?.collected || completedTask.summary?.total || '?',
            downloadUrl: `${base}/api/tasks/${completedTask.taskId}/export?token=${encodeURIComponent(API_TOKEN)}`,
            csvUrl: `${base}/api/tasks/${completedTask.taskId}/export?format=csv&token=${encodeURIComponent(API_TOKEN)}`,
          }];
        }

        return res.end(JSON.stringify(response));
      } catch (err) {
        console.error(`[api/agent] 错误: ${err.message}`);
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // GET /api/tasks — 任务列表
    if (req.method === 'GET' && path === '/api/tasks') {
      const status = url.searchParams.get('status') || null;
      const page = parseInt(url.searchParams.get('page')) || 1;
      const size = Math.min(parseInt(url.searchParams.get('size')) || 20, 100);
      const result = listTasks({ status, page, size });
      return res.end(JSON.stringify({ ok: true, ...result }));
    }

    // GET /api/tasks/:id — 任务详情
    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (req.method === 'GET' && taskMatch) {
      const taskId = taskMatch[1];
      const task = getTask(taskId);
      if (!task) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ ok: false, error: `Task not found: ${taskId}` }));
      }
      const response = { ok: true, ...task };
      if (task.status === 'queued') {
        const allQueued = listTasks({ status: 'queued' }).items;
        response.queuePosition = allQueued.findIndex(t => t.taskId === taskId) + 1;
      }
      return res.end(JSON.stringify(response));
    }

    // GET /api/tasks/:id/result — 完整结果
    const resultMatch = path.match(/^\/api\/tasks\/(.+)\/result$/);
    if (req.method === 'GET' && resultMatch) {
      const taskId = resultMatch[1];
      const task = getTask(taskId);
      if (!task) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ ok: false, error: `Task not found: ${taskId}` }));
      }
      if (task.status !== 'done') {
        res.statusCode = 409;
        return res.end(JSON.stringify({ ok: false, error: `Task not done yet (status: ${task.status})` }));
      }
      const page = parseInt(url.searchParams.get('page')) || 1;
      const size = Math.min(parseInt(url.searchParams.get('size')) || 50, 200);
      const result = getResult(taskId, { page, size });
      if (!result) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ ok: false, error: '结果文件不存在' }));
      }
      return res.end(JSON.stringify({ ok: true, ...result }));
    }

    // DELETE /api/tasks/:id — 删除任务
    if (req.method === 'DELETE' && taskMatch) {
      const taskId = taskMatch[1];
      const task = getTask(taskId);
      if (!task) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ ok: false, error: `Task not found: ${taskId}` }));
      }
      if (task.status === 'running') {
        res.statusCode = 409;
        return res.end(JSON.stringify({ ok: false, error: 'Cannot delete running task' }));
      }
      deleteTask(taskId);
      return res.end(JSON.stringify({ ok: true, deleted: taskId }));
    }

    // GET /api/tasks/:id/export — 导出 Excel
    const exportMatch = path.match(/^\/api\/tasks\/(.+)\/export$/);
    if (req.method === 'GET' && exportMatch) {
      const taskId = exportMatch[1];
      const task = getTask(taskId);
      if (!task) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ ok: false, error: `Task not found: ${taskId}` }));
      }
      if (task.status !== 'done') {
        res.statusCode = 409;
        return res.end(JSON.stringify({ ok: false, error: `Task not done yet (status: ${task.status})` }));
      }
      const fullResult = JSON.parse(fs.readFileSync(resultPath(taskId), 'utf-8'));
      const format = url.searchParams.get('format') || 'xls';

      const safeKeyword = task.keyword.replace(/[^\w一-鿿]/g, '_').slice(0, 20) || 'export';

      if (format === 'csv') {
        const csv = generateCSV(fullResult);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeKeyword)}-${taskId}.csv`);
        return res.end('﻿' + csv); // BOM for Excel Chinese support
      }

      // 默认 HTML 格式 Excel（.xls）
      const html = generateExcelHTML(fullResult);
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeKeyword)}-${taskId}.xls`);
      return res.end(html);
    }

    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'API endpoint not found' }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

// ── WebSocket（多客户端连接管理）───────────────

const wss = new WebSocketServer({ noServer: true });

// ── WebSocket 心跳保活 ─────────────────────────
const HEARTBEAT_INTERVAL = 30_000;  // 每 30 秒 ping
const HEARTBEAT_TIMEOUT  = 300_000; // 5 分钟无 pong → 断连（bridge 可能正在执行长任务，如批量发消息）
const HEARTBEAT_GRACE    = 3;       // 连续 3 次无 pong 才判定死亡（避免偶发网络抖动误杀）

const heartbeatMissCount = new Map(); // clientId → 连续未响应次数

const heartbeatInterval = setInterval(() => {
  const now = Date.now();
  for (const [clientId, client] of clients) {
    if (client._dead) continue;

    const lastPong = client._lastPong || now;
    const elapsed = now - lastPong;

    if (elapsed > HEARTBEAT_TIMEOUT) {
      const misses = (heartbeatMissCount.get(clientId) || 0) + 1;
      heartbeatMissCount.set(clientId, misses);
      if (misses >= HEARTBEAT_GRACE) {
        console.log(`[relay] 💔 ${clientId} 心跳超时 (${Math.round(elapsed/1000)}s, 连续${misses}次)，断开`);
        client._dead = true;
        heartbeatMissCount.delete(clientId);
        try { client.ws.terminate(); } catch {}
        clients.delete(clientId);
        for (const [, { reject, timer }] of client.pending) {
          clearTimeout(timer);
          reject(new Error(`Client '${clientId}' heartbeat lost`));
        }
        client.pending.clear();
      } else {
        console.log(`[relay] ⚠️ ${clientId} 心跳延迟 (${Math.round(elapsed/1000)}s, 第${misses}次)，再容忍 ${HEARTBEAT_GRACE - misses} 次`);
      }
    } else {
      // 恢复了，重置计数
      if (heartbeatMissCount.has(clientId)) {
        console.log(`[relay] ✓ ${clientId} 心跳恢复`);
        heartbeatMissCount.delete(clientId);
      }
    }

    // 只在连接正常时 ping
    if (!client._dead && client.ws.readyState === 1) {
      try { client.ws.ping(); } catch {}
    }
  }
}, HEARTBEAT_INTERVAL);

wss.on('connection', (ws, req) => {
  const params = new URL(req.url || '/', 'http://localhost').searchParams;
  const token = params.get('token');
  const clientId = params.get('clientId') || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (token !== AUTH_TOKEN) {
    ws.close(4001, 'unauthorized');
    console.log(`[relay] 客户端 ${clientId} 鉴权失败`);
    return;
  }

  const existing = clients.get(clientId);
  if (existing) {
    console.log(`[relay] 踢掉旧连接: ${clientId}`);
    existing.ws.close(4000, 'replaced by new connection');
  }

  const client = {
    ws, clientId,
    ip: req.socket.remoteAddress,
    connectedAt: new Date().toISOString(),
    douyinLoggedIn: false,
    pending: new Map(),
    _lastPong: Date.now(),
    _dead: false,
  };
  clients.set(clientId, client);
  console.log(`[relay] 客户端已连接: ${clientId} (${client.ip}) [共 ${clients.size} 个在线]`);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'res' && msg.id && client.pending.has(msg.id)) {
      const { resolve, reject, timer } = client.pending.get(msg.id);
      clearTimeout(timer);
      client.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
    }

    if (msg.type === 'event') {
      console.log(`[relay] 事件 [${clientId}]: ${msg.event}`, msg.data || '');

      // ── 进度事件：来自 bridge 的实时采集进度 ──
      if (msg.event === 'client.progress' && msg.data) {
        const d = msg.data;
        const line = [
          `[progress:${clientId}]`,
          `[${d.phase || '?'}]`,
          d.message || '',
          d.details ? `(${d.details})` : '',
        ].filter(Boolean).join(' ');
        console.log(line);

        // 查找该客户端正在执行的任务并更新进度
        for (const task of listTasks({ status: 'running', page: 1, size: 50 }).items) {
          if (task.clientId === clientId) {
            const currentProgress = task.progress || {};
            const patch = {
              progress: {
                ...currentProgress,
                phase: d.phase,
                message: d.message,
                details: d.details,
                videoId: d.videoId || currentProgress.videoId,
                videoUrl: d.videoUrl || currentProgress.videoUrl,
                collected: d.collected ?? currentProgress.collected,
                ts: d.ts,
              },
            };
            updateTask(task.taskId, patch);
            break; // 一个客户端同时只有一个 running 任务
          }
        }
      }

      if (msg.event === 'client.ready') {
        if (msg.data?.clientId) {
          const declared = msg.data.clientId;
          if (declared !== clientId) {
            clients.delete(clientId);
            client.clientId = declared;
            clients.set(declared, client);
          }
        }
        client.douyinLoggedIn = msg.data?.douyinLoggedIn ?? false;
        console.log(`[relay] ${client.clientId} 就绪 (抖音${client.douyinLoggedIn ? '已' : '未'}登录)`);
      }
      if (msg.event === 'client.loginRequired') {
        client.douyinLoggedIn = false;
        console.log(`[relay] ⚠️  ${client.clientId} 需要登录抖音`);
      }
      if (msg.event === 'client.loginDone') {
        client.douyinLoggedIn = true;
        console.log(`[relay] ✓ ${client.clientId} 抖音登录完成`);
      }
    }
  });

  ws.on('pong', () => {
    client._lastPong = Date.now();
  });

  ws.on('close', () => {
    clients.delete(client.clientId);
    heartbeatMissCount.delete(client.clientId);
    console.log(`[relay] 客户端断开: ${client.clientId} [剩余 ${clients.size} 个在线]`);
    for (const [, { reject, timer }] of client.pending) {
      clearTimeout(timer);
      reject(new Error(`Client '${client.clientId}' disconnected`));
    }
    client.pending.clear();
    // 清空该客户端的请求队列
    const qEntry = clientQueues.get(client.clientId);
    if (qEntry) {
      for (const pendingFn of qEntry.queue) {
        try { pendingFn(); } catch {} // 让排队的请求也失败掉
      }
      clientQueues.delete(client.clientId);
    }
  });

  ws.on('error', (err) => console.error(`[relay] WS error [${client.clientId}]:`, err.message));
});

// ── 推送事件到指定客户端（Server → Client）─────

function sendEventToClient(clientId, eventName, data) {
  const client = clients.get(clientId);
  if (!client || client._dead || client.ws.readyState !== 1) return false;
  try {
    const event = makeEvent(eventName, data);
    client.ws.send(JSON.stringify(event));
    return true;
  } catch (err) {
    console.error(`[relay] 推送事件失败 [${clientId}]: ${err.message}`);
    return false;
  }
}

// ── 发送请求到指定客户端 ──────────────────────

// 请求队列：防止对同一客户端并发发送大量请求
const clientQueues = new Map(); // clientId → { queue: [], processing: bool }

function sendToClient(client, method, params, timeout) {
  return new Promise((resolve, reject) => {
    const req = makeRequest(method, params);

    const execute = () => {
      const timer = setTimeout(() => {
        client.pending.delete(req.id);
        reject(new Error(`Timeout: ${method} (${timeout}ms)`));
        processNextInQueue(client.clientId);
      }, timeout);

      client.pending.set(req.id, { resolve, reject, timer });

      try {
        client.ws.send(JSON.stringify(req));
      } catch (err) {
        clearTimeout(timer);
        client.pending.delete(req.id);
        reject(new Error(`Send failed: ${err.message}`));
        processNextInQueue(client.clientId);
      }
    };

    // 入队：同客户端请求串行化，避免浏览器端过载
    enqueueClientRequest(client.clientId, execute);
  });
}

function enqueueClientRequest(clientId, fn) {
  if (!clientQueues.has(clientId)) {
    clientQueues.set(clientId, { queue: [], processing: false });
  }
  const entry = clientQueues.get(clientId);
  entry.queue.push(fn);
  if (!entry.processing) {
    processNextInQueue(clientId);
  }
}

function processNextInQueue(clientId) {
  const entry = clientQueues.get(clientId);
  if (!entry) return;
  if (entry.queue.length === 0) {
    entry.processing = false;
    return;
  }
  entry.processing = true;
  const next = entry.queue.shift();
  // 请求间小延迟，让 bridge 端的浏览器有时间"呼吸"
  setTimeout(() => {
    try { next(); } catch (err) {
      console.error(`[relay] 队列执行异常 [${clientId}]: ${err.message}`);
      processNextInQueue(clientId);
    }
  }, 100);
}

// ── 并发 Worker ──────────────────────────────

/** @type {Map<string, boolean>} — clientId → 是否正在执行任务 */
const busyClients = new Map();

async function workerTick() {
  checkTimeout();

  // 获取所有 queued 任务（FIFO）
  const { items: queuedTasks } = listTasks({ status: 'queued', page: 1, size: 100 });

  for (const task of queuedTasks) {
    let assignedClient = null;

    // 任务指定了 clientId → 只分配给那个客户端
    if (task.clientId) {
      const c = clients.get(task.clientId);
      if (c && c.douyinLoggedIn && !busyClients.get(task.clientId)) {
        assignedClient = c;
      }
    } else {
      // 没指定 → 找任意空闲且已登录的客户端
      for (const c of clients.values()) {
        if (c.douyinLoggedIn && !busyClients.get(c.clientId)) {
          assignedClient = c;
          updateTask(task.taskId, { clientId: c.clientId });
          break;
        }
      }
    }

    if (!assignedClient) continue; // 暂无可用客户端，下轮再试

    const cid = assignedClient.clientId;
    busyClients.set(cid, true);
    runTask(task, cid).finally(() => busyClients.delete(cid));
  }
}

async function runTask(task, clientId) {
  console.log(`\n[worker:${clientId}] 🚀 开始: ${task.taskId} "${task.keyword}"`);
  updateTask(task.taskId, { status: 'running', clientId, progress: { collected: 0, target: task.count, elapsed: '0s' } });

  // ── 推送：任务开始 ──
  sendEventToClient(clientId, SERVER_EVENTS.TASK_PROGRESS, {
    taskId: task.taskId,
    keyword: task.keyword,
    count: task.count,
    timeRange: task.timeRange || null,
    phase: 'start',
    message: `开始采集「${task.keyword}」，目标 ${task.count} 条评论 (LLM 驱动)`,
  });

  const startTime = Date.now();
  const progressInterval = setInterval(() => {
    try {
      const t = getTask(task.taskId);
      if (!t || t.status !== 'running') return;
      updateTask(task.taskId, { progress: { ...t.progress, elapsed: `${Math.round((Date.now() - startTime) / 1000)}s` } });
    } catch { /* ok */ }
  }, 3000);

  try {
    // ★ 使用 LLM 驱动的采集引擎
    const result = await llmCollect({
      keyword: task.keyword,
      count: task.count,
      timeRange: task.timeRange || null,
      clientId,
      onAnalysis: ({ phase, message, decision, reasoning, collected }) => {
        // 更新任务进度
        const t = getTask(task.taskId);
        if (!t || t.status !== 'running') return;
        const newProgress = { ...t.progress };
        if (collected !== undefined) newProgress.collected = collected;
        if (decision) newProgress.lastDecision = decision;
        updateTask(task.taskId, { progress: newProgress });

        // ── 推送分析事件给 Windows 客户端（含 LLM 决策和推理）──
        sendEventToClient(clientId, SERVER_EVENTS.ANALYSIS, {
          taskId: task.taskId,
          phase,
          message,
          decision: decision || null,
          reasoning: reasoning || null,
          collected: collected || t.progress?.collected || 0,
          ts: new Date().toISOString(),
        });
      },
    });
    clearInterval(progressInterval);

    const summary = makeSummary(result);
    saveResult(task.taskId, result);
    updateTask(task.taskId, {
      status: result.status === 'partial' ? 'done' : result.status,
      progress: {
        collected: result.total,
        target: task.count,
        elapsed: `${result.elapsedSec}s`,
        iterations: result.iterations,
      },
      summary,
    });
    console.log(`[worker:${clientId}] ✅ 完成: ${task.taskId} | ${result.total} 条 | ${result.elapsedSec}s | ${result.iterations} 轮决策`);

    // ── 推送：任务完成（包含完整下载链接）──
    const finalSummary = {
      taskId: task.taskId,
      keyword: result.keyword,
      status: result.status === 'failed' ? 'failed' : 'done',
      collectedAt: result.collectedAt,
      total: result.total,
      target: result.target,
      elapsedSec: result.elapsedSec,
      iterations: result.iterations,
      finishReason: result.finishReason,
      summary,
      // ★ 完整的下载链接（bridge 用来自动拉取文件）
      links: {
        result: `/api/tasks/${task.taskId}/result`,
        export: `/api/tasks/${task.taskId}/export`,
        csv: `/api/tasks/${task.taskId}/export?format=csv`,
        xls: `/api/tasks/${task.taskId}/export`,
      },
      // ★ 服务器基地址（bridge 需要完整 URL 来下载）
      serverBase: process.env.PUBLIC_BASE_URL || `https://uu347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443`,
    };

    sendEventToClient(clientId, SERVER_EVENTS.TASK_COMPLETED, finalSummary);
    sendEventToClient(clientId, SERVER_EVENTS.TASK_PROGRESS, {
      taskId: task.taskId,
      phase: 'done',
      message: `采集完成: ${result.total} 条评论 | ${result.elapsedSec}s | ${result.iterations} 轮 LLM 决策`,
      collected: result.total,
    });
  } catch (err) {
    clearInterval(progressInterval);
    updateTask(task.taskId, {
      status: 'failed', error: err.message,
      progress: { elapsed: `${Math.round((Date.now() - startTime) / 1000)}s` },
    });
    console.error(`[worker:${clientId}] ❌ 失败: ${task.taskId} | ${err.message}`);

    // ── 推送：任务失败 ──
    sendEventToClient(clientId, SERVER_EVENTS.TASK_COMPLETED, {
      taskId: task.taskId,
      keyword: task.keyword,
      status: 'failed',
      error: err.message,
      elapsedSec: Math.round((Date.now() - startTime) / 1000),
      serverBase: process.env.PUBLIC_BASE_URL || `https://uu347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443`,
    });
  }
}

function makeSummary(result) {
  const comments = result.comments || [];
  const users = new Set(comments.map(c => c.nickname));
  const avgLikes = comments.length > 0
    ? Math.round((comments.reduce((s, c) => s + (c.likes || 0), 0) / comments.length) * 10) / 10 : 0;
  const wordFreq = {};
  for (const c of comments) {
    (c.content || '').split('').forEach(ch => {
      if (/[一-龥]/.test(ch)) wordFreq[ch] = (wordFreq[ch] || 0) + 1;
    });
  }
  const topKeywords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  const summary = { total: result.total, uniqueUsers: users.size, avgLikes, topKeywords };
  if (result.timeRange) summary.timeRange = result.timeRange;
  if (result.iterations) summary.iterations = result.iterations;
  if (result.finishReason) summary.finishReason = result.finishReason;
  return summary;
}

// ── 启动（独立运行）─────────────────────────────

if (process.argv[1]?.includes('relay.mjs')) {
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/ws')) {
      wss.handleUpgrade(req, socket, head, (ws) => { wss.emit('connection', ws, req); });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n┌───────────────────────────────────────────────┐`);
    console.log(`│  🐉 Douyin Collect — Relay + API (合并版)      │`);
    console.log(`├───────────────────────────────────────────────┤`);
    console.log(`│  HTTP+WS:  http://0.0.0.0:${PORT}                │`);
    console.log(`│  Token:    ${AUTH_TOKEN.slice(0, 10)}...            │`);
    console.log(`│                                               │`);
    console.log(`│  [公开]                                        │`);
    console.log(`│  GET  /health              → 客户端列表        │`);
    console.log(`│  POST /call                → 浏览器指令        │`);
    console.log(`│  WS   /ws                  → 客户端连接        │`);
    console.log(`│                                               │`);
    console.log(`│  [需鉴权: Bearer <token>]                      │`);
    console.log(`│  POST   /api/chat          → 自然语言采集(LLM)  │`);
    console.log(`│  POST   /api/collect       → 提交采集任务       │`);
    console.log(`│  GET    /api/tasks          → 任务列表          │`);
    console.log(`│  GET    /api/tasks/:id      → 任务详情+进度     │`);
    console.log(`│  GET    /api/tasks/:id/result → 完整结果        │`);
    console.log(`│  DELETE /api/tasks/:id      → 删除任务          │`);
    console.log(`└───────────────────────────────────────────────┘\n`);
  });

  // Worker: 每秒检查队列
  setInterval(workerTick, 1000);
  // 每5分钟自动检测所有客户端抖音登录状态
  setInterval(checkAllClientsLogin, 5 * 60_000);
  // 每小时清理过期任务
  setInterval(cleanupOldTasks, 60 * 60 * 1000);

  // 启动恢复：把上次崩掉时卡在 running 的任务重置为 queued
  recoverStaleRunningTasks();
}

// ── 自动登录监测 ──────────────────────────────

function checkAllClientsLogin() {
  for (const [clientId, client] of clients) {
    checkClientLogin(clientId, client).catch(() => {});
  }
}

async function checkClientLogin(clientId, client) {
  try {
    // 原有 DOM 检查
    const result = await sendToClient(client, 'browser.checkLogin', {}, 10_000);
    let loggedIn = result?.loggedIn ?? false;

    // ★ 新增：如果 DOM 没检测到登录，尝试同步 cookie 检查
    if (!loggedIn) {
      try {
        const cookieResult = await sendToClient(client, 'browser.getCookies', {
          urls: ['https://www.douyin.com', 'https://creator.douyin.com']
        }, 5_000);
        const cookies = cookieResult?.cookies || [];
        // 检查是否有抖音认证 cookie
        loggedIn = cookies.some(c =>
          c.name === 'passport_csrf_token' ||
          c.name === 'sessionid' ||
          c.name === 'sso_uid' ||
          (c.name && c.name.includes('passport'))
        );
        if (loggedIn) {
          console.log(`[relay] ${clientId} DOM 未检测到登录，但 cookie 验证通过 (${cookies.length} 个 cookie)`);
        }
      } catch {
        // getCookies 可能不被旧版 bridge 支持，忽略
      }
    }

    const prev = client.douyinLoggedIn;
    client.douyinLoggedIn = loggedIn;

    if (prev !== loggedIn) {
      console.log(`[relay] 🔔 ${clientId} 登录状态变更: ${prev ? '已登录' : '未登录'} → ${loggedIn ? '已登录' : '未登录'}`);
    }
  } catch {
    // 客户端可能断开或无响应，跳过
  }
}

// ── Excel 导出 ────────────────────────────────

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateExcelHTML(result) {
  const { keyword, collectedAt, total, comments } = result;
  const rows = comments.map((c, i) => `
  <tr>
    <td align="center">${i + 1}</td>
    <td>${escapeHtml(c.content)}</td>
    <td>${escapeHtml(c.nickname)}</td>
    <td>${escapeHtml(c.userId || '')}</td>
    <td align="center">${c.likes ?? 0}</td>
    <td align="center">${c.replyCount ?? 0}</td>
    <td>${c.publishedAt ? new Date(c.publishedAt).toLocaleString('zh-CN') : ''}</td>
    <td><a href="${escapeHtml(c.videoUrl || '')}">${escapeHtml((c.videoUrl || '').slice(0, 40))}</a></td>
  </tr>`).join('');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
    <x:ExcelWorksheet><x:Name>${escapeHtml(keyword)}评论</x:Name><x:WorksheetOptions>
      <x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
  </x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    table { border-collapse: collapse; }
    th, td { padding: 6px 10px; border: 1px solid #999; font-size: 12px; }
    th { background: #4472C4; color: #fff; font-weight: bold; white-space: nowrap; }
    td { vertical-align: top; }
    tr:nth-child(even) td { background: #F2F2F2; }
  </style>
</head>
<body>
  <h2>📊 抖音评论采集结果</h2>
  <p><b>关键词：</b>${escapeHtml(keyword)} &nbsp;|&nbsp; <b>采集时间：</b>${collectedAt} &nbsp;|&nbsp; <b>共 ${total} 条评论</b></p>
  <table>
    <thead><tr>
      <th>序号</th><th>评论内容</th><th>用户昵称</th><th>抖音号</th><th>点赞数</th><th>回复数</th><th>回复时间</th><th>作品链接</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function generateCSV(result) {
  const { comments } = result;
  const header = '序号,评论内容,用户昵称,抖音号,点赞数,回复数,回复时间,作品链接';
  const body = comments.map((c, i) => {
    const cells = [
      i + 1,
      `"${(c.content || '').replace(/"/g, '""')}"`,
      `"${(c.nickname || '').replace(/"/g, '""')}"`,
      `"${(c.userId || '').replace(/"/g, '""')}"`,
      c.likes ?? 0,
      c.replyCount ?? 0,
      c.publishedAt || '',
      c.videoUrl || '',
    ];
    return cells.join(',');
  }).join('\n');
  return `${header}\n${body}`;
}

// ── 任务工具 ──────────────────────────────────

function getLatestDoneTask() {
  try {
    const { items } = listTasks({ status: 'done', page: 1, size: 5 });
    return items[0] || null;
  } catch {
    return null;
  }
}

// ── 启动恢复：running → queued（仅当 clientId 仍然在线）───────────────

function recoverStaleRunningTasks() {
  try {
    const { items } = listTasks({ status: 'running', page: 1, size: 100 });
    if (items.length === 0) return;

    // 只恢复那些 clientId 仍然在线的任务
    const onlineClients = new Set(
      [...clients.values()].filter(c => c.douyinLoggedIn).map(c => c.clientId)
    );

    let recovered = 0, skipped = 0;
    for (const task of items) {
      const cid = task.clientId;
      if (!cid || !onlineClients.has(cid)) {
        // 客户端不在线或未指定 → 标记失败，不白等
        updateTask(task.taskId, {
          status: 'failed',
          error: cid
            ? `Relay 重启后 client '${cid}' 不在线，任务无法恢复`
            : 'Relay 重启后任务无法恢复（未绑定客户端）',
        });
        skipped++;
        console.log(`[relay]   ✗ ${task.taskId} "${task.keyword}" — clientId='${cid}' 不在线，标记失败`);
        continue;
      }

      updateTask(task.taskId, {
        status: 'queued',
        error: null,
        progress: { ...(task.progress || {}), recovered: true },
      });
      recovered++;
      console.log(`[relay]   ↻ ${task.taskId} "${task.keyword}" — clientId='${cid}' 在线，重入队列`);
    }

    if (recovered > 0 || skipped > 0) {
      console.log(`[relay] 🔄 任务恢复: ${recovered} 个重入队列, ${skipped} 个标记失败`);
    }
  } catch (err) {
    console.error(`[relay] 任务恢复失败: ${err.message}`);
  }
}

// ── 工具 ──────────────────────────────────────

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

export {};
