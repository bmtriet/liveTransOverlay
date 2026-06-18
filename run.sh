#!/usr/bin/env bash
set -e

if command -v livetranslate-overlay &> /dev/null; then
  echo "Launching installed LiveTranslate Overlay..."
  livetranslate-overlay "$@"
else
  echo "Error: livetranslate-overlay is not installed or not in PATH."
  echo "Please build and install it first using:"
  echo "  npx tauri build --bundles deb"
  echo "  sudo apt install \"./src-tauri/target/release/bundle/deb/LiveTranslate Overlay_*.deb\""
  exit 1
fi
