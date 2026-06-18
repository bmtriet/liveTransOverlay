import type { AppSettings, LanguageCode, MeetingSession, SummaryStyle } from "../types";
import { LANGUAGES } from "../utils/language";
import { bytesToBase64 } from "./pcmEncoder";

interface GenerateResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  error?: { message?: string };
}

export interface LanguageDecision {
  language: LanguageCode | "mixed" | "unknown";
  confidence: number;
  languageRatio: number;
  mixed: boolean;
}

async function generate(
  apiKey: string,
  model: string,
  prompt: string,
  generationConfig: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
  });
  const body = await response.json() as GenerateResponse;
  if (!response.ok || body.error) throw new Error(body.error?.message || `Gemini request failed (${response.status}).`);
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function detectTranscriptLanguage(
  settings: AppSettings,
  transcript: string,
  apiLanguageCode?: string,
): Promise<LanguageDecision> {
  const allowed = [settings.sourceLanguage, settings.targetLanguage] as const;
  const chinesePairGuidance = allowed.some((language) => language === "zh-CN" || language === "zh-TW")
    ? `Special handling for a Chinese language pair:
- Count Han-script clauses as strong Chinese evidence, but do not classify a Latin-script name or isolated borrowed word as Chinese.
- For Chinese versus Vietnamese, distinguish unmarked Latin text carefully; Vietnamese tone marks and Vietnamese function words are stronger evidence than generic Latin letters.
- For Chinese versus English, require natural English words and grammar rather than pinyin, names, or acronyms.
- Do not infer a direction change from translated text, punctuation, or a very short fragment.`
    : "";
  const prompt = `Classify the dominant language in this live speech transcript.
Allowed languages: ${settings.sourceLanguage} (${LANGUAGES[settings.sourceLanguage]}) or ${settings.targetLanguage} (${LANGUAGES[settings.targetLanguage]}).
The transcript can contain borrowed words, names, or brief code-switching. Return "mixed" unless one allowed language clearly accounts for at least 70% of the meaningful speech. Return "unknown" for insufficient or ambiguous text.
The Live API language hint is ${apiLanguageCode || "unavailable"}; treat it only as supporting evidence.
${chinesePairGuidance}

Transcript:
${transcript}`;
  const raw = await generate(settings.geminiApiKey, settings.languageDetectorModel, prompt, {
    temperature: 0,
    maxOutputTokens: 100,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        language: { type: "STRING", enum: [...allowed, "mixed", "unknown"] },
        confidence: { type: "NUMBER" },
        languageRatio: { type: "NUMBER" },
        mixed: { type: "BOOLEAN" },
      },
      required: ["language", "confidence", "languageRatio", "mixed"],
    },
  });
  const result = JSON.parse(stripCodeFence(raw)) as LanguageDecision;
  return {
    language: allowed.includes(result.language as LanguageCode) ? result.language : result.language === "mixed" ? "mixed" : "unknown",
    confidence: clamp(result.confidence),
    languageRatio: clamp(result.languageRatio),
    mixed: Boolean(result.mixed),
  };
}

export async function detectAudioLanguage(
  settings: AppSettings,
  pcmAudio: Uint8Array,
): Promise<LanguageDecision> {
  const allowed = [settings.sourceLanguage, settings.targetLanguage] as const;
  const wavAudio = pcm16ToWav(pcmAudio, 16_000);
  const prompt = `Listen to this recent microphone audio and classify the dominant spoken language.
Allowed languages: ${settings.sourceLanguage} (${LANGUAGES[settings.sourceLanguage]}) or ${settings.targetLanguage} (${LANGUAGES[settings.targetLanguage]}).
Classify the actual speech sounds, not their meaning. Return "mixed" for real code-switching and "unknown" for silence, noise, music, or insufficient speech.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.languageDetectorModel)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": settings.geminiApiKey },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: prompt },
        { inlineData: { mimeType: "audio/wav", data: bytesToBase64(wavAudio) } },
      ] }],
      generationConfig: languageDecisionConfig(allowed),
    }),
  });
  const body = await response.json() as GenerateResponse;
  if (!response.ok || body.error) throw new Error(body.error?.message || `Gemini audio detection failed (${response.status}).`);
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty audio-language response.");
  return normalizeLanguageDecision(JSON.parse(stripCodeFence(text)) as LanguageDecision, allowed);
}

export async function summarizeMeeting(
  settings: AppSettings,
  session: MeetingSession,
  language: LanguageCode,
  style: SummaryStyle,
): Promise<string> {
  const styleInstruction: Record<SummaryStyle, string> = {
    concise: "Be concise: provide a short overview and only the most important decisions and actions.",
    standard: "Use balanced detail: overview, key discussion points, decisions, and action items.",
    detailed: "Be detailed: capture major arguments, context, decisions, open questions, risks, and action items without inventing facts.",
  };
  const transcript = session.segments.map((segment) => {
    const time = new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `[${time}] ${segment.sourceText || "(source unavailable)"}\nTranslation: ${segment.translatedText}`;
  }).join("\n\n");
  const prompt = `Create a meeting summary in ${LANGUAGES[language]}.
${styleInstruction[style]}
Return clean Markdown. Use headings and bullet points where useful. Do not wrap the response in a Markdown code fence. Do not add information that is absent from the transcript.

Meeting transcript:
${transcript}`;
  return generate(settings.geminiApiKey, settings.languageDetectorModel, prompt, {
    temperature: 0.2,
    maxOutputTokens: style === "detailed" ? 4096 : style === "standard" ? 2048 : 1024,
    thinkingConfig: { thinkingBudget: 0 },
  });
}

function clamp(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function languageDecisionConfig(allowed: readonly [LanguageCode, LanguageCode]) {
  return {
    temperature: 0,
    maxOutputTokens: 100,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        language: { type: "STRING", enum: [...allowed, "mixed", "unknown"] },
        confidence: { type: "NUMBER" },
        languageRatio: { type: "NUMBER" },
        mixed: { type: "BOOLEAN" },
      },
      required: ["language", "confidence", "languageRatio", "mixed"],
    },
  };
}

function normalizeLanguageDecision(result: LanguageDecision, allowed: readonly [LanguageCode, LanguageCode]): LanguageDecision {
  return {
    language: allowed.includes(result.language as LanguageCode) ? result.language : result.language === "mixed" ? "mixed" : "unknown",
    confidence: clamp(result.confidence),
    languageRatio: clamp(result.languageRatio),
    mixed: Boolean(result.mixed),
  };
}

function pcm16ToWav(pcm: Uint8Array, sampleRate: number) {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

function stripCodeFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
