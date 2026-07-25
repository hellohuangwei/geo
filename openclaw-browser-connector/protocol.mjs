/**
 * Browser Bridge 协议定义（共享模块）。
 *
 * Server ↔ Client 通过 WebSocket 通信，JSON 消息格式：
 *   { id, type: "req"|"res"|"event", method, params?, result?, error? }
 *
 * 所有浏览器操作、Cookie、登录状态保留在 Client 端，
 * Server 只发送指令、接收结果。
 */

// ── 协议常量 ──────────────────────────────────

export const PROTOCOL_VERSION = 1;

// Server → Client 的方法
export const METHODS = {
  // 导航
  NAVIGATE: 'browser.navigate',
  RELOAD:   'browser.reload',

  // 交互
  CLICK:    'browser.click',
  TYPE:     'browser.type',
  SCROLL:   'browser.scroll',
  PRESS_KEY: 'browser.pressKey',

  // 截图/信息
  SCREENSHOT: 'browser.screenshot',
  GET_HTML:   'browser.getHtml',
  GET_TEXT:   'browser.getText',
  GET_URL:    'browser.getUrl',

  // 高级操作（抖音专用）
  EXTRACT_COMMENTS: 'browser.extractComments',
  EXTRACT_VIDEO_IDS: 'browser.extractVideoIds',
  EXTRACT_SEARCH_VIDEOS: 'browser.extractSearchVideos',
  EXTRACT_FEED_VIDEOS: 'browser.extractFeedVideos',
  INTERCEPT_API:    'browser.interceptApi',
  WAIT_FOR_SELECTOR: 'browser.waitForSelector',

  // 状态
  CHECK_LOGIN: 'browser.checkLogin',
  GET_COOKIES: 'browser.getCookies',

  // 人感操作
  HUMAN_SCROLL:  'browser.humanScroll',
  HUMAN_CLICK:   'browser.humanClick',
  RANDOM_DELAY:  'browser.randomDelay',
};

// Client → Server 的事件
export const EVENTS = {
  READY:       'client.ready',
  DISCONNECT:  'client.disconnect',
  ERROR:       'client.error',
  LOGIN_REQUIRED: 'client.loginRequired',
  API_RESPONSE:   'client.apiResponse',
  PROGRESS:    'client.progress',
  LOGIN_DONE:  'client.loginDone',
};

// Server → Client 的推送事件（服务端主动推送分析/结果到 Windows 客户端）
export const SERVER_EVENTS = {
  TASK_PROGRESS:   'server.taskProgress',   // 中间分析过程
  TASK_COMPLETED:  'server.taskCompleted',  // 最终结果摘要
  ANALYSIS:        'server.analysis',        // 阶段性分析洞察
};

// ── 消息工厂 ──────────────────────────────────

let _nextId = 1;
export function nextId() { return `req_${_nextId++}_${Date.now()}`; }

export function makeRequest(method, params = {}) {
  return {
    id: nextId(),
    type: 'req',
    method,
    params,
    timestamp: Date.now(),
  };
}

export function makeResponse(id, result = null, error = null) {
  return {
    id,
    type: 'res',
    result,
    error,
    timestamp: Date.now(),
  };
}

export function makeEvent(event, data = {}) {
  return {
    id: nextId(),
    type: 'event',
    event,
    data,
    timestamp: Date.now(),
  };
}

// ── 参数校验 ──────────────────────────────────

export function validateRequest(msg) {
  if (!msg || typeof msg !== 'object') return 'invalid message';
  if (msg.type !== 'req') return 'not a request';
  if (!msg.method) return 'missing method';
  if (!METHODS[msg.method] && !Object.values(METHODS).includes(msg.method))
    return `unknown method: ${msg.method}`;
  return null;
}
