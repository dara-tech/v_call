import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSharedAudioContext } from '../lib/sharedAudioContext';
import type { PeerState } from './types';

export interface ScreenRecorderState {
  isRecording: boolean;
  durationSec: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Records screen video with mixed audio:
 * - Microphone (local)
 * - System / tab audio (from display capture, when browser allows)
 * - Remote call participants (WebRTC streams)
 */
export function useScreenRecorder(
  localStream: MediaStream | null,
  peers: PeerState[],
): ScreenRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    audioNodesRef.current.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    });
    audioNodesRef.current = [];
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (micStreamRef.current && micStreamRef.current !== localStream) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    micStreamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setDurationSec(0);
    setIsRecording(false);
  }, [localStream]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      return;
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(blob, `v-call-recording-${stamp}.${ext}`);
      toast.success('Recording saved');
      cleanup();
    };
    try {
      recorder.stop();
    } catch {
      cleanup();
    }
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;

    try {
      // 1. Screen + system/tab audio (user must enable "Share audio" in browser picker)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        systemAudio: 'include',
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      } as DisplayMediaStreamOptions);
      screenStreamRef.current = displayStream;

      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        toast.info('Screen share ended — stopping recording');
        stopRecording();
      });

      // 2. Microphone — reuse call mic or request a dedicated track
      let micStream: MediaStream | null = null;
      const existingMic = localStream?.getAudioTracks()[0];
      if (existingMic && existingMic.readyState === 'live') {
        micStream = new MediaStream([existingMic]);
      } else {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      }
      micStreamRef.current = micStream;

      // 3. Mix mic + system audio + remote call audio
      const audioCtx = getSharedAudioContext();
      await audioCtx.resume();
      const mixDest = audioCtx.createMediaStreamDestination();
      const sources: MediaStreamAudioSourceNode[] = [];

      const connectAudio = (stream: MediaStream, gain = 1) => {
        if (!stream.getAudioTracks().length) return;
        const src = audioCtx.createMediaStreamSource(stream);
        if (gain !== 1) {
          const g = audioCtx.createGain();
          g.gain.value = gain;
          src.connect(g);
          g.connect(mixDest);
        } else {
          src.connect(mixDest);
        }
        sources.push(src);
      };

      connectAudio(micStream, 1);
      connectAudio(displayStream, 1);

      for (const peer of peers) {
        if (peer.stream) connectAudio(peer.stream, 1);
      }

      audioNodesRef.current = sources;

      const hasSystemAudio = displayStream.getAudioTracks().length > 0;
      const hasRemoteAudio = peers.some((p) => p.stream?.getAudioTracks().length);
      if (!hasSystemAudio) {
        toast.message('Tip: enable "Share tab audio" in the picker for internal sound', {
          duration: 4000,
        });
      }

      // 4. Combine screen video + mixed audio
      const combined = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...mixDest.stream.getAudioTracks(),
      ]);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 128_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        toast.error('Recording failed');
        cleanup();
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      startedAtRef.current = Date.now();
      setDurationSec(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setDurationSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);

      const parts = ['mic', hasSystemAudio ? 'system audio' : null, hasRemoteAudio ? 'call audio' : null]
        .filter(Boolean)
        .join(' + ');
      toast.success(`Recording — ${parts}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start recording';
      if (!msg.toLowerCase().includes('permission') && !msg.toLowerCase().includes('abort')) {
        toast.error(msg);
      }
      cleanup();
    }
  }, [cleanup, isRecording, localStream, peers, stopRecording]);

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    cleanup();
  }, [cleanup]);

  return { isRecording, durationSec, startRecording, stopRecording };
}
