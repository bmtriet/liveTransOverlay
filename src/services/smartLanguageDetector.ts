import type { AppSettings } from "../types";
import { detectAudioLanguage, detectTranscriptLanguage, type LanguageDecision } from "./geminiTextClient";
import { recordSmartAutoDebug } from "./diagnostics";

export class SmartLanguageDetector {
  private timer?: number;
  private inFlight = false;
  private pending?: Observation;
  private candidateConfirmations = 0;
  private candidateLanguage = "";
  private candidateFingerprint = "";
  private candidateEvidence = 0;
  private candidateSignals = new Set<string>();
  private cooldownUntil = 0;
  private generation = 0;
  private audioInFlight = false;
  private lastAudioDetectionAt = 0;
  private audioCandidateLanguage = "";
  private audioCandidateConfirmations = 0;

  observe(observation: Observation, onSwitch: (decision: LanguageDecision) => void) {
    if (observation.settings.mode !== "smart-auto" || Date.now() < this.cooldownUntil) return;
    const windowedObservation = { ...observation, text: transcriptTail(observation.text) };
    const policy = detectionPolicy(windowedObservation.settings);
    debugDetector("observe", {
      pair: `${windowedObservation.settings.sourceLanguage}->${windowedObservation.settings.targetLanguage}`,
      evidence: evidenceCount(windowedObservation.text),
      apiLanguageCode: windowedObservation.apiLanguageCode,
      text: windowedObservation.text,
    });
    if (evidenceCount(windowedObservation.text) < policy.minEvidence) return;
    const hint = detectLanguageHint(windowedObservation.apiLanguageCode, windowedObservation.settings);
    if (hint && this.acceptCandidate(hint, windowedObservation, policy, "api-hint", onSwitch)) return;
    const heuristic = detectLocalLanguage(windowedObservation.text, windowedObservation.settings);
    if (heuristic?.language === windowedObservation.settings.targetLanguage
      && this.acceptCandidate(heuristic, windowedObservation, policy, "local", onSwitch)) {
        return;
    }
    this.pending = windowedObservation;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.evaluate(onSwitch), policy.settleDelayMs);
  }

  markSwitched(settings: AppSettings) {
    this.reset();
    this.cooldownUntil = Date.now() + detectionPolicy(settings).cooldownMs;
  }

  observeAudio(pcmAudio: Uint8Array, settings: AppSettings, onSwitch: (decision: LanguageDecision) => void) {
    if (settings.mode !== "smart-auto" || Date.now() < this.cooldownUntil) return;
    if (pcmAudio.length < 64_000 || this.audioInFlight || Date.now() - this.lastAudioDetectionAt < 2_500) return;
    this.lastAudioDetectionAt = Date.now();
    this.audioInFlight = true;
    const generation = this.generation;
    const audioWindow = pcmAudio.slice(Math.max(0, pcmAudio.length - 128_000));
    debugDetector("audio-observe", {
      pair: `${settings.sourceLanguage}->${settings.targetLanguage}`,
      durationMs: Math.round(audioWindow.length / 32),
    });
    void detectAudioLanguage(settings, audioWindow).then((decision) => {
      if (generation !== this.generation) {
        debugDetector("stale-audio-decision-ignored", decision);
        return;
      }
      debugDetector("audio-decision", decision);
      const isTarget = decision.language === settings.targetLanguage
        && !decision.mixed
        && decision.confidence >= 0.9
        && decision.languageRatio >= 0.72;
      if (!isTarget) {
        this.audioCandidateLanguage = "";
        this.audioCandidateConfirmations = 0;
        return;
      }
      if (this.audioCandidateLanguage === decision.language) this.audioCandidateConfirmations += 1;
      else {
        this.audioCandidateLanguage = decision.language;
        this.audioCandidateConfirmations = 1;
      }
      if (decision.confidence >= 0.97 || this.audioCandidateConfirmations >= 2) {
        debugDetector("audio-switch", { decision, confirmations: this.audioCandidateConfirmations });
        onSwitch(decision);
      }
    }).catch((error) => {
      debugDetector("audio-error", error instanceof Error ? error.message : String(error));
    }).finally(() => {
      this.audioInFlight = false;
    });
  }

  reset() {
    this.generation += 1;
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
    this.resetCandidate();
    this.audioCandidateLanguage = "";
    this.audioCandidateConfirmations = 0;
  }

  private async evaluate(onSwitch: (decision: LanguageDecision) => void) {
    this.timer = undefined;
    if (this.inFlight || !this.pending) return;
    const observation = this.pending;
    const generation = this.generation;
    this.pending = undefined;
    this.inFlight = true;
    try {
      const decision = await detectTranscriptLanguage(observation.settings, observation.text, observation.apiLanguageCode);
      if (generation !== this.generation) {
        debugDetector("stale-decision-ignored", decision);
        return;
      }
      debugDetector("gemini-decision", decision);
      this.acceptCandidate(decision, observation, detectionPolicy(observation.settings), "gemini", onSwitch);
    } catch (error) {
      debugDetector("gemini-error", error instanceof Error ? error.message : String(error));
      // Detection is advisory; translation must continue when the classifier is unavailable.
    } finally {
      this.inFlight = false;
      this.schedulePending(onSwitch);
    }
  }

  private schedulePending(onSwitch: (decision: LanguageDecision) => void) {
    if (!this.pending || this.timer) return;
    const delay = detectionPolicy(this.pending.settings).settleDelayMs;
    this.timer = window.setTimeout(() => void this.evaluate(onSwitch), delay);
  }

  private acceptCandidate(
    decision: LanguageDecision,
    observation: Observation,
    policy: DetectionPolicy,
    signalSource: "api-hint" | "local" | "gemini",
    onSwitch: (decision: LanguageDecision) => void,
  ) {
    const isCandidate = decision.language === observation.settings.targetLanguage
      && !decision.mixed
      && decision.confidence >= policy.minConfidence
      && decision.languageRatio >= policy.minLanguageRatio;
    if (!isCandidate) {
      debugDetector("candidate-rejected", { signalSource, decision, policy });
      this.resetCandidate();
      return false;
    }

    const fingerprint = transcriptFingerprint(observation.text);
    const evidence = evidenceCount(observation.text);
    const signalKey = `${signalSource}:${fingerprint}`;
    if (this.candidateLanguage !== decision.language) {
      this.candidateLanguage = decision.language;
      this.candidateFingerprint = fingerprint;
      this.candidateEvidence = evidence;
      this.candidateSignals = new Set([signalKey]);
      this.candidateConfirmations = 1;
    } else if (!this.candidateSignals.has(signalKey)
      && (fingerprint === this.candidateFingerprint
        || evidence >= this.candidateEvidence + policy.minEvidenceGrowth
        || !fingerprint.startsWith(this.candidateFingerprint))) {
      this.candidateFingerprint = fingerprint;
      this.candidateEvidence = evidence;
      this.candidateSignals.add(signalKey);
      this.candidateConfirmations += 1;
    }

    const strongSingleResult = signalSource === "gemini"
      && decision.confidence >= policy.strongConfidence
      && decision.languageRatio >= policy.strongLanguageRatio
      && evidence >= policy.strongMinEvidence;
    if (strongSingleResult || this.candidateConfirmations >= policy.confirmations) {
      debugDetector("switch", { signalSource, decision, confirmations: this.candidateConfirmations });
      onSwitch(decision);
      return true;
    }
    debugDetector("candidate-pending", { signalSource, decision, confirmations: this.candidateConfirmations });
    return false;
  }

  private resetCandidate() {
    this.candidateConfirmations = 0;
    this.candidateLanguage = "";
    this.candidateFingerprint = "";
    this.candidateEvidence = 0;
    this.candidateSignals.clear();
  }
}

