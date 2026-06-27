import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { FullscreenMeetingSettings, LanguageCode, OverlaySettings } from "../types";
import { LANGUAGES } from "../utils/language";

interface OverlayTextProps {
  sourceText?: string;
  translatedText: string;
  settings: OverlaySettings;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  presentationLeftLanguage?: LanguageCode;
  presentationRightLanguage?: LanguageCode;
  final: boolean;
  fullscreenSettings?: FullscreenMeetingSettings;
  presentationMode?: boolean;
  controls?: ReactNode;
}

const fallbackFullscreenSettings: FullscreenMeetingSettings = {
  sourceFontSize: 46,
  targetFontSize: 64,
  sourceTextColor: "#e8eef7",
  targetTextColor: "#ffffff",
  historyOrder: "newest-bottom",
  maxHistoryItems: 4,
};

interface PresentationEntry {
  key: string;
  textByLanguage: Partial<Record<LanguageCode, string>>;
}

export function OverlayText({ sourceText, translatedText, settings, sourceLanguage, targetLanguage, presentationLeftLanguage, presentationRightLanguage, final, fullscreenSettings, presentationMode = false, controls }: OverlayTextProps) {
  const [winSize, setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [scaledFontSize, setScaledFontSize] = useState(settings.fontSize);
  const [presentationHistory, setPresentationHistory] = useState<PresentationEntry[]>([]);
  const probeRef = useRef<HTMLDivElement>(null);
  const presentation = fullscreenSettings ?? fallbackFullscreenSettings;

  useEffect(() => {
    const handleResize = () => {
      setWinSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!presentationMode) setPresentationHistory([]);
  }, [presentationMode, presentationLeftLanguage, presentationRightLanguage]);

  useEffect(() => {
    if (!presentationMode || !final || !translatedText.trim()) return;
    const entry: PresentationEntry = {
      key: `${sourceLanguage}->${targetLanguage}\n${sourceText ?? ""}\n${translatedText}`.trim(),
      textByLanguage: {
        [sourceLanguage]: sourceText?.trim() || "Source transcription unavailable",
        [targetLanguage]: translatedText.trim(),
      },
    };
    setPresentationHistory((current) => {
      if (current.at(-1)?.key === entry.key) return current;
      return [...current, entry].slice(-presentation.maxHistoryItems);
    });
  }, [final, presentation.maxHistoryItems, presentationMode, sourceText, translatedText]);

  const totalLines = Math.min(5, Math.max(2, settings.maxLines));
  const showSource = Boolean(settings.bilingualEnabled && sourceText && !sameCaption(sourceText, translatedText));
  const translationLines = showSource ? totalLines - 1 : totalLines;

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;

    if (presentationMode) return;

    const maxW = Math.min(1200, winSize.w * 0.92) - 44;
    const maxH = Math.max(80, winSize.h - 140);

    let minF = 14;
    let maxF = settings.fontSize;
    let optimalF = minF;

    while (minF <= maxF) {
      const midF = Math.floor((minF + maxF) / 2);
      probe.style.width = `${maxW}px`;
      probe.style.fontSize = `${midF}px`;
      
      const sourceF = Math.max(12, Math.round(midF * 0.48));
      
      let html = "";
      if (showSource && sourceText) {
        html += `<div style="font-size: ${sourceF}px; font-weight: 600; line-height: 1.32; margin-bottom: 5px; overflow-wrap: anywhere;">${sourceText}</div>`;
      }
      html += `<div style="font-size: ${midF}px; font-weight: 780; line-height: 1.22; overflow-wrap: anywhere;">${translatedText}</div>`;
      probe.innerHTML = html;

      if (probe.scrollHeight <= maxH) {
        optimalF = midF;
        minF = midF + 1;
      } else {
        maxF = midF - 1;
      }
    }

    setScaledFontSize(optimalF);
  }, [sourceText, translatedText, settings, showSource, winSize, presentationMode]);

  const containerStyle: CSSProperties = {
    backgroundColor: presentationMode ? "transparent" : settings.backgroundEnabled ? colorWithOpacity(settings.backgroundColor, settings.backgroundOpacity) : "transparent",
  };
  const translatedStyle: CSSProperties = {
    color: presentationMode ? presentation.targetTextColor : settings.textColor,
    fontSize: `${scaledFontSize}px`,
    WebkitTextStroke: !presentationMode && settings.strokeEnabled ? `${Math.min(1, settings.strokeWidth)}px ${settings.strokeColor}` : undefined,
    textShadow: presentationMode ? "0 4px 28px rgba(0,0,0,.65)" : settings.shadowEnabled ? "0 2px 8px rgba(0,0,0,.72)" : undefined,
  };
  const sourceStyle: CSSProperties = {
    color: presentationMode ? presentation.sourceTextColor : settings.textColor,
    fontSize: `${Math.max(12, Math.round(scaledFontSize * 0.48))}px`,
    textShadow: presentationMode ? "0 4px 24px rgba(0,0,0,.58)" : settings.shadowEnabled ? "0 1px 5px rgba(0,0,0,.65)" : undefined,
  };

  if (presentationMode) {
    const leftLanguage = presentationLeftLanguage ?? sourceLanguage;
    const rightLanguage = presentationRightLanguage ?? targetLanguage;
    const liveEntry: PresentationEntry | null = translatedText.trim()
      ? {
          key: `${sourceLanguage}->${targetLanguage}\n${sourceText ?? ""}\n${translatedText}`.trim(),
          textByLanguage: {
            [sourceLanguage]: sourceText?.trim() || "Listening…",
            [targetLanguage]: translatedText.trim(),
          },
        }
      : null;
    const baseEntries = final || !liveEntry
      ? presentationHistory
      : [...presentationHistory.filter((entry) => entry.key !== liveEntry.key), liveEntry].slice(-presentation.maxHistoryItems);
    const entries = presentation.historyOrder === "newest-top" ? [...baseEntries].reverse() : baseEntries;
    const newestKey = presentation.historyOrder === "newest-top" ? entries[0]?.key : entries.at(-1)?.key;
    const sourcePresentationStyle: CSSProperties = {
      color: presentation.sourceTextColor,
      fontSize: `${presentation.sourceFontSize}px`,
      textShadow: "0 4px 24px rgba(0,0,0,.58)",
    };
    const targetPresentationStyle: CSSProperties = {
      color: presentation.targetTextColor,
      fontSize: `${presentation.targetFontSize}px`,
      textShadow: "0 4px 28px rgba(0,0,0,.65)",
    };

    return <div data-tauri-drag-region className="overlay-text presentation-text" style={containerStyle}>
      {controls ? <div className="overlay-controls-slot">{controls}</div> : null}
      <div data-tauri-drag-region className={`presentation-caption-grid order-${presentation.historyOrder} animation-${settings.animation}`}>
        <PresentationColumn label={LANGUAGES[leftLanguage]} entries={entries} newestKey={newestKey} language={leftLanguage} className="overlay-source" style={sourcePresentationStyle} />
        <PresentationColumn label={LANGUAGES[rightLanguage]} entries={entries} newestKey={newestKey} language={rightLanguage} className="overlay-translation" style={targetPresentationStyle} />
      </div>
      <div ref={probeRef} style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", left: 0, top: 0, padding: "13px 22px 16px", boxSizing: "border-box" }} />
    </div>;
  }

  return <div data-tauri-drag-region className="overlay-text" style={containerStyle}>
    {controls ? <div className="overlay-controls-slot">{controls}</div> : null}
    <div data-tauri-drag-region key={`${sourceText}:${translatedText}`} className={`animation-${settings.animation}`} style={{ width: "100%" }}>
      {showSource && sourceText ? <TailCaption key={`source:${sourceText}`} className="overlay-source" style={sourceStyle} text={sourceText} maxLines={1} lineHeight={1.32} /> : null}
      <TailCaption key={`translation:${translatedText}`} className="overlay-translation" style={translatedStyle} text={translatedText} maxLines={translationLines} lineHeight={1.22} />
    </div>
    <div ref={probeRef} style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", left: 0, top: 0, padding: "13px 22px 16px", boxSizing: "border-box" }} />
  </div>;
}

