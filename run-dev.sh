#!/usr/bin/env bash
set -e

echo "Killing any existing livetranslate-overlay processes..."
pkill -9 -f livetranslate-overlay 2>/dev/null || true

echo "Freeing port 1420..."
fuser -k 1420/tcp 2>/dev/null || true

echo "Starting Tauri dev server..."
npm run tauri dev
