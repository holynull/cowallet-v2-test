#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${WDA_ENV_FILE:-$ROOT_DIR/.env}"
MODE="${1:-run}"
EXTERNAL_WDA_PROJECT_PATH="${WDA_PROJECT_PATH:-}"
EXTERNAL_WDA_SCHEME="${WDA_SCHEME:-}"
EXTERNAL_WDA_DERIVED_DATA_PATH="${WDA_DERIVED_DATA_PATH:-}"
EXTERNAL_WDA_SIGNING_IDENTITY="${WDA_SIGNING_IDENTITY:-}"
EXTERNAL_WDA_BUNDLE_ID="${WDA_BUNDLE_ID:-}"
EXTERNAL_WDA_START_IPROXY="${WDA_START_IPROXY:-}"
EXTERNAL_WDA_LOCAL_PORT="${WDA_LOCAL_PORT:-}"
EXTERNAL_WDA_REMOTE_PORT="${WDA_REMOTE_PORT:-}"
EXTERNAL_WDA_CODESIGN_IDENTITY="${WDA_CODESIGN_IDENTITY:-}"
EXTERNAL_IOS_WDA_LOCAL_PORT="${IOS_WDA_LOCAL_PORT:-}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -n "$EXTERNAL_WDA_PROJECT_PATH" ]]; then
  WDA_PROJECT_PATH="$EXTERNAL_WDA_PROJECT_PATH"
fi
if [[ -n "$EXTERNAL_WDA_SCHEME" ]]; then
  WDA_SCHEME="$EXTERNAL_WDA_SCHEME"
fi
if [[ -n "$EXTERNAL_WDA_DERIVED_DATA_PATH" ]]; then
  WDA_DERIVED_DATA_PATH="$EXTERNAL_WDA_DERIVED_DATA_PATH"
fi
if [[ -n "$EXTERNAL_WDA_SIGNING_IDENTITY" ]]; then
  WDA_SIGNING_IDENTITY="$EXTERNAL_WDA_SIGNING_IDENTITY"
fi
if [[ -n "$EXTERNAL_WDA_BUNDLE_ID" ]]; then
  WDA_BUNDLE_ID="$EXTERNAL_WDA_BUNDLE_ID"
fi
if [[ -n "$EXTERNAL_WDA_START_IPROXY" ]]; then
  WDA_START_IPROXY="$EXTERNAL_WDA_START_IPROXY"
fi
if [[ -n "$EXTERNAL_WDA_LOCAL_PORT" ]]; then
  WDA_LOCAL_PORT="$EXTERNAL_WDA_LOCAL_PORT"
fi
if [[ -n "$EXTERNAL_WDA_REMOTE_PORT" ]]; then
  WDA_REMOTE_PORT="$EXTERNAL_WDA_REMOTE_PORT"
fi
if [[ -n "$EXTERNAL_WDA_CODESIGN_IDENTITY" ]]; then
  WDA_CODESIGN_IDENTITY="$EXTERNAL_WDA_CODESIGN_IDENTITY"
fi
if [[ -n "$EXTERNAL_IOS_WDA_LOCAL_PORT" ]]; then
  IOS_WDA_LOCAL_PORT="$EXTERNAL_IOS_WDA_LOCAL_PORT"
fi

print_usage() {
  cat >&2 <<EOF
Usage: $0 [--check]

Required environment:
  IOS_UDID=<connected iOS device UDID>
  WDA_DEVELOPMENT_TEAM=<Apple Developer Team ID>

Optional environment:
  WDA_PROJECT_PATH=<path to WebDriverAgent.xcodeproj>
  WDA_ENV_FILE=<path to env file, default: $ROOT_DIR/.env>

Create $ROOT_DIR/.env from $ROOT_DIR/.env.example for local use.
EOF
}

if [[ "$MODE" != "run" && "$MODE" != "--check" ]]; then
  print_usage
  exit 2
fi

