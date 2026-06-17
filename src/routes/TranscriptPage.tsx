import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Captions, CheckCircle2, Clock3, Download, Sparkles } from "lucide-react";
import type { Route } from "../App";
import { summarizeMeeting } from "../services/geminiTextClient";
import { sanitizedSession, sessionToMarkdown } from "../services/transcriptExport";
import { useAppStore } from "../store/appStore";
import { useSessionStore } from "../store/sessionStore";
import type { LanguageCode, SummaryStyle } from "../types";
import { languageOptions } from "../utils/language";

type ExportFormat = "json" | "markdown";

export function TranscriptPage({ navigate }: { navigate: (route: Route) => void }) {
  const settings = useAppStore((state) => state.settings);
  const session = useSessionStore((state) => state.session);
  const setSummary = useSessionStore((state) => state.setSummary);
  const segments = session?.segments ?? [];
  const [exportFormat, setExportFormat] = useState<ExportFormat>("markdown");
  const [summaryLanguage, setSummaryLanguage] = useState<LanguageCode>(settings.targetLanguage);
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>("standard");
  const [exportedPath, setExportedPath] = useState("");
  const [operationError, setOperationError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const generateSummary = async () => {
    if (!session || !segments.length || summarizing) return;
    if (!settings.geminiApiKey.trim()) {
      setOperationError("Add your Gemini API key in Settings before generating a summary.");
      return;
    }
    setSummarizing(true);
    setOperationError("");
    try {
      const text = await summarizeMeeting(settings, session, summaryLanguage, summaryStyle);
      setSummary({
        text,
        language: summaryLanguage,
        style: summaryStyle,
        generatedAt: new Date().toISOString(),
        model: settings.languageDetectorModel,
      });
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The AI summary could not be generated.");
    } finally {
      setSummarizing(false);
    }
  };

  const exportTranscript = async () => {
    if (!session || exporting) return;
    setExporting(true);
    setExportedPath("");
    setOperationError("");
    try {
      const safeSession = sanitizedSession(session);
      const isJson = exportFormat === "json";
      const extension = isJson ? "json" : "md";
      const filename = `livetranslate-${session.id}.${extension}`;
      const content = isJson ? JSON.stringify(safeSession, null, 2) : sessionToMarkdown(safeSession);
      if ("__TAURI_INTERNALS__" in window) {
        const path = await save({
          defaultPath: filename,
          filters: [{ name: isJson ? "JSON transcript" : "Markdown transcript", extensions: [extension] }],
        });
        if (!path) return;
        const savedPath = await invoke<string>("export_text", { path, content });
        setExportedPath(savedPath);
      } else {
        const mime = isJson ? "application/json" : "text/markdown";
        const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        setExportedPath(`Downloads/${filename}`);
      }
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Transcript could not be exported.");
    } finally {
      setExporting(false);
    }
  };

  return <div className="transcript-page">
    <header className="page-header transcript-header">
      <div><h1>Transcript</h1><p>Review, summarize, and export the current meeting.</p></div>
      <div className="export-actions">
        <select aria-label="Export format" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
        </select>
        <button className="secondary-button" onClick={() => void exportTranscript()} disabled={!session || exporting}><Download size={17} />{exporting ? "Exporting…" : "Export"}</button>
      </div>
    </header>
    {exportedPath ? <div className="export-result success"><CheckCircle2 size={17} /><span><strong>Transcript saved</strong><code title={exportedPath}>{exportedPath}</code></span></div> : null}
    {operationError ? <div className="export-result error"><span>{operationError}</span></div> : null}

    <section className="ai-summary-panel">
      <div className="ai-summary-heading"><div><span className="summary-icon"><Sparkles size={18} /></span><div><h2>AI meeting summary</h2><p>Generated with Gemini 2.5 Flash-Lite from the complete transcript.</p></div></div></div>
      <div className="summary-controls">
        <label><span>Language</span><select value={summaryLanguage} onChange={(event) => setSummaryLanguage(event.target.value as LanguageCode)}>{languageOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <label><span>Style</span><select value={summaryStyle} onChange={(event) => setSummaryStyle(event.target.value as SummaryStyle)}><option value="concise">Concise</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></label>
        <button className="primary-button compact" onClick={() => void generateSummary()} disabled={!segments.length || summarizing}><Sparkles size={16} />{summarizing ? "Summarizing…" : session?.summary ? "Regenerate" : "Summarize"}</button>
      </div>
      {session?.summary ? <div className="summary-output"><div className="summary-meta">{session.summary.style} · {new Date(session.summary.generatedAt).toLocaleString()}</div><div className="summary-markdown">{session.summary.text}</div></div> : <div className="summary-empty">Choose a language and style, then generate a summary.</div>}
    </section>

    <div className="transcript-meta"><span><Captions size={16} />{segments.length} translated lines</span><span><Clock3 size={16} />{session ? new Date(session.startedAt).toLocaleString() : "No session yet"}</span></div>
    <section className="transcript-table">
      {segments.length ? segments.map((segment, index) => <article key={segment.id}>
        <div className="line-number">{String(index + 1).padStart(2, "0")}</div>
        <time>{new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
        <div><p>{segment.sourceText || "Source transcription unavailable"}</p><strong>{segment.translatedText}</strong></div>
      </article>) : <div className="empty-state"><Captions size={32} /><h2>No transcript yet</h2><p>Start a meeting to collect final translations.</p><button className="primary-button compact" onClick={() => navigate("control")}>Go to control</button></div>}
    </section>
  </div>;
}
