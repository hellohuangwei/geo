/**
 * Task Manager — 采集任务状态机 + JSON 文件持久化。
 *
 * 状态流: queued → running → done / failed
 *
 * 每个任务一个 JSON 文件: tasks/{taskId}.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = process.env.TASK_STORE_DIR || path.join(__dirname, '..', 'tasks');
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 单个任务最长 30 分钟
const TASK_RETENTION_MS = 24 * 60 * 60 * 1000; // 已完成任务保留 24h

// ── 确保目录 ────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
    console.log(`[task-manager] 任务目录: ${TASKS_DIR}`);
  }
}

// ── ID 生成 ──────────────────────────────────

function generateTaskId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hex = Math.random().toString(36).slice(2, 10);
  return `${date}-${hex}`;
}

// ── 文件路径 ─────────────────────────────────

function taskPath(taskId) {
  return path.join(TASKS_DIR, `${taskId}.json`);
}

export function resultPath(taskId) {
  return path.join(TASKS_DIR, `${taskId}-result.json`);
}

// ── 任务 CRUD ────────────────────────────────

export function createTask({ keyword, count = 100, clientId = null, timeRange = null }) {
  ensureDir();

  const taskId = generateTaskId();
  const task = {
    taskId,
    keyword,
    count: Math.min(count, 500), // 上限 500
    clientId,
    timeRange: timeRange || null, // { value, unit } e.g. { value: 3, unit: 'months' }
    status: 'queued',
    progress: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(taskPath(taskId), JSON.stringify(task, null, 2));
  console.log(`[task-manager] 任务创建: ${taskId} "${keyword}" x${task.count}`);
  return task;
}

export function getTask(taskId) {
  const p = taskPath(taskId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function updateTask(taskId, patch) {
  const task = getTask(taskId);
  if (!task) return null;

  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(taskPath(taskId), JSON.stringify(task, null, 2));
  return task;
}

export function deleteTask(taskId) {
  const p = taskPath(taskId);
  const rp = resultPath(taskId);
  let deleted = false;

  if (fs.existsSync(p)) { fs.unlinkSync(p); deleted = true; }
  if (fs.existsSync(rp)) { fs.unlinkSync(rp); deleted = true; }

  if (deleted) console.log(`[task-manager] 任务删除: ${taskId}`);
  return deleted;
}

// ── 结果存储 ─────────────────────────────────

export function saveResult(taskId, result) {
  // 完整评论存结果文件，task 文件只保留摘要
  const rp = resultPath(taskId);
  fs.writeFileSync(rp, JSON.stringify(result, null, 2));
  console.log(`[task-manager] 结果保存: ${taskId} (${result.total} 条)`);
}

export function getResult(taskId, { page = 1, size = 50 } = {}) {
  const rp = resultPath(taskId);
  if (!fs.existsSync(rp)) return null;

  const full = JSON.parse(fs.readFileSync(rp, 'utf-8'));
  const start = (page - 1) * size;
  const comments = (full.comments || []).slice(start, start + size);

  return {
    ...full,
    comments,
    page,
    size,
    totalComments: full.total || full.comments?.length || 0,
  };
}

// ── 列表查询 ─────────────────────────────────

export function listTasks({ status = null, page = 1, size = 20 } = {}) {
  ensureDir();

  let files = fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-result'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean);

  // 过滤状态
  if (status) {
    files = files.filter(t => t.status === status);
  }

  // 按创建时间倒序
  files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = files.length;
  const start = (page - 1) * size;
  const items = files.slice(start, start + size);

  return { total, page, size, items };
}

// ── 队列操作 ─────────────────────────────────

export function getNextQueued() {
  ensureDir();

  const files = fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-result'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .filter(t => t.status === 'queued')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // 先进先出

  return files[0] || null;
}

export function getQueueLength() {
  ensureDir();

  return fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-result'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .filter(t => t.status === 'queued')
    .length;
}

// ── 超时检查 ─────────────────────────────────

export function checkTimeout() {
  ensureDir();

  const now = Date.now();
  const files = fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-result'));

  for (const f of files) {
    try {
      const task = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf-8'));
      if (task.status === 'running') {
        const elapsed = now - new Date(task.updatedAt).getTime();
        if (elapsed > TASK_TIMEOUT_MS) {
          updateTask(task.taskId, {
            status: 'failed',
            error: `Task timeout (${Math.round(elapsed / 60000)}min)`,
          });
          console.log(`[task-manager] 任务超时: ${task.taskId}`);
        }
      }
    } catch { /* skip */ }
  }
}

// ── 清理过期任务 ─────────────────────────────

export function cleanupOldTasks() {
  ensureDir();

  const now = Date.now();
  const files = fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json'));

  let cleaned = 0;
  for (const f of files) {
    const p = path.join(TASKS_DIR, f);
    try {
      const task = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if ((task.status === 'done' || task.status === 'failed')) {
        const age = now - new Date(task.updatedAt).getTime();
        if (age > TASK_RETENTION_MS) {
          fs.unlinkSync(p);
          cleaned++;
        }
      }
    } catch { /* skip */ }
  }

  if (cleaned > 0) console.log(`[task-manager] 清理 ${cleaned} 个过期任务`);
}
