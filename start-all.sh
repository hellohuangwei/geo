#!/bin/bash
# ============================================================
# OpenClaw Browser Connector — 一键启动全部服务
# ============================================================
#
# 服务列表:
#   1. relay        — WS + REST API  端口 6008 (核心中转)
#   2. openclaw-gateway — Agent 网关  端口 6006 (自动拉起 MCP Server)
#
# 用法:
#   ./start-all.sh           前台启动（看日志）
#   ./start-all.sh --daemon  后台启动
#   ./start-all.sh stop      停止所有服务
#   ./start-all.sh status    查看服务状态
# ============================================================

set -e

PROJECT_DIR="/root/openclaw-browser-connector"
LOG_DIR="/tmp/openclaw-services"
PID_DIR="/tmp/openclaw-services/pids"

# 环境变量
export BROWSER_RELAY_PORT="${BROWSER_RELAY_PORT:-6008}"
export BROWSER_RELAY_TOKEN="${BROWSER_RELAY_TOKEN:-openclaw-browser-bridge}"
export DOUYIN_API_TOKEN="${DOUYIN_API_TOKEN:-openclaw-browser-bridge}"
export BROWSER_RELAY_URL="${BROWSER_RELAY_URL:-http://127.0.0.1:6008}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://uu347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443}"
export NODE_TLS_REJECT_UNAUTHORIZED=0

mkdir -p "$LOG_DIR" "$PID_DIR"

# ── 颜色 ──────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[start-all]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; }

# ── PID 管理 ──────────────────────────────────

write_pid() { echo $2 > "$PID_DIR/$1.pid"; }
read_pid()  { cat "$PID_DIR/$1.pid" 2>/dev/null; }
is_running() {
  local pid=$(read_pid "$1")
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# ── 停止 ──────────────────────────────────────

do_stop() {
  log "停止所有服务..."
  # 停止 relay
  if is_running "relay"; then
    local pid=$(read_pid "relay")
    kill "$pid" 2>/dev/null
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$PID_DIR/relay.pid"
    ok "relay (PID $pid) 已停止"
  else
    warn "relay 未运行"
  fi
  # 停止 gateway (通过守护脚本)
  /root/start-gateway-daemon.sh stop 2>/dev/null
  ok "openclaw-gateway 已停止"
  log "全部停止"
}

# ── 状态 ──────────────────────────────────────

do_status() {
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  echo -e "${CYAN}  OpenClaw 服务状态${NC}"
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  echo ""

  for svc in relay; do
    if is_running "$svc"; then
      local pid=$(read_pid "$svc")
      echo -e "  ${GREEN}●${NC} $svc — PID $pid"
    else
      echo -e "  ${RED}○${NC} $svc — 未运行"
    fi
  done
  # gateway 状态用守护脚本
  if /root/start-gateway-daemon.sh status | grep -q "Running"; then
    echo -e "  ${GREEN}●${NC} openclaw-gateway — $(/root/start-gateway-daemon.sh status)"
  else
    echo -e "  ${RED}○${NC} openclaw-gateway — 未运行"
  fi

  echo ""
  echo -e "${CYAN}端口监听:${NC}"
  # 用 netstat 或 lsof
  if command -v lsof &>/dev/null; then
    lsof -i -P -n 2>/dev/null | grep LISTEN | grep -E '6006|6008|9700' || echo "  (无)"
  elif command -v netstat &>/dev/null; then
    netstat -tlnp 2>/dev/null | grep -E '6006|6008' || echo "  (无)"
  else
    echo "  (无法检测端口)"
  fi

  echo ""

  # Relay 健康检查
  if curl -sf http://localhost:6008/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}Relay /health${NC} → $(curl -s http://localhost:6008/health | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f"{d[\"totalClients\"]} clients, {d[\"onlineClients\"]} online")' 2>/dev/null || echo 'OK')"
  fi

  # Gateway 健康检查
  if curl -sf http://localhost:6006/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}Gateway /health${NC} → OK"
  fi

  echo ""
}

# ── 启动服务 ──────────────────────────────────

start_relay() {
  if is_running "relay"; then
    warn "relay 已在运行 (PID $(read_pid relay))"
    return 0
  fi
  log "启动 relay (端口 $BROWSER_RELAY_PORT) ..."
  cd "$PROJECT_DIR"
  nohup node server/relay.mjs >> "$LOG_DIR/relay.log" 2>&1 &
  write_pid "relay" $!
  sleep 2
  if is_running "relay" && curl -sf http://localhost:$BROWSER_RELAY_PORT/health > /dev/null 2>&1; then
    ok "relay 已启动 (PID $!)"
  else
    fail "relay 启动失败，查看日志: $LOG_DIR/relay.log"
    return 1
  fi
}

start_gateway() {
  if /root/start-gateway-daemon.sh status | grep -q "Running"; then
    warn "openclaw-gateway 已在运行"
    return 0
  fi
  log "启动 openclaw-gateway (守护模式, 崩溃自动重启) ..."
  nohup /root/start-gateway-daemon.sh start > /dev/null 2>&1
  sleep 3
  if /root/start-gateway-daemon.sh status | grep -q "Running"; then
    ok "openclaw-gateway 已启动 (守护模式)"
    log "MCP Server (browser-connector) 由 Gateway 自动拉起"
  else
    fail "openclaw-gateway 启动失败，查看日志: /var/log/openclaw-gateway.log"
    return 1
  fi
}

# ── 前台模式 ──────────────────────────────────

start_foreground() {
  log "前台模式启动所有服务 (Ctrl+C 停止) ..."
  echo ""

  # 先停掉已有的
  do_stop
  sleep 1

  cd "$PROJECT_DIR"

  # 用 trap 确保 Ctrl+C 时全部停止
  trap 'log "收到中断信号，停止所有服务..."; kill 0; exit 0' INT TERM

  # 启动 relay
  log "启动 relay ..."
  node server/relay.mjs &
  RELAY_PID=$!
  sleep 2

  # 启动 gateway (守护模式)
  log "启动 openclaw-gateway (守护模式) ..."
  /root/start-gateway-daemon.sh start > /dev/null 2>&1
  sleep 3

  echo ""
  ok "全部服务已启动:"
  echo "  relay:            PID $RELAY_PID  端口 $BROWSER_RELAY_PORT"
  echo "  openclaw-gateway: 守护模式         端口 6006"
  echo "  mcp-server:       由 Gateway 自动管理"
  echo ""
  log "按 Ctrl+C 停止所有服务"

  wait
}

# ── 后台模式 ──────────────────────────────────

start_daemon() {
  log "后台模式启动所有服务 ..."
  start_relay
  start_gateway
  echo ""
  ok "全部服务已后台启动"
  echo ""
  do_status
}

# ── 主入口 ────────────────────────────────────

case "${1:-}" in
  stop)
    do_stop
    ;;
  status)
    do_status
    ;;
  --daemon|-d)
    start_daemon
    ;;
  "")
    start_foreground
    ;;
  *)
    echo "用法: $0 [--daemon|-d|stop|status]"
    echo ""
    echo "  (无参数)     前台启动全部服务"
    echo "  --daemon, -d  后台启动全部服务"
    echo "  stop          停止所有服务"
    echo "  status        查看服务状态"
    exit 1
    ;;
esac
