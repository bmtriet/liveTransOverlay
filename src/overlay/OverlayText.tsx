import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { OverlaySettings } from "../types";

interface OverlayTextProps {
  sourceText?: string;
  translatedText: string;
  settings: OverlaySettings;
}

export function OverlayText({ sourceText, translatedText, settings }: OverlayTextProps) {
  const totalLines = Math.min(5, Math.max(2, settings.maxLines));
  const showSource = Boolean(settings.bilingualEnabled && sourceText);
  const translationLines = showSource ? totalLines - 1 : totalLines;
  const containerStyle: CSSProperties = {
    backgroundColor: settings.backgroundEnabled ? colorWithOpacity(settings.backgroundColor, settings.backgroundOpacity) : "transparent",
  };
  const translatedStyle: CSSProperties = {
    color: settings.textColor,
    fontSize: `${settings.fontSize}px`,
    WebkitTextStroke: settings.strokeEnabled ? `${settings.strokeWidth}px ${settings.strokeColor}` : undefined,
    textShadow: settings.shadowEnabled ? "0 4px 16px rgba(0,0,0,.75)" : undefined,
  };
  const sourceStyle: CSSProperties = {
    color: settings.textColor,
    fontSize: `${Math.max(17, Math.round(settings.fontSize * 0.48))}px`,
    textShadow: settings.shadowEnabled ? "0 2px 10px rgba(0,0,0,.75)" : undefined,
  };

  return <div className={`overlay-text animation-${settings.animation}`} style={containerStyle}>
    {showSource && sourceText ? <TailCaption className="overlay-source" style={sourceStyle} text={sourceText} maxLines={1} lineHeight={1.32} /> : null}
    <TailCaption className="overlay-translation" style={translatedStyle} text={translatedText} maxLines={translationLines} lineHeight={1.22} />
  </div>;
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
