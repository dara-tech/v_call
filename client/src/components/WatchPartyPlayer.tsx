import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactPlayerImport from 'react-player';
import { DailyMotionSyncPlayer } from './DailyMotionSyncPlayer';
import { WatchPartyControls } from './WatchPartyControls';
import { WatchPartyQueue } from './WatchPartyQueue';

const ReactPlayer = (ReactPlayerImport as any).default || ReactPlayerImport;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Search, RotateCcw, Loader2, Clock, PlayCircle, Link2, ChevronRight, ListPlus, Play, Languages, Mic2 } from 'lucide-react';
import type { VideoSyncState, WatchPartyVideo } from '../hooks/types';
import { apiUrl } from '../lib/serverConfig';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LIVE_TRANSLATE_LANGUAGES, getLanguageLabel } from '../lib/ai/liveConfig';
import { getSharedAudioContext } from '../lib/sharedAudioContext';
import { DEFAULT_PLAYBACK_RATE, expectedPlayhead, videoFromResult } from '../lib/watchPartyUtils';
import { toast } from 'sonner';

interface WatchPartyPlayerProps {
  videoSyncState: VideoSyncState;
  broadcastVideoState: (state: VideoSyncState) => void;
  patchVideoState: (patch: Partial<VideoSyncState>) => void;
  addToQueue: (video: WatchPartyVideo, playNow?: boolean) => void;
  removeFromQueue: (videoId: string) => void;
  playQueueIndex: (index: number) => void;
  playNextInQueue: () => void;
  playPreviousInQueue: () => void;
  clearQueue: () => void;
  onClose: () => void;
  onAudioStreamChange?: (stream: MediaStream | null) => void;
  onStartTranslate?: (langCode: string, expectVideoAudio?: boolean) => void;
  onStopTranslate?: () => void;
  isTranslateActive?: boolean;
  translateTargetLanguage?: string;
  translateState?: string;
  translateOutputLiveText?: string;
  localSocketId?: string | null;
}

interface VideoResult {
  id: string;
  source: 'youtube' | 'dailymotion';
  title: string;
  thumbnail: string;
  duration: string;
  author: string;
  url: string;
}

type FilterSource = 'all' | 'youtube' | 'dailymotion';

const SOURCE_META: Record<string, { label: string; color: string; dot: string }> = {
  youtube:    { label: 'YouTube',    color: 'text-red-400',    dot: 'bg-red-500' },
  dailymotion:{ label: 'DailyMotion',color: 'text-orange-400', dot: 'bg-orange-500' },
};

const PLATFORMS = [
  { label: 'Vimeo',       color: '#1ab7ea' },
  { label: 'Twitch',      color: '#9146ff' },
  { label: 'Facebook',    color: '#4267b2' },
  { label: 'Streamable',  color: '#fff' },
  { label: 'MP4 / HLS',   color: '#05C77E' },
];

