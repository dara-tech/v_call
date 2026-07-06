import { buildLiveTranslateSetupPayload } from './ai/liveConfig';
import { downsampleBuffer, floatTo16BitPCM, arrayBufferToBase64 } from './ai/audioUtils';
import { getAiProxyUrl } from './serverConfig';

export type TranslateState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Real-time voice translation via Gemini Live Translate API (audio-only pipeline). */
export class LiveTranslate extends EventTarget {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext;
  private mixerNode: GainNode;
  private processorNode: ScriptProcessorNode;
  private silentSink: GainNode;
  private outputGain: GainNode;
  private streams: Set<MediaStream> = new Set();
  private sources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();

  private nextPlayTime = 0;
  private readonly JITTER_BUFFER_MS = 90;
  private activeSources: AudioBufferSourceNode[] = [];

  private proxyUrl = getAiProxyUrl();
  private sessionHandle: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private isIntentionalDisconnect = false;
  private currentState: TranslateState = 'disconnected';
  private setupComplete = false;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  public readonly targetLanguageCode: string;

  constructor(targetLanguageCode: string) {
    super();
    this.targetLanguageCode = targetLanguageCode;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioContextClass({ sampleRate: 24000 });
    this.mixerNode = this.audioContext.createGain();
    this.outputGain = this.audioContext.createGain();
    this.outputGain.gain.value = 1.1;
    this.outputGain.connect(this.audioContext.destination);

    this.silentSink = this.audioContext.createGain();
    this.silentSink.gain.value = 0;

    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.mixerNode.connect(this.processorNode);
    this.processorNode.connect(this.silentSink);
    this.silentSink.connect(this.audioContext.destination);

    this.processorNode.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) return;
      if (this.streams.size === 0) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(inputData, this.audioContext.sampleRate, 16000);
      const pcm16 = floatTo16BitPCM(downsampled);
      const base64Data = arrayBufferToBase64(pcm16);

