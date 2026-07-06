import type { AIState, AIPersona } from './ai/types';
import { PERSONAS } from './ai/personas';
import { buildLiveSetupPayload } from './ai/liveConfig';
import { downsampleBuffer, floatTo16BitPCM, arrayBufferToBase64 } from './ai/audioUtils';
import { getAiProxyUrl } from './serverConfig';

export class AIParticipant extends EventTarget {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext;
  private mixerNode: GainNode;
  private processorNode: ScriptProcessorNode;
  private destinationNode: MediaStreamAudioDestinationNode;
  private outputCompressor: DynamicsCompressorNode;
  private outputGain: GainNode;
  private streams: Set<MediaStream> = new Set();
  private sources: Map<string, MediaStreamAudioSourceNode> = new Map();
  public aiStream: MediaStream;
  
  // Video and Screen Capture
  private videoElements: Map<string, HTMLVideoElement> = new Map();
  private videoIntervals: Map<string, number> = new Map();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Audio playback state
  private nextPlayTime: number = 0;
  private readonly JITTER_BUFFER_MS = 90;
  private activeSources: AudioBufferSourceNode[] = [];
  private isPlayingAudio: boolean = false;
  private lastInterruptTime: number = 0;
  private lastVideoFrameTime: Map<string, number> = new Map();
  
  // Reconnection and Session state
  private proxyUrl: string = getAiProxyUrl();

  private sessionHandle: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private isIntentionalDisconnect: boolean = false;
  private currentState: AIState = 'disconnected';

  // Voice Activity Detection (VAD)
  // RMS Threshold: Lower is MORE sensitive. 0.015 prevents background noise from triggering an interruption.
  private readonly VAD_THRESHOLD = 0.015;
  // 1 chunk = ~0.17s (4096 samples @ 24kHz). 20 chunks = ~3.4 seconds of trailing silence.
  private readonly SILENCE_CHUNKS_BEFORE_PAUSE = 20; 
  private silenceCount = 0;
  private speechCount = 0;
  private isSendingAudio = false;
  
  public personaId: AIPersona;

  constructor(persona: AIPersona = 'lily') {
    super();
    this.personaId = persona;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({ sampleRate: 24000 }); // Output from Gemini is 24kHz
    this.mixerNode = this.audioContext.createGain();
    this.destinationNode = this.audioContext.createMediaStreamDestination();
    this.outputCompressor = this.audioContext.createDynamicsCompressor();
    this.outputCompressor.threshold.value = -22;
    this.outputCompressor.knee.value = 18;
    this.outputCompressor.ratio.value = 2.5;
    this.outputCompressor.attack.value = 0.005;
    this.outputCompressor.release.value = 0.12;
    this.outputGain = this.audioContext.createGain();
    this.outputGain.gain.value = 1.15;
    this.outputCompressor.connect(this.outputGain);
    this.outputGain.connect(this.destinationNode);
    this.outputGain.connect(this.audioContext.destination);
    this.aiStream = this.destinationNode.stream;

    // Set up canvas for video frame extraction
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 360;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    // Use ScriptProcessorNode to capture mixed audio and downsample to 16kHz for Gemini
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.mixerNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination); // Required for processor to run

    this.processorNode.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate RMS for Voice Activity Detection
      let sumSquares = 0;
      for (let i = 0; i < inputData.length; i++) {
        sumSquares += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sumSquares / inputData.length);
      
      if (rms > this.VAD_THRESHOLD) {
        this.silenceCount = 0;
        this.speechCount++;
        this.isSendingAudio = true;
        
        // Only interrupt if the user has been speaking for at least 8 chunks (~0.7 seconds)
        // This prevents echo or brief noises (like coughing or typing) from instantly cutting the AI off.
        if (this.isPlayingAudio && this.speechCount > 8) {
          this.interrupt();
        }
      } else {
        this.speechCount = 0;
        this.silenceCount++;
        if (this.silenceCount > this.SILENCE_CHUNKS_BEFORE_PAUSE) {
          this.isSendingAudio = false;
        }
      }

      // If neither currently speaking nor in trailing silence period, don't send anything
      if (!this.isSendingAudio) return;
      
      // Downsample to 16kHz
      const downsampled = downsampleBuffer(inputData, this.audioContext.sampleRate, 16000);
      const pcm16 = floatTo16BitPCM(downsampled);
      const base64Data = arrayBufferToBase64(pcm16);

