#!/usr/bin/env bash
# 启动本地 Appium server（默认 127.0.0.1:4723）。
# 端口取自 .env 的 APPIUM_SERVER，可用 APPIUM_HOST / APPIUM_PORT 覆盖。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

APPIUM_HOST="${APPIUM_HOST:-127.0.0.1}"
APPIUM_PORT="${APPIUM_PORT:-${APPIUM_SERVER##*:}}"
APPIUM_PORT="${APPIUM_PORT:-4723}"
APPIUM_BIN="${APPIUM_BIN:-$(command -v appium || true)}"

if [[ -z "$APPIUM_BIN" ]]; then
  echo "找不到 appium。请先安装：npm install -g appium" >&2
  exit 1
fi

# appium 通常由某个 node 版本管理；优先用同目录的 node 启动，避免 PATH 里版本不一致。
APPIUM_NODE="$(dirname "$APPIUM_BIN")/node"
if [[ -x "$APPIUM_NODE" ]]; then
  exec "$APPIUM_NODE" "$APPIUM_BIN" --address "$APPIUM_HOST" --port "$APPIUM_PORT"
fi

exec "$APPIUM_BIN" --address "$APPIUM_HOST" --port "$APPIUM_PORT"
