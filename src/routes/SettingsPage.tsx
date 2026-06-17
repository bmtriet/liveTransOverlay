import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
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
import type { AppSettings, LanguageCode } from "../types";
import { languageOptions } from "../utils/language";

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
  const [micPermission, setMicPermission] = useState<
    "unknown" | "requesting" | "granted" | "denied" | "error"
  >("unknown");
  const [micError, setMicError] = useState("");
  const [audioCapture] = useState(() => new AudioCapture());
  useEffect(() => {
    void Promise.all([
      audioCapture.listDevices(),
      audioCapture.permissionStatus(),
    ])
      .then(([availableDevices, permission]) => {
        setDevices(availableDevices);
        setMicPermission(permission);
      })
      .catch(() => setDevices([]));
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
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-title">
            <span>02</span>
            <div>
              <h2>Translation</h2>
              <p>Choose the languages for this conversation.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>From</span>
              <select
                value={draft.sourceLanguage}
                onChange={(e) =>
                  set("sourceLanguage", e.target.value as LanguageCode)
                }
              >
                {languageOptions.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>To</span>
              <select
                value={draft.targetLanguage}
                onChange={(e) =>
                  set("targetLanguage", e.target.value as LanguageCode)
                }
              >
                {languageOptions.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              <span>Direction</span>
              <div className="segmented">
                <button
                  className={
                    draft.mode === "auto-bidirectional" ? "selected" : ""
                  }
                  onClick={() => set("mode", "auto-bidirectional")}
                >
                  Auto bidirectional
                </button>
                <button
                  className={draft.mode === "fixed-direction" ? "selected" : ""}
                  onClick={() => set("mode", "fixed-direction")}
                >
                  Fixed direction
                </button>
              </div>
            </label>
            <div className="full microphone-permission">
              <div>
                <span className="field-label">Microphone permission</span>
                <p>
                  macOS will show its system permission dialog after you click.
                </p>
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
                  Open Privacy Settings
                </button>
              </div>
            </div>
            {micPermission === "denied" ? (
              <div className="permission-message denied full">
                <CircleAlert size={16} />
                <span>
                  Access was denied. Open System Settings → Privacy & Security →
                  Microphone, then enable LiveTranslate Overlay. If it is not
                  listed, quit the app, reset its permission, reopen it, and
                  click this button again.
                </span>
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
      </div>
      <button className="text-button" onClick={() => navigate("control")}>
        ← Back to control
      </button>
    </div>
  );
}
