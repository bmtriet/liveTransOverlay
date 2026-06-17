import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { GripHorizontal } from "lucide-react";
import { defaultSettings } from "../store/appStore";
import type { OverlaySettings } from "../types";
import { OverlayText } from "./OverlayText";
import "./overlay.css";

interface Payload { sourceText?: string; translatedText: string; final: boolean; settings: OverlaySettings }

export function OverlayWindow() {
  const [payload, setPayload] = useState<Payload>({ translatedText: "", final: false, settings: defaultSettings.overlay });
  const [visible, setVisible] = useState(false);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const moveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    const overlayWindow = getCurrentWindow();
    const updateUnlisten = listen<Payload>("overlay:update", ({ payload: next }) => {
      setPayload(next); setVisible(true); setNonce((value) => value + 1);
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
    if (event.detail >= 2) {
      const main = await Window.getByLabel("main");
      await main?.show();
      await main?.setFocus();
      return;
    }
    await getCurrentWindow().startDragging();
  };

  return <div data-tauri-drag-region className={`overlay-root position-${payload.settings.position}`} onMouseDown={(event) => void dragOrOpenControls(event)}>
    <div data-tauri-drag-region className="drag-hint"><GripHorizontal size={16} />Drag overlay · Double-click for controls</div>
    <div className={visible ? "overlay-content visible" : "overlay-content"}>
      <OverlayText sourceText={payload.sourceText} translatedText={payload.translatedText} settings={payload.settings} nonce={nonce} />
    </div>
  </div>;
}
