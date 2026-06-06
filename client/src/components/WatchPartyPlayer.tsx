import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactPlayerImport from 'react-player';
const ReactPlayer = (ReactPlayerImport as any).default || ReactPlayerImport;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Popcorn, Search, RotateCcw, Loader2, Clock, PlayCircle } from 'lucide-react';
import type { VideoSyncState } from '../hooks/useWebRTC';

interface WatchPartyPlayerProps {
  videoSyncState: VideoSyncState;
  broadcastVideoState: (state: VideoSyncState) => void;
  onClose: () => void;
}

export const WatchPartyPlayer: React.FC<WatchPartyPlayerProps> = ({
  videoSyncState,
  broadcastVideoState,
  onClose,
}) => {
  const playerRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
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

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';
      const res = await fetch(`${BASE}/api/youtube/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.videos) setSearchResults(data.videos);
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Live search with 500ms debounce
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 500);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(searchQuery);
  };

  const handleSelectVideo = (video: any) => {
    broadcastVideoState({
      url: `https://www.youtube.com/watch?v=${video.id}`,
      playing: true,
      playedSeconds: 0,
      timestamp: Date.now(),
    });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const isPlayerVisible = !showSearch && !!videoSyncState.url;

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 h-11 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <Popcorn className="size-3.5 text-brand-cyan" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-300">Watch Party</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isPlayerVisible && (
            <Button variant="ghost" size="sm"
              onClick={() => { setShowSearch(true); setSearchResults([]); setSearchQuery(''); }}
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

      {/* ── Search Bar ── */}
      {(showSearch || !videoSyncState.url) && (
        <div className="shrink-0 px-4 py-3 border-b border-zinc-900">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <div className="absolute left-3 flex items-center pointer-events-none">
              {isSearching
                ? <Loader2 className="size-3.5 text-brand-cyan animate-spin" />
                : <Search className="size-3.5 text-zinc-500" />
              }
            </div>
            <Input
              autoFocus
              type="text"
              placeholder="Search for a video to watch together..."
              value={searchQuery}
              onChange={handleQueryChange}
              className="pl-9 pr-20 h-9 text-xs bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-brand-cyan/40 focus-visible:border-brand-cyan/50 rounded-lg w-full"
            />
            {searchQuery && (
              <button type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                className="absolute right-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="size-3.5" />
              </button>
            )}
          </form>
        </div>
      )}

      {/* ── Content Area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Results list */}
        {showSearch && searchResults.length > 0 && !isSearching && (
          <div className="absolute inset-0 overflow-y-auto">
            <div className="p-3 pb-1 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur-sm z-10 border-b border-zinc-900/50">
              <span className="text-[10px] text-zinc-500 font-medium">
                {searchResults.length} videos found
              </span>
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider">YouTube</span>
            </div>
            <div className="divide-y divide-zinc-900">
              {searchResults.map((video) => (
                <button
                  key={video.id}
                  onClick={() => handleSelectVideo(video)}
                  onMouseEnter={() => setHoveredId(video.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-zinc-900/70 transition-colors duration-100 group text-left focus:outline-none focus-visible:bg-zinc-900"
                >
                  {/* Thumbnail */}
                  <div className="relative shrink-0 w-28 aspect-video rounded-md overflow-hidden bg-zinc-800">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    {/* Duration */}
                    <span className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/85 px-1 py-0.5 rounded text-[8px] font-mono text-zinc-300">
                      <Clock className="size-1.5 opacity-60" />
                      {video.duration}
                    </span>
                    {/* Hover play overlay */}
                    <div className={`absolute inset-0 bg-brand-cyan/15 flex items-center justify-center transition-opacity duration-150 ${hoveredId === video.id ? 'opacity-100' : 'opacity-0'}`}>
                      <PlayCircle className="size-7 text-brand-cyan drop-shadow-lg" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-[11px] font-semibold text-zinc-200 line-clamp-2 leading-snug group-hover:text-brand-cyan transition-colors">
                      {video.title}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1 truncate">{video.author}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skeleton while searching */}
        {isSearching && (
          <div className="absolute inset-0 divide-y divide-zinc-900 overflow-hidden">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2.5 animate-pulse">
                <div className="shrink-0 w-28 aspect-video rounded-md bg-zinc-800/80" />
                <div className="flex-1 py-1 space-y-2">
                  <div className="h-2.5 bg-zinc-800 rounded w-full" />
                  <div className="h-2.5 bg-zinc-800 rounded w-4/5" />
                  <div className="h-2 bg-zinc-800/50 rounded w-1/3 mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video Player */}
        {isPlayerVisible && (
          <div className="absolute inset-0 bg-black">
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
              config={{ youtube: { playerVars: { disablekb: 1 } } }}
            />
          </div>
        )}

        {/* Empty State — no query yet */}
        {showSearch && !isSearching && searchResults.length === 0 && !searchQuery && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="relative">
              <div className="size-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Popcorn className="size-7 text-zinc-600" />
              </div>
              <div className="absolute -top-1 -right-1 size-5 rounded-full bg-brand-cyan/10 border border-brand-cyan/30 flex items-center justify-center">
                <Search className="size-2.5 text-brand-cyan" />
              </div>
            </div>
            <div className="space-y-1 max-w-[200px]">
              <p className="text-xs font-semibold text-zinc-300">Watch together</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Type a video title above — results appear instantly as you type.
              </p>
            </div>
          </div>
        )}

        {/* No results */}
        {showSearch && !isSearching && searchResults.length === 0 && searchQuery.length > 2 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-8">
            <Search className="size-8 text-zinc-700" />
            <p className="text-xs text-zinc-500">No results for <span className="text-zinc-300 font-medium">"{searchQuery}"</span></p>
            <p className="text-[10px] text-zinc-600">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
};
