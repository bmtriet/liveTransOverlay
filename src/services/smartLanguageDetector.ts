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
