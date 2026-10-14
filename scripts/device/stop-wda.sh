#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${WDA_ENV_FILE:-$ROOT_DIR/.env}"
MODE="${1:-run}"
EXTERNAL_IOS_UDID="${IOS_UDID:-}"
EXTERNAL_IOS_WDA_LOCAL_PORT="${IOS_WDA_LOCAL_PORT:-}"
EXTERNAL_WDA_LOCAL_PORT="${WDA_LOCAL_PORT:-}"
EXTERNAL_WDA_STOP_TIMEOUT_SECONDS="${WDA_STOP_TIMEOUT_SECONDS:-}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -n "$EXTERNAL_IOS_UDID" ]]; then
  IOS_UDID="$EXTERNAL_IOS_UDID"
fi
if [[ -n "$EXTERNAL_IOS_WDA_LOCAL_PORT" ]]; then
  IOS_WDA_LOCAL_PORT="$EXTERNAL_IOS_WDA_LOCAL_PORT"
fi
if [[ -n "$EXTERNAL_WDA_LOCAL_PORT" ]]; then
  WDA_LOCAL_PORT="$EXTERNAL_WDA_LOCAL_PORT"
fi
if [[ -n "$EXTERNAL_WDA_STOP_TIMEOUT_SECONDS" ]]; then
  WDA_STOP_TIMEOUT_SECONDS="$EXTERNAL_WDA_STOP_TIMEOUT_SECONDS"
fi

print_usage() {
  cat >&2 <<EOF
Usage: $0 [--dry-run]

Stops WebDriverAgent helper processes for this test environment:
  - iproxy for IOS_WDA_LOCAL_PORT/WDA_LOCAL_PORT and IOS_UDID
  - xcodebuild WebDriverAgentRunner process for IOS_UDID

Required environment:
  IOS_UDID=<connected iOS device UDID>

Optional environment:
  WDA_ENV_FILE=<path to env file, default: $ROOT_DIR/.env>
  IOS_WDA_LOCAL_PORT=<local forwarded port, default: 8100>
  WDA_LOCAL_PORT=<local forwarded port fallback, default: 8100>
  WDA_STOP_TIMEOUT_SECONDS=<seconds to wait after SIGTERM, default: 5>
EOF
}

if [[ "$MODE" != "run" && "$MODE" != "--dry-run" ]]; then
  print_usage
  exit 2
fi

if [[ -z "${IOS_UDID:-}" ]]; then
  echo "Missing IOS_UDID." >&2
  print_usage
  exit 2
fi

WDA_LOCAL_PORT="${IOS_WDA_LOCAL_PORT:-${WDA_LOCAL_PORT:-8100}}"
WDA_STOP_TIMEOUT_SECONDS="${WDA_STOP_TIMEOUT_SECONDS:-5}"

find_target_pids() {
  local process_list
  if ! process_list="$(ps -axo pid,ppid,stat,command)"; then
    echo "Unable to inspect processes with ps." >&2
    return 1
  fi

  printf '%s\n' "$process_list" | awk -v udid="$IOS_UDID" -v port="$WDA_LOCAL_PORT" '
    function token_basename(value) {
      sub(/^.*\//, "", value)
      return value
    }

    function has_iproxy_local_port(    i, command_name) {
      for (i = 4; i < NF; i++) {
        command_name = token_basename($i)
        if (command_name == "iproxy" && $(i + 1) == port) {
          return 1
        }
        if (command_name == "iproxy" && $(i + 1) == port ":" port) {
          return 1
        }
        if ($i == port ":" port) {
          return 1
        }
      }
      return 0
    }

    function has_udid_arg(    i) {
      for (i = 4; i < NF; i++) {
        if ($i == "-u" && $(i + 1) == udid) {
          return 1
        }
      }
      return 0
    }

    $1 !~ /^[0-9]+$/ {
      next
    }

    /iproxy/ && has_iproxy_local_port() && has_udid_arg() {
      print $1
      next
    }

    /xcodebuild/ && /WebDriverAgentRunner/ && index($0, "id=" udid) {
      print $1
      next
    }
  ' | sort -u
}

TARGET_PID_OUTPUT="$(find_target_pids)"
TARGET_PIDS=()
if [[ -n "$TARGET_PID_OUTPUT" ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && TARGET_PIDS+=("$pid")
  done <<<"$TARGET_PID_OUTPUT"
fi

if [[ "${#TARGET_PIDS[@]}" -eq 0 ]]; then
  echo "No matching WebDriverAgent helper processes found."
  exit 0
fi

echo "Matched WebDriverAgent helper PIDs: ${TARGET_PIDS[*]}"

if [[ "$MODE" == "--dry-run" ]]; then
  exit 0
fi

kill -TERM "${TARGET_PIDS[@]}" 2>/dev/null || true
for ((elapsed = 0; elapsed < WDA_STOP_TIMEOUT_SECONDS; elapsed++)); do
  if [[ -z "$(find_target_pids)" ]]; then
    break
  fi
  sleep 1
done

REMAINING_PID_OUTPUT="$(find_target_pids)"
REMAINING_PIDS=()
if [[ -n "$REMAINING_PID_OUTPUT" ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && REMAINING_PIDS+=("$pid")
  done <<<"$REMAINING_PID_OUTPUT"
fi
if [[ "${#REMAINING_PIDS[@]}" -gt 0 ]]; then
  echo "Processes still running after SIGTERM: ${REMAINING_PIDS[*]}" >&2
  exit 1
fi

echo "Stopped WebDriverAgent helper processes."
