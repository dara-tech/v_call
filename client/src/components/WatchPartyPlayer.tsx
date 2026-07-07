import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactPlayerImport from 'react-player';
import { DailyMotionSyncPlayer } from './DailyMotionSyncPlayer';

const ReactPlayer = (ReactPlayerImport as any).default || ReactPlayerImport;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Search, RotateCcw, Loader2, Clock, PlayCircle, Link2, ChevronRight } from 'lucide-react';
import type { VideoSyncState } from '../hooks/useWebRTC';
import { apiUrl } from '../lib/serverConfig';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LIVE_TRANSLATE_LANGUAGES } from '../lib/ai/liveConfig';
import { getSharedAudioContext } from '../lib/sharedAudioContext';

interface WatchPartyPlayerProps {
  videoSyncState: VideoSyncState;
  broadcastVideoState: (state: VideoSyncState) => void;
  onClose: () => void;
  onAudioStreamChange?: (stream: MediaStream | null) => void;
  onStartTranslate?: (langCode: string) => void;
  onStopTranslate?: () => void;
  isTranslateActive?: boolean;
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
  broadcastVideoState,
  onClose,
  onAudioStreamChange,
  onStartTranslate,
  onStopTranslate,
  isTranslateActive,
}) => {
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
  const seekingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlayedRef = useRef(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const localVolumeNodeRef = useRef<GainNode | null>(null);

  const isYoutube = Boolean(
    videoSyncState.url &&
      (videoSyncState.url.includes('youtube.com') || videoSyncState.url.includes('youtu.be'))
  );

  const proxyAudioUrl = isYoutube
    ? apiUrl(`/api/calls/youtube-audio?url=${encodeURIComponent(videoSyncState.url!)}`)
    : '';

  // Handle source changes on the audio element without unmounting it
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    if (isYoutube && proxyAudioUrl) {
      audioEl.src = proxyAudioUrl;
      audioEl.load();
    } else {
      audioEl.src = '';
    }
  }, [proxyAudioUrl, isYoutube]);

  // Set up Web Audio API capture on the persistent audio element
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) {
      onAudioStreamChange?.(null);
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

    let source = audioSourceNodeRef.current;
    if (!source) {
      try {
        source = ctx.createMediaElementSource(audioEl);
        audioSourceNodeRef.current = source;
      } catch (err) {
        console.warn('[WatchPartyPlayer] createMediaElementSource error:', err);
      }
    }

    if (source) {
      const destination = ctx.createMediaStreamDestination();
      source.connect(destination);

      // Create a gain node for local speaker output to support background audio ducking
      const volumeNode = ctx.createGain();
      volumeNode.gain.value = isTranslateActive ? 0.0 : 1.0;
      source.connect(volumeNode);
      volumeNode.connect(ctx.destination);
      localVolumeNodeRef.current = volumeNode;

      const stream = destination.stream;
      onAudioStreamChange?.(stream);

      return () => {
        try {
          source.disconnect(destination);
          source.disconnect(volumeNode);
          volumeNode.disconnect(ctx!.destination);
        } catch (e) {}
        localVolumeNodeRef.current = null;
        onAudioStreamChange?.(null);
      };
    }
  }, [onAudioStreamChange, isTranslateActive]);

  // Dynamically duck original audio when live translate is active
  useEffect(() => {
    if (localVolumeNodeRef.current) {
      localVolumeNodeRef.current.gain.value = isTranslateActive ? 0.0 : 1.0;
    }
  }, [isTranslateActive]);

  useEffect(() => {
    setIsPlaying(videoSyncState.playing);
    const audioEl = audioRef.current;

    const expectedTime = videoSyncState.playing
      ? videoSyncState.playedSeconds + (Date.now() - videoSyncState.timestamp) / 1000
      : videoSyncState.playedSeconds;

    if (playerRef.current && !seekingRef.current) {
      const cur = typeof playerRef.current.getCurrentTime === 'function'
        ? playerRef.current.getCurrentTime() : 0;

      if (Math.abs(cur - expectedTime) > 2) {
        if (typeof playerRef.current.seekTo === 'function') {
          playerRef.current.seekTo(expectedTime, 'seconds');
          lastPlayedRef.current = expectedTime;
        }
      }
    }

    if (audioEl) {
      if (videoSyncState.playing) {
        audioEl.play().catch(() => {});
      } else {
        audioEl.pause();
      }
      if (Math.abs(audioEl.currentTime - expectedTime) > 2) {
        audioEl.currentTime = expectedTime;
      }
    }
  }, [videoSyncState, isYoutube]);

  useEffect(() => {
    if (videoSyncState.url) setShowSearch(false);
  }, [videoSyncState.url]);

  const handlePlay = () => {
    setIsPlaying(true);
    const t = typeof playerRef.current?.getCurrentTime === 'function' ? playerRef.current.getCurrentTime() : 0;
    broadcastVideoState({ ...videoSyncState, playing: true, playedSeconds: t, timestamp: Date.now() });
  };

  const handlePause = () => {
    setIsPlaying(false);
    const t = typeof playerRef.current?.getCurrentTime === 'function' ? playerRef.current.getCurrentTime() : 0;
    broadcastVideoState({ ...videoSyncState, playing: false, playedSeconds: t, timestamp: Date.now() });
  };

  const handleSeek = (seconds: number) => {
    seekingRef.current = false;
    broadcastVideoState({ ...videoSyncState, playedSeconds: seconds, timestamp: Date.now() });
  };

  const doSearch = useCallback(async (q: string, isDefault = false) => {
    if (!q.trim() && !isDefault) { setAllResults([]); setSources({}); return; }
    const queryToUse = isDefault ? 'top trending movie trailers 2026 official' : q;
    setIsSearching(true);
    setFilter('all');
    try {
      const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(queryToUse)}`));
      const data = await res.json();
      if (data.videos) setAllResults(data.videos);
      if (data.sources) setSources(data.sources);
    } catch (e) {
      console.error('Search failed:', e);
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
    broadcastVideoState({ url: video.url, playing: true, playedSeconds: 0, timestamp: Date.now() });
    setShowSearch(false);
    setSearchQuery('');
    setAllResults([]);
    setSelectedVideoForModal(null);

    if (langCode) {
      onStartTranslate?.(langCode);
    } else {
      onStopTranslate?.();
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError('');
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try { new URL(trimmed); } catch { setUrlError('Invalid URL'); return; }
    if (!ReactPlayer.canPlay(trimmed)) {
      setUrlError('Unsupported. Try Vimeo, Twitch, Facebook, Streamable or a .mp4 link.');
      return;
    }
    broadcastVideoState({ url: trimmed, playing: true, playedSeconds: 0, timestamp: Date.now() });
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
      <div className="flex h-10 shrink-0 items-center justify-end border-b border-zinc-900 px-3 sm:h-11 sm:px-4">
        <div className="flex items-center gap-1.5">
          {isPlayerVisible && (
            <Button variant="ghost" size="sm" onClick={handleReset}
              className="h-6 px-2 text-[10px] text-zinc-400 hover:text-brand-cyan hover:bg-brand-cyan/10 gap-1">
              <RotateCcw className="size-3" /> Change
            </Button>
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
              placeholder="Search YouTube + DailyMotion..."
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
              {(['all', 'youtube', 'dailymotion'] as FilterSource[]).map(src => {
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
                return (
                  <button key={`${video.source}-${video.id}`}
                    onClick={() => handleSelectVideo(video)}
                    onMouseEnter={() => setHoveredId(`${video.source}-${video.id}`)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="relative w-full flex flex-col gap-2.5 group text-left focus:outline-none rounded-2xl p-2 bg-transparent hover:bg-zinc-900/40 border border-transparent hover:border-white/10 hover:shadow-[0_8px_32px_rgba(34,211,238,0.05)] transition-all duration-300"
                  >
                    {/* Thumbnail */}
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-zinc-800">
                      <img src={video.thumbnail} alt={video.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      {video.duration && (
                        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide text-white">
                          <Clock className="size-2.5 opacity-70" />{video.duration}
                        </span>
                      )}
                      {/* Source badge on thumbnail */}
                      <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/80 uppercase tracking-wider ${meta.color}`}>
                        {video.source === 'youtube' ? 'YouTube' : 'DailyMotion'}
                      </span>
                      <div className={`absolute inset-0 bg-brand-cyan/20 flex items-center justify-center transition-opacity duration-200 ${hoveredId === `${video.source}-${video.id}` ? 'opacity-100' : 'opacity-0'}`}>
                        <PlayCircle className="size-12 text-brand-cyan drop-shadow-xl" strokeWidth={1.5} />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex flex-col px-1 w-full">
                      <p className="text-[13px] font-semibold text-zinc-100 line-clamp-2 leading-tight group-hover:text-brand-cyan transition-colors mb-1.5">
                        {video.title}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className={`size-2 rounded-full shrink-0 ${meta.dot}`} />
                        <p className="text-[11px] font-medium text-zinc-400 truncate">{video.author}</p>
                      </div>
                    </div>
                  </button>
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
          <div className="absolute inset-0 bg-black shadow-2xl">
            {isDailyMotion && dmVideoId ? (
              <DailyMotionSyncPlayer
                ref={playerRef}
                videoId={dmVideoId}
                playing={isPlaying}
                onPlay={handlePlay}
                onPause={handlePause}
                onProgress={(state) => {
                  if (Math.abs(state.playedSeconds - lastPlayedRef.current) > 2) {
                    handleSeek(state.playedSeconds);
                  }
                  lastPlayedRef.current = state.playedSeconds;
                }}
              />
            ) : (
              <ReactPlayer
                ref={playerRef}
                url={videoSyncState.url!}
                playing={isPlaying}
                controls={true}
                muted={isYoutube}
                width="100%"
                height="100%"
                onPlay={handlePlay}
                onPause={handlePause}
                onProgress={(state: { playedSeconds: number }) => {
                  if (Math.abs(state.playedSeconds - lastPlayedRef.current) > 2) {
                    handleSeek(state.playedSeconds);
                  }
                  lastPlayedRef.current = state.playedSeconds;
                }}
                config={{ 
                  youtube: { playerVars: { disablekb: 1 } },
                  dailymotion: { params: { api: 1, 'endscreen-enable': false, origin: window.location.origin } }
                }}
              />
            )}
            <audio
              ref={audioRef}
              crossOrigin="anonymous"
              style={{ display: 'none' }}
            />
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
                {/* Play Original */}
                <button
                  onClick={() => handlePlayWithTranslation(selectedVideoForModal, null)}
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors active:scale-95"
                >
                  Play Original (No Translation)
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