interface Observation {
  text: string;
  apiLanguageCode?: string;
  settings: AppSettings;
}

interface DetectionPolicy {
  minEvidence: number;
  minConfidence: number;
  minLanguageRatio: number;
  minEvidenceGrowth: number;
  confirmations: number;
  settleDelayMs: number;
  cooldownMs: number;
  strongConfidence: number;
  strongLanguageRatio: number;
  strongMinEvidence: number;
}

function detectionPolicy(settings: AppSettings): DetectionPolicy {
  const sourceIsChinese = isChinese(settings.sourceLanguage);
  const targetIsChinese = isChinese(settings.targetLanguage);
  if (sourceIsChinese || targetIsChinese) {
    // Han characters are strong evidence for Chinese, while Latin transcripts
    // need more context to distinguish Vietnamese from English. Both directions
    // deliberately require fresh transcript updates to avoid ping-pong switches.
    return targetIsChinese
      ? {
          minEvidence: 5,
          minConfidence: 0.9,
          minLanguageRatio: 0.72,
          minEvidenceGrowth: 2,
          confirmations: 2,
          settleDelayMs: 650,
          cooldownMs: 12_000,
          strongConfidence: 0.96,
          strongLanguageRatio: 0.82,
          strongMinEvidence: 8,
        }
      : {
          minEvidence: 6,
          minConfidence: 0.92,
          minLanguageRatio: 0.75,
          minEvidenceGrowth: 2,
          confirmations: 2,
          settleDelayMs: 750,
          cooldownMs: 12_000,
          strongConfidence: 0.97,
          strongLanguageRatio: 0.85,
          strongMinEvidence: 10,
        };
  }
  return {
    minEvidence: 5,
    minConfidence: 0.88,
    minLanguageRatio: 0.68,
    minEvidenceGrowth: 1,
    confirmations: 2,
    settleDelayMs: 600,
    cooldownMs: 6_000,
    strongConfidence: 0.95,
    strongLanguageRatio: 0.8,
    strongMinEvidence: 8,
  };
}

