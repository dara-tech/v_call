import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveTranslate } from '../lib/LiveTranslate';
import { LIVE_TRANSLATE_LANGUAGES } from '../lib/ai/liveConfig';
import type { PeerState } from './types';
import { toast } from 'sonner';
import { getSharedAudioContext } from '../lib/sharedAudioContext';

export type TranslateTranscriptLine = {
  id: string;
  text: string;
  languageCode?: string;
  timestamp: number;
};

type TranscriptDetail = {
  text: string;
  languageCode?: string;
};

function nextTranscriptState(
  prevLive: string,
  incoming: string,
  languageCode?: string,
): { live: string; history: TranslateTranscriptLine[] } {
  const text = incoming.trim();
  if (!text) return { live: prevLive, history: [] };

  if (!prevLive) {
    return { live: text, history: [] };
  }

  if (text.startsWith(prevLive) || prevLive.startsWith(text)) {
    return { live: text, history: [] };
  }

  return {
    live: text,
    history: [
      {
        id: crypto.randomUUID(),
        text: prevLive,
        languageCode,
        timestamp: Date.now(),
      },
    ],
  };
}

function isHumanPeer(peer: PeerState): boolean {
  return peer.aiState === undefined;
}

function countHumanAudioPeers(peers: Record<string, PeerState>): number {
  return Object.values(peers).filter(
    (p) => isHumanPeer(p) && p.stream?.getAudioTracks().some((t) => t.enabled && t.readyState === 'live'),
  ).length;
}

