#!/usr/bin/env bash
# 启动 Midscene iOS Playground（需要 WDA 已经就绪：npm run wda:start）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

exec npx --yes @midscene/ios-playground
