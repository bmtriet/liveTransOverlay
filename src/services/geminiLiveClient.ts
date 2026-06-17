import type { AppSettings, LanguageCode } from "../types";
import { LIVE_TRANSLATE_LANGUAGE_CODES } from "../utils/language";
import { bytesToBase64 } from "./pcmEncoder";
import { recordDiagnostic } from "./diagnostics";

interface TranslationResult {
  sourceText?: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}

interface LiveHandlers {
  onStatus: (status: "connecting" | "connected" | "error" | "idle", error?: string) => void;
  onText: (text: string, isFinal: boolean, result: TranslationResult) => void;
}

type GeminiMessage = {
  setupComplete?: object;
  text?: string;
  error?: { code?: number; message?: string; status?: string };
  serverContent?: {
    turnComplete?: boolean;
    interrupted?: boolean;
    modelTurn?: { parts?: Array<{ text?: string }> };
    inputTranscription?: { text?: string; languageCode?: string };
    outputTranscription?: { text?: string; languageCode?: string };
  };
};

interface LiveConnection {
  socket: WebSocket;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  ready: boolean;
  setupComplete: boolean;
  sourceText: string;
  translatedText: string;
  finalizeTimer?: number;
}

export class GeminiLiveClient {
  private connections: LiveConnection[] = [];
  private setupReady = false;
  private closing = false;
  private audioBuffer = new Uint8Array(0);

  async connect(settings: AppSettings, handlers: LiveHandlers): Promise<void> {
    this.close();
    this.closing = false;
    this.setupReady = false;
    const directions = settings.mode === "auto-bidirectional"
      ? [
          { sourceLanguage: settings.sourceLanguage, targetLanguage: settings.targetLanguage },
          { sourceLanguage: settings.targetLanguage, targetLanguage: settings.sourceLanguage },
        ]
      : [{ sourceLanguage: settings.sourceLanguage, targetLanguage: settings.targetLanguage }];

    handlers.onStatus("connecting");
    await Promise.all(directions.map((direction) => this.connectDirection(settings, handlers, direction)));
    this.setupReady = true;
    handlers.onStatus("connected");
    this.flushAudio();
  }

  private connectDirection(
    settings: AppSettings,
    handlers: LiveHandlers,
    direction: { sourceLanguage: LanguageCode; targetLanguage: LanguageCode },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let failureRecorded = false;
      const setupMessage = { setup: {
        model: `models/${settings.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          translationConfig: {
            targetLanguageCode: LIVE_TRANSLATE_LANGUAGE_CODES[direction.targetLanguage],
            // Each bidirectional connection should stay silent when speech is
            // already in its target language; the reverse connection handles it.
            echoTargetLanguage: false,
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      }};
      const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(settings.geminiApiKey)}`;
      const socket = new WebSocket(endpoint);
      const connection: LiveConnection = {
        socket,
        ...direction,
        ready: false,
        setupComplete: false,
        sourceText: "",
        translatedText: "",
      };
      this.connections.push(connection);

      const fail = (message: string) => {
        if (this.closing) return;
        handlers.onStatus("error", message);
        if (!failureRecorded) {
          failureRecorded = true;
          void recordDiagnostic({
            at: new Date().toISOString(),
            scope: "gemini-live",
            message,
            details: { endpointVersion: "v1beta", direction, setupMessage },
          });
        }
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };
      const timeout = window.setTimeout(() => {
        fail(`Gemini did not start ${direction.sourceLanguage} → ${direction.targetLanguage} within 12 seconds.`);
        socket.close();
      }, 12000);

      socket.onopen = () => socket.send(JSON.stringify(setupMessage));
      socket.onmessage = async (event) => {
        let message: GeminiMessage;
        try {
          const raw = typeof event.data === "string"
            ? event.data
            : event.data instanceof Blob
              ? await event.data.text()
              : event.data instanceof ArrayBuffer
                ? new TextDecoder().decode(event.data)
                : String(event.data);
          message = JSON.parse(raw) as GeminiMessage;
        } catch {
          fail("Gemini returned an unreadable response.");
          socket.close();
          return;
        }
        if (message.error) {
          fail(message.error.message || `Gemini connection failed${message.error.status ? `: ${message.error.status}` : ""}.`);
          socket.close();
          return;
        }
        if (message.setupComplete) {
          window.clearTimeout(timeout);
          connection.setupComplete = true;
          connection.ready = true;
          if (!settled) { settled = true; resolve(); }
          return;
        }
        this.handleContent(connection, message, handlers);
      };
      socket.onerror = () => fail("Could not connect to Gemini Live API. Check your internet connection and API key.");
      socket.onclose = (event) => {
        window.clearTimeout(timeout);
        connection.ready = false;
        if (this.closing) return;
        if (!connection.setupComplete) fail(event.reason || `Gemini closed the connection before setup completed (code ${event.code}).`);
        else handlers.onStatus("error", event.reason || "A Gemini translation direction closed unexpectedly.");
      };
    });
  }

