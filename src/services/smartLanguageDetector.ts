import type { AppSettings } from "../types";
import { detectTranscriptLanguage, type LanguageDecision } from "./geminiTextClient";

export class SmartLanguageDetector {
  private timer?: number;
  private inFlight = false;
  private pending?: Observation;
  private candidateConfirmations = 0;
  private candidateLanguage = "";
  private cooldownUntil = 0;

  observe(observation: Observation, onSwitch: (decision: LanguageDecision) => void) {
    if (observation.settings.mode !== "smart-auto" || Date.now() < this.cooldownUntil) return;
    const windowedObservation = { ...observation, text: transcriptTail(observation.text) };
    if (evidenceCount(windowedObservation.text) < 5) return;
    const heuristic = detectLocalLanguage(windowedObservation.text, windowedObservation.settings);
    if (heuristic?.language === windowedObservation.settings.targetLanguage) {
      onSwitch(heuristic);
      return;
    }
    this.pending = windowedObservation;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.evaluate(onSwitch), 700);
  }

  markSwitched() {
    this.reset();
    this.cooldownUntil = Date.now() + 8_000;
  }

  reset() {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
    this.candidateConfirmations = 0;
    this.candidateLanguage = "";
  }

  private async evaluate(onSwitch: (decision: LanguageDecision) => void) {
    this.timer = undefined;
    if (this.inFlight || !this.pending) return;
    const observation = this.pending;
    this.pending = undefined;
    this.inFlight = true;
    try {
      const decision = await detectTranscriptLanguage(observation.settings, observation.text, observation.apiLanguageCode);
      const isCandidate = decision.language === observation.settings.targetLanguage
        && !decision.mixed
        && decision.confidence >= 0.9
        && decision.languageRatio >= 0.7;
      if (!isCandidate) {
        this.candidateConfirmations = 0;
        this.candidateLanguage = "";
        return;
      }
      if (this.candidateLanguage === decision.language) this.candidateConfirmations += 1;
      else {
        this.candidateLanguage = decision.language;
        this.candidateConfirmations = 1;
      }
      const strongSingleResult = decision.confidence >= 0.97
        && decision.languageRatio >= 0.85
        && evidenceCount(observation.text) >= 10;
      if (strongSingleResult || this.candidateConfirmations >= 2) {
        onSwitch(decision);
        return;
      }
      this.pending = observation;
      this.timer = window.setTimeout(() => void this.evaluate(onSwitch), 650);
    } catch {
      // Detection is advisory; translation must continue when the classifier is unavailable.
    } finally {
      this.inFlight = false;
      if (this.pending && !this.timer) this.timer = window.setTimeout(() => void this.evaluate(onSwitch), 700);
    }
  }
}

interface Observation {
  text: string;
  apiLanguageCode?: string;
  settings: AppSettings;
}

function evidenceCount(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const compactCharacters = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  return Math.max(words, Math.ceil(compactCharacters / 2));
}

function transcriptTail(text: string) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 40) return tokens.slice(-40).join(" ");
  return text.length > 320 ? text.slice(-320) : text;
}

function detectLocalLanguage(text: string, settings: AppSettings): LanguageDecision | undefined {
  const scores: Partial<Record<AppSettings["sourceLanguage"], number>> = {
    "en-US": englishScore(text),
    "vi-VN": vietnameseScore(text),
    "zh-CN": scriptScore(text, /[\p{Script=Han}]/gu),
    "zh-TW": scriptScore(text, /[\p{Script=Han}]/gu),
    "ja-JP": scriptScore(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu),
    "ko-KR": scriptScore(text, /[\p{Script=Hangul}]/gu),
  };
  const sourceScore = scores[settings.sourceLanguage] ?? 0;
  const targetScore = scores[settings.targetLanguage] ?? 0;
  if (targetScore < 0.62 || targetScore < sourceScore + 0.28) return undefined;
  return {
    language: settings.targetLanguage,
    confidence: Math.min(0.98, targetScore),
    languageRatio: targetScore,
    mixed: false,
  };
}

function englishScore(text: string) {
  const words = text.toLocaleLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  if (words.length < 5) return 0;
  const common = words.filter((word) => ENGLISH_MARKERS.has(word)).length;
  return Math.min(1, (common * 1.8 + words.length * 0.12) / Math.max(8, words.length));
}

function vietnameseScore(text: string) {
  const words = text.toLocaleLowerCase().match(/[\p{Letter}\p{Mark}]+/gu) ?? [];
  if (words.length < 4) return 0;
  const marked = (text.match(/[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/giu) ?? []).length;
  const common = words.filter((word) => VIETNAMESE_MARKERS.has(word)).length;
  return Math.min(1, (marked * 0.18 + common * 1.5) / Math.max(6, words.length * 0.45));
}

function scriptScore(text: string, pattern: RegExp) {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 4) return 0;
  const matches = text.match(pattern)?.length ?? 0;
  return Math.min(1, matches / Math.max(4, compact.length * 0.55));
}

const ENGLISH_MARKERS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "for", "from", "have", "i", "in", "is", "it", "of", "on", "or", "so", "that", "the", "there", "this", "to", "we", "with", "you",
]);

const VIETNAMESE_MARKERS = new Set([
  "anh", "bạn", "cái", "các", "cảm", "cho", "chúng", "có", "của", "đã", "đang", "đây", "đó", "được", "em", "không", "là", "lại", "mình", "một", "này", "nên", "nói", "tôi", "trong", "và", "với",
]);