      this.ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Data,
          },
        },
      }));
    };
  }

  private setState(state: TranslateState) {
    if (this.currentState !== state) {
      this.currentState = state;
      this.dispatchEvent(new CustomEvent('statechange', { detail: state }));
    }
  }

  public getState(): TranslateState {
    return this.currentState;
  }

  public hasAudioSources(): boolean {
    return this.streams.size > 0;
  }

  public async connect(proxyUrl?: string): Promise<void> {
    this.proxyUrl = proxyUrl ?? getAiProxyUrl();
    this.isIntentionalDisconnect = false;
    this.reconnectAttempts = 0;
    this.setupComplete = false;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.connectTimeoutId = setTimeout(() => {
        this.failConnect(new Error('Live Translate setup timed out'));
      }, 15000);
      this.establishConnection();
    });
  }

  private finishConnect() {
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
    this.connectResolve?.();
    this.connectResolve = null;
    this.connectReject = null;
  }

  private failConnect(err: Error) {
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
    this.connectReject?.(err);
    this.connectResolve = null;
    this.connectReject = null;
  }

  private establishConnection() {
    this.setupComplete = false;
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    this.ws = new WebSocket(this.proxyUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.ws?.send(JSON.stringify({
        setup: buildLiveTranslateSetupPayload(this.targetLanguageCode, this.sessionHandle),
      }));
    };

    this.ws.onmessage = async (event) => {
      try {
        let textData = event.data;
        if (textData instanceof Blob) {
          textData = await textData.text();
        }
        const msg = JSON.parse(textData);

        if (msg.error) {
          const message = msg.error.message || JSON.stringify(msg.error);
          console.error('[LiveTranslate] API error:', message);
          this.dispatchEvent(new CustomEvent('error', { detail: message }));
          if (!this.setupComplete) {
            this.failConnect(new Error(message));
          }
          return;
        }

        if (msg.setupComplete) {
          this.setupComplete = true;
          this.setState('connected');
          this.dispatchEvent(new CustomEvent('ready'));
          this.finishConnect();
          console.log('[LiveTranslate] Setup complete');
        }

        if (msg.sessionResumptionUpdate?.newHandle) {
          this.sessionHandle = msg.sessionResumptionUpdate.newHandle;
        }

        if (msg.serverContent?.inputTranscription?.text) {
          this.dispatchEvent(new CustomEvent('inputtranscript', {
            detail: {
              text: msg.serverContent.inputTranscription.text,
              languageCode: msg.serverContent.inputTranscription.languageCode,
            },
          }));
        }
        if (msg.serverContent?.outputTranscription?.text) {
          this.dispatchEvent(new CustomEvent('outputtranscript', {
            detail: {
              text: msg.serverContent.outputTranscription.text,
              languageCode: msg.serverContent.outputTranscription.languageCode,
            },
          }));
        }

        const parts = msg.serverContent?.modelTurn?.parts;
        if (parts) {
          for (const part of parts) {
            const inline = part.inlineData ?? part.inline_data;
            if (inline?.data) {
              this.playAudio(inline.data);
            }
          }
        }
      } catch (err) {
        console.error('[LiveTranslate] Message error:', err);
      }
    };

    this.ws.onclose = (event) => {
      this.setupComplete = false;
      if (!this.isIntentionalDisconnect && !this.connectResolve) {
        this.dispatchEvent(new CustomEvent('error', {
          detail: event.reason || `Connection closed (${event.code})`,
        }));
      }
      if (this.connectReject) {
        this.failConnect(new Error(event.reason || 'Live Translate disconnected'));
      }
      if (this.isIntentionalDisconnect) {
        this.setState('disconnected');
        return;
      }
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
        this.setState('reconnecting');
        setTimeout(() => this.establishConnection(), backoffMs);
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = () => {
      console.error('[LiveTranslate] WebSocket error');
      this.dispatchEvent(new CustomEvent('error', { detail: 'WebSocket connection error' }));
    };
  }

  public addStream(stream: MediaStream) {
    if (!stream || this.streams.has(stream) || stream.getAudioTracks().length === 0) return;
    try {
      const audioEl = document.createElement('audio');
      audioEl.srcObject = stream;
      audioEl.autoplay = true;
      audioEl.muted = true;
      audioEl.setAttribute('playsinline', '');
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      audioEl.play().catch(() => {});
      this.audioElements.set(stream.id, audioEl);

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.mixerNode);
      this.sources.set(stream.id, source);
      this.streams.add(stream);
      console.log('[LiveTranslate] Added audio stream:', stream.id);
    } catch (e) {
      console.error('[LiveTranslate] addStream failed:', e);
    }
  }

  public removeStream(stream: MediaStream) {
    if (!this.streams.has(stream)) return;
    this.streams.delete(stream);
    const source = this.sources.get(stream.id);
    if (source) {
      source.disconnect();
      this.sources.delete(stream.id);
    }
    const audioEl = this.audioElements.get(stream.id);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
      this.audioElements.delete(stream.id);
    }
  }

  public disconnect() {
    this.isIntentionalDisconnect = true;
    this.setupComplete = false;
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
    this.connectResolve = null;
    this.connectReject = null;
    this.ws?.close();
    this.ws = null;
    this.activeSources.forEach((s) => {
      try { s.stop(); } catch { /* noop */ }
    });
    this.activeSources = [];
    try {
      this.processorNode.disconnect();
      this.mixerNode.disconnect();
      this.silentSink.disconnect();
      this.sources.forEach((s) => s.disconnect());
      this.sources.clear();
      this.streams.clear();
      this.audioElements.forEach((el) => {
        el.pause();
        el.srcObject = null;
        el.remove();
      });
      this.audioElements.clear();
    } catch { /* noop */ }
    this.setState('disconnected');
  }

  private playAudio(base64Data: string) {
    const binaryStr = window.atob(base64Data);
    const len = Math.floor(binaryStr.length / 2) * 2;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768.0;
    }

    const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputGain);

    const currentTime = this.audioContext.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime + this.JITTER_BUFFER_MS / 1000;
    }
    source.start(this.nextPlayTime);
    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
    this.nextPlayTime += audioBuffer.duration;
  }
}
