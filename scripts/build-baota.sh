#!/usr/bin/env bash
# 构建前端并打包宝塔部署包：outputs/yunyouhe-baota-v<版本>-<日期>.tar.gz
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' backend/app/__init__.py)"
NAME="yunyouhe-baota-v${VERSION}-$(date +%Y%m%d)"
STAGE="$(mktemp -d)/yunyouhe"

echo "==> 构建前端"
(cd frontend && { [ -d node_modules ] || npm ci; } && npm run build)

echo "==> 组装部署目录"
mkdir -p "$STAGE/backend" "$STAGE/frontend" "$STAGE/deploy"
cp run.py requirements.txt .env.example README.md "$STAGE/"
cp -R backend/app "$STAGE/backend/app"
cp backend/requirements.txt "$STAGE/backend/"
cp -R frontend/dist "$STAGE/frontend/dist"
cp -R deploy/baota "$STAGE/deploy/baota"
find "$STAGE" \( -name '__pycache__' -o -name '.DS_Store' \) -prune -exec rm -rf {} +
chmod +x "$STAGE"/deploy/baota/*.sh

mkdir -p outputs
COPYFILE_DISABLE=1 tar -czf "outputs/${NAME}.tar.gz" -C "$(dirname "$STAGE")" yunyouhe
rm -rf "$(dirname "$STAGE")"
echo "==> 完成：outputs/${NAME}.tar.gz（$(du -h "outputs/${NAME}.tar.gz" | cut -f1)）"
