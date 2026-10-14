#!/usr/bin/env bash
# 启动 Midscene Android Playground（基于 adb，不需要 Appium）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

ADB_BIN="${ADB_BIN:-adb}"
if ! command -v "$ADB_BIN" >/dev/null 2>&1; then
  echo "找不到 adb。请安装 Android platform-tools，或在 .env 里设置 ADB_BIN。" >&2
  exit 1
fi

exec npx --yes @midscene/android-playground
