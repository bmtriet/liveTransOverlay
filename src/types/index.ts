export type LanguageCode = "vi-VN" | "zh-CN" | "zh-TW" | "en-US" | "ja-JP" | "ko-KR";
export type TranslationMode = "smart-auto" | "fixed-direction";
export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";
export type SummaryStyle = "concise" | "standard" | "detailed";

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
  languageDetectorModel: string;
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
  directionChanges?: DirectionChange[];
  summary?: MeetingSummary;
}

export interface DirectionChange {
  timestamp: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  reason: "manual" | "smart-language-detection";
  confidence?: number;
}

export interface MeetingSummary {
  text: string;
  language: LanguageCode;
  style: SummaryStyle;
  generatedAt: string;
  model: string;
}

export interface OverlayUpdatePayload {
  sourceText?: string;
  translatedText: string;
  final: boolean;
  settings: OverlaySettings;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  mode: TranslationMode;
  switching?: boolean;
}

export interface TranslationSwitchRequest {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}
