# LiveTranslate Overlay

*Build with ❤️ for SportGear TW. Thanks Tara for the idea!*

An elegant, privacy-first, real-time subtitle translation tool featuring an always-on-top transparent overlay. Designed to sit seamlessly over virtual meeting platforms (Zoom, Google Meet, Microsoft Teams) to provide low-latency, real-time speech translation.

---

### 🌟 Project Vision & Goals
* **Zero Friction Subtitles:** A floating, transparent overlay that sits perfectly on top of active meeting windows without interrupting user interaction.
* **Privacy First (BYOK):** No central server middleware. Microphone audio streams directly from your device to Google Gemini endpoints via secure WebSockets.
* **Ultra-Low Latency:** Utilizes Gemini's Live API for real-time bidirectional streaming, turning voice input into translated text instantly.
* **Cross-Platform & Lightweight:** Powered by Tauri v2 and React for minimal memory and CPU footprints across Windows, macOS, and Linux.

---

> [!WARNING]
> **English:**
> 1. **Auto-language switching limitations:** There are still bugs and auto-language switching is not fully effective yet. Gemini Flash Live Translate does not officially support language switching at the moment.
> 2. **BYOK (Bring Your Own Key) Mechanism:** The application operates on a BYOK basis, so you must input your own Gemini API Key to use it.
>
> **Tiếng Việt:**
> 1. **Lưu ý về dịch tự động:** Hiện tại ứng dụng vẫn còn bug và chưa hiệu quả trong việc chuyển đổi ngôn ngữ tự động. Gemini Flash Live Translate hiện chưa hỗ trợ cơ chế switch ngôn ngữ chính thức.
> 2. **Cơ chế BYOK (Bring Your Own Key):** Ứng dụng hoạt động theo cơ chế BYOK, vì vậy bạn phải tự điền Gemini API Key của mình để sử dụng.
>
> **繁體中文 (Traditional Chinese):**
> 1. **自動語言切換限制：** 目前仍存在 Bug，且在自動語言切換方面效果有限。Gemini Flash Live Translate 目前官方尚未支援語言切換功能。
> 2. **BYOK (Bring Your Own Key) 機制：** 本應用採用 BYOK 模式，因此您需要自行填寫您的 Gemini API Key 才能使用。

---

## 🚀 Key Features

- **Transparent Floating Overlay:** Stays visible above any full-screen or windowed meeting apps.
- **Global Hotkey Toggle:** Press `CommandOrControl+Shift+O` (`⌘ + Shift + O`) to instantly show/hide the subtitle overlay.
- **Persistent Drag-to-Position:** Drag the subtitle overlay anywhere on screen. Position coordinates are automatically saved.
- **Session Transcripts:** Local session archiving which auto-saves all translated transcriptions as Markdown files under the `sessions/` directory.

---

## 🛠️ Technology Stack
* **Frontend:** React, TypeScript, Vite, Tailwind CSS (for modern UI styling)
* **Desktop Shell:** Tauri v2 (Rust backend supplying native audio capturing, windows management, and global hotkeys)
* **AI Engine:** Google Gemini Live API (sending mono 16-bit PCM at 16 kHz, receiving real-time transcription and translation payloads)

---

## 💻 Operating System Guides

### Windows (no administrator rights required)

The Windows release is an NSIS **current-user** installer. It installs under the user profile, does not write to `Program Files`, and does not require elevation. Application settings, logs, and saved sessions also stay in the user's app-data directory.

#### Install and run (end users)

1. Double-click the generated `*-setup.exe` file.
2. Complete the installer. Do not use **Run as administrator**.
3. Launch **LiveTranslate Overlay** from the Start menu, or run:

   ```powershell
   .\run-windows.cmd
   ```

Windows 10 and 11 normally include the Microsoft Edge WebView2 Runtime required by Tauri. If the app reports that WebView2 is missing, IT can deploy the runtime or the user can install Microsoft's per-user Evergreen bootstrapper if company policy permits it.

#### Build on Windows

The following are build-machine requirements only; people installing the finished app do not need them:

- Node.js LTS and npm
- Rust's stable MSVC toolchain (`rustup` installs into the current user profile)
- Microsoft C++ Build Tools with **Desktop development with C++**, plus a Windows 10 or 11 SDK
- WebView2 Runtime

From PowerShell or Command Prompt at the repository root:

```powershell
.\build-windows.cmd
```

The script installs the locked npm dependencies, builds the frontend and Rust application, and creates only the non-admin NSIS package. The result is written to:

```text
src-tauri\target\release\bundle\nsis\*-setup.exe
```

To run the unpackaged release executable on the build machine:

```powershell
.\run-windows.cmd
```

#### Develop on Windows

After installing the same build prerequisites, run:

```powershell
.\run-dev-windows.cmd
```

The script uses the repository's locked dependencies and starts Tauri in development mode. The `.cmd` wrapper supplies a process-only PowerShell execution-policy override; it does not change machine or user policy and does not require administrator rights.

For microphone access, enable **Microphone access** and **Let desktop apps access your microphone** under Windows **Settings > Privacy & security > Microphone**. The app's **Open Privacy Settings** button opens this page.

---

### macOS or Linux

#### Development

To start the development environment (which automatically checks and kills any process occupying port 1420):

```bash
npm install
./run-dev.sh
```

*(Or use the standard command `npm run tauri dev`).*

For browser-only UI development, use `npm run dev`. Native overlay and local session files require Tauri.

#### Build & install on macOS

For a macOS debug app with the microphone entitlement embedded in its ad-hoc signature, run `npm run build:macos:debug`. Launch the resulting `.app` bundle rather than the raw binary.

On macOS, if microphone access was previously denied, quit the app and run:
```bash
tccutil reset Microphone com.livetranslate.overlay
```
Then reopen the newly built app and click **Request microphone access** again.

#### Build & install on Linux (Ubuntu)

##### Prerequisites
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

##### Build, Install & Run
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

---

## 🔄 MVP flow

1. Open Settings and enter a Gemini API key.
2. Click **Request microphone access**, approve the operating-system prompt if one appears, then select a microphone.
3. Save, return to Control, and start a meeting.
4. Final translations are saved under the app data directory in `sessions/` when the meeting ends.

The raw Live API client sends mono 16-bit PCM at 16 kHz and accepts text from `modelTurn`, `inputTranscription`, and `outputTranscription` response shapes.
