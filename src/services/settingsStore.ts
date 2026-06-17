import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../types";

const KEY = "livetranslate.settings.v1";
const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function persistSettings(settings: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
  if (isTauri()) await invoke("save_settings", { settings });
}

export async function loadPersistedSettings(): Promise<AppSettings | null> {
  if (isTauri()) {
    try { return await invoke<AppSettings | null>("load_settings"); } catch { /* browser fallback */ }
  }
  const value = localStorage.getItem(KEY);
  return value ? JSON.parse(value) as AppSettings : null;
}
