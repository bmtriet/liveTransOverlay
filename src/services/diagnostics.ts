import { invoke } from "@tauri-apps/api/core";

export interface DiagnosticEntry {
  at: string;
  scope: string;
  message: string;
  details?: unknown;
}

export async function recordDiagnostic(entry: DiagnosticEntry): Promise<void> {
  localStorage.setItem("livetranslate.latest-diagnostic", JSON.stringify(entry));
  if ("__TAURI_INTERNALS__" in window) {
    try { await invoke("save_diagnostic", { entry }); } catch { /* localStorage fallback */ }
  }
}

export async function recordSmartAutoDebug(event: string, details: unknown): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  try {
    await invoke("append_debug_log", { entry: { at: new Date().toISOString(), event, details } });
  } catch {
    // Debug logging must never interrupt translation.
  }
}