      this.ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data
          }
        }
      }));
    };
  }

  private setState(state: AIState) {
    if (this.currentState !== state) {
      this.currentState = state;
      this.dispatchEvent(new CustomEvent('statechange', { detail: state }));
      console.log(`[AIParticipant] State changed to: ${state}`);
    }
  }

  public getState(): AIState {
    return this.currentState;
  }

  public async connect(proxyUrl?: string) {
    this.proxyUrl = proxyUrl ?? getAiProxyUrl();
    this.isIntentionalDisconnect = false;
    this.reconnectAttempts = 0;
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    this.establishConnection();
  }

  private establishConnection() {
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    this.ws = new WebSocket(this.proxyUrl);
    
    this.ws.onopen = () => {
      console.log('[AIParticipant] Connected to Proxy');
      this.setState('connected');
      this.reconnectAttempts = 0;
      
      const personaConfig = PERSONAS[this.personaId];
      const setupPayload = buildLiveSetupPayload(this.personaId, this.sessionHandle);

      this.ws?.send(JSON.stringify({ setup: setupPayload }));

      // Only introduce itself if it's the first connection.
      // IMPORTANT: Use realtimeInput (not clientContent) so the voice goes through the
      // same native audio-out pipeline as all subsequent speech — keeping the voice consistent.
      if (!this.sessionHandle) {
        setTimeout(() => {
          this.ws?.send(JSON.stringify({
            realtimeInput: {
              text: personaConfig.greeting
            }
          }));
        }, 500); // Small delay to ensure setup is processed first
      }
    };

    this.ws.onmessage = async (event) => {
      try {
        let textData = event.data;
        if (textData instanceof Blob) {
          textData = await textData.text();
        }
        const msg = JSON.parse(textData);

        // Store session handle if provided by the server
        if (msg.sessionResumptionUpdate && msg.sessionResumptionUpdate.newHandle) {
          this.sessionHandle = msg.sessionResumptionUpdate.newHandle;
        }

        if (msg.serverContent?.modelTurn) {
          const parts = msg.serverContent.modelTurn.parts;
          for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
              this.playAudio(part.inlineData.data);
            }
            if (part.functionCall) {
              this.dispatchEvent(new CustomEvent('functioncall', { detail: part.functionCall }));
            }
          }
        }
      } catch (err) {
        console.error('[AIParticipant] Error processing message:', err);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[AIParticipant] WebSocket closed', event.code, event.reason);
      if (this.isIntentionalDisconnect) {
        this.setState('disconnected');
        return;
      }

      // Attempt reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
        console.log(`[AIParticipant] Reconnecting in ${backoffMs}ms... (Attempt ${this.reconnectAttempts})`);
        this.setState('reconnecting');
        setTimeout(() => this.establishConnection(), backoffMs);
      } else {
        console.error('[AIParticipant] Max reconnect attempts reached');
        this.setState('disconnected');
      }
    };

    this.ws.onerror = (err) => {
      console.error('[AIParticipant] WebSocket error:', err);
      // Let onclose handle the reconnect
    };
  }

  public addStream(stream: MediaStream) {
    if (!stream) return;
    if (this.streams.has(stream)) return;
    
    this.streams.add(stream);
    
    // Process audio tracks
    if (stream.getAudioTracks().length > 0) {
      try {
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.mixerNode);
        this.sources.set(stream.id, source);
        console.log('[AIParticipant] Added audio stream to AI mixer:', stream.id);
      } catch (e) {
        console.error('[AIParticipant] Failed to add audio stream:', e);
      }
    }

    // Setup Video processing unconditionally so it picks up camera/screen swaps dynamically
    console.log('[AIParticipant] Initializing Video Vision for stream:', stream.id);
    const videoEl = document.createElement('video');
    videoEl.srcObject = stream; // Pass the live stream directly to pick up track swaps
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.style.display = 'none'; // Keep hidden
    
    this.videoElements.set(stream.id, videoEl);
    document.body.appendChild(videoEl);
    
    // Check frames periodically
    const intervalId = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      
      const vTracks = stream.getVideoTracks();
      if (vTracks.length === 0 || !vTracks[0].enabled || vTracks[0].readyState === 'ended') return;
      
      if (videoEl.readyState < 2) return; // Ensure enough data is loaded
      
      const now = Date.now();
      const lastTime = this.lastVideoFrameTime.get(stream.id) || 0;
      const intervalLimit = this.isSendingAudio ? 500 : 3000; // 2 FPS if speaking, 0.33 FPS if silent
      
      if (now - lastTime < intervalLimit) return;
      this.lastVideoFrameTime.set(stream.id, now);
      
      try {
        this.ctx.drawImage(videoEl, 0, 0, this.canvas.width, this.canvas.height);
        const dataUrl = this.canvas.toDataURL('image/jpeg', 0.5); // Compress to 50%
        const base64Data = dataUrl.split(',')[1];
            
            // Send video frames inside video object
            this.ws.send(JSON.stringify({
              realtimeInput: {
                video: {
                  mimeType: "image/jpeg",
                  data: base64Data
                }
              }
            }));
      } catch (err) {
        console.error('[AIParticipant] Failed to capture video frame:', err);
      }
    }, 200); // Check 5 times a second, but actual send rate depends on intervalLimit
    
    this.videoIntervals.set(stream.id, intervalId);
  }

  public removeStream(stream: MediaStream) {
    if (this.streams.has(stream)) {
      this.streams.delete(stream);
      
      // Clean up audio
      const source = this.sources.get(stream.id);
      if (source) {
        source.disconnect();
        this.sources.delete(stream.id);
      }
      
      // Clean up video
      const interval = this.videoIntervals.get(stream.id);
      if (interval) {
        clearInterval(interval);
        this.videoIntervals.delete(stream.id);
      }
      const videoEl = this.videoElements.get(stream.id);
      if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
        if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
        this.videoElements.delete(stream.id);
      }
    }
  }

  public disconnect() {
    this.isIntentionalDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    try {
      this.processorNode.disconnect();
      this.mixerNode.disconnect();
      this.sources.forEach(source => source.disconnect());
      this.sources.clear();
      this.streams.clear();
      
      // Clean up all video streams
      this.videoIntervals.forEach(interval => clearInterval(interval));
      this.videoIntervals.clear();
      this.videoElements.forEach(videoEl => {
        videoEl.pause();
        videoEl.srcObject = null;
        if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
      });
      this.videoElements.clear();
    } catch (e) {}
    this.setState('disconnected');
  }

  public sendSystemContext(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: `[SYSTEM CONTEXT UPDATE]: ${text}` }] }]
        }
      }));
    }
  }

  public sendFunctionResponse(call: any, response: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const functionResponse: any = {
        name: call.name,
        response: response
      };
      if (call.id) {
        functionResponse.id = call.id;
      }
      
      this.ws.send(JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ functionResponse }]
            }
          ],
          turnComplete: true
        }
      }));
    }
  }


  public interrupt() {
    if (!this.isPlayingAudio) return;
    
    const now = Date.now();
    if (now - this.lastInterruptTime < 1000) return; // Prevent spamming interrupt
    this.lastInterruptTime = now;

    console.log('[AIParticipant] Interrupting AI audio playback');
    this.isPlayingAudio = false;
    this.speechCount = 0; // Reset speech count so it doesn't immediately re-trigger
    
    this.activeSources.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    this.activeSources = [];
    this.nextPlayTime = this.audioContext.currentTime;
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Sending turnComplete: true clears the server's generation queue.
      this.ws.send(JSON.stringify({
        clientContent: { turnComplete: true }
      }));
    }
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
    
    const numSamples = Math.floor(bytes.length / 2);
    const audioBuffer = this.audioContext.createBuffer(1, numSamples, 24000);
    audioBuffer.getChannelData(0).set(float32);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputCompressor);
    
    const currentTime = this.audioContext.currentTime;
    
    // Jitter Buffer logic: Only reset nextPlayTime if we've fallen behind (underrun).
    // If we underrun, add a small delay (jitter buffer) to allow future chunks to arrive.
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime + (this.JITTER_BUFFER_MS / 1000);
    }
    
    source.start(this.nextPlayTime);
    
    this.activeSources.push(source);
    this.isPlayingAudio = true;
    
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s !== source);
      if (this.activeSources.length === 0) {
        this.isPlayingAudio = false;
      }
    };
    
    this.nextPlayTime += audioBuffer.duration;
  }
}
