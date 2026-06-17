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