function PresentationColumn({ label, entries, newestKey, language, className, style }: { label: string; entries: PresentationEntry[]; newestKey?: string; language: LanguageCode; className: string; style: CSSProperties }) {
  return <section data-tauri-drag-region className="presentation-caption-column">
    <div className="presentation-caption-label">{label}</div>
    <div className="presentation-caption-stack">
      {entries.length ? entries.map((entry) => (
        <p key={`${language}:${entry.key}`} className={`presentation-caption-item ${entry.key === newestKey ? "newest" : "older"} ${className}`} style={style}>
          {entry.textByLanguage[language] || "—"}
        </p>
      )) : (
        <p className={`presentation-caption-item newest ${className}`} style={style}>Waiting…</p>
      )}
    </div>
  </section>;
}

function sameCaption(sourceText: string, translatedText: string) {
  return normalizeCaption(sourceText) === normalizeCaption(translatedText);
}

function normalizeCaption(text: string) {
  return text.trim().toLocaleLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:，。！？；：]+$/g, "");
}

function TailCaption({ className, style, text, maxLines, lineHeight }: { className: string; style: CSSProperties; text: string; maxLines: number; lineHeight: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [visibleText, setVisibleText] = useState(text);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const probe = probeRef.current;
    if (!viewport || !probe) return;
    const fit = () => {
      const tokens = segmentText(text);
      const maxHeight = (Number.parseFloat(getComputedStyle(probe).fontSize) || 16) * lineHeight * maxLines + 1;
      probe.textContent = text;
      if (probe.scrollHeight <= maxHeight) { setVisibleText(text); return; }
      let low = 0;
      let high = Math.max(0, tokens.length - 1);
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        probe.textContent = `…${tokens.slice(middle).join("").trimStart()}`;
        if (probe.scrollHeight <= maxHeight) high = middle;
        else low = middle + 1;
      }
      setVisibleText(`…${tokens.slice(low).join("").trimStart()}`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [lineHeight, maxLines, text]);

  const fontSize = Number.parseFloat(String(style.fontSize ?? 16)) || 16;
  return <div ref={viewportRef} className={`caption-viewport ${className}-viewport`} style={{ maxHeight: `${fontSize * maxLines * lineHeight}px` }}>
    <div className={className} style={style}>{visibleText}</div>
    <div ref={probeRef} aria-hidden className={`${className} caption-probe`} style={style} />
  </div>;
}

function segmentText(text: string) {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(text), (part) => part.segment);
  }
  return text.match(/\s+|[^\s]+/g) ?? [text];
}

function colorWithOpacity(hex: string, opacity: number) {
  const value = hex.replace("#", "");
  const [r, g, b] = value.length === 3 ? value.split("").map((v) => parseInt(v + v, 16)) : [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${opacity})`;
}
