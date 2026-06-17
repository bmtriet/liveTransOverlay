import { invoke } from "@tauri-apps/api/core";
import { floatToPcm16, resampleTo16k } from "./pcmEncoder";

export interface AudioCaptureHandlers {
  onChunk: (chunk: Uint8Array) => void;
  onLevel: (level: number) => void;
}

export class AudioCapture {
  private context?: AudioContext;
  private stream?: MediaStream;
  private processor?: ScriptProcessorNode;

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audioinput");
  }

  async permissionStatus(): Promise<"unknown" | "granted" | "denied"> {
    if (!("__TAURI_INTERNALS__" in window)) return "unknown";
    return invoke<"unknown" | "granted" | "denied">("microphone_permission_status");
  }

  private async requestNativePermission(): Promise<boolean> {
    if (!("__TAURI_INTERNALS__" in window)) return true;
    return invoke<boolean>("request_native_microphone_permission");
  }

  async requestPermission(): Promise<"granted" | "denied"> {
    try {
      if (!(await this.requestNativePermission())) return "denied";
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return "granted";
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "UnknownError";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
      throw error;
    }
  }

  async start(deviceId: string | undefined, handlers: AudioCaptureHandlers) {
    if (!(await this.requestNativePermission())) {
      throw new DOMException("Microphone access was denied by macOS.", "NotAllowedError");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.context = new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
    const source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      handlers.onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
      handlers.onChunk(floatToPcm16(resampleTo16k(samples, this.context!.sampleRate)));
    };
    source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  async stop() {
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close();
    this.processor = undefined;
    this.stream = undefined;
    this.context = undefined;
  }
}
