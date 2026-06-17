export type LanguageCode = "vi-VN" | "zh-CN" | "zh-TW" | "en-US" | "ja-JP" | "ko-KR";
export type TranslationMode = "auto-bidirectional" | "fixed-direction";
export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export interface OverlaySettings {
  position: "bottom-center" | "top-center" | "custom";
  customX?: number;
  customY?: number;
  fontSize: number;
  textColor: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  maxLines: number;
  displayDurationMs: number;
  animation: "none" | "fade" | "slide-up" | "typewriter";
  clickThrough: boolean;
  bilingualEnabled: boolean;
}

export interface AppSettings {
  geminiApiKey: string;
  model: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  mode: TranslationMode;
  microphoneDeviceId?: string;
  overlay: OverlaySettings;
}

export interface TranscriptSegment {
  id: string;
  timestamp: string;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
  sourceText?: string;
  translatedText: string;
  isFinal: boolean;
}

export interface MeetingSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  settingsSnapshot: AppSettings;
  segments: TranscriptSegment[];
}
