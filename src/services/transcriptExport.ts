import type { MeetingSession } from "../types";
import { LANGUAGES } from "../utils/language";

export function sanitizedSession(session: MeetingSession): MeetingSession {
  return {
    ...session,
    settingsSnapshot: { ...session.settingsSnapshot, geminiApiKey: "" },
  };
}

export function sessionToMarkdown(session: MeetingSession): string {
  const lines = [
    "# LiveTranslate Meeting Transcript",
    "",
    `- Started: ${new Date(session.startedAt).toLocaleString()}`,
    `- Ended: ${session.endedAt ? new Date(session.endedAt).toLocaleString() : "In progress"}`,
    `- Lines: ${session.segments.length}`,
    "",
  ];
  if (session.summary) {
    lines.push(
      `## AI Summary · ${LANGUAGES[session.summary.language]} · ${session.summary.style}`,
      "",
      session.summary.text,
      "",
    );
  }
  lines.push("## Transcript", "");
  for (const segment of session.segments) {
    const time = new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    lines.push(
      `### ${time} · ${segment.sourceLanguage ?? "?"} → ${segment.targetLanguage ?? "?"}`,
      "",
      segment.sourceText ? `**Original:** ${segment.sourceText}` : "**Original:** _Unavailable_",
      "",
      `**Translation:** ${segment.translatedText}`,
      "",
    );
  }
  return lines.join("\n");
}
