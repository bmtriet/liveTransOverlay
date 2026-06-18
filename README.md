# LiveTranslate Overlay

Realtime microphone translation with a transparent, always-on-top subtitle overlay. Built with Tauri v2, React, TypeScript, and Rust.

## Windows (no administrator rights required)

The Windows release is an NSIS **current-user** installer. It installs under the
user profile, does not write to `Program Files`, and does not require elevation.
Application settings, logs, and saved sessions also stay in the user's app-data
directory.

### Install and run (end users)

1. Double-click the generated `*-setup.exe` file.
2. Complete the installer. Do not use **Run as administrator**.
3. Launch **LiveTranslate Overlay** from the Start menu, or run:

   ```powershell
   .\run-windows.cmd
   ```

Windows 10 and 11 normally include the Microsoft Edge WebView2 Runtime required
by Tauri. If the app reports that WebView2 is missing, IT can deploy the runtime
or the user can install Microsoft's per-user Evergreen bootstrapper if company
policy permits it.

### Build on Windows

The following are build-machine requirements only; people installing the
finished app do not need them:

- Node.js LTS and npm
- Rust's stable MSVC toolchain (`rustup` installs into the current user profile)
- Microsoft C++ Build Tools with **Desktop development with C++**, plus a
  Windows 10 or 11 SDK
- WebView2 Runtime

From PowerShell or Command Prompt at the repository root:

```powershell
.\build-windows.cmd
```

The script installs the locked npm dependencies, builds the frontend and Rust
application, and creates only the non-admin NSIS package. The result is written
to:

```text
src-tauri\target\release\bundle\nsis\*-setup.exe
```

To run the unpackaged release executable on the build machine:

```powershell
.\run-windows.cmd
```

### Develop on Windows

After installing the same build prerequisites, run:

```powershell
.\run-dev-windows.cmd
```

The script uses the repository's locked dependencies and starts Tauri in
development mode. The `.cmd` wrapper supplies a process-only PowerShell
execution-policy override; it does not change machine or user policy and does
not require administrator rights.

For microphone access, enable **Microphone access** and **Let desktop apps
access your microphone** under Windows **Settings > Privacy & security >
Microphone**. The app's **Open Privacy Settings** button opens this page.

## Run on macOS or Linux

### Development

To start the development environment (which automatically checks and kills any process occupying port 1420):

```bash
npm install
./run-dev.sh
```

*(Or use the standard command `npm run tauri dev`).*

For browser-only UI development, use `npm run dev`. Native overlay and local session files require Tauri.

## Build & install on macOS or Linux

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
2. Click **Request microphone access**, approve the operating-system prompt if one appears, then select a microphone.
3. Save, return to Control, and start a meeting.
4. Final translations are saved under the app data directory in `sessions/` when the meeting ends.

The raw Live API client sends mono 16-bit PCM at 16 kHz and accepts text from `modelTurn`, `inputTranscription`, and `outputTranscription` response shapes.

On macOS, if access was previously denied, quit the app and run `tccutil reset Microphone com.livetranslate.overlay`, then reopen the newly built app and click **Request microphone access** again.
