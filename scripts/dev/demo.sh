#!/usr/bin/env bash
# 本地演示：使用模拟的 agently-cli 和独立的演示数据目录启动云邮盒。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export DATA_DIR="${DATA_DIR:-$ROOT/data-demo}"
export FAKE_AGENTLY_STATE="${FAKE_AGENTLY_STATE:-$DATA_DIR/fake-agently.json}"
export AGENTLY_CLI_PATH="$ROOT/scripts/dev/fake-agently-cli"
export PORT="${PORT:-1265}"
PY="${PYTHON:-$ROOT/.venv/bin/python}"
[ -x "$PY" ] || PY=python3
exec "$PY" run.py
