# LiveTranslate Overlay

Realtime microphone translation with a transparent, always-on-top subtitle overlay. Built with Tauri v2, React, TypeScript, and Rust.

## Run

```bash
npm install
npm run tauri dev
```

For a macOS debug app with the microphone entitlement embedded in its ad-hoc signature, run `npm run build:macos:debug`. Launch the resulting `.app` bundle rather than the raw binary.

For browser-only UI development, use `npm run dev`. Native overlay and local session files require Tauri.

## MVP flow

1. Open Settings and enter a Gemini API key.
2. Click **Request microphone access**, approve the macOS prompt, then select a microphone.
3. Save, return to Control, and start a meeting.
4. Final translations are saved under the app data directory in `sessions/` when the meeting ends.

The raw Live API client sends mono 16-bit PCM at 16 kHz and accepts text from `modelTurn`, `inputTranscription`, and `outputTranscription` response shapes.

If macOS previously denied access, quit the app and run `tccutil reset Microphone com.livetranslate.overlay`, then reopen the newly built app and click **Request microphone access** again.