  private handleContent(connection: LiveConnection, message: GeminiMessage, handlers: LiveHandlers) {
    const content = message.serverContent;
    if (content?.inputTranscription?.text) {
      connection.sourceText = mergeTranscript(connection.sourceText, content.inputTranscription.text);
    }
    const partsText = content?.modelTurn?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const nextText = content?.outputTranscription?.text ?? partsText ?? message.text ?? "";
    if (nextText.trim()) connection.translatedText = mergeTranscript(connection.translatedText, nextText);

    const shouldFinalize = Boolean(content?.turnComplete || content?.interrupted);
    if (connection.translatedText && (nextText.trim() || shouldFinalize)) {
      handlers.onText(connection.translatedText, shouldFinalize, {
        sourceText: connection.sourceText || undefined,
        sourceLanguage: connection.sourceLanguage,
        targetLanguage: connection.targetLanguage,
      });
    }
    if (shouldFinalize) {
      this.resetTurn(connection);
    } else if (nextText.trim()) {
      window.clearTimeout(connection.finalizeTimer);
      // Live Translate can stream usable output without a turnComplete event.
      // Treat a short quiet period as the end of the caption so it is persisted.
      connection.finalizeTimer = window.setTimeout(() => {
        if (!connection.translatedText) return;
        handlers.onText(connection.translatedText, true, {
          sourceText: connection.sourceText || undefined,
          sourceLanguage: connection.sourceLanguage,
          targetLanguage: connection.targetLanguage,
        });
        this.resetTurn(connection);
      }, 1400);
    }
  }

  private resetTurn(connection: LiveConnection) {
    window.clearTimeout(connection.finalizeTimer);
    connection.finalizeTimer = undefined;
    connection.sourceText = "";
    connection.translatedText = "";
  }

  sendAudio(chunk: Uint8Array) {
    const combined = new Uint8Array(this.audioBuffer.length + chunk.length);
    combined.set(this.audioBuffer);
    combined.set(chunk, this.audioBuffer.length);
    this.audioBuffer = combined.length > 160_000 ? combined.slice(combined.length - 160_000) : combined;
    this.flushAudio();
  }

  private flushAudio() {
    if (!this.setupReady || this.connections.some((connection) => !connection.ready)) return;
    const chunkBytes = 3200; // 100 ms of 16-bit mono PCM at 16 kHz.
    let offset = 0;
    while (this.audioBuffer.length - offset >= chunkBytes) {
      const chunk = this.audioBuffer.subarray(offset, offset + chunkBytes);
      for (const connection of this.connections) this.sendAudioMessage(connection, chunk);
      offset += chunkBytes;
    }
    this.audioBuffer = this.audioBuffer.slice(offset);
  }

  private sendAudioMessage(connection: LiveConnection, chunk: Uint8Array) {
    connection.socket.send(JSON.stringify({ realtimeInput: { audio: { data: bytesToBase64(chunk), mimeType: "audio/pcm;rate=16000" } } }));
  }

  close() {
    this.closing = true;
    for (const connection of this.connections) {
      window.clearTimeout(connection.finalizeTimer);
      if (connection.socket.readyState === WebSocket.OPEN && connection.ready) {
        if (this.audioBuffer.length) this.sendAudioMessage(connection, this.audioBuffer);
        connection.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        connection.socket.close(1000, "Meeting ended");
      } else if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.close(1000, "Meeting ended before setup");
      }
    }
    this.connections = [];
    this.setupReady = false;
    this.audioBuffer = new Uint8Array(0);
  }
}

function mergeTranscript(current: string, incoming: string): string {
  const next = incoming.trim();
  if (!next) return current;
  if (!current) return next;
  if (next.startsWith(current)) return next;
  if (current.endsWith(next)) return current;
  const noSpace = /^[,.;:!?…，。！？、]/.test(next) || /[\s\-–—]$/.test(current);
  return `${current}${noSpace ? "" : " "}${next}`;
}
