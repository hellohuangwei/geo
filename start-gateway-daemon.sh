#!/bin/bash
# OpenClaw Gateway Daemon - 自动重启守护进程
# 用法: /root/start-gateway-daemon.sh [start|stop|status]

PIDFILE=/var/run/openclaw-gateway.pid
LOGFILE=/var/log/openclaw-gateway.log
# 容器内存限制 2GB，限制 Node.js 堆为 1.5GB 防止 OOM SIGKILL
export NODE_OPTIONS="--max-old-space-size=1536"
GATEWAY_CMD="/usr/bin/openclaw gateway run --port 6006 --bind lan --auth token"
RESTART_DELAY=5

start_daemon() {
  # 已经运行就跳过
  if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
    echo "[gateway] Already running (PID: $(cat $PIDFILE))"
    return 0
  fi

  echo "[gateway] Starting daemon..."
  rm -f "$PIDFILE"
  mkdir -p "$(dirname $LOGFILE)" "$(dirname $PIDFILE)"

  # 后台启动自动重启循环
  (
    while true; do
      echo "[gateway] $(date '+%Y-%m-%d %H:%M:%S') Launching..." >> "$LOGFILE"
      $GATEWAY_CMD >> "$LOGFILE" 2>&1
      EXIT_CODE=$?
      echo "[gateway] $(date '+%Y-%m-%d %H:%M:%S') Exited with code $EXIT_CODE, restarting in ${RESTART_DELAY}s..." >> "$LOGFILE"
      sleep $RESTART_DELAY
    done
  ) &
  echo $! > "$PIDFILE"
  echo "[gateway] Daemon started (PID: $(cat $PIDFILE))"
}

stop_daemon() {
  if [ -f "$PIDFILE" ]; then
    PID=$(cat $PIDFILE)
    # 杀掉整个进程组
    PGRP=$(ps -o pgid= -p $PID 2>/dev/null | tr -d ' ')
    if [ -n "$PGRP" ]; then
      kill -TERM -- -$PGRP 2>/dev/null
      sleep 1
      kill -KILL -- -$PGRP 2>/dev/null
    fi
    rm -f "$PIDFILE"
    echo "[gateway] Daemon stopped"
  else
    # fallback: 按名称杀
    pkill -f "openclaw gateway run" 2>/dev/null && echo "[gateway] Killed by name"
  fi
}

status_daemon() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
    echo "[gateway] Running (PID: $(cat $PIDFILE))"
  else
    echo "[gateway] Not running"
  fi
}

case "${1:-start}" in
  start)  start_daemon ;;
  stop)   stop_daemon ;;
  status) status_daemon ;;
  restart) stop_daemon; sleep 1; start_daemon ;;
  *) echo "Usage: $0 {start|stop|status|restart}"; exit 1 ;;
esac
