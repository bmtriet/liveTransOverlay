import { create } from "zustand";
import type { AppSettings, ConnectionStatus } from "../types";
import { loadPersistedSettings, persistSettings } from "../services/settingsStore";

export const defaultSettings: AppSettings = {
  geminiApiKey: "",
  model: "gemini-3.5-live-translate-preview",
  sourceLanguage: "vi-VN",
  targetLanguage: "zh-CN",
  mode: "auto-bidirectional",
  overlay: {
    position: "bottom-center", fontSize: 42, textColor: "#ffffff",
    strokeEnabled: true, strokeColor: "#000000", strokeWidth: 3,
    shadowEnabled: true, backgroundEnabled: true, backgroundColor: "#000000",
    backgroundOpacity: 0.35, maxLines: 3, displayDurationMs: 6000,
    animation: "fade", clickThrough: true, bilingualEnabled: true,
  },
};

interface AppState {
  settings: AppSettings;
  hydrated: boolean;
  connectionStatus: ConnectionStatus;
  connectionError?: string;
  overlayVisible: boolean;
  audioLevel: number;
  updateSettings: (settings: AppSettings) => void;
  hydrate: () => Promise<void>;
  save: () => Promise<void>;
  setConnection: (connectionStatus: ConnectionStatus, connectionError?: string) => void;
  setOverlayVisible: (value: boolean) => void;
  setAudioLevel: (value: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: defaultSettings,
  hydrated: false,
  connectionStatus: "idle",
  overlayVisible: true,
  audioLevel: 0,
  updateSettings: (settings) => set({ settings }),
  hydrate: async () => {
    const persisted = await loadPersistedSettings();
    const settings = persisted
      ? {
          ...defaultSettings,
          ...persisted,
          model: persisted.model === "gemini-3.1-flash-live-preview" ? defaultSettings.model : persisted.model,
          overlay: {
            ...defaultSettings.overlay,
            ...persisted.overlay,
            maxLines: Math.min(5, Math.max(2, persisted.overlay?.maxLines ?? defaultSettings.overlay.maxLines)),
          },
        }
      : defaultSettings;
    set({ settings, hydrated: true });
  },
  save: async () => persistSettings(get().settings),
  setConnection: (connectionStatus, connectionError) => set({ connectionStatus, connectionError }),
  setOverlayVisible: (overlayVisible) => set({ overlayVisible }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
}));
