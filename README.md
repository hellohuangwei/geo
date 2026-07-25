# OpenClaw Agent — LLM 自适应抖音评论采集

基于 DeepSeek v4-pro 的 ReAct 自适应评论采集系统。LLM 观察每一步结果，自主决策下一步操作。

## 项目结构

```
├── openclaw-gateway/                # Gateway 大脑（openclaw npm 包）
│   ├── openclaw.mjs                 # 入口
│   ├── dist/                        # 编译后代码
│   ├── skills/                      # 内置技能（54个）
│   └── package.json
├── openclaw-browser-connector/      # 浏览器连接器
│   ├── server/
│   │   ├── relay.mjs                # WS + REST API 核心中转 (6008)
│   │   ├── mcp-server.mjs           # MCP 工具 (douyin_collect_comments等)
│   │   ├── llm-collector.mjs        # DeepSeek ReAct 自适应采集引擎
│   │   ├── llm-parser.mjs           # 时间语义解析
│   │   └── task-manager.mjs         # 任务管理
│   ├── client/
│   │   ├── bridge.mjs               # Windows 浏览器客户端
│   │   ├── collect-cli.mjs          # CLI 采集
│   │   └── gateway-client.mjs       # Gateway 客户端
│   ├── protocol.mjs                 # 协议定义
│   └── package.json
├── start-all.sh                     # 一键启停
└── start-gateway-daemon.sh          # Gateway 守护
```

## Windows 完整部署

### 1. 安装依赖

```bash
git clone -b agent https://github.com/hellohuangwei/geo.git
cd geo

# 安装 browser-connector 依赖
cd openclaw-browser-connector
npm install
cd ..

# 安装 gateway 依赖
cd openclaw-gateway
npm install --production
cd ..
```

### 2. 配置环境变量

```bash
# DeepSeek API（采集决策用）
set LLM_API_KEY=你的DeepSeek_API_Key
set LLM_MODEL=deepseek-v4-pro

# Relay 连接 Token
set BROWSER_RELAY_TOKEN=openclaw-browser-bridge

# 如果你有远程服务器，设置 relay 地址
set BROWSER_RELAY_URL=http://127.0.0.1:6008
```

### 3. 启动 Chrome 远程调试

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### 4. 启动服务

```bash
# 启动 Relay（核心中转）
cd openclaw-browser-connector
node server/relay.mjs

# 另一个终端：启动 Gateway
cd openclaw-gateway
node openclaw.mjs gateway run --port 6006 --bind loopback --auth token
```

### 5. 连接 Bridge

```bash
cd openclaw-browser-connector
node client/bridge.mjs --server ws://127.0.0.1:6008/ws --token openclaw-browser-bridge --cdp http://127.0.0.1:9222
```

## 服务架构

```
┌──────────┐   stdio   ┌───────────┐   HTTP   ┌─────────┐   WS   ┌──────────────┐
│ Gateway  │──────────▶│ MCP Server │────────▶│  Relay  │──────▶│Windows Bridge│
│  (6006)  │◀──────────│           │◀────────│  (6008) │◀──────│  (Chrome)    │
└──────────┘           └───────────┘          └─────────┘       └──────────────┘
```

## LLM 自适应决策

采集任务由 DeepSeek v4-pro 自主决策：

1. `search_videos` → 观察结果，无结果自动换词
2. `open_video` → 判断评论质量，低质跳过
3. `collect_comments` → 滚动采集，采完换视频
4. `get_state` → 检查进度
5. `finish_collection` → 达标停止