export const WatchPartyPlayer: React.FC<WatchPartyPlayerProps> = ({
  videoSyncState,
  patchVideoState,
  addToQueue,
  removeFromQueue,
  playQueueIndex,
  playNextInQueue,
  playPreviousInQueue,
  clearQueue,
  onClose,
  onAudioStreamChange,
  onStartTranslate,
  onStopTranslate,
  isTranslateActive,
  translateTargetLanguage = 'km',
  translateState = 'disconnected',
  translateOutputLiveText = '',
  localSocketId = null,
}) => {
  const [inPlayerDubLang, setInPlayerDubLang] = useState(translateTargetLanguage);
  const [selectedVideoForModal, setSelectedVideoForModal] = useState<VideoResult | null>(null);
  const [dubLanguage, setDubLanguage] = useState('km');
  const playerRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allResults, setAllResults] = useState<VideoResult[]>([]);
  const [sources, setSources] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<FilterSource>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(!videoSyncState.url);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [localVolume, setLocalVolume] = useState(1);
  const [isVolumeMuted, setIsVolumeMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const seekingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlayedRef = useRef(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAudioSeekRef = useRef(0);
  const pendingDubLangRef = useRef<string | null>(null);
  const proxyVideoKeyRef = useRef<string | null>(null);
  const youtubePlayerRef = useRef<any>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const captureDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const localVolumeNodeRef = useRef<GainNode | null>(null);

  const isYoutube = Boolean(
    videoSyncState.url &&
      (videoSyncState.url.includes('youtube.com') || videoSyncState.url.includes('youtu.be'))
  );

  // Proxy audio is only needed for YouTube live-translate capture (iframe audio is not capturable).
  const useYoutubeProxy = isYoutube && Boolean(isTranslateActive);

  const isHost = !videoSyncState.hostSocketId || videoSyncState.hostSocketId === localSocketId;
  const canControl = isHost || !localSocketId;

  const buildProxyAudioUrl = useCallback((startSeconds: number) => {
    if (!videoSyncState.url) return '';
    return apiUrl(
      `/api/calls/youtube-audio?url=${encodeURIComponent(videoSyncState.url)}&t=${Math.max(0, Math.floor(startSeconds))}`,
    );
  }, [videoSyncState.url]);

  const reloadYoutubeProxy = useCallback((startSeconds: number, force = false) => {
    const audioEl = audioRef.current;
    if (!audioEl || !useYoutubeProxy || !videoSyncState.url) return;

    const startAt = Math.max(0, Math.floor(startSeconds));
    if (!force && Math.abs(startAt - lastAudioSeekRef.current) < 3 && audioEl.src) return;

    lastAudioSeekRef.current = startAt;
    audioEl.src = buildProxyAudioUrl(startAt);
    audioEl.load();
    if (videoSyncState.playing) {
      audioEl.play().catch((err) => {
        console.warn('[WatchPartyPlayer] proxy audio play failed:', err);
      });
    }
  }, [useYoutubeProxy, videoSyncState.url, videoSyncState.playing, buildProxyAudioUrl]);

  // Start proxy once when dubbing begins or video changes — do NOT restart on sync heartbeats
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !useYoutubeProxy || !videoSyncState.url) {
      if (audioEl && !useYoutubeProxy) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        proxyVideoKeyRef.current = null;
      }
      if (!useYoutubeProxy) onAudioStreamChange?.(null);
      return;
    }

    const key = videoSyncState.url;
    if (proxyVideoKeyRef.current === key && audioEl.src) return;

    proxyVideoKeyRef.current = key;
    reloadYoutubeProxy(videoSyncState.playedSeconds ?? 0, true);
  }, [useYoutubeProxy, videoSyncState.url, videoSyncState.playedSeconds, reloadYoutubeProxy, onAudioStreamChange]);

  // YouTube iframe volume (normal playback — sound comes from the embed, not the proxy)
  useEffect(() => {
    const yt = youtubePlayerRef.current;
    if (!yt || typeof yt.setVolume !== 'function') return;
    if (isTranslateActive) {
      yt.setVolume(0);
    } else {
      yt.setVolume(isVolumeMuted ? 0 : Math.round(localVolume * 100));
    }
  }, [isTranslateActive, isVolumeMuted, localVolume, isPlaying]);

  // Web Audio capture from proxy — feeds Live Translate when dubbing YouTube
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!useYoutubeProxy || !audioEl) {
      if (!useYoutubeProxy) onAudioStreamChange?.(null);
      return;
    }

    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = getSharedAudioContext();
      audioContextRef.current = ctx;
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    let disconnected = false;

    const attachCapture = () => {
      if (disconnected) return;

      let source = audioSourceNodeRef.current;
      if (!source) {
        try {
          source = ctx!.createMediaElementSource(audioEl);
          audioSourceNodeRef.current = source;
        } catch (err) {
          console.warn('[WatchPartyPlayer] createMediaElementSource error:', err);
          return;
        }
      }

      if (captureDestinationRef.current) {
        onAudioStreamChange?.(captureDestinationRef.current.stream);
        return;
      }

      try {
        const destination = ctx!.createMediaStreamDestination();
        source.connect(destination);
        const volumeNode = ctx!.createGain();
        volumeNode.gain.value = 0;
        source.connect(volumeNode);
        volumeNode.connect(ctx!.destination);
        captureDestinationRef.current = destination;
        localVolumeNodeRef.current = volumeNode;
        onAudioStreamChange?.(destination.stream);
      } catch (err) {
        console.warn('[WatchPartyPlayer] audio capture graph error:', err);
      }
    };

    audioEl.addEventListener('playing', attachCapture);
    audioEl.addEventListener('loadeddata', attachCapture);
    if (audioEl.readyState >= 2) attachCapture();

    return () => {
      disconnected = true;
      audioEl.removeEventListener('playing', attachCapture);
      audioEl.removeEventListener('loadeddata', attachCapture);
      onAudioStreamChange?.(null);
      captureDestinationRef.current = null;
      audioSourceNodeRef.current = null;
      localVolumeNodeRef.current = null;
    };
  }, [onAudioStreamChange, useYoutubeProxy]);

  // Ducking handled via YouTube setVolume(0) when translate is active
  useEffect(() => {
    if (localVolumeNodeRef.current) {
      localVolumeNodeRef.current.gain.value = 0;
    }
  }, [isTranslateActive]);

  useEffect(() => {
    setIsPlaying(videoSyncState.playing);
    const audioEl = audioRef.current;
    const expectedTime = expectedPlayhead(videoSyncState);
    const rate = videoSyncState.playbackRate ?? DEFAULT_PLAYBACK_RATE;

    if (playerRef.current && !seekingRef.current) {
      const cur = typeof playerRef.current.getCurrentTime === 'function'
        ? playerRef.current.getCurrentTime() : 0;

      if (Math.abs(cur - expectedTime) > 1.5) {
        if (typeof playerRef.current.seekTo === 'function') {
          playerRef.current.seekTo(expectedTime, 'seconds');
          lastPlayedRef.current = expectedTime;
        }
      }
    }

    if (audioEl && useYoutubeProxy) {
      audioEl.playbackRate = rate;
      const audioDrift = Math.abs(audioEl.currentTime - expectedTime);
      if (audioDrift > 4) {
        reloadYoutubeProxy(expectedTime, true);
      } else if (audioDrift > 0.75 && videoSyncState.playing) {
        audioEl.currentTime = expectedTime;
      }
      if (videoSyncState.playing) {
        audioEl.play().catch(() => {});
      } else {
        audioEl.pause();
      }
    }

  }, [videoSyncState.playing, videoSyncState.playbackRate, videoSyncState.playedSeconds, videoSyncState.timestamp, useYoutubeProxy, reloadYoutubeProxy]);

  // Host-only heartbeat — keeps remote peers aligned without multi-client fights
  useEffect(() => {
    if (syncHeartbeatRef.current) clearInterval(syncHeartbeatRef.current);
    if (!videoSyncState.playing || !videoSyncState.url || !canControl) return;

    syncHeartbeatRef.current = setInterval(() => {
      const t = typeof playerRef.current?.getCurrentTime === 'function'
        ? playerRef.current.getCurrentTime() : videoSyncState.playedSeconds;
      patchVideoState({ playedSeconds: t });
    }, 8000);

    return () => {
      if (syncHeartbeatRef.current) clearInterval(syncHeartbeatRef.current);
    };
  }, [videoSyncState.playing, videoSyncState.url, canControl, patchVideoState]);

  useEffect(() => {
    if (videoSyncState.url) setShowSearch(false);
  }, [videoSyncState.url]);

  const handlePlay = () => {
    if (!canControl) {
      toast('Only the host can control playback');
      return;
    }
    setIsPlaying(true);
    const t = typeof playerRef.current?.getCurrentTime === 'function' ? playerRef.current.getCurrentTime() : videoSyncState.playedSeconds;
    patchVideoState({ playing: true, playedSeconds: t });
  };

  const handlePause = () => {
    if (!canControl) {
      toast('Only the host can control playback');
      return;
    }
    setIsPlaying(false);
    const t = typeof playerRef.current?.getCurrentTime === 'function' ? playerRef.current.getCurrentTime() : videoSyncState.playedSeconds;
    patchVideoState({ playing: false, playedSeconds: t });
  };

  const syncPlayhead = useCallback((seconds: number) => {
    patchVideoState({ playedSeconds: seconds });
  }, [patchVideoState]);

  /** User-initiated seek (scrub bar, keyboard) — reload dub proxy only here. */
  const handleSeek = (seconds: number) => {
    if (!canControl) return;
    seekingRef.current = false;
    syncPlayhead(seconds);
    if (useYoutubeProxy) {
      reloadYoutubeProxy(seconds, true);
    }
  };

  const handleToggleDub = () => {
    if (!isYoutube) {
      toast('Live dub is available for YouTube videos');
      return;
    }
    getSharedAudioContext().resume().catch(() => {});
    if (isTranslateActive) {
      onStopTranslate?.();
      toast('Dubbing off');
    } else {
      onStartTranslate?.(inPlayerDubLang, true);
    }
  };

  const handleVideoEnded = () => {
    if (!canControl) return;
    playNextInQueue();
  };

  useEffect(() => {
    if (isTranslateActive) setInPlayerDubLang(translateTargetLanguage);
  }, [isTranslateActive, translateTargetLanguage]);

  const guardControl = useCallback((action: () => void) => {
    if (!canControl) {
      toast('Only the host can control playback');
      return;
    }
    action();
  }, [canControl]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!videoSyncState.url || showSearch) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (isPlaying) handlePause();
          else handlePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSeek(Math.max(0, expectedPlayhead(videoSyncState) - 10));
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeek(expectedPlayhead(videoSyncState) + 10);
          break;
        case 'KeyN':
          if (e.shiftKey) { e.preventDefault(); guardControl(playNextInQueue); }
          break;
        case 'KeyP':
          if (e.shiftKey) { e.preventDefault(); guardControl(playPreviousInQueue); }
          break;
        case 'KeyM':
          e.preventDefault();
          setIsVolumeMuted((v) => !v);
          break;
        case 'KeyQ':
          e.preventDefault();
          setQueueOpen((v) => !v);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [videoSyncState, isPlaying, showSearch, playNextInQueue, playPreviousInQueue, handlePlay, handlePause, handleSeek, guardControl]);

  const startVideo = (video: WatchPartyVideo, langCode: string | null) => {
    if (!canControl) {
      toast('Only the host can start videos');
      return;
    }
    addToQueue(video, true);
    setShowSearch(false);
    setSearchQuery('');
    setAllResults([]);
    setSelectedVideoForModal(null);
    if (langCode) {
      pendingDubLangRef.current = langCode;
    } else {
      pendingDubLangRef.current = null;
      onStopTranslate?.();
    }
  };

  // Start dub once the video URL is in state (after addToQueue) — keeps user-gesture AudioContext unlock from Play Dubbed click
  useEffect(() => {
    const lang = pendingDubLangRef.current;
    if (!lang || !videoSyncState.url || !isYoutube) return;
    pendingDubLangRef.current = null;
    getSharedAudioContext().resume().catch(() => {});
    onStartTranslate?.(lang, true);
  }, [videoSyncState.url, isYoutube, onStartTranslate]);

  const doSearch = useCallback(async (q: string, isDefault = false) => {
    if (!q.trim() && !isDefault) { setAllResults([]); setSources({}); return; }
    const queryToUse = isDefault ? 'top trending movie trailers 2026 official' : q;
    setIsSearching(true);
    setFilter('all');
    try {
      const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(queryToUse)}`));
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      if (data.videos) setAllResults(data.videos);
      if (data.sources) setSources(data.sources);
    } catch {
      toast.error('Video search failed — check your connection');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!val.trim()) doSearch('', true);
      else doSearch(val);
    }, 500);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) doSearch('', true);
    else doSearch(searchQuery);
  };

  const handleSelectVideo = (video: VideoResult) => {
    setSelectedVideoForModal(video);
  };

  const handlePlayWithTranslation = (video: VideoResult, langCode: string | null) => {
    if (langCode) {
      getSharedAudioContext().resume().catch(() => {});
    }
    startVideo(videoFromResult(video), langCode);
  };

  const handleAddToQueue = (video: VideoResult, e?: React.MouseEvent) => {
    e?.stopPropagation();
    addToQueue(videoFromResult(video), false);
  };

  const handlePlayQueueIndex = (index: number) => guardControl(() => playQueueIndex(index));
  const handleRemoveFromQueue = (videoId: string) => guardControl(() => removeFromQueue(videoId));
  const handleClearQueue = () => guardControl(clearQueue);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canControl) {
      toast('Only the host can start videos');
      return;
    }
    setUrlError('');
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try { new URL(trimmed); } catch { setUrlError('Invalid URL'); return; }
    if (!ReactPlayer.canPlay(trimmed)) {
      setUrlError('Unsupported. Try Vimeo, Twitch, Facebook, Streamable or a .mp4 link.');
      return;
    }
    addToQueue({
      id: `url-${Date.now()}`,
      url: trimmed,
      title: 'Custom link',
      source: 'url',
    }, true);
    setShowSearch(false);
    setUrlInput('');
    setShowUrlInput(false);
  };

  const handleReset = () => {
    setShowSearch(true);
    setShowUrlInput(false);
    setSearchQuery('');
    setUrlInput('');
    setUrlError('');
    setFilter('all');
    doSearch('', true);
  };

  useEffect(() => {
    if (showSearch && allResults.length === 0 && !searchQuery) {
      doSearch('', true);
    }
  }, [showSearch, doSearch]);

  const filteredResults = filter === 'all'
    ? allResults
    : allResults.filter(v => v.source === filter);

  const isPlayerVisible = !showSearch && !!videoSyncState.url;
  const hasResults = allResults.length > 0 && !isSearching;

  // Parse DailyMotion specifically because react-player's DM integration is broken
  const isDailyMotion = videoSyncState.url?.includes('dailymotion.com');
  const dmVideoId = isDailyMotion ? videoSyncState.url?.split('/video/')[1]?.split('?')[0] : null;

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-900 px-3 sm:h-11 sm:px-4">
        <div className="min-w-0 flex-1">
          {isPlayerVisible && videoSyncState.title && (
            <p className="truncate text-[11px] font-semibold text-zinc-300 sm:text-xs">
              {videoSyncState.title}
            </p>
          )}
          {isPlayerVisible && (
            <p className="text-[9px] text-zinc-600">
              {canControl ? 'You control playback' : 'Following host'}
              {' · '}Space play · ←/→ seek · Q queue
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isPlayerVisible && isYoutube && (
            <>
              <div className="hidden items-center gap-1 sm:flex">
                {isTranslateActive ? (
                  <Button variant="ghost" size="sm" onClick={handleToggleDub}
                    className="h-6 gap-1 px-2 text-[10px] text-brand-cyan hover:bg-brand-cyan/10">
                    <Languages className="size-3" />
                    Dub → {getLanguageLabel(translateTargetLanguage)}
                    {translateState === 'connecting' && ' …'}
                  </Button>
                ) : (
                  <>
                    <select
                      value={inPlayerDubLang}
                      onChange={(e) => setInPlayerDubLang(e.target.value)}
                      className="h-6 max-w-[88px] rounded-md border border-zinc-800 bg-zinc-900 px-1 text-[10px] text-zinc-300"
                    >
                      {LIVE_TRANSLATE_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                    <Button variant="ghost" size="sm" onClick={handleToggleDub}
                      className="h-6 gap-1 px-2 text-[10px] text-zinc-300 hover:text-brand-cyan">
                      <Mic2 className="size-3" /> Dub
                    </Button>
                  </>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleToggleDub}
                className={`h-6 gap-1 px-2 text-[10px] sm:hidden ${isTranslateActive ? 'text-brand-cyan' : 'text-zinc-400'}`}>
                <Languages className="size-3" />
                {isTranslateActive ? getLanguageLabel(translateTargetLanguage) : 'Dub'}
              </Button>
            </>
          )}
          {isPlayerVisible && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setQueueOpen((v) => !v)}
                className={`h-6 px-2 text-[10px] gap-1 ${queueOpen ? 'text-brand-orange' : 'text-zinc-400 hover:text-white'}`}>
                Queue {(videoSyncState.queue?.length ?? 0) > 0 && `(${videoSyncState.queue!.length})`}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReset}
                className="h-6 px-2 text-[10px] text-zinc-400 hover:text-brand-cyan hover:bg-brand-cyan/10 gap-1">
                <RotateCcw className="size-3" /> Change
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose}
            className="size-6 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Search bar ── */}
      {(showSearch || !videoSyncState.url) && (
        <div className="shrink-0 border-b border-zinc-900">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center px-3 py-2 sm:px-4 sm:py-3">
            <div className="absolute left-6 flex items-center pointer-events-none sm:left-7">
              {isSearching
                ? <Loader2 className="size-3.5 text-brand-cyan animate-spin" />
                : <Search className="size-3.5 text-zinc-500" />}
            </div>
            <Input autoFocus type="text"
              placeholder="Search YouTube..."
              value={searchQuery}
              onChange={handleQueryChange}
              className="h-9 w-full rounded-lg border-zinc-800 bg-zinc-900 pl-9 pr-8 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-brand-cyan/50 focus-visible:ring-brand-cyan/40"
            />
            {searchQuery && (
              <button type="button" title="Clear search"
                onClick={() => { setSearchQuery(''); doSearch('', true); }}
                className="absolute right-6 text-zinc-500 transition-colors hover:text-zinc-300 sm:right-7">
                <X className="size-3.5" />
              </button>
            )}
          </form>

          {/* Source filter tabs — shown only when results exist */}
          {hasResults && (
            <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2 scrollbar-none sm:gap-0.5 sm:px-4">
              {(['all', 'youtube', ...(sources.dailymotion ? (['dailymotion'] as FilterSource[]) : [])] as FilterSource[]).map(src => {
                const meta = src === 'all' ? null : SOURCE_META[src];
                const count = src === 'all' ? allResults.length : (sources[src] ?? 0);
                return (
                  <Button key={src}
                    onClick={() => setFilter(src)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                      filter === src
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                    }`}>
                    {meta && <span className={`size-1.5 rounded-full ${meta.dot}`} />}
                    {src === 'all' ? 'All' : meta!.label}
                    <span className="text-[9px] opacity-60">{count}</span>
                  </Button>
                );
              })}
            </div>
          )}

          {/* Paste URL toggle */}
          <div className="px-3 pb-2 sm:px-4 sm:pb-3">
            <button
              type="button"
              onClick={() => setShowUrlInput((v) => !v)}
              className="flex w-full items-center gap-1.5 text-left text-[10px] text-zinc-500 transition-colors hover:text-brand-cyan"
            >
              <Link2 className="size-3 shrink-0" />
              <span className="truncate">Paste link (Vimeo, Twitch…)</span>
              <ChevronRight className={`size-3 shrink-0 transition-transform ${showUrlInput ? 'rotate-90' : ''}`} />
            </button>

            {showUrlInput && (
              <div className="mt-2 space-y-2">
                <form onSubmit={handleUrlSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
                    <Input type="url" placeholder="https://vimeo.com/..."
                      value={urlInput}
                      onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
                      className="pl-8 h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-brand-cyan/40"
                    />
                  </div>
                  <Button type="submit" disabled={!urlInput.trim()} size="sm"
                    className="h-8 px-3 bg-brand-cyan hover:bg-brand-cyan/85 text-zinc-950 font-bold text-[11px] shrink-0 disabled:opacity-40">
                    Play
                  </Button>
                </form>
                {urlError && <p className="text-[10px] text-brand-rose">{urlError}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map(p => (
                    <span key={p.label}
                      className="px-2 py-0.5 rounded-full border text-[9px] bg-zinc-900/60"
                      style={{ borderColor: `${p.color}30`, color: p.color }}>
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Content Area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Results list */}
        {showSearch && hasResults && (
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur-sm z-10 border-b border-zinc-900/50">
              <span className="text-[10px] text-zinc-500 font-medium">
                {searchQuery ? (
                  <>{filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}{filter !== 'all' && ` from ${SOURCE_META[filter].label}`}</>
                ) : (
                  <span className="text-brand-cyan uppercase tracking-wider font-bold text-[9px]">🔥 Trending Now</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {Object.entries(sources).map(([src, count]) => (
                  <span key={src} className="flex items-center gap-1 text-[9px] text-zinc-600">
                    <span className={`size-1.5 rounded-full ${SOURCE_META[src]?.dot}`} />
                    {count}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 md:grid-cols-3 lg:grid-cols-4">
              {filteredResults.map((video) => {
                const meta = SOURCE_META[video.source];
                const cardId = `${video.source}-${video.id}`;
                return (
                  <div
                    key={cardId}
                    onMouseEnter={() => setHoveredId(cardId)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="relative flex w-full flex-col gap-2.5 rounded-2xl border border-transparent p-2 text-left transition-all duration-300 hover:border-white/10 hover:bg-zinc-900/40 hover:shadow-[0_8px_32px_rgba(34,211,238,0.05)]"
                  >
                    <button type="button" onClick={() => handleSelectVideo(video)} className="flex flex-col gap-2.5 text-left focus:outline-none">
                      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-800">
                        <img src={video.thumbnail} alt={video.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        {video.duration && (
                          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white">
                            <Clock className="size-2.5 opacity-70" />{video.duration}
                          </span>
                        )}
                        <span className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-black/80 ${meta.color}`}>
                          {video.source === 'youtube' ? 'YouTube' : 'DailyMotion'}
                        </span>
                        <div className={`absolute inset-0 flex items-center justify-center bg-brand-cyan/20 transition-opacity duration-200 ${hoveredId === cardId ? 'opacity-100' : 'opacity-0'}`}>
                          <PlayCircle className="size-12 text-brand-cyan drop-shadow-xl" strokeWidth={1.5} />
                        </div>
                      </div>
                      <div className="flex w-full flex-col px-1">
                        <p className="mb-1.5 line-clamp-2 text-[13px] font-semibold leading-tight text-zinc-100">
                          {video.title}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
                          <p className="truncate text-[11px] font-medium text-zinc-400">{video.author}</p>
                        </div>
                      </div>
                    </button>
                    <div className="flex gap-1.5 px-1">
                      <Button type="button" size="sm" onClick={() => handlePlayWithTranslation(video, null)}
                        className="h-7 flex-1 gap-1 bg-brand-cyan text-[10px] font-bold text-zinc-950 hover:bg-brand-cyan/85">
                        <Play className="size-3" /> Play
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={(e) => handleAddToQueue(video, e)}
                        className="h-7 gap-1 border-zinc-700 text-[10px] text-zinc-300 hover:bg-zinc-800">
                        <ListPlus className="size-3" /> Queue
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Skeleton */}
        {isSearching && (
          <div className="absolute inset-0 overflow-y-auto">
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 md:grid-cols-3 lg:grid-cols-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="flex flex-col gap-2.5 p-2">
                  <div className="w-full aspect-video rounded-lg bg-zinc-800/80 animate-pulse" />
                  <div className="flex flex-col px-1 space-y-2 mt-1">
                    <div className="h-3.5 bg-zinc-800 rounded w-[90%] animate-pulse" />
                    <div className="h-3.5 bg-zinc-800 rounded w-[60%] animate-pulse" />
                    <div className="h-2.5 bg-zinc-800/50 rounded w-1/3 mt-2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player */}
        {isPlayerVisible && (
          <div
            className="absolute inset-0 bg-black shadow-2xl"
            onMouseMove={revealControls}
            onClick={revealControls}
          >
            {isDailyMotion && dmVideoId ? (
              <DailyMotionSyncPlayer
                ref={playerRef}
                videoId={dmVideoId}
                playing={isPlaying}
                playbackRate={videoSyncState.playbackRate ?? DEFAULT_PLAYBACK_RATE}
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handleVideoEnded}
                onDuration={setDuration}
                onProgress={(state) => {
                  lastPlayedRef.current = state.playedSeconds;
                }}
              />
            ) : (
              <ReactPlayer
                ref={playerRef}
                url={videoSyncState.url!}
                playing={isPlaying}
                controls={false}
                muted={isYoutube ? isTranslateActive : false}
                volume={isYoutube ? undefined : isVolumeMuted ? 0 : localVolume}
                playbackRate={videoSyncState.playbackRate ?? DEFAULT_PLAYBACK_RATE}
                width="100%"
                height="100%"
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handleVideoEnded}
                onDuration={setDuration}
                onProgress={(state: { playedSeconds: number }) => {
                  lastPlayedRef.current = state.playedSeconds;
                }}
                onReady={() => {
                  const internal = playerRef.current?.getInternalPlayer?.();
                  if (internal && typeof internal.setVolume === 'function') {
                    youtubePlayerRef.current = internal;
                  }
                }}
                config={{
                  youtube: { playerVars: { disablekb: 1, controls: 0, enablejsapi: 1 } },
                  dailymotion: { params: { api: 1, 'endscreen-enable': false, origin: window.location.origin } },
                }}
              />
            )}
            <audio ref={audioRef} crossOrigin="anonymous" playsInline preload="auto" style={{ display: 'none' }} />

            {isTranslateActive && translateOutputLiveText && (
              <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 px-4 sm:bottom-28">
                <p className="mx-auto max-w-2xl truncate rounded-lg bg-black/75 px-3 py-1.5 text-center text-[11px] text-brand-cyan backdrop-blur-sm sm:text-xs">
                  {translateOutputLiveText}
                </p>
              </div>
            )}

            <WatchPartyControls
              videoSyncState={videoSyncState}
              isPlaying={isPlaying}
              duration={duration}
              localVolume={localVolume}
              isMuted={isVolumeMuted}
              showControls={showControls}
              onTogglePlay={() => (isPlaying ? handlePause() : handlePlay())}
              onSeek={handleSeek}
              onPrevious={() => guardControl(playPreviousInQueue)}
              onNext={() => guardControl(playNextInQueue)}
              onVolumeChange={(v) => { setLocalVolume(v); setIsVolumeMuted(v === 0); }}
              onToggleMute={() => setIsVolumeMuted((v) => !v)}
              onPlaybackRateChange={(rate) => canControl && patchVideoState({ playbackRate: rate })}
              onToggleLoop={() => canControl && patchVideoState({ loopQueue: !videoSyncState.loopQueue })}
              onToggleShuffle={() => canControl && patchVideoState({ shuffle: !videoSyncState.shuffle })}
              onToggleQueue={() => setQueueOpen((v) => !v)}
              queueOpen={queueOpen}
            />

            {queueOpen && (
              <WatchPartyQueue
                videoSyncState={videoSyncState}
                canControl={canControl}
                onPlayIndex={handlePlayQueueIndex}
                onRemove={handleRemoveFromQueue}
                onClear={handleClearQueue}
                onClose={() => setQueueOpen(false)}
              />
            )}
          </div>
        )}

        {/* Empty state is no longer needed since default search runs on mount */}

        {/* No results */}
        {showSearch && !isSearching && allResults.length === 0 && searchQuery.length > 2 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-8">
            <Search className="size-8 text-zinc-700" />
            <p className="text-xs text-zinc-500">No results for <span className="text-zinc-300 font-medium">"{searchQuery}"</span></p>
          </div>
        )}
      </div>

      {/* Watch Options (Dubbed Translate) Modal */}
      <Dialog open={!!selectedVideoForModal} onOpenChange={(open) => !open && setSelectedVideoForModal(null)}>
        <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-200 sm:max-w-md rounded-2xl shadow-2xl p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-brand-cyan">Watch Options</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">Choose how you want to play this video.</DialogDescription>
          </DialogHeader>
          
          {selectedVideoForModal && (
            <div className="flex flex-col gap-5 mt-2">
              <div className="flex gap-3 bg-zinc-900/60 p-3 rounded-xl border border-white/5">
                <img src={selectedVideoForModal.thumbnail} className="w-24 aspect-video object-cover rounded-lg shrink-0 border border-white/5" />
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h4 className="text-[13px] font-semibold text-zinc-200 line-clamp-2 leading-tight mb-1">{selectedVideoForModal.title}</h4>
                  <p className="text-[11px] font-medium text-zinc-500 truncate">{selectedVideoForModal.author}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handlePlayWithTranslation(selectedVideoForModal, null)}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 active:scale-95"
                >
                  <Play className="size-4" /> Play Now
                </button>
                <button
                  onClick={() => {
                    handleAddToQueue(selectedVideoForModal);
                    setSelectedVideoForModal(null);
                  }}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 active:scale-95"
                >
                  <ListPlus className="size-4" /> Add to Queue
                </button>

                <div className="flex items-center my-1">
                  <div className="flex-1 h-px bg-zinc-900" />
                  <span className="px-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Or</span>
                  <div className="flex-1 h-px bg-zinc-900" />
                </div>

                {/* Play Dubbed */}
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Live Translate Language (Dubbed)</label>
                  <div className="flex gap-2">
                    <select
                      value={dubLanguage}
                      onChange={(e) => setDubLanguage(e.target.value)}
                      className="flex-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-3 h-11 text-xs text-zinc-200 focus:outline-none focus:border-brand-cyan/50 focus:ring-1 focus:ring-brand-cyan/35 cursor-pointer transition-colors"
                    >
                      {LIVE_TRANSLATE_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                    
                    <button
                      onClick={() => handlePlayWithTranslation(selectedVideoForModal, dubLanguage)}
                      className="h-11 px-4 bg-brand-cyan hover:bg-brand-cyan/85 text-zinc-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-all active:scale-95 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                    >
                      Play Dubbed
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
