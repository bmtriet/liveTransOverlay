import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { ArrowLeftRight, ArrowRight, LoaderCircle, Minus, Plus, SlidersHorizontal, X } from "lucide-react";
import { defaultSettings } from "../store/appStore";
import type { LanguageCode, OverlayUpdatePayload, TranslationSwitchRequest } from "../types";
import { COMPACT_LANGUAGES, languageOptions } from "../utils/language";
import { OverlayText } from "./OverlayText";
import "./overlay.css";

const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 72;
const FONT_STEP = 4;
const CONTROLS_IDLE_MS = 5000;

export function OverlayWindow() {
  const [payload, setPayload] = useState<OverlayUpdatePayload>({
    translatedText: "",
    final: false,
    settings: defaultSettings.overlay,
    sourceLanguage: defaultSettings.sourceLanguage,
    targetLanguage: defaultSettings.targetLanguage,
    mode: defaultSettings.mode,
  });
  const [langBarExpanded, setLangBarExpanded] = useState(false);
  const [repaintKey, setRepaintKey] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const moveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    if (!("__TAURI_INTERNALS__" in window)) return () => document.documentElement.classList.remove("overlay-document");
    
    // Listen for custom reset event to clear text and settings bar status cleanly
    const resetUnlisten = listen("overlay:reset", () => {
      setLangBarExpanded(false);
      setPayload((current) => ({
        ...current,
        translatedText: "",
        sourceText: undefined,
      }));
    });

    const overlayWindow = getCurrentWindow();
    const updateUnlisten = listen<OverlayUpdatePayload>("overlay:update", ({ payload: next }) => {
      setPayload(next);
      void applyPresentationMode(Boolean(next.presentationMode));
      window.clearTimeout(timer.current);
      if (next.final) {
        timer.current = window.setTimeout(() => {
          setPayload((current) => ({ ...current, translatedText: "", sourceText: undefined }));
        }, next.settings.displayDurationMs);
      }
    });
    const movedUnlisten = overlayWindow.onMoved(({ payload: position }) => {
      window.clearTimeout(moveTimer.current);
      moveTimer.current = window.setTimeout(() => {
        void emitTo("main", "overlay:moved", { x: position.x, y: position.y });
      }, 300);
    });
    return () => {
      void resetUnlisten.then((fn) => fn());
      void updateUnlisten.then((fn) => fn());
      void movedUnlisten.then((fn) => fn());
      window.clearTimeout(timer.current);
      window.clearTimeout(moveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!payload.presentationMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void openMainAndHideOverlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [payload.presentationMode]);

  const applyPresentationMode = async (enabled: boolean) => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const overlayWindow = getCurrentWindow();
    const current = await overlayWindow.isFullscreen().catch(() => false);
    if (current !== enabled) await overlayWindow.setFullscreen(enabled);
    if (enabled) await overlayWindow.setFocus();
  };

  const openMainAndHideOverlay = async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const overlayWindow = getCurrentWindow();
    await overlayWindow.setFullscreen(false);
    await emitTo("main", "overlay:closed");
    await overlayWindow.hide();
    const main = await Window.getByLabel("main");
    await main?.show();
    await main?.setFocus();
  };

  const dragOrOpenControls = async (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-overlay-control]")) return;
    if (!("__TAURI_INTERNALS__" in window)) return;
    if (event.detail >= 2) {
      if (payload.presentationMode) {
        await openMainAndHideOverlay();
        return;
      }
      const main = await Window.getByLabel("main");
      await main?.show();
      await main?.setFocus();
      return;
    }
    await getCurrentWindow().startDragging();
  };

  const requestSwitch = async (sourceLanguage: LanguageCode, targetLanguage: LanguageCode) => {
    if (sourceLanguage === targetLanguage || payload.switching) return;
    setPayload((current) => ({ ...current, sourceLanguage, targetLanguage, mode: "fixed-direction", switching: true }));
    if (!("__TAURI_INTERNALS__" in window)) {
      setPayload((current) => ({ ...current, switching: false }));
      return;
    }
    const request: TranslationSwitchRequest = { sourceLanguage, targetLanguage };
    await emitTo("main", "translation:switch-requested", request);
  };

  const changeFontSize = async (delta: number) => {
    const nextFontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, payload.settings.fontSize + delta));
    if (nextFontSize === payload.settings.fontSize) return;
    setPayload((current) => ({ ...current, settings: { ...current.settings, fontSize: nextFontSize } }));
    setRepaintKey((value) => value + 1);
    document.documentElement.style.opacity = "0.999";
    window.requestAnimationFrame(() => {
      document.documentElement.style.opacity = "";
    });
    if ("__TAURI_INTERNALS__" in window) await emitTo("main", "overlay:font-size-changed", nextFontSize);
  };

  const closeOverlay = async () => {
    window.clearTimeout(timer.current);
    if (!("__TAURI_INTERNALS__" in window)) return;
    await emitTo("main", "overlay:closed");
    await getCurrentWindow().hide();
    const main = await Window.getByLabel("main");
    await main?.show();
    await main?.setFocus();
    
    // Reset state manually instead of reloading (avoid WebKitGTK transparency loss)
    setLangBarExpanded(false);
    setPayload((current) => ({
      ...current,
      translatedText: "",
      sourceText: undefined,
    }));
  };

  const controls = (
    <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }} data-overlay-control onMouseDown={(e) => e.stopPropagation()}>
      {/* Left: Gear (SlidersHorizontal) & Expanded Switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <button type="button" className={`home-button ${langBarExpanded ? "active" : ""}`} onClick={() => setLangBarExpanded(!langBarExpanded)} aria-label="Toggle language settings" title="Toggle language settings" style={{ background: "transparent", border: 0, cursor: "pointer", color: "white", width: "26px", height: "25px", display: "grid", placeItems: "center" }}>
          <SlidersHorizontal size={15} />
        </button>
        {langBarExpanded && (
          <div className="translation-switcher" style={{ background: "rgba(10,18,28,.85)", display: "flex", alignItems: "center", gap: "5px", padding: "4px 5px", border: "1px solid rgba(255,255,255,.16)", borderRadius: "10px" }}>
            <label>
              <span>From</span>
              <select value={payload.sourceLanguage} disabled={payload.switching} onChange={(event) => void requestSwitch(event.target.value as LanguageCode, payload.targetLanguage)}>
                {languageOptions.map(([code]) => <option key={code} value={code} disabled={code === payload.targetLanguage}>{COMPACT_LANGUAGES[code]}</option>)}
              </select>
            </label>
            <button type="button" aria-label="Swap translation direction" title="Swap translation direction" disabled={payload.switching} onClick={() => void requestSwitch(payload.targetLanguage, payload.sourceLanguage)}>
              {payload.switching ? <LoaderCircle className="switching-spinner" size={16} /> : <ArrowLeftRight size={16} />}
            </button>
            <label>
              <span>To</span>
              <select value={payload.targetLanguage} disabled={payload.switching} onChange={(event) => void requestSwitch(payload.sourceLanguage, event.target.value as LanguageCode)}>
                {languageOptions.map(([code]) => <option key={code} value={code} disabled={code === payload.sourceLanguage}>{COMPACT_LANGUAGES[code]}</option>)}
              </select>
            </label>
            <span className={payload.switching ? "switch-status active" : "switch-status"} title={payload.switching ? "Reconnecting" : payload.mode === "smart-auto" ? "Smart Auto" : "Fixed direction"}>
              {payload.switching ? <LoaderCircle className="switching-spinner" size={14} /> : payload.mode === "smart-auto" ? <ArrowLeftRight size={15} /> : <ArrowRight size={15} />}
            </span>
            <div className="switcher-divider" />
            <button type="button" aria-label="Decrease font size" title={`Decrease font size`} disabled={payload.settings.fontSize <= MIN_FONT_SIZE} onClick={() => void changeFontSize(-FONT_STEP)}>
              <Minus size={15} />
            </button>
            <span className="font-size-indicator">{payload.settings.fontSize}</span>
            <button type="button" aria-label="Increase font size" title={`Increase font size`} disabled={payload.settings.fontSize >= MAX_FONT_SIZE} onClick={() => void changeFontSize(FONT_STEP)}>
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Right: Close button */}
      <button type="button" className="close-button" aria-label="Close overlay" title="Close overlay" onClick={() => void closeOverlay()} style={{ width: "26px", height: "25px", display: "grid", placeItems: "center", border: 0, borderRadius: "6px", background: "rgba(255,255,255,.1)", color: "white", cursor: "pointer" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#ff5c5c"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.1)"; }}>
        <X size={15} />
      </button>
    </div>
  );

  const controlsForMode = payload.presentationMode ? null : controls;

  return <div data-tauri-drag-region className={`overlay-root position-${payload.settings.position} ${payload.presentationMode ? "presentation" : ""}`} onMouseDown={(event) => void dragOrOpenControls(event)}>
    <div className="overlay-content visible">
      <OverlayText key={`${payload.settings.fontSize}:${payload.presentationMode ? "presentation" : "overlay"}:${repaintKey}`} sourceText={payload.sourceText} translatedText={payload.translatedText} settings={payload.settings} fullscreenSettings={payload.fullscreenSettings} sourceLanguage={payload.sourceLanguage} targetLanguage={payload.targetLanguage} presentationLeftLanguage={payload.presentationLeftLanguage} presentationRightLanguage={payload.presentationRightLanguage} final={payload.final} presentationMode={Boolean(payload.presentationMode)} controls={controlsForMode} />
    </div>
  </div>;
}
