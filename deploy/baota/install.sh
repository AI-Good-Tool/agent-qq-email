#!/usr/bin/env bash
# 云邮盒 · 宝塔一键安装脚本
# 用法：bash deploy/baota/install.sh [--port 1265] [--public] [--user root] [--no-service] [--skip-cli] [--config-only]
#   --config-only：只生成 .env 并安装 agently-cli，适合作为宝塔「Python 项目」的项目初始化命令
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PORT=""
PUBLIC=0
RUN_USER="root"
SERVICE=1
SKIP_CLI=0
CONFIG_ONLY=0
SERVICE_NAME="yunyouhe"
PIP_MIRRORS=("" "https://mirrors.aliyun.com/pypi/simple/" "https://pypi.tuna.tsinghua.edu.cn/simple/")
NPM_MIRRORS=("" "https://registry.npmmirror.com")

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --public) PUBLIC=1; shift ;;
    --user) RUN_USER="$2"; shift 2 ;;
    --no-service) SERVICE=0; shift ;;
    --skip-cli) SKIP_CLI=1; shift ;;
    --config-only) CONFIG_ONLY=1; SERVICE=0; shift ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) echo "未知参数：$1"; exit 1 ;;
  esac
done

c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_bold=$'\033[1m'; c_off=$'\033[0m'
step() { echo; echo "${c_bold}==> $*${c_off}"; }
ok()   { echo "  ${c_green}✓${c_off} $*"; }
warn() { echo "  ${c_yellow}!${c_off} $*"; }
die()  { echo "  ${c_red}✗ $*${c_off}"; exit 1; }

set_env() {  # set_env KEY VALUE  —— 写入/替换 .env 中的配置项
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" .env; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {print k"="v; next} {print}' .env > "$tmp"
  else
    cat .env > "$tmp"; echo "${key}=${value}" >> "$tmp"
  fi
  cat "$tmp" > .env; rm -f "$tmp"
}
get_env() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

echo "${c_bold}云邮盒 · 一键安装${c_off}  目录：$ROOT"

# ---------- 1. Python ----------
step "检查 Python（需要 3.8 及以上）"
PY=""
candidates=()
[ -n "${PYTHON:-}" ] && candidates+=("$PYTHON")
for v in 3.13 3.12 3.11 3.10 3.9 3.8; do candidates+=("python$v"); done
candidates+=("python3")
for d in /www/server/pyporject_evn/versions/*/bin /www/server/python_manager/versions/*/bin /usr/local/python3*/bin; do
  [ -x "$d/python3" ] && candidates+=("$d/python3")
done
for c in "${candidates[@]}"; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then
    PY="$(command -v "$c")"; break
  fi
done
[ -n "$PY" ] || die "未找到 Python 3.8+。请在宝塔「软件商店 → Python 项目管理器」中安装 Python 3.10 或更高版本后重试，或用 PYTHON=/path/to/python3 指定。"
ok "使用 $PY（$("$PY" -V 2>&1)）"

# ---------- 2. 虚拟环境与依赖 ----------
if [ "$CONFIG_ONLY" = 1 ]; then
  VPY="$PY"   # 宝塔 Python 项目自带虚拟环境和依赖安装，这里只借用解释器生成随机密钥
else
step "创建虚拟环境并安装依赖"
PYVER="$("$PY" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
VPY="$ROOT/.venv/bin/python"
venv_ok() { [ -x "$VPY" ] && "$VPY" -m pip --version >/dev/null 2>&1; }
make_venv() {
  rm -rf .venv
  "$PY" -m venv .venv >/tmp/yunyouhe-venv.log 2>&1 || return 1
  venv_ok && return 0
  # 部分发行版的 venv 不自带 pip，尝试用 ensurepip 补上
  "$VPY" -m ensurepip --upgrade >>/tmp/yunyouhe-venv.log 2>&1 || true
  venv_ok
}
if venv_ok; then
  ok "复用已有虚拟环境 .venv"
else
  # 不完整的 .venv（例如安装 python3-venv 之前创建的）会被自动删除重建
  [ -e .venv ] && warn "检测到不完整的 .venv，正在重建…"
  if ! make_venv; then
    tail -n 5 /tmp/yunyouhe-venv.log 2>/dev/null | sed 's/^/    /'
    if command -v apt-get >/dev/null 2>&1; then
      warn "正在安装 python${PYVER}-venv …"
      apt-get install -y "python${PYVER}-venv" python3-venv python3-pip >/tmp/yunyouhe-apt.log 2>&1 || true
      make_venv || die "创建虚拟环境失败，请执行：apt install -y python${PYVER}-venv python3-pip 后重新运行本脚本。"
    else
      die "创建虚拟环境失败，请安装 Python 的 venv 与 pip 组件后重新运行本脚本。"
    fi
  fi
  ok "已创建虚拟环境 .venv"
