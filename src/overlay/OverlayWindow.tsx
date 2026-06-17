import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { ArrowLeftRight, ArrowRight, Home, LoaderCircle } from "lucide-react";
import { defaultSettings } from "../store/appStore";
import type { LanguageCode, OverlayUpdatePayload, TranslationSwitchRequest } from "../types";
import { COMPACT_LANGUAGES, languageOptions } from "../utils/language";
import { OverlayText } from "./OverlayText";
import "./overlay.css";

export function OverlayWindow() {
  const [payload, setPayload] = useState<OverlayUpdatePayload>({
    translatedText: "",
    final: false,
    settings: defaultSettings.overlay,
    sourceLanguage: defaultSettings.sourceLanguage,
    targetLanguage: defaultSettings.targetLanguage,
    mode: defaultSettings.mode,
  });
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const moveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    if (!("__TAURI_INTERNALS__" in window)) return () => document.documentElement.classList.remove("overlay-document");
    const overlayWindow = getCurrentWindow();
    const updateUnlisten = listen<OverlayUpdatePayload>("overlay:update", ({ payload: next }) => {
      setPayload(next); setVisible(true);
      window.clearTimeout(timer.current);
      if (next.final) timer.current = window.setTimeout(() => setVisible(false), next.settings.displayDurationMs);
    });
    const movedUnlisten = overlayWindow.onMoved(({ payload: position }) => {
      window.clearTimeout(moveTimer.current);
      moveTimer.current = window.setTimeout(() => {
        void emitTo("main", "overlay:moved", { x: position.x, y: position.y });
      }, 300);
    });
    return () => {
      void updateUnlisten.then((fn) => fn());
      void movedUnlisten.then((fn) => fn());
      window.clearTimeout(timer.current);
      window.clearTimeout(moveTimer.current);
    };
  }, []);

  const dragOrOpenControls = async (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-overlay-control]")) return;
    if (!("__TAURI_INTERNALS__" in window)) return;
    if (event.detail >= 2) {
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

  const handleResizeMouseDown = async (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!("__TAURI_INTERNALS__" in window)) return;
    await getCurrentWindow().startResizeDragging("SouthEast");
  };

  return <div data-tauri-drag-region className={`overlay-root position-${payload.settings.position}`} onMouseDown={(event) => void dragOrOpenControls(event)}>
    <div className="translation-switcher" data-overlay-control onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="home-button" aria-label="Open control panel" title="Open control panel" onClick={async () => {
        if (!("__TAURI_INTERNALS__" in window)) return;
        const main = await Window.getByLabel("main");
        await main?.show();
        await main?.setFocus();
      }}>
        <Home size={14} />
      </button>
      <div className="switcher-divider" />
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
      <span className={payload.switching ? "switch-status active" : "switch-status"} title={payload.switching ? "Reconnecting" : payload.mode === "smart-auto" ? "Smart Auto · one Live session" : "Fixed direction"}>
        {payload.switching ? <LoaderCircle className="switching-spinner" size={14} /> : payload.mode === "smart-auto" ? <ArrowLeftRight size={15} /> : <ArrowRight size={15} />}
      </span>
    </div>
    <div className={visible ? "overlay-content visible" : "overlay-content"}>
      <OverlayText sourceText={payload.sourceText} translatedText={payload.translatedText} settings={payload.settings} />
    </div>
    <div className="resize-handle" data-overlay-control onMouseDown={(event) => void handleResizeMouseDown(event)} />
  </div>;
}
