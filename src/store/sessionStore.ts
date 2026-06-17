import { create } from "zustand";
import type { AppSettings, DirectionChange, MeetingSession, MeetingSummary, TranscriptSegment } from "../types";

interface SessionState {
  active: boolean;
  session?: MeetingSession;
  partialText: string;
  start: (settings: AppSettings) => void;
  addText: (text: string, isFinal: boolean, settings: AppSettings, sourceText?: string, sourceLanguage?: AppSettings["sourceLanguage"], targetLanguage?: AppSettings["targetLanguage"]) => void;
  addDirectionChange: (change: DirectionChange) => void;
  setSummary: (summary: MeetingSummary) => void;
  finish: () => MeetingSession | undefined;
  seedDemo: (settings: AppSettings) => void;
}

const demo = [
  ["Xin chào, cảm ơn bạn đã tham gia cuộc họp.", "你好，感谢你参加会议。"],
  ["Hôm nay chúng ta sẽ thảo luận về tiến độ dự án.", "今天我们将讨论项目进展。"],
  ["Trước tiên, hãy xem lại những điểm chính.", "首先，让我们回顾一下要点。"],
];

export const useSessionStore = create<SessionState>((set, get) => ({
  active: false,
  partialText: "",
  start: (settings) => set({ active: true, partialText: "", session: { id: crypto.randomUUID(), startedAt: new Date().toISOString(), settingsSnapshot: safeSettingsSnapshot(settings), segments: [], directionChanges: [] } }),
  addText: (text, isFinal, settings, sourceText, sourceLanguage, targetLanguage) => set((state) => {
    if (!state.session) return { partialText: text };
    if (!isFinal) return { partialText: text };
    const segment: TranscriptSegment = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), sourceLanguage: sourceLanguage ?? settings.sourceLanguage, targetLanguage: targetLanguage ?? settings.targetLanguage, sourceText, translatedText: text, isFinal: true };
    return { partialText: "", session: { ...state.session, segments: [...state.session.segments, segment] } };
  }),
  addDirectionChange: (change) => set((state) => state.session ? { session: { ...state.session, directionChanges: [...(state.session.directionChanges ?? []), change] } } : {}),
  setSummary: (summary) => set((state) => state.session ? { session: { ...state.session, summary } } : {}),
  finish: () => {
    const current = get().session;
    const finished = current ? { ...current, endedAt: new Date().toISOString() } : undefined;
    set({ active: false, partialText: "", session: finished });
    return finished;
  },
  seedDemo: (settings) => {
    const segments: TranscriptSegment[] = demo.map(([sourceText, translatedText], index) => ({
      id: crypto.randomUUID(), timestamp: new Date(Date.now() - (2 - index) * 15000).toISOString(), sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage, sourceText, translatedText, isFinal: true,
    }));
    set({ session: { id: "preview", startedAt: new Date().toISOString(), settingsSnapshot: safeSettingsSnapshot(settings), segments, directionChanges: [] }, partialText: demo[0][1] });
  },
}));

function safeSettingsSnapshot(settings: AppSettings): AppSettings {
  return { ...structuredClone(settings), geminiApiKey: "" };
}