fi
installed=0
for mirror in "${PIP_MIRRORS[@]}"; do
  args=(-m pip install -q --disable-pip-version-check -r backend/requirements.txt)
  [ -n "$mirror" ] && args+=(-i "$mirror")
  if "$VPY" "${args[@]}" 2>/tmp/yunyouhe-pip.log; then installed=1; ok "依赖安装完成${mirror:+（镜像：$mirror）}"; break; fi
  warn "从 ${mirror:-默认源} 安装失败，尝试下一个镜像…"
done
[ "$installed" = 1 ] || { tail -n 20 /tmp/yunyouhe-pip.log; die "依赖安装失败，请检查服务器网络。"; }
fi

# ---------- 3. 配置文件 ----------
step "生成配置"
NEW_PASSWORD=""
if [ ! -f .env ]; then
  cp .env.example .env
  NEW_PASSWORD="$("$VPY" -c 'import secrets; print(secrets.token_urlsafe(12))')"
  set_env DASHBOARD_PASSWORD "$NEW_PASSWORD"
  set_env DASHBOARD_TOKEN_SECRET "$("$VPY" -c 'import secrets; print(secrets.token_urlsafe(48))')"
  ok "已创建 .env 并生成随机登录密码"
else
  ok "保留已有 .env"
fi
[ -n "$PORT" ] && set_env PORT "$PORT"
[ "$PUBLIC" = 1 ] && set_env HOST 0.0.0.0
PORT="$(get_env PORT)"; PORT="${PORT:-1265}"
chmod 600 .env
mkdir -p data logs

# ---------- 4. Agent Mail CLI ----------
step "检查 Agent Mail 官方 CLI（agently-cli）"
NODE_DIRS=()
for d in /www/server/nodejs/*/bin /usr/local/bin /usr/bin "$HOME/.nvm/versions/node"/*/bin; do
  [ -x "$d/node" ] && NODE_DIRS+=("$d")
done
if command -v node >/dev/null 2>&1; then NODE_DIRS=("$(dirname "$(command -v node)")" "${NODE_DIRS[@]+"${NODE_DIRS[@]}"}"); fi
CLI=""
for d in "${NODE_DIRS[@]+"${NODE_DIRS[@]}"}"; do
  [ -x "$d/agently-cli" ] && { CLI="$d/agently-cli"; break; }
done
[ -z "$CLI" ] && command -v agently-cli >/dev/null 2>&1 && CLI="$(command -v agently-cli)"

if [ -z "$CLI" ] && [ "$SKIP_CLI" = 0 ]; then
  NPM=""
  for d in "${NODE_DIRS[@]+"${NODE_DIRS[@]}"}"; do [ -x "$d/npm" ] && { NPM="$d/npm"; break; }; done
  if [ -n "$NPM" ]; then
    for mirror in "${NPM_MIRRORS[@]}"; do
      if PATH="$(dirname "$NPM"):$PATH" "$NPM" install -g @tencent-qqmail/agently-cli ${mirror:+--registry "$mirror"} >/tmp/yunyouhe-npm.log 2>&1; then
        CLI="$(dirname "$NPM")/agently-cli"
        [ -x "$CLI" ] || CLI="$(PATH="$(dirname "$NPM"):$PATH" command -v agently-cli || true)"
        break
      fi
      warn "npm 从 ${mirror:-默认源} 安装失败，尝试镜像…"
    done
  fi
fi
if [ -n "$CLI" ]; then
  EXTRA="$(dirname "$CLI")"
  for d in "${NODE_DIRS[@]+"${NODE_DIRS[@]}"}"; do EXTRA="$EXTRA:$d"; break; done
  set_env AGENTLY_CLI_PATH "$CLI"
  set_env EXTRA_PATH "$EXTRA"
  ok "agently-cli：$CLI"
else
  warn "未找到 agently-cli。请先在宝塔「软件商店」安装 Node.js 版本管理器（Node 20+），然后执行："
  warn "  npm install -g @tencent-qqmail/agently-cli   再重新运行本脚本"
  warn "服务仍会启动，但在安装 CLI 之前无法扫码添加邮箱。"
