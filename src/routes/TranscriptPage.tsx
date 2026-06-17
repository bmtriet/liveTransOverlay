import { Captions, Clock3, Download, Sparkles } from "lucide-react";
import type { Route } from "../App";
import { useSessionStore } from "../store/sessionStore";

export function TranscriptPage({ navigate }: { navigate: (route: Route) => void }) {
  const session = useSessionStore((state) => state.session);
  const segments = session?.segments ?? [];
  const exportJson = () => {
    if (!session) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `livetranslate-${session.id}.json`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="transcript-page"><header className="page-header"><div><h1>Transcript</h1><p>Every final translation from your current session.</p></div><button className="secondary-button" onClick={exportJson} disabled={!session}><Download size={17} />Export JSON</button></header><div className="transcript-meta"><span><Captions size={16} />{segments.length} translated lines</span><span><Clock3 size={16} />{session ? new Date(session.startedAt).toLocaleString() : "No session yet"}</span></div><section className="transcript-table">{segments.length ? segments.map((segment, index) => <article key={segment.id}><div className="line-number">{String(index + 1).padStart(2, "0")}</div><time>{new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><div><p>{segment.sourceText || "Source transcription unavailable"}</p><strong>{segment.translatedText}</strong></div></article>) : <div className="empty-state"><Captions size={32} /><h2>No transcript yet</h2><p>Start a meeting to collect final translations.</p><button className="primary-button compact" onClick={() => navigate("control")}>Go to control</button></div>}</section><button className="summary-button transcript-summary" disabled><Sparkles size={16} />Summary coming soon</button></div>;
}