WDA_PROJECT_PATH="${WDA_PROJECT_PATH:-$ROOT_DIR/node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj}"
if [[ "$WDA_PROJECT_PATH" != /* ]]; then
  WDA_PROJECT_PATH="$ROOT_DIR/$WDA_PROJECT_PATH"
fi
WDA_SCHEME="${WDA_SCHEME:-WebDriverAgentRunner}"
WDA_DERIVED_DATA_PATH="${WDA_DERIVED_DATA_PATH:-/private/tmp/midscene-wda-derived-data}"
WDA_SIGNING_IDENTITY="${WDA_SIGNING_IDENTITY:-iPhone Developer}"
WDA_BUNDLE_ID="${WDA_BUNDLE_ID:-com.facebook.WebDriverAgentRunner.xctrunner}"
WDA_START_IPROXY="${WDA_START_IPROXY:-true}"
WDA_LOCAL_PORT="${IOS_WDA_LOCAL_PORT:-${WDA_LOCAL_PORT:-8100}}"
WDA_REMOTE_PORT="${WDA_REMOTE_PORT:-8100}"
if [[ -z "${WDA_DEVELOPMENT_TEAM:-}" || -z "${IOS_UDID:-}" ]]; then
  echo "Missing required WDA environment." >&2
  print_usage
  exit 2
fi
WDA_CODESIGN_IDENTITY="${WDA_CODESIGN_IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null | awk '/"Apple Development:/{print $2; exit}')}"
WDA_CODESIGN_IDENTITY="${WDA_CODESIGN_IDENTITY:-$WDA_SIGNING_IDENTITY}"

set_wda_artifact_paths() {
  WDA_APP_PATH="$WDA_DERIVED_DATA_PATH/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app"
  WDA_ENTITLEMENTS_PATH="$WDA_DERIVED_DATA_PATH/Build/Intermediates.noindex/WebDriverAgent.build/Debug-iphoneos/WebDriverAgentRunner.build/WebDriverAgentRunner.xctest.xcent"
}

set_wda_artifact_paths

if [[ ! -d "$WDA_PROJECT_PATH" ]]; then
  cat >&2 <<EOF
WebDriverAgent project not found:
  $WDA_PROJECT_PATH

Install appium-webdriveragent locally or set WDA_PROJECT_PATH to an existing WebDriverAgent.xcodeproj.
EOF
  exit 2
fi

run_preflight() {
  echo "WDA preflight"
  echo "  env file: $ENV_FILE"
  echo "  project: $WDA_PROJECT_PATH"
  echo "  scheme: $WDA_SCHEME"
  echo "  derived data: $WDA_DERIVED_DATA_PATH"
  echo "  bundle id: $WDA_BUNDLE_ID"
  echo "  team id length: ${#WDA_DEVELOPMENT_TEAM}"
  echo "  udid length: ${#IOS_UDID}"
  echo "  xcode: $(xcode-select -p)"

  if ! command -v xcodebuild >/dev/null 2>&1; then
    echo "xcodebuild not found." >&2
    exit 2
  fi

  if [[ "$WDA_START_IPROXY" == "true" ]] && ! command -v iproxy >/dev/null 2>&1; then
    echo "iproxy not found. Install libimobiledevice or set WDA_START_IPROXY=false." >&2
    exit 2
  fi

  local codesign_identities
  codesign_identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"

  if ! grep -Fq "$WDA_CODESIGN_IDENTITY" <<<"$codesign_identities"; then
    echo "No usable codesigning identity found for: $WDA_CODESIGN_IDENTITY" >&2
    if [[ -n "$codesign_identities" ]]; then
      echo "Available identities:" >&2
      printf '%s\n' "$codesign_identities" >&2
    fi
    exit 2
  fi

  local xcdevice_output
  xcdevice_output="$(xcrun xcdevice list 2>/dev/null || true)"

  if grep -Fq "\"identifier\" : \"$IOS_UDID\"" <<<"$xcdevice_output"; then
    if awk -v udid="$IOS_UDID" '
      $0 ~ "\"identifier\" : \"" udid "\"" {found=1}
      found && /"available" : true/ {ok=1}
      found && /^  }/ {exit}
      END {exit ok ? 0 : 1}
    ' <<<"$xcdevice_output"; then
      echo "Preflight OK"
      return 0
    fi
  fi

  local devices_output
  local online_devices
  local offline_devices
  devices_output="$(xcrun xctrace list devices 2>/dev/null || true)"
  online_devices="$(awk '/^== Devices ==/{online=1;next}/^== /{online=0} online' <<<"$devices_output")"
  offline_devices="$(awk '/^== Devices Offline ==/{offline=1;next}/^== /{offline=0} offline' <<<"$devices_output")"

  if grep -Fq "$IOS_UDID" <<<"$online_devices"; then
    echo "Preflight OK"
    return 0
  fi

  if grep -Fq "$IOS_UDID" <<<"$offline_devices"; then
    echo "Device UDID was found, but Xcode reports it as offline." >&2
    echo "Unlock the device, trust this Mac, reconnect the cable, then retry." >&2
    exit 2
  fi

  if ! grep -Fq "$IOS_UDID" <<<"$devices_output"; then
    echo "Device UDID was not found in xcrun xctrace device list." >&2
    exit 2
  fi

  echo "Device UDID was found, but it is not listed as an online physical device." >&2
  exit 2
}

IPROXY_PID=""
cleanup() {
  if [[ -n "$IPROXY_PID" ]]; then
    kill "$IPROXY_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

start_iproxy() {
  if [[ "$WDA_START_IPROXY" != "true" ]]; then
    return 0
  fi

  echo "Starting iproxy: 127.0.0.1:$WDA_LOCAL_PORT -> device:$WDA_REMOTE_PORT"
  iproxy "$WDA_LOCAL_PORT" "$WDA_REMOTE_PORT" -u "$IOS_UDID" &
  IPROXY_PID="$!"
  sleep 1

  if ! kill -0 "$IPROXY_PID" >/dev/null 2>&1; then
    echo "iproxy exited early. Check whether local port $WDA_LOCAL_PORT is already in use." >&2
    exit 2
  fi
}

is_wda_ready() {
  local status_url="${WDA_STATUS_URL:-http://127.0.0.1:$WDA_LOCAL_PORT/status}"
  if [[ "$status_url" != */status ]]; then
    status_url="${status_url%/}/status"
  fi

  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi

  curl -fsS "$status_url" 2>/dev/null | grep -Fq '"ready" : true'
}

