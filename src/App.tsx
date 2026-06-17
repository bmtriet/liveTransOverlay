import { useEffect, useState } from "react";
import { Captions, Gauge, Settings, SlidersHorizontal } from "lucide-react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { listen } from "@tauri-apps/api/event";
import { Window } from "@tauri-apps/api/window";
import { Brand } from "./components/Icons";
import { ControlPanel } from "./routes/ControlPanel";
import { SettingsPage } from "./routes/SettingsPage";
import { TranscriptPage } from "./routes/TranscriptPage";
import { useAppStore } from "./store/appStore";
import "./styles.css";

export type Route = "control" | "settings" | "transcript";

export default function App() {
  const [route, setRoute] = useState<Route>("control");
  const hydrate = useAppStore((state) => state.hydrate);
  const hydrated = useAppStore((state) => state.hydrated);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const shortcut = "CommandOrControl+Shift+O";
    void register(shortcut, async (event) => {
      if (event.state !== "Pressed") return;
      const state = useAppStore.getState();
      const next = !state.overlayVisible;
      state.setOverlayVisible(next);
      const overlay = await Window.getByLabel("overlay");
      if (next) await overlay?.show(); else await overlay?.hide();
    });
    return () => { void unregister(shortcut); };
  }, []);
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<{ x: number; y: number }>("overlay:moved", ({ payload }) => {
      const state = useAppStore.getState();
      state.updateSettings({
        ...state.settings,
        overlay: { ...state.settings.overlay, position: "custom", customX: payload.x, customY: payload.y },
      });
      void state.save();
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);
  if (!hydrated) return <div className="boot">LiveTranslate</div>;

  const nav = [
    ["control", "Control", Gauge], ["settings", "Settings", Settings], ["transcript", "Transcript", Captions],
  ] as const;
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <nav>{nav.map(([id, label, Icon]) => <button key={id} className={route === id ? "nav-item active" : "nav-item"} onClick={() => setRoute(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-note"><SlidersHorizontal size={17} /><div><strong>Overlay shortcut</strong><span>⌘ + Shift + O</span></div></div>
    </aside>
    <main className="main-surface">
      {route === "control" ? <ControlPanel navigate={setRoute} /> : null}
      {route === "settings" ? <SettingsPage navigate={setRoute} /> : null}
      {route === "transcript" ? <TranscriptPage navigate={setRoute} /> : null}
    </main>
  </div>;
}
