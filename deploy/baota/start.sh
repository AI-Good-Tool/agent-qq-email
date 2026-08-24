#!/usr/bin/env sh
set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIRECTORY=$(CDPATH= cd -- "$SCRIPT_DIRECTORY/../.." && pwd)

if [ -f "$PROJECT_DIRECTORY/.env.baota" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_DIRECTORY/.env.baota"
  set +a
fi

cd "$PROJECT_DIRECTORY"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