prepare_derived_data() {
  if [[ "${WDA_CLEAN_DERIVED_DATA:-true}" == "true" ]]; then
    if ! rm -rf "$WDA_DERIVED_DATA_PATH"; then
      local fallback_path
      fallback_path="${WDA_DERIVED_DATA_PATH}-fresh-$(date +%Y%m%d%H%M%S)"
      echo "Unable to clean derived data at $WDA_DERIVED_DATA_PATH; using $fallback_path" >&2
      WDA_DERIVED_DATA_PATH="$fallback_path"
      set_wda_artifact_paths
    fi
  fi

  mkdir -p "$WDA_DERIVED_DATA_PATH"
}

if [[ "$MODE" == "--check" ]]; then
  run_preflight
  exit 0
fi

copy_framework_from_xcode() {
  local framework_name="$1"
  local source_path
  local dest_path="$WDA_APP_PATH/Frameworks/$framework_name.framework"
  source_path="$(find "$(xcode-select -p)/Platforms/iPhoneOS.platform/Developer/Library" -name "$framework_name.framework" -print -quit)"

  if [[ -z "$source_path" ]]; then
    echo "Unable to locate $framework_name.framework in Xcode." >&2
    exit 1
  fi

  rm -rf "$dest_path"
  ditto "$source_path" "$dest_path"
  codesign --force --sign "$WDA_CODESIGN_IDENTITY" --timestamp=none --preserve-metadata=identifier,flags "$dest_path"
}

repair_embedded_frameworks() {
  WDA_XCTESTRUN_PATH="$(find "$WDA_DERIVED_DATA_PATH/Build/Products" -maxdepth 1 -name 'WebDriverAgentRunner_iphoneos*.xctestrun' -print -quit)"

  if [[ -z "$WDA_XCTESTRUN_PATH" ]]; then
    echo "Unable to locate generated xctestrun file in $WDA_DERIVED_DATA_PATH/Build/Products." >&2
    exit 1
  fi

  copy_framework_from_xcode Testing
  copy_framework_from_xcode XCTAutomationSupport
  copy_framework_from_xcode XCTest
  copy_framework_from_xcode XCTestCore
  copy_framework_from_xcode XCTestSupport
  copy_framework_from_xcode XCUIAutomation
  copy_framework_from_xcode XCUnit

  codesign --force --sign "$WDA_CODESIGN_IDENTITY" --timestamp=none --entitlements "$WDA_ENTITLEMENTS_PATH" --preserve-metadata=identifier,flags "$WDA_APP_PATH"
}

if is_wda_ready; then
  echo "WDA is already ready at ${WDA_STATUS_URL:-http://127.0.0.1:$WDA_LOCAL_PORT}"
  exit 0
fi

prepare_derived_data

xcodebuild \
  -project "$WDA_PROJECT_PATH" \
  -scheme "$WDA_SCHEME" \
  -destination "id=$IOS_UDID" \
  -derivedDataPath "$WDA_DERIVED_DATA_PATH" \
  -allowProvisioningUpdates \
  build-for-testing \
  DEVELOPMENT_TEAM="$WDA_DEVELOPMENT_TEAM" \
  PRODUCT_BUNDLE_IDENTIFIER="$WDA_BUNDLE_ID" \
  CODE_SIGN_IDENTITY="$WDA_SIGNING_IDENTITY"

repair_embedded_frameworks

start_iproxy

xcodebuild \
  test-without-building \
  -xctestrun "$WDA_XCTESTRUN_PATH" \
  -destination "id=$IOS_UDID" \
  -derivedDataPath "$WDA_DERIVED_DATA_PATH" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$WDA_DEVELOPMENT_TEAM" \
  PRODUCT_BUNDLE_IDENTIFIER="$WDA_BUNDLE_ID" \
  CODE_SIGN_IDENTITY="$WDA_SIGNING_IDENTITY"