fi

# ---------- 5. 启动服务 ----------
step "启动服务"
# 端口空闲时 grep 找不到结果会返回非零，必须吞掉，否则 set -e 会让脚本直接退出
port_owner() { ss -lntpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -n1 | cut -d= -f2 || true; }
if [ "$SERVICE" = 1 ]; then
  # 先停掉本项目已有的实例，再确认端口空闲，避免旧进程占着端口导致新配置不生效
  if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then systemctl stop "$SERVICE_NAME" 2>/dev/null || true; fi
  bash deploy/baota/yunyouhe.sh stop >/dev/null 2>&1 || true
  if command -v ss >/dev/null 2>&1; then
    for _ in 1 2 3; do
      pid="$(port_owner)"; [ -z "$pid" ] && break
      cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
      cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
      if [[ "$cmd" == *"$ROOT/run.py"* ]] || { [[ "$cmd" == *run.py* ]] && [ "$cwd" = "$ROOT" ]; }; then
        warn "端口 $PORT 被另一份云邮盒进程占用（PID $pid），正在结束它…"
        kill "$pid" 2>/dev/null || true; sleep 2
      else
        die "端口 $PORT 已被其他程序占用（PID $pid：${cmd:-未知}）。请先停止它，或用 --port 换一个端口。"
      fi
    done
    pid="$(port_owner)"
    [ -z "$pid" ] || die "端口 $PORT 仍被 PID $pid 占用，它可能由宝塔「Python 项目」自动拉起。请先在宝塔中停止并删除该项目后重试。"
  fi
fi
if [ "$SERVICE" = 1 ] && [ "$(id -u)" = 0 ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"; RUN_HOME="${RUN_HOME:-/root}"
  if [ "$RUN_USER" != root ]; then chown -R "$RUN_USER" data logs; chown "$RUN_USER" .env; fi
  cat > /etc/systemd/system/${SERVICE_NAME}.service <<UNIT
[Unit]
Description=Yunyouhe mail dashboard
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${ROOT}
Environment=HOME=${RUN_HOME}
Environment=PYTHONUNBUFFERED=1
ExecStart=${VPY} ${ROOT}/run.py
Restart=always
RestartSec=3
StandardOutput=append:${ROOT}/logs/yunyouhe.log
StandardError=append:${ROOT}/logs/yunyouhe.log

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable ${SERVICE_NAME} >/dev/null 2>&1
  systemctl restart ${SERVICE_NAME}
  ok "已注册 systemd 服务 ${SERVICE_NAME}（开机自启，异常自动重启）"
elif [ "$SERVICE" = 1 ]; then
  bash deploy/baota/yunyouhe.sh restart
else
  ok "已跳过启动。请在宝塔「Python 项目」中添加：项目路径 $ROOT，启动命令 python3 run.py"
fi

# ---------- 6. 健康检查 ----------
if [ "$SERVICE" = 1 ]; then
  healthy=0
  for _ in $(seq 1 20); do
    if "$VPY" -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:${PORT}/health', timeout=2)" 2>/dev/null; then healthy=1; break; fi
    sleep 1
  done
  [ "$healthy" = 1 ] && ok "服务运行正常：http://127.0.0.1:${PORT}/health" || { warn "服务未通过健康检查，请查看日志：tail -n 50 $ROOT/logs/yunyouhe.log"; }
fi

USERNAME="$(get_env DASHBOARD_USERNAME)"
HOSTV="$(get_env HOST)"
echo
echo "${c_bold}安装完成${c_off}"
echo "  访问方式：宝塔「网站 → 添加站点」后，在站点「反向代理」中填目标 URL：http://127.0.0.1:${PORT}"
[ "$HOSTV" = "0.0.0.0" ] && echo "            或直接访问 http://服务器IP:${PORT}（需在宝塔安全与云厂商安全组放行 ${PORT} 端口）"
echo "  登录账号：${USERNAME:-admin}"
if [ -n "$NEW_PASSWORD" ]; then
  echo "  登录密码：${c_bold}${NEW_PASSWORD}${c_off}   （已写入 $ROOT/.env，可随时修改 DASHBOARD_PASSWORD）"
else
  echo "  登录密码：见 $ROOT/.env 中的 DASHBOARD_PASSWORD"
fi
[ "$SERVICE" = 1 ] && echo "  管理命令：bash $ROOT/deploy/baota/yunyouhe.sh {start|stop|restart|status|logs}"
exit 0