function isChinese(language: AppSettings["sourceLanguage"]) {
  return language === "zh-CN" || language === "zh-TW";
}

function detectLanguageHint(apiLanguageCode: string | undefined, settings: AppSettings): LanguageDecision | undefined {
  if (!apiLanguageCode) return undefined;
  const hint = apiLanguageCode.toLocaleLowerCase();
  const target = settings.targetLanguage;
  const matchesTarget = target === "zh-CN" || target === "zh-TW"
    ? hint.startsWith("zh") || hint.startsWith("cmn")
    : target === "vi-VN"
      ? hint.startsWith("vi")
      : target === "en-US"
        ? hint.startsWith("en")
        : target === "ja-JP"
          ? hint.startsWith("ja")
          : hint.startsWith("ko");
  if (!matchesTarget) return undefined;
  return { language: target, confidence: 0.96, languageRatio: 0.9, mixed: false };
}

function evidenceCount(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const compactCharacters = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  return Math.max(words, Math.ceil(compactCharacters / 2));
}

function transcriptTail(text: string) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 16) return tokens.slice(-16).join(" ");
  return text.length > 160 ? text.slice(-160) : text;
}

function debugDetector(event: string, details: unknown) {
  if (import.meta.env.DEV) {
    console.info(`[SmartAuto] ${event}`, details);
    void recordSmartAutoDebug(event, details);
  }
}

function transcriptFingerprint(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
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
  const normalized = text.toLocaleLowerCase().normalize("NFD");
  const marked = (normalized.match(/[a-z][\u0300-\u036f]/g) ?? []).length
    + (text.match(/[\u0111\u0110]/g) ?? []).length;
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
  "anh", "b\u1ea1n", "c\u00e1i", "c\u00e1c", "c\u1ea3m", "cho", "ch\u00fang", "c\u00f3", "c\u1ee7a", "\u0111\u00e3", "\u0111ang", "\u0111\u00e2y", "\u0111\u00f3", "\u0111\u01b0\u1ee3c", "em", "kh\u00f4ng", "l\u00e0", "l\u1ea1i", "m\u00ecnh", "m\u1ed9t", "n\u00e0y", "n\u00ean", "n\u00f3i", "t\u00f4i", "trong", "v\u00e0", "v\u1edbi",
]);
