import { create } from "zustand";
import type { AppSettings, ConnectionStatus } from "../types";
import { loadPersistedSettings, persistSettings } from "../services/settingsStore";

export const defaultSettings: AppSettings = {
  geminiApiKey: "",
  model: "gemini-3.5-live-translate-preview",
  languageDetectorModel: "gemini-flash-lite-latest",
  sourceLanguage: "vi-VN",
  targetLanguage: "zh-CN",
  mode: "fixed-direction",
  overlay: {
    position: "bottom-center", fontSize: 42, textColor: "#ffffff",
    strokeEnabled: true, strokeColor: "#000000", strokeWidth: 3,
    shadowEnabled: true, backgroundEnabled: true, backgroundColor: "#000000",
    backgroundOpacity: 0.35, maxLines: 3, displayDurationMs: 6000,
    animation: "fade", clickThrough: true, bilingualEnabled: true,
  },
  fullscreen: {
    sourceFontSize: 46,
    targetFontSize: 46,
    sourceTextColor: "#e8eef7",
    targetTextColor: "#ffffff",
    historyOrder: "newest-bottom",
    maxHistoryItems: 4,
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
          languageDetectorModel: !persisted.languageDetectorModel
            || persisted.languageDetectorModel === "gemini-2.5-flash-lite"
            ? defaultSettings.languageDetectorModel
            : persisted.languageDetectorModel,
          mode: (persisted.mode as string) === "auto-bidirectional" ? "smart-auto" : persisted.mode,
          overlay: {
            ...defaultSettings.overlay,
            ...persisted.overlay,
            maxLines: Math.min(5, Math.max(2, persisted.overlay?.maxLines ?? defaultSettings.overlay.maxLines)),
          },
          fullscreen: {
            ...defaultSettings.fullscreen,
            ...persisted.fullscreen,
            sourceFontSize: Math.min(88, Math.max(28, persisted.fullscreen?.sourceFontSize ?? defaultSettings.fullscreen.sourceFontSize)),
            targetFontSize: Math.min(112, Math.max(36, persisted.fullscreen?.targetFontSize === 64 ? defaultSettings.fullscreen.targetFontSize : persisted.fullscreen?.targetFontSize ?? defaultSettings.fullscreen.targetFontSize)),
            maxHistoryItems: Math.min(8, Math.max(1, persisted.fullscreen?.maxHistoryItems ?? defaultSettings.fullscreen.maxHistoryItems)),
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
