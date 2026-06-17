import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { ArrowLeftRight, GripHorizontal, LoaderCircle } from "lucide-react";
import { defaultSettings } from "../store/appStore";
import type { LanguageCode, OverlayUpdatePayload, TranslationSwitchRequest } from "../types";
import { languageOptions } from "../utils/language";
import { OverlayText } from "./OverlayText";
import "./overlay.css";

export function OverlayWindow() {
  const [payload, setPayload] = useState<OverlayUpdatePayload>({
    translatedText: "",
    final: false,
    settings: defaultSettings.overlay,
    sourceLanguage: defaultSettings.sourceLanguage,
    targetLanguage: defaultSettings.targetLanguage,
  });
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const moveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
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
    setPayload((current) => ({ ...current, sourceLanguage, targetLanguage, switching: true }));
    const request: TranslationSwitchRequest = { sourceLanguage, targetLanguage };
    await emitTo("main", "translation:switch-requested", request);
  };

  return <div data-tauri-drag-region className={`overlay-root position-${payload.settings.position}`} onMouseDown={(event) => void dragOrOpenControls(event)}>
    <div data-tauri-drag-region className="drag-hint"><GripHorizontal size={16} />Drag overlay · Double-click for controls</div>
    <div className="translation-switcher" data-overlay-control onMouseDown={(event) => event.stopPropagation()}>
      <label>
        <span>From</span>
        <select value={payload.sourceLanguage} disabled={payload.switching} onChange={(event) => void requestSwitch(event.target.value as LanguageCode, payload.targetLanguage)}>
          {languageOptions.map(([code, name]) => <option key={code} value={code} disabled={code === payload.targetLanguage}>{name}</option>)}
        </select>
      </label>
      <button type="button" aria-label="Swap translation direction" title="Swap translation direction" disabled={payload.switching} onClick={() => void requestSwitch(payload.targetLanguage, payload.sourceLanguage)}>
        {payload.switching ? <LoaderCircle className="switching-spinner" size={16} /> : <ArrowLeftRight size={16} />}
      </button>
      <label>
        <span>To</span>
        <select value={payload.targetLanguage} disabled={payload.switching} onChange={(event) => void requestSwitch(payload.sourceLanguage, event.target.value as LanguageCode)}>
          {languageOptions.map(([code, name]) => <option key={code} value={code} disabled={code === payload.sourceLanguage}>{name}</option>)}
        </select>
      </label>
      <span className={payload.switching ? "switch-status active" : "switch-status"}>{payload.switching ? "Reconnecting…" : "Fixed"}</span>
    </div>
    <div className={visible ? "overlay-content visible" : "overlay-content"}>
      <OverlayText sourceText={payload.sourceText} translatedText={payload.translatedText} settings={payload.settings} />
    </div>
  </div>;
}
