#!/usr/bin/env bash
set -euo pipefail

npx tauri build --debug --bundles app

APP_PATH="src-tauri/target/debug/bundle/macos/LiveTranslate Overlay.app"
codesign --force --deep --sign - \
  --entitlements src-tauri/Entitlements.plist \
  "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

echo "Signed debug app: $APP_PATH"
