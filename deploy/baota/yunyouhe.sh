#!/usr/bin/env bash
# 云邮盒服务管理：start | stop | restart | status | logs
# 已注册 systemd 服务时自动转交 systemctl；否则以后台进程方式运行。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
NAME="yunyouhe"
PID_FILE="$ROOT/data/yunyouhe.pid"
LOG_FILE="$ROOT/logs/yunyouhe.log"
VPY="$ROOT/.venv/bin/python"
mkdir -p "$ROOT/data" "$ROOT/logs"

use_systemd() { command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/${NAME}.service" ]; }
running_pid() {
  [ -f "$PID_FILE" ] || return 1
  local pid; pid="$(cat "$PID_FILE")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && echo "$pid"
}

start() {
  if use_systemd; then systemctl start "$NAME"; echo "已启动（systemd）"; return; fi
  if pid="$(running_pid)"; then echo "已在运行（PID $pid）"; return; fi
  [ -x "$VPY" ] || { echo "未找到 .venv，请先运行 bash deploy/baota/install.sh"; exit 1; }
  nohup "$VPY" "$ROOT/run.py" >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 1
  if running_pid >/dev/null; then echo "已启动（PID $(cat "$PID_FILE")），日志：$LOG_FILE"; else echo "启动失败，请查看日志：$LOG_FILE"; tail -n 20 "$LOG_FILE"; exit 1; fi
}

stop() {
  if use_systemd; then systemctl stop "$NAME"; echo "已停止（systemd）"; return; fi
  if pid="$(running_pid)"; then
    kill "$pid"
    for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
    echo "已停止"
  else
    echo "未在运行"
  fi
  rm -f "$PID_FILE"
}

status() {
  if use_systemd; then systemctl --no-pager status "$NAME" | head -n 5; return; fi
  if pid="$(running_pid)"; then echo "运行中（PID $pid）"; else echo "未运行"; fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) tail -n "${2:-100}" -f "$LOG_FILE" ;;
  *) echo "用法：$0 {start|stop|restart|status|logs}"; exit 1 ;;
esac
