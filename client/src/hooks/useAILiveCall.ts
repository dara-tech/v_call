import { useState, useEffect, useRef, useCallback } from 'react';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

interface UseAILiveCallResult {
  state: ConnectionState;
  transcript: string;
  error: string | null;
  startCall: () => Promise<void>;
  stopCall: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  volume: number;
}

export function useAILiveCall(): UseAILiveCallResult {
  const [state, setState] = useState<ConnectionState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);

  // Buffer for playing received audio
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  // Fetch API key securely from signaling server
  const fetchApiKey = async () => {
    const serverUrl = import.meta.env.VITE_SIGNALING_SERVER || 'http://localhost:5001';
    const res = await fetch(`${serverUrl}/api/live-key`);
    if (!res.ok) throw new Error('Failed to fetch API key');
    const data = await res.json();
    return data.key;
  };

  const initAudioRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      } 
    });
    mediaStreamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioCtx;
    
    // Playback context for incoming audio (Gemini returns 24kHz usually)
    const playbackCtx = new AudioContext({ sampleRate: 24000 });
    playbackContextRef.current = playbackCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume for UI visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        setVolume(Math.sqrt(sum / inputData.length));

        // Convert Float32Array to Int16Array
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to base64
        const buffer = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64Data = btoa(binary);

        const message = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: base64Data,
              }
            ]
          }
        };

        wsRef.current.send(JSON.stringify(message));
      } else {
        setVolume(0);
      }
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);
  };

  const playNextChunk = () => {
    if (!playbackContextRef.current || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    const ctx = playbackContextRef.current;
    
    const buffer = ctx.createBuffer(1, chunk.length, 24000);
    buffer.getChannelData(0).set(chunk);
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    const currentTime = ctx.currentTime;
    const playTime = Math.max(currentTime, nextPlayTimeRef.current);
    
    source.start(playTime);
    nextPlayTimeRef.current = playTime + buffer.duration;
    
    source.onended = () => {
      playNextChunk();
    };
  };

  const handleIncomingMessage = (event: MessageEvent) => {
    try {
      const response = JSON.parse(event.data);

      if (response.serverContent?.modelTurn?.parts) {
        const parts = response.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.text) {
            setTranscript((prev) => prev + part.text);
          }
          if (part.inlineData?.data) {
            // Audio data received
            const binaryString = atob(part.inlineData.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Convert to Float32Array
            const int16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
              float32[i] = int16[i] / 32768;
            }
            
            audioQueueRef.current.push(float32);
            if (!isPlayingRef.current) {
              nextPlayTimeRef.current = playbackContextRef.current?.currentTime || 0;
              playNextChunk();
            }
          }
        }
      }
    } catch (e) {
      console.error("Error parsing message", e);
    }
  };

  const startCall = useCallback(async () => {
    try {
      setState('connecting');
      setError(null);
      setTranscript('');
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      const apiKey = await fetchApiKey();
      
      await initAudioRecording();

      const host = 'generativelanguage.googleapis.com';
      // Use gemini-2.0-flash-exp for Multimodal Live API
      const wsUrl = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send Initial Setup Message
        const setupMessage = {
          setup: {
            model: "models/gemini-2.0-flash-exp",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Aoede" // Other voices: Puck, Charon, Kore, Fenrir, Aoede
                  }
                }
              }
            }
          }
        };
        ws.send(JSON.stringify(setupMessage));
        setState('connected');
      };

      ws.onmessage = handleIncomingMessage;

      ws.onerror = () => {
        setError('WebSocket error occurred');
        stopCall();
      };

      ws.onclose = () => {
        setState('idle');
      };

    } catch (err: any) {
      setError(err.message || 'Failed to start call');
      setState('idle');
      stopCall();
    }
  }, []);

  const stopCall = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setState('idle');
    setVolume(0);
    audioQueueRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      stopCall();
    };
  }, [stopCall]);

  const toggleMute = () => setIsMuted(!isMuted);

  return {
    state,
    transcript,
    error,
    startCall,
    stopCall,
    isMuted,
    toggleMute,
    volume,
  };
}
