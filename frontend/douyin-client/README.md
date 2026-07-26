# 抖音采集客户端 v2.0

在你的电脑上运行，桥接服务器指令到本地浏览器。所有 Cookie、登录态留在本地。

## 环境要求

- Node.js 18+
- Windows / macOS / Linux
- Edge 或 Chrome 浏览器

## 快速开始

### 1. 安装

```bash
npm install
```

### 2. 启动浏览器调试模式

```cmd
:: Windows (以管理员运行 cmd/powershell)
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
```

### 3. 登录抖音

```bash
node login.mjs
```

### 4. 启动桥接

```bash
node bridge.mjs --server wss://<服务器IP>:8443/ws --token <token>
```

## 文件说明

| 文件 | 用途 |
|------|------|
| `bridge.mjs` | 核心守护进程，连服务器 WebSocket，接收指令操作本地浏览器 |
| `protocol.mjs` | 通信协议定义（服务器与客户端共享） |
| `login.mjs` | 抖音扫码登录，Cookie 保存到 `~/.douyin-cookies.json` |
| `package.json` | 依赖：`playwright-core` + `ws` |

## 架构

```
本地浏览器  ←──CDP:9222──  bridge.mjs  ──WebSocket──  服务器 (Claude)
               (playwright)              (ws)
```

服务器不直接接触浏览器，只通过 WebSocket 发送指令。
