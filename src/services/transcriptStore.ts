import { invoke } from "@tauri-apps/api/core";
import type { MeetingSession } from "../types";

export async function saveTranscript(session: MeetingSession): Promise<string> {
  if ("__TAURI_INTERNALS__" in window) return invoke<string>("save_session", { session });
  localStorage.setItem(`livetranslate.session.${session.id}`, JSON.stringify(session));
  return `browser-local:${session.id}`;
}
