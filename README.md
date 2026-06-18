# LiveTranslate Overlay

Realtime microphone translation with a transparent, always-on-top subtitle overlay. Built with Tauri v2, React, TypeScript, and Rust.

## Run

### Development

To start the development environment (which automatically checks and kills any process occupying port 1420):

```bash
npm install
./run-dev.sh
```

*(Or use the standard command `npm run tauri dev`).*

For browser-only UI development, use `npm run dev`. Native overlay and local session files require Tauri.

## Build & Install

### macOS

For a macOS debug app with the microphone entitlement embedded in its ad-hoc signature, run `npm run build:macos:debug`. Launch the resulting `.app` bundle rather than the raw binary.

### Linux (Ubuntu)

#### Prerequisites

To develop and build Tauri v2 applications on Ubuntu, you must install the following system dependencies:

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev
```

#### Build, Install & Run

1. Build the release `.deb` package:
   ```bash
   npx tauri build --bundles deb
   ```

2. Install the generated package:
   ```bash
   sudo apt install "./src-tauri/target/release/bundle/deb/LiveTranslate Overlay_*.deb"
   ```

3. Run the installed application:
   ```bash
   ./run.sh
   ```

## MVP flow

1. Open Settings and enter a Gemini API key.
2. Click **Request microphone access**, approve the macOS prompt, then select a microphone.
3. Save, return to Control, and start a meeting.
4. Final translations are saved under the app data directory in `sessions/` when the meeting ends.

The raw Live API client sends mono 16-bit PCM at 16 kHz and accepts text from `modelTurn`, `inputTranscription`, and `outputTranscription` response shapes.

If macOS previously denied access, quit the app and run `tccutil reset Microphone com.livetranslate.overlay`, then reopen the newly built app and click **Request microphone access** again.
