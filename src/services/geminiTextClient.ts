import type { AppSettings, LanguageCode, MeetingSession, SummaryStyle } from "../types";
import { LANGUAGES } from "../utils/language";

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
  const prompt = `Classify the dominant language in this live speech transcript.
Allowed languages: ${settings.sourceLanguage} (${LANGUAGES[settings.sourceLanguage]}) or ${settings.targetLanguage} (${LANGUAGES[settings.targetLanguage]}).
The transcript can contain borrowed words, names, or brief code-switching. Return "mixed" unless one allowed language clearly accounts for at least 70% of the meaningful speech. Return "unknown" for insufficient or ambiguous text.
The Live API language hint is ${apiLanguageCode || "unavailable"}; treat it only as supporting evidence.

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

function stripCodeFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
