# OpenClaw Browser Connector — LLM 自适应抖音评论采集智能体

基于 DeepSeek v4-pro 的 ReAct 自适应评论采集系统。LLM 观察每一步结果，自主决策下一步操作，替代硬编码流程。

## 项目结构

```
├── openclaw-browser-connector/
│   ├── server/
│   │   ├── relay.mjs          # WS + REST API 核心中转 (端口 6008)
│   │   ├── mcp-server.mjs     # MCP 工具注册 (douyin_collect_comments 等)
│   │   ├── llm-collector.mjs  # DeepSeek ReAct 自适应采集引擎
│   │   ├── llm-parser.mjs     # 时间语义解析 (规则+LLM)
│   │   └── task-manager.mjs   # 任务管理
│   ├── client/
│   │   ├── bridge.mjs         # Windows 浏览器客户端 (puppeteer-core + CDP)
│   │   ├── collect-cli.mjs    # CLI 采集工具
│   │   └── gateway-client.mjs # Gateway 客户端
│   ├── protocol.mjs           # 协议定义
│   └── package.json
├── start-all.sh               # 一键启停脚本
└── start-gateway-daemon.sh    # Gateway 守护脚本
```

## 快速开始

### 1. 安装依赖

```bash
cd openclaw-browser-connector
npm install
```

### 2. 配置环境变量

```bash
export LLM_API_KEY="你的DeepSeek API Key"    # DeepSeek API Key
export LLM_MODEL="deepseek-v4-pro"           # 或 deepseek-v4-flash
export BROWSER_RELAY_TOKEN="你的Token"        # 中继 Token
```

### 3. 启动服务

```bash
# 后台启动所有服务
./start-all.sh --daemon

# 查看状态
./start-all.sh status

# 停止
./start-all.sh stop
```

### 4. Windows 客户端连接

在 Windows 机器上启动浏览器桥接：

```bash
node client/bridge.mjs --server ws://<服务器IP>:6008/ws --token <Token> --cdp http://127.0.0.1:9222
```

启动 Chrome 并开启远程调试：

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

## 服务架构

```
┌──────────┐   stdio   ┌───────────┐   HTTP   ┌─────────┐   WS   ┌──────────────┐
│ Gateway  │──────────▶│ MCP Server │────────▶│  Relay  │──────▶│Windows Bridge│
│  (6006)  │◀──────────│           │◀────────│  (6008) │◀──────│  (Chrome)    │
└──────────┘           └───────────┘          └─────────┘       └──────────────┘
```

- **Gateway**: 接收用户请求，管理 MCP 工具
- **MCP Server**: 注册抖音采集工具，调用 LLM 引擎
- **Relay**: 中转浏览器指令到 Windows 客户端
- **Windows Bridge**: puppeteer-core 连接本地 Chrome 执行操作

## LLM 自适应决策流程

采集任务由 DeepSeek v4-pro 自主决策，每次观察上一步结果后再决定下一步：

1. `search_videos` → 观察搜索结果（条数、标题相关性）
2. `open_video` → 观察视频内容和评论质量
3. `collect_comments` → 滚动采集，连续无新评论则换视频
4. `get_state` → 检查进度百分比
5. `finish_collection` → 达标或尽力后结束

LLM 根据实际数据判断：搜索无结果就换词、评论质量差就跳过、数量够了就停止。
