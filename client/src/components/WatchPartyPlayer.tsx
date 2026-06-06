import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactPlayerImport from 'react-player';
import { DailyMotionSyncPlayer } from './DailyMotionSyncPlayer';

const ReactPlayer = (ReactPlayerImport as any).default || ReactPlayerImport;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Search, RotateCcw, Loader2, Clock, PlayCircle } from 'lucide-react';
import type { VideoSyncState } from '../hooks/useWebRTC';

interface WatchPartyPlayerProps {
  videoSyncState: VideoSyncState;
  broadcastVideoState: (state: VideoSyncState) => void;
  onClose: () => void;
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



export const WatchPartyPlayer: React.FC<WatchPartyPlayerProps> = ({
  videoSyncState,
  broadcastVideoState,
  onClose,
}) => {
  const playerRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allResults, setAllResults] = useState<VideoResult[]>([]);
  const [sources, setSources] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<FilterSource>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(!videoSyncState.url);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const seekingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsPlaying(videoSyncState.playing);
    if (playerRef.current && !seekingRef.current) {
      const cur = typeof playerRef.current.getCurrentTime === 'function'
        ? playerRef.current.getCurrentTime() : 0;
      if (Math.abs(cur - videoSyncState.playedSeconds) > 2) {
        if (typeof playerRef.current.seekTo === 'function') {
          playerRef.current.seekTo(videoSyncState.playedSeconds, 'seconds');
        }
      }
    }
  }, [videoSyncState]);

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
      const BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';
      const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(queryToUse)}`);
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
    broadcastVideoState({ url: video.url, playing: true, playedSeconds: 0, timestamp: Date.now() });
    setShowSearch(false);
    setSearchQuery('');
    setAllResults([]);
  };



  const handleReset = () => {
    setShowSearch(true);
    setSearchQuery('');
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
    <div className="flex flex-col h-full w-full bg-black overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-end px-4 h-11 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          {isPlayerVisible && (
            <Button variant="ghost" size="sm" onClick={handleReset}
              className="h-6 px-2 text-[10px] text-white/50 hover:text-brand-cyan hover:bg-brand-cyan/10 gap-1">
              <RotateCcw className="size-3" /> Change
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose}
            className="size-6 text-white/40 hover:text-white hover:bg-white/10 rounded-md">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Search bar ── */}
      {(showSearch || !videoSyncState.url) && (
        <div className="shrink-0 border-b border-white/5">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center px-4 py-3">
            <div className="absolute left-7 flex items-center pointer-events-none">
              {isSearching
                ? <Loader2 className="size-3.5 text-brand-cyan animate-spin" />
                : <Search className="size-3.5 text-white/40" />}
            </div>
            <Input autoFocus type="text"
              placeholder="Search YouTube + DailyMotion..."
              value={searchQuery}
              onChange={handleQueryChange}
              className="pl-9 pr-8 h-9 text-xs bg-white/5 border-white/10 text-white/90 placeholder:text-zinc-600 focus-visible:ring-brand-cyan/40 focus-visible:border-brand-cyan/50 rounded-lg w-full"
            />
            {searchQuery && (
              <button type="button"
                onClick={() => { setSearchQuery(''); doSearch('', true); }}
                className="absolute right-7 text-white/40 hover:text-white/70 transition-colors">
                <X className="size-3.5" />
              </button>
            )}
          </form>

          {/* Source filter tabs — shown only when results exist */}
          {hasResults && (
            <div className="flex items-center gap-0.5 px-4 pb-2">
              {(['all', 'youtube', 'dailymotion'] as FilterSource[]).map(src => {
                const meta = src === 'all' ? null : SOURCE_META[src];
                const count = src === 'all' ? allResults.length : (sources[src] ?? 0);
                return (
                  <button key={src}
                    onClick={() => setFilter(src)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                      filter === src
                        ? 'bg-white/10 text-white'
                        : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                    }`}>
                    {meta && <span className={`size-1.5 rounded-full ${meta.dot}`} />}
                    {src === 'all' ? 'All' : meta!.label}
                    <span className="text-[9px] opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          )}


        </div>
      )}

      {/* ── Content Area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Results list */}
        {showSearch && hasResults && (
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-black/95 backdrop-blur-sm z-10 border-b border-white/5/50">
              <span className="text-[10px] text-white/40 font-medium">
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

            <div className="divide-y divide-white/5">
              {filteredResults.map((video) => {
                const meta = SOURCE_META[video.source];
                return (
                  <button key={`${video.source}-${video.id}`}
                    onClick={() => handleSelectVideo(video)}
                    onMouseEnter={() => setHoveredId(`${video.source}-${video.id}`)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/5/70 transition-colors group text-left focus:outline-none"
                  >
                    {/* Thumbnail */}
                    <div className="relative shrink-0 w-28 aspect-video rounded-md overflow-hidden bg-white/10">
                      <img src={video.thumbnail} alt={video.title}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
                      {video.duration && (
                        <span className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/85 px-1 py-0.5 rounded text-[8px] font-mono text-white/70">
                          <Clock className="size-1.5 opacity-60" />{video.duration}
                        </span>
                      )}
                      {/* Source badge on thumbnail */}
                      <span className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[7px] font-bold bg-black/80 uppercase tracking-wider ${meta.color}`}>
                        {video.source === 'youtube' ? 'YT' : 'DM'}
                      </span>
                      <div className={`absolute inset-0 bg-brand-cyan/15 flex items-center justify-center transition-opacity duration-150 ${hoveredId === `${video.source}-${video.id}` ? 'opacity-100' : 'opacity-0'}`}>
                        <PlayCircle className="size-7 text-brand-cyan drop-shadow-lg" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 py-0.5">
                      <p className="text-[11px] font-semibold text-white/90 line-clamp-2 leading-snug group-hover:text-brand-cyan transition-colors">
                        {video.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`size-1.5 rounded-full shrink-0 ${meta.dot}`} />
                        <p className="text-[10px] text-white/40 truncate">{video.author}</p>
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
          <div className="absolute inset-0 divide-y divide-white/5 overflow-hidden">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2.5 animate-pulse">
                <div className="shrink-0 w-28 aspect-video rounded-md bg-white/10/80" />
                <div className="flex-1 py-1 space-y-2">
                  <div className="h-2.5 bg-white/10 rounded w-full" />
                  <div className="h-2.5 bg-white/10 rounded w-4/5" />
                  <div className="h-2 bg-white/10/50 rounded w-1/3 mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Player */}
        {isPlayerVisible && (
          <div className="absolute top-0 inset-x-0 bottom-[84px] bg-black shadow-2xl">
            {isDailyMotion && dmVideoId ? (
              <DailyMotionSyncPlayer
                ref={playerRef}
                videoId={dmVideoId}
                playing={isPlaying}
                onPlay={handlePlay}
                onPause={handlePause}
                onProgress={(state) => {
                  if (Math.abs(state.playedSeconds - videoSyncState.playedSeconds) > 3) {
                    handleSeek(state.playedSeconds);
                  }
                }}
              />
            ) : (
              <ReactPlayer
                ref={playerRef}
                url={videoSyncState.url!}
                playing={isPlaying}
                controls={true}
                width="100%"
                height="100%"
                onPlay={handlePlay}
                onPause={handlePause}
                onProgress={(state: { playedSeconds: number }) => {
                  if (Math.abs(state.playedSeconds - videoSyncState.playedSeconds) > 3) {
                    handleSeek(state.playedSeconds);
                  }
                }}
                config={{ 
                  youtube: { playerVars: { disablekb: 1 } },
                  dailymotion: { params: { api: 1, 'endscreen-enable': false, origin: window.location.origin } }
                }}
              />
            )}
          </div>
        )}

        {/* Empty state is no longer needed since default search runs on mount */}

        {/* No results */}
        {showSearch && !isSearching && allResults.length === 0 && searchQuery.length > 2 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-8">
            <Search className="size-8 text-zinc-700" />
            <p className="text-xs text-white/40">No results for <span className="text-white/70 font-medium">"{searchQuery}"</span></p>
          </div>
        )}
      </div>
    </div>
  );
};
