import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { ArrowUpRight, CircleStop, Eye, EyeOff, Mic, Play, Radio, Sparkles } from "lucide-react";
import type { Route } from "../App";
import { AudioCapture } from "../services/audioCapture";
import { GeminiLiveClient } from "../services/geminiLiveClient";
import { saveTranscript } from "../services/transcriptStore";
import { recordDiagnostic } from "../services/diagnostics";
import { SmartLanguageDetector } from "../services/smartLanguageDetector";
import type { LanguageDecision } from "../services/geminiTextClient";
import { useAppStore } from "../store/appStore";
import { useSessionStore } from "../store/sessionStore";
import { LANGUAGES } from "../utils/language";
import type { AppSettings, OverlayUpdatePayload, TranslationSwitchRequest } from "../types";

const isTauri = () => "__TAURI_INTERNALS__" in window;

export function ControlPanel({ navigate }: { navigate: (route: Route) => void }) {
  const settings = useAppStore((state) => state.settings);
  const status = useAppStore((state) => state.connectionStatus);
  const error = useAppStore((state) => state.connectionError);
  const overlayVisible = useAppStore((state) => state.overlayVisible);
  const audioLevel = useAppStore((state) => state.audioLevel);
  const setConnection = useAppStore((state) => state.setConnection);
  const setOverlayVisible = useAppStore((state) => state.setOverlayVisible);
  const setAudioLevel = useAppStore((state) => state.setAudioLevel);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const saveSettings = useAppStore((state) => state.save);
  const active = useSessionStore((state) => state.active);
  const session = useSessionStore((state) => state.session);
  const partialText = useSessionStore((state) => state.partialText);
  const startSession = useSessionStore((state) => state.start);
  const addText = useSessionStore((state) => state.addText);
  const finishSession = useSessionStore((state) => state.finish);
  const seedDemo = useSessionStore((state) => state.seedDemo);
  const audio = useRef(new AudioCapture());
  const client = useRef(new GeminiLiveClient());
  const detector = useRef(new SmartLanguageDetector());
  const audioHistory = useRef(new Uint8Array(0));
  const switching = useRef(false);
  const performSwitchRef = useRef<((request: TranslationSwitchRequest, mode: AppSettings["mode"], reason: "manual" | "smart-language-detection", confidence?: number) => Promise<void>) | null>(null);
  const lastOverlay = useRef({ translatedText: "Listening…", final: false, sourceText: undefined as string | undefined });
  const [starting, setStarting] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => { void audio.current.listDevices().then(setDevices).catch(() => setDevices([])); }, []);
  const segments = session?.segments ?? [];
  const latest = partialText || segments.at(-1)?.translatedText || "Your translated subtitles will appear here.";
  const bars = useMemo(() => Array.from({ length: 22 }, (_, i) => Math.min(1, audioLevel * 1.5 + (Math.sin(i * 1.7) + 1) * 0.08)), [audioLevel]);

  const publishOverlay = useCallback(async (translatedText: string, final = false, sourceText?: string, runtimeSettings?: AppSettings, isSwitching = false) => {
    if (!isTauri()) return;
    const currentSettings = runtimeSettings ?? useAppStore.getState().settings;
    lastOverlay.current = { sourceText, translatedText, final };
    const payload: OverlayUpdatePayload = {
      sourceText,
      translatedText,
      final,
      settings: currentSettings.overlay,
      sourceLanguage: currentSettings.sourceLanguage,
      targetLanguage: currentSettings.targetLanguage,
      mode: currentSettings.mode,
      switching: isSwitching,
    };
    await emitTo("overlay", "overlay:update", payload);
  }, []);

  const connectTranslation = useCallback(async (runtimeSettings: AppSettings, replayAudio?: Uint8Array) => {
    await client.current.connect(runtimeSettings, {
      onStatus: setConnection,
      onText: (text, isFinal, result) => {
        useSessionStore.getState().addText(text, isFinal, runtimeSettings, result.sourceText, result.sourceLanguage, result.targetLanguage);
        if (isFinal) {
          const currentSession = useSessionStore.getState().session;
          if (currentSession) {
            void saveTranscript(currentSession).catch((error) => {
              void recordDiagnostic({
                at: new Date().toISOString(),
                scope: "transcript-autosave",
                message: error instanceof Error ? error.message : String(error),
              });
            });
          }
        }
        void publishOverlay(text, isFinal, result.sourceText, runtimeSettings);
        if (result.sourceText) {
          detector.current.observe({ text: result.sourceText, settings: runtimeSettings }, (decision: LanguageDecision) => {
            void performSwitchRef.current?.(
              { sourceLanguage: runtimeSettings.targetLanguage, targetLanguage: runtimeSettings.sourceLanguage },
              "smart-auto",
              "smart-language-detection",
              decision.confidence,
            );
          });
        }
      },
      onInputTranscript: (text, _isFinal, languageCode) => {
        detector.current.observe({ text, apiLanguageCode: languageCode, settings: runtimeSettings }, (decision: LanguageDecision) => {
          void performSwitchRef.current?.(
            { sourceLanguage: runtimeSettings.targetLanguage, targetLanguage: runtimeSettings.sourceLanguage },
            "smart-auto",
            "smart-language-detection",
            decision.confidence,
          );
        });
      },
    }, replayAudio);
  }, [publishOverlay, setConnection]);

  const performSwitch = useCallback(async (
    request: TranslationSwitchRequest,
    mode: AppSettings["mode"],
    reason: "manual" | "smart-language-detection",
    confidence?: number,
  ) => {
    if (!useSessionStore.getState().active || switching.current || request.sourceLanguage === request.targetLanguage) return;
    switching.current = true;
    detector.current.reset();
    const appState = useAppStore.getState();
    const nextSettings: AppSettings = {
      ...appState.settings,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      mode,
    };
    appState.updateSettings(nextSettings);
    await appState.save();
    useSessionStore.getState().addDirectionChange({
      timestamp: new Date().toISOString(),
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      reason,
      confidence,
    });
    const previous = lastOverlay.current;
    await publishOverlay(previous.translatedText, previous.final, previous.sourceText, nextSettings, true);
    try {
      const replayAudio = audioHistory.current.slice(Math.max(0, audioHistory.current.length - 96_000));
      await connectTranslation(nextSettings, replayAudio);
      detector.current.markSwitched();
      await publishOverlay(previous.translatedText, previous.final, previous.sourceText, nextSettings, false);
    } catch (switchError) {
      const message = switchError instanceof Error ? switchError.message : "Could not switch translation direction.";
      setConnection("error", message);
      await publishOverlay(previous.translatedText, previous.final, previous.sourceText, nextSettings, false);
      await recordDiagnostic({ at: new Date().toISOString(), scope: "translation-switch", message, details: { ...request, reason, confidence } });
    } finally {
      switching.current = false;
    }
  }, [connectTranslation, publishOverlay, setConnection]);
  performSwitchRef.current = performSwitch;

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<TranslationSwitchRequest>("translation:switch-requested", async ({ payload }) => {
      await performSwitch(payload, "fixed-direction", "manual");
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [performSwitch]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<number>("overlay:font-size-changed", async ({ payload: fontSize }) => {
      const appState = useAppStore.getState();
      const nextSettings = {
        ...appState.settings,
        overlay: {
          ...appState.settings.overlay,
          fontSize: Math.min(72, Math.max(24, fontSize)),
        },
      };
      appState.updateSettings(nextSettings);
      await appState.save();
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen("overlay:closed", () => {
      setOverlayVisible(false);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [setOverlayVisible]);

  const selectMicrophone = async (microphoneDeviceId: string) => {
    const next = { ...settings, microphoneDeviceId: microphoneDeviceId || undefined };
    updateSettings(next);
    await saveSettings();
  };

  const start = async () => {
    if (starting) return;
    setConnection("idle");
    if (!settings.geminiApiKey.trim()) {
      setConnection("error", "Gemini API key is missing. Add it in Settings before starting a meeting.");
      return;
    }
    setStarting(true);
    try {
      audioHistory.current = new Uint8Array(0);
      await audio.current.start(settings.microphoneDeviceId, { onLevel: setAudioLevel, onChunk: (chunk) => {
        const combined = new Uint8Array(audioHistory.current.length + chunk.length);
        combined.set(audioHistory.current);
        combined.set(chunk, audioHistory.current.length);
        audioHistory.current = combined.length > 160_000 ? combined.slice(combined.length - 160_000) : combined;
        client.current.sendAudio(chunk);
      } });
      startSession(settings);
      if (isTauri()) {
        const overlay = await Window.getByLabel("overlay");
        if (settings.overlay.position === "custom" && settings.overlay.customX !== undefined && settings.overlay.customY !== undefined) {
          await overlay?.setPosition(new PhysicalPosition(settings.overlay.customX, settings.overlay.customY));
        }
        await invoke("set_overlay_click_through", { enabled: false });
        await overlay?.show();
        setOverlayVisible(true);
        await publishOverlay("Listening…", false, undefined, settings);
        await getCurrentWindow().hide();
      }
      await connectTranslation(settings);
    } catch (startError) {
      await audio.current.stop();
      client.current.close();
      setAudioLevel(0);
      finishSession();
      const message = startError instanceof DOMException && startError.name === "NotAllowedError"
        ? "Microphone access is blocked. Open Settings, check microphone access, then try again."
        : startError instanceof Error ? startError.message
          : typeof startError === "string" ? startError
            : "Meeting could not start.";
      await recordDiagnostic({
        at: new Date().toISOString(),
        scope: "meeting-start",
        message,
        details: { rawError: String(startError) },
      });
      setConnection("error", message);
      if (isTauri()) {
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
        await (await Window.getByLabel("overlay"))?.hide();
      }
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    await audio.current.stop();
    detector.current.reset();
    audioHistory.current = new Uint8Array(0);
    client.current.close();
    setAudioLevel(0);
    const finished = finishSession();
    if (finished) await saveTranscript(finished);
    if (isTauri()) {
      await invoke("set_overlay_click_through", { enabled: settings.overlay.clickThrough });
      await emitTo("overlay", "overlay:reset");
      await (await Window.getByLabel("overlay"))?.hide();
      setOverlayVisible(false);
      await getCurrentWindow().show();
      await getCurrentWindow().setFocus();
    }
  };

  const toggleOverlay = async () => {
    const next = !overlayVisible;
    setOverlayVisible(next);
    if (isTauri()) {
      const overlay = await Window.getByLabel("overlay");
      if (next) {
        await overlay?.show();
      } else {
        await emitTo("overlay", "overlay:reset");
        await overlay?.hide();
      }
    }
  };

  const testOverlay = async () => {
    setOverlayVisible(true);
    if (isTauri()) {
      const overlay = await Window.getByLabel("overlay");
      await overlay?.show();
      await invoke("set_overlay_click_through", { enabled: false });
      await publishOverlay("Hello, thank you for joining the meeting.", true, "Xin chào, cảm ơn bạn đã tham gia cuộc họp.", settings);
    } else addText("你好，感谢你参加会议。", false, settings, "Xin chào, cảm ơn bạn đã tham gia cuộc họp.");
  };

  return <div className="control-layout">
    <section className="workspace">
      <header className="page-header"><div><h1>Ready to translate</h1><p>Clear subtitles, while the conversation is happening.</p></div><div className={`status-chip ${status}`}><span />{status === "idle" ? "Ready" : status}</div></header>
      <div className="listening-hero">
        <div className={active ? "mic-orbit active" : "mic-orbit"}><div className="wave left" /> <Mic size={35} /> <div className="wave right" /></div>
        <h2>{active ? "Listening now" : "Your meeting, understood"}</h2>
        <p>{active ? "Speak naturally — translation is streaming live." : "Start a session and keep the conversation moving."}</p>
        <button className={active ? "primary-button stop" : "primary-button"} disabled={starting} onClick={() => void (active ? stop() : start())}>{active ? <CircleStop size={19} /> : <Play size={19} fill="currentColor" />}{starting ? "Starting…" : active ? "End meeting" : "Start meeting"}</button>
        {error ? <span className="inline-error">{error}{error.includes("Settings") || error.includes("API key") ? <button onClick={() => navigate("settings")}>Open Settings</button> : null}</span> : null}
      </div>
      <div className="device-row">
        <label><span>Microphone</span><div className="select-icon control-microphone"><Mic size={17} /><select value={settings.microphoneDeviceId ?? ""} onChange={(event) => void selectMicrophone(event.target.value)} disabled={active || starting}><option value="">System default</option>{devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${device.deviceId.slice(0, 5)}`}</option>)}</select></div></label>
        <div className="level-block"><span>Audio level</span><div className="level-bars">{bars.map((height, index) => <i key={index} style={{ transform: `scaleY(${Math.max(.16, height)})` }} />)}</div></div>
      </div>
      <div className="overlay-row">
        <button className="overlay-state" onClick={() => void toggleOverlay()}><span className="eye-box">{overlayVisible ? <Eye /> : <EyeOff />}</span><span><strong>Overlay {overlayVisible ? "visible" : "hidden"}</strong><small>Subtitles will appear above other windows</small></span></button>
        <button className="secondary-button" onClick={() => void testOverlay()}><ArrowUpRight size={18} />Test overlay</button>
      </div>
      <div className="preview-block"><div className="section-label"><span>Live translation preview</span><span className="language-pair">{LANGUAGES[settings.sourceLanguage]} {settings.mode === "smart-auto" ? "↔" : "→"} {LANGUAGES[settings.targetLanguage]}</span></div><div className="preview-text"><p>{segments.at(-1)?.sourceText ?? "Xin chào, cảm ơn bạn đã tham gia cuộc họp."}</p><strong>{latest}</strong></div><small><Radio size={13} />{settings.mode === "smart-auto" ? "Smart Auto detects language changes with Gemini 2.5 Flash-Lite" : "Subtitles update in real time"}</small></div>
    </section>
    <aside className="transcript-rail">
      <div className="rail-heading"><div><span>Recent transcript</span><strong>{segments.length} lines</strong></div><button onClick={() => navigate("transcript")}>View all <ArrowUpRight size={14} /></button></div>
      <div className="rail-list">{[...segments].reverse().map((segment) => <article key={segment.id}><time>{new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><p>{segment.sourceText}</p><strong>{segment.translatedText}</strong></article>)}</div>
      <button className="summary-button" disabled={!segments.length} onClick={() => navigate("transcript")}><Sparkles size={16} />AI summary</button>
    </aside>
  </div>;
}