async function waitForAudioSources(
  syncFn: () => void,
  hasSources: () => boolean,
  maxMs = 30000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    syncFn();
    if (hasSources()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  syncFn();
  return hasSources();
}

export function useLiveTranslate(
  peers: Record<string, PeerState>,
  localStream: MediaStream | null,
  watchPartyStream: MediaStream | null = null,
) {
  const instanceRef = useRef<LiveTranslate | null>(null);
  const attachedStreamIdsRef = useRef<Set<string>>(new Set());
  const usingLocalMicRef = useRef(false);
  const watchPartyStreamRef = useRef(watchPartyStream);
  watchPartyStreamRef.current = watchPartyStream;
  const inputLiveRef = useRef('');
  const outputLiveRef = useRef('');

  const [isActive, setIsActive] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('km');
  const [translateState, setTranslateState] = useState<string>('disconnected');
  const [inputLiveText, setInputLiveText] = useState('');
  const [outputLiveText, setOutputLiveText] = useState('');
  const [inputHistory, setInputHistory] = useState<TranslateTranscriptLine[]>([]);
  const [outputHistory, setOutputHistory] = useState<TranslateTranscriptLine[]>([]);
  const [inputLanguageCode, setInputLanguageCode] = useState<string | null>(null);

  const clearTranscripts = useCallback(() => {
    inputLiveRef.current = '';
    outputLiveRef.current = '';
    setInputLiveText('');
    setOutputLiveText('');
    setInputHistory([]);
    setOutputHistory([]);
    setInputLanguageCode(null);
  }, []);

  const syncPeerStreams = useCallback(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    const wanted = new Set<string>();
    const humanCount = countHumanAudioPeers(peers);

    for (const peer of Object.values(peers)) {
      if (!isHumanPeer(peer) || !peer.stream?.getAudioTracks().length) continue;
      wanted.add(peer.stream.id);
      if (!attachedStreamIdsRef.current.has(peer.stream.id)) {
        instance.addStream(peer.stream);
        attachedStreamIdsRef.current.add(peer.stream.id);
      }
    }

    if (watchPartyStream && watchPartyStream.getAudioTracks().length) {
      wanted.add(watchPartyStream.id);
      if (!attachedStreamIdsRef.current.has(watchPartyStream.id)) {
        instance.addStream(watchPartyStream);
        attachedStreamIdsRef.current.add(watchPartyStream.id);
      }
    }

    const hasWatchPartyAudio = Boolean(watchPartyStream && watchPartyStream.getAudioTracks().length);
    const shouldUseLocalMic =
      (humanCount === 0 || !hasWatchPartyAudio) &&
      localStream?.getAudioTracks().length &&
      !hasWatchPartyAudio;

    if (shouldUseLocalMic && localStream) {
      wanted.add(localStream.id);
      if (!attachedStreamIdsRef.current.has(localStream.id)) {
        instance.addStream(localStream);
        attachedStreamIdsRef.current.add(localStream.id);
        usingLocalMicRef.current = true;
      }
    } else if (usingLocalMicRef.current && localStream) {
      instance.removeStream(localStream);
      attachedStreamIdsRef.current.delete(localStream.id);
      usingLocalMicRef.current = false;
    }

    for (const id of [...attachedStreamIdsRef.current]) {
      if (!wanted.has(id)) {
        if (localStream?.id === id) {
          instance.removeStream(localStream);
        } else if (watchPartyStream?.id === id) {
          instance.removeStream(watchPartyStream);
        } else {
          for (const peer of Object.values(peers)) {
            if (peer.stream?.id === id) {
              instance.removeStream(peer.stream);
              break;
            }
          }
        }
        attachedStreamIdsRef.current.delete(id);
      }
    }
  }, [peers, localStream, watchPartyStream]);

  const stopTranslate = useCallback(() => {
    instanceRef.current?.disconnect();
    instanceRef.current = null;
    attachedStreamIdsRef.current.clear();
    usingLocalMicRef.current = false;
    clearTranscripts();
    setIsActive(false);
    setTranslateState('disconnected');
  }, [clearTranscripts]);

  const startTranslate = useCallback(async (langCode: string, expectVideoAudio = false) => {
    stopTranslate();
    setTargetLanguage(langCode);

    const ctx = getSharedAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const instance = new LiveTranslate(langCode);
    instance.addEventListener('statechange', ((e: CustomEvent) => {
      setTranslateState(e.detail);
    }) as EventListener);
    instance.addEventListener('error', ((e: CustomEvent) => {
      toast.error(`Live Translate: ${e.detail}`);
    }) as EventListener);
    instance.addEventListener('inputtranscript', ((e: CustomEvent<TranscriptDetail>) => {
      const { text, languageCode } = e.detail;
      if (languageCode) setInputLanguageCode(languageCode);
      const next = nextTranscriptState(inputLiveRef.current, text, languageCode);
      inputLiveRef.current = next.live;
      setInputLiveText(next.live);
      if (next.history.length > 0) {
        setInputHistory((prev) => [...prev, ...next.history]);
      }
    }) as EventListener);
    instance.addEventListener('outputtranscript', ((e: CustomEvent<TranscriptDetail>) => {
      const { text, languageCode } = e.detail;
      const next = nextTranscriptState(outputLiveRef.current, text, languageCode);
      outputLiveRef.current = next.live;
      setOutputLiveText(next.live);
      if (next.history.length > 0) {
        setOutputHistory((prev) => [...prev, ...next.history]);
      }
    }) as EventListener);

    instanceRef.current = instance;
    setIsActive(true);

    // Let WatchPartyPlayer mount the proxy <audio> stream before Gemini setup.
    if (expectVideoAudio) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    try {
      await instance.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      toast.error(`Live Translate: ${message}`);
      stopTranslate();
      return;
    }

    const expectingWatchParty = expectVideoAudio || Boolean(watchPartyStreamRef.current);
    const hasSource = await waitForAudioSources(
      () => {
        syncPeerStreams();
        const stream = watchPartyStreamRef.current;
        if (stream && instanceRef.current && !attachedStreamIdsRef.current.has(stream.id)) {
          instanceRef.current.addStream(stream);
          attachedStreamIdsRef.current.add(stream.id);
        }
      },
      () => instance.hasAudioSources(),
      expectingWatchParty ? 45000 : 12000,
    );

    if (!hasSource) {
      toast.error(
        expectingWatchParty
          ? 'Live Translate: waiting for video audio timed out. Try Play Dubbed again.'
          : 'Live Translate: no audio source. Play a video or unmute your mic.',
      );
      stopTranslate();
      return;
    }

    const label = LIVE_TRANSLATE_LANGUAGES.find((l) => l.code === langCode)?.label ?? langCode;
    const sourceHint = watchPartyStreamRef.current
      ? 'video audio'
      : usingLocalMicRef.current
        ? 'your mic'
        : 'call audio';
    toast.success(`Live Translate → ${label} (${sourceHint})`, { duration: 2500 });
  }, [stopTranslate, syncPeerStreams, watchPartyStream]);

  const toggleTranslate = useCallback(async (langCode?: string) => {
    if (isActive) {
      stopTranslate();
      toast('Live Translate off');
      return;
    }
    await startTranslate(langCode ?? targetLanguage);
  }, [isActive, stopTranslate, startTranslate, targetLanguage]);

  useEffect(() => {
    if (isActive) syncPeerStreams();
  }, [isActive, syncPeerStreams]);

  useEffect(() => () => stopTranslate(), [stopTranslate]);

  return {
    isTranslateActive: isActive,
    translateTargetLanguage: targetLanguage,
    translateState,
    translateInputLanguageCode: inputLanguageCode,
    translateInputLiveText: inputLiveText,
    translateOutputLiveText: outputLiveText,
    translateInputHistory: inputHistory,
    translateOutputHistory: outputHistory,
    setTranslateTargetLanguage: setTargetLanguage,
    startLiveTranslate: startTranslate,
    stopLiveTranslate: stopTranslate,
    toggleLiveTranslate: toggleTranslate,
  };
}
