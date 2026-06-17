import type { LanguageCode } from "../types";

export const LANGUAGES: Record<LanguageCode, string> = {
  "vi-VN": "Vietnamese",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  "en-US": "English",
  "ja-JP": "Japanese",
  "ko-KR": "Korean",
};

export const LIVE_TRANSLATE_LANGUAGE_CODES: Record<LanguageCode, string> = {
  "vi-VN": "vi",
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
  "en-US": "en",
  "ja-JP": "ja",
  "ko-KR": "ko",
};

export const languageOptions = Object.entries(LANGUAGES) as [LanguageCode, string][];

export const COMPACT_LANGUAGES: Record<LanguageCode, string> = {
  "vi-VN": "🇻🇳 VI",
  "zh-CN": "🇨🇳 ZH",
  "zh-TW": "🇹🇼 ZH",
  "en-US": "🇺🇸 EN",
  "ja-JP": "🇯🇵 JA",
  "ko-KR": "🇰🇷 KO",
};
