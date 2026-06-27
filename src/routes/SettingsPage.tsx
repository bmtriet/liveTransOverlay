import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  ExternalLink,
  Eye,
  EyeOff,
  Mic,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { Route } from "../App";
import { AudioCapture } from "../services/audioCapture";
import { useAppStore } from "../store/appStore";
import type { AppSettings } from "../types";

export function SettingsPage({
  navigate,
}: {
  navigate: (route: Route) => void;
}) {
  const stored = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const saveSettings = useAppStore((state) => state.save);
  const [draft, setDraft] = useState<AppSettings>(() =>
    structuredClone(stored),
  );
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [hostPlatform, setHostPlatform] = useState("web");
  const [micPermission, setMicPermission] = useState<
    "unknown" | "requesting" | "granted" | "denied" | "error"
  >("unknown");
  const [micError, setMicError] = useState("");
  const [audioCapture] = useState(() => new AudioCapture());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detectedPlatform = "__TAURI_INTERNALS__" in window
        ? await invoke<string>("host_platform").catch(() => "unknown")
        : "web";
      if (!cancelled) setHostPlatform(detectedPlatform);

      try {
        const permission = await audioCapture.permissionStatus();
        if (!cancelled) setMicPermission(permission);
      } catch {
        if (!cancelled) setMicPermission("unknown");
      }

      try {
        const availableDevices = await audioCapture.listDevices();
        if (!cancelled) setDevices(availableDevices);
      } catch {
        if (!cancelled) setDevices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioCapture]);
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setOverlay = <K extends keyof AppSettings["overlay"]>(
    key: K,
    value: AppSettings["overlay"][K],
  ) =>
    setDraft((current) => ({
      ...current,
      overlay: { ...current.overlay, [key]: value },
    }));
  const setFullscreen = <K extends keyof AppSettings["fullscreen"]>(
    key: K,
    value: AppSettings["fullscreen"][K],
  ) =>
    setDraft((current) => ({
      ...current,
      fullscreen: { ...current.fullscreen, [key]: value },
    }));
  const save = async () => {
    updateSettings(draft);
    await saveSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  const requestMicrophone = async () => {
    setMicPermission("requesting");
    setMicError("");
    try {
      const result = await audioCapture.requestPermission();
      setMicPermission(result);
      if (result === "granted") setDevices(await audioCapture.listDevices());
    } catch (error) {
      setMicPermission("error");
      setMicError(
        error instanceof Error ? error.message : "Microphone request failed",
      );
    }
  };
  const openPrivacySettings = async () => {
    setMicError("");
    if (!("__TAURI_INTERNALS__" in window)) {
      setMicError("Open Privacy Settings is available in the desktop app.");
      return;
    }
    try {
      await invoke("open_microphone_privacy_settings");
    } catch (error) {
      setMicError(error instanceof Error ? error.message : String(error));
    }
  };
  const testOverlay = async () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      console.log("Mock overlay test in browser:", draft.overlay);
      return;
    }
    try {
      const { emitTo } = await import("@tauri-apps/api/event");
      const { Window } = await import("@tauri-apps/api/window");

      const overlay = await Window.getByLabel("overlay");
      await overlay?.show();
      await invoke("set_overlay_click_through", { enabled: false });

      const payload = {
        sourceText: "Xin chào, cảm ơn bạn đã tham gia cuộc họp.",
        translatedText: "Hello, thank you for joining the meeting.",
        final: true,
        settings: draft.overlay,
        sourceLanguage: draft.sourceLanguage,
        targetLanguage: draft.targetLanguage,
        mode: draft.mode,
        switching: false,
      };
      await emitTo("overlay", "overlay:update", payload);
    } catch (error) {
      console.error("Failed to test overlay:", error);
    }
  };

  const permissionHelp =
    hostPlatform === "macos"
      ? "macOS will show its system permission dialog after you click."
      : hostPlatform === "linux"
        ? "Ubuntu/Linux uses the desktop microphone through WebKitGTK after you click."
        : hostPlatform === "windows"
          ? "Windows will use the system microphone permission after you click."
          : "Your browser or desktop shell will ask for microphone access after you click.";
  const settingsButtonLabel =
    hostPlatform === "linux" ? "Open Sound Settings" : "Open Privacy Settings";
  const deniedMessage =
    hostPlatform === "macos"
      ? "Access was denied. Open System Settings → Privacy & Security → Microphone, then enable LiveTranslate Overlay. If it is not listed, quit the app, reset its permission, reopen it, and click this button again."
      : hostPlatform === "linux"
        ? "Access was denied. Check Ubuntu Sound input settings, make sure a microphone is selected, then click Try again. If you installed from a sandboxed package later, also check that package's microphone permission."
        : hostPlatform === "windows"
          ? "Access was denied. Open Windows Settings → Privacy & security → Microphone, then allow microphone access for desktop apps and try again."
          : "Access was denied. Allow microphone access in your browser or desktop permission prompt, then try again.";

  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Configure translation, microphone, and how subtitles look.</p>
        </div>
        <button className="primary-button compact" onClick={() => void save()}>
          {saved ? <Check size={18} /> : <Save size={18} />}
          {saved ? "Saved" : "Save settings"}
        </button>
      </header>
      <div className="settings-grid">
        <section className="settings-section">
          <div className="settings-title">
            <span>01</span>
            <div>
              <h2>Gemini connection</h2>
              <p>Your key stays on this device.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="full">
              <span>API key</span>
              <div className="input-with-action">
                <input
                  type={showKey ? "text" : "password"}
                  value={draft.geminiApiKey}
                  placeholder="Enter your Gemini API key"
                  onChange={(e) => set("geminiApiKey", e.target.value)}
                />
                <button onClick={() => setShowKey((value) => !value)}>
                  {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <label className="full">
              <span>Model</span>
              <input
                value={draft.model}
                onChange={(e) => set("model", e.target.value)}
              />
            </label>
            <label className="full">
              <span>Language detector & summary model</span>
              <input
                value={draft.languageDetectorModel}
                onChange={(e) => set("languageDetectorModel", e.target.value)}
              />
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-title">
            <span>02</span>
            <div>
              <h2>Microphone access</h2>
              <p>Allow the desktop app to hear the conversation.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="full microphone-permission">
              <div>
                <span className="field-label">Microphone permission</span>
                <p>{permissionHelp}</p>
              </div>
              <div className="permission-actions">
                <button
                  className={`permission-button ${micPermission}`}
                  onClick={() => void requestMicrophone()}
                  disabled={
                    micPermission === "requesting" ||
                    micPermission === "granted"
                  }
                >
                  {micPermission === "granted" ? (
                    <ShieldCheck size={18} />
                  ) : micPermission === "denied" ? (
                    <CircleAlert size={18} />
                  ) : (
                    <Mic size={18} />
                  )}
                  {micPermission === "requesting"
                    ? "Requesting…"
                    : micPermission === "granted"
                      ? "Access granted"
                      : micPermission === "denied"
                        ? "Try again"
                        : "Request microphone access"}
                </button>
                <button
                  className="privacy-settings-button"
                  onClick={() => void openPrivacySettings()}
                >
                  <ExternalLink size={17} />
                  {settingsButtonLabel}
                </button>
              </div>
            </div>
            {micPermission === "denied" ? (
              <div className="permission-message denied full">
                <CircleAlert size={16} />
                <span>{deniedMessage}</span>
              </div>
            ) : null}
            {micError ? (
              <div className="permission-message denied full">
                <CircleAlert size={16} />
                <span>{micError}</span>
              </div>
            ) : null}
            <label className="full">
              <span>Microphone</span>
              <div className="select-icon">
                <Mic size={17} />
                <select
                  value={draft.microphoneDeviceId ?? ""}
                  onChange={(e) =>
                    set("microphoneDeviceId", e.target.value || undefined)
                  }
                >
                  <option value="">System default</option>
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label ||
                        `Microphone ${device.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>
        </section>
        <section className="settings-section overlay-settings">
          <div className="settings-title">
            <span>03</span>
            <div>
              <h2>Overlay appearance</h2>
              <p>Make subtitles readable over any content.</p>
            </div>
            <button
              type="button"
              className="secondary-button compact"
              style={{ marginLeft: "auto", minHeight: "38px" }}
              onClick={() => void testOverlay()}
            >
              <ArrowUpRight size={17} />
              Test overlay
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Position</span>
              <select
                value={draft.overlay.position}
                onChange={(e) =>
                  setOverlay(
                    "position",
                    e.target.value as AppSettings["overlay"]["position"],
                  )
                }
              >
                <option value="bottom-center">Bottom center</option>
                <option value="top-center">Top center</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              <span>Animation</span>
              <select
                value={draft.overlay.animation}
                onChange={(e) =>
                  setOverlay(
                    "animation",
                    e.target.value as AppSettings["overlay"]["animation"],
                  )
                }
              >
                <option value="fade">Fade</option>
                <option value="slide-up">Slide up</option>
                <option value="typewriter">Typewriter</option>
                <option value="none">None</option>
              </select>
            </label>
            <label>
              <span>Font size · {draft.overlay.fontSize}px</span>
              <input
                type="range"
                min="24"
                max="72"
                value={draft.overlay.fontSize}
                onChange={(e) => setOverlay("fontSize", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Caption lines · {draft.overlay.maxLines}</span>
              <input
                type="range"
                min="2"
                max="5"
                step="1"
                value={draft.overlay.maxLines}
                onChange={(e) => setOverlay("maxLines", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Display · {draft.overlay.displayDurationMs / 1000}s</span>
              <input
                type="range"
                min="2000"
                max="12000"
                step="500"
                value={draft.overlay.displayDurationMs}
                onChange={(e) =>
                  setOverlay("displayDurationMs", Number(e.target.value))
                }
              />
            </label>
            <label>
              <span>Text color</span>
              <input
                type="color"
                value={draft.overlay.textColor}
                onChange={(e) => setOverlay("textColor", e.target.value)}
              />
            </label>
            <label>
              <span>
                Background opacity ·{" "}
                {Math.round(draft.overlay.backgroundOpacity * 100)}%
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step=".05"
                value={draft.overlay.backgroundOpacity}
                onChange={(e) =>
                  setOverlay("backgroundOpacity", Number(e.target.value))
                }
              />
            </label>
            <div className="toggle-grid full">
              {[
                ["bilingualEnabled", "Bilingual subtitles"],
                ["strokeEnabled", "Text stroke"],
                ["shadowEnabled", "Text shadow"],
                ["backgroundEnabled", "Background"],
                ["clickThrough", "Click-through when idle"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={
                    draft.overlay[key as keyof typeof draft.overlay]
                      ? "toggle on"
                      : "toggle"
                  }
                  onClick={() =>
                    setOverlay(
                      key as "strokeEnabled",
                      !draft.overlay[key as "strokeEnabled"],
                    )
                  }
                >
                  <i />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="settings-section fullscreen-settings">
          <div className="settings-title">
            <span>04</span>
            <div>
              <h2>Fullscreen meeting</h2>
              <p>Presentation-style two-column view for rooms and demos.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>Source font - {draft.fullscreen.sourceFontSize}px</span>
              <input
                type="range"
                min="28"
                max="88"
                value={draft.fullscreen.sourceFontSize}
                onChange={(e) => setFullscreen("sourceFontSize", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Translation font - {draft.fullscreen.targetFontSize}px</span>
              <input
                type="range"
                min="36"
                max="112"
                value={draft.fullscreen.targetFontSize}
                onChange={(e) => setFullscreen("targetFontSize", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Source text color</span>
              <input
                type="color"
                value={draft.fullscreen.sourceTextColor}
                onChange={(e) => setFullscreen("sourceTextColor", e.target.value)}
              />
            </label>
            <label>
              <span>Translation text color</span>
              <input
                type="color"
                value={draft.fullscreen.targetTextColor}
                onChange={(e) => setFullscreen("targetTextColor", e.target.value)}
              />
            </label>
            <label>
              <span>Caption order</span>
              <select
                value={draft.fullscreen.historyOrder}
                onChange={(e) => setFullscreen("historyOrder", e.target.value as AppSettings["fullscreen"]["historyOrder"])}
              >
                <option value="newest-bottom">Newest at bottom</option>
                <option value="newest-top">Newest at top</option>
              </select>
            </label>
            <label>
              <span>Lines kept - {draft.fullscreen.maxHistoryItems}</span>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={draft.fullscreen.maxHistoryItems}
                onChange={(e) => setFullscreen("maxHistoryItems", Number(e.target.value))}
              />
            </label>
          </div>
        </section>
      </div>
      <button className="text-button" onClick={() => navigate("control")}>
        ← Back to control
      </button>
    </div>
  );
}
