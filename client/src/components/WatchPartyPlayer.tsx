import React, { useRef, useEffect, useState } from 'react';
import ReactPlayerImport from 'react-player';
const ReactPlayer = (ReactPlayerImport as any).default || ReactPlayerImport;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Popcorn, Search, RotateCcw, Loader2, Clock } from 'lucide-react';
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
  const seekingRef = useRef(false);

  useEffect(() => {
    setIsPlaying(videoSyncState.playing);
    if (playerRef.current && !seekingRef.current) {
      const currentPlayerTime =
        typeof playerRef.current.getCurrentTime === 'function'
          ? playerRef.current.getCurrentTime()
          : 0;
      if (Math.abs(currentPlayerTime - videoSyncState.playedSeconds) > 2) {
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
    const currentTime =
      typeof playerRef.current?.getCurrentTime === 'function'
        ? playerRef.current.getCurrentTime()
        : 0;
    broadcastVideoState({ ...videoSyncState, playing: true, playedSeconds: currentTime, timestamp: Date.now() });
  };

  const handlePause = () => {
    setIsPlaying(false);
    const currentTime =
      typeof playerRef.current?.getCurrentTime === 'function'
        ? playerRef.current.getCurrentTime()
        : 0;
    broadcastVideoState({ ...videoSyncState, playing: false, playedSeconds: currentTime, timestamp: Date.now() });
  };

  const handleSeek = (seconds: number) => {
    seekingRef.current = false;
    broadcastVideoState({ ...videoSyncState, playedSeconds: seconds, timestamp: Date.now() });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';
      const response = await fetch(`${SERVER_URL}/api/youtube/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data.videos) setSearchResults(data.videos);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectVideo = (videoId: string) => {
    broadcastVideoState({ url: `https://www.youtube.com/watch?v=${videoId}`, playing: true, playedSeconds: 0, timestamp: Date.now() });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const isYouTube = (url: string | null) =>
    !!url && (url.includes('youtube.com') || url.includes('youtu.be'));

  const isPlayerVisible = !showSearch && isYouTube(videoSyncState.url);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 h-11 border-b border-zinc-900 bg-zinc-950">
        <div className="flex items-center gap-2">
          <Popcorn className="size-3.5 text-brand-cyan" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-300">
            Watch Party
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isPlayerVisible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearch(true)}
              className="h-6 px-2 text-[10px] text-zinc-400 hover:text-brand-cyan hover:bg-brand-cyan/10 gap-1"
            >
              <RotateCcw className="size-3" />
              Change
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="size-6 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Search Bar ───────────────────────────────────── */}
      {(showSearch || !isYouTube(videoSyncState.url)) && (
        <div className="shrink-0 px-4 py-3 border-b border-zinc-900 bg-zinc-950/80">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search YouTube to watch together..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-brand-cyan/40 focus-visible:border-brand-cyan/50"
              />
            </div>
            <Button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              size="sm"
              className="h-8 px-3 bg-brand-cyan hover:bg-brand-cyan/85 text-zinc-950 font-bold text-[11px] gap-1.5 shrink-0 disabled:opacity-40"
            >
              {isSearching ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Search className="size-3.5" />
              )}
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </form>
        </div>
      )}

      {/* ── Content Area ─────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Search Results Grid */}
        {showSearch && searchResults.length > 0 && (
          <div className="absolute inset-0 overflow-y-auto p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-3">
              {searchResults.length} results
            </p>
            <div className="grid grid-cols-2 gap-3">
              {searchResults.map((video) => (
                <button
                  key={video.id}
                  onClick={() => handleSelectVideo(video.id)}
                  className="group flex flex-col gap-2 text-left bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/60 hover:border-brand-cyan/30 rounded-lg p-2 transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-cyan"
                >
                  <div className="relative w-full aspect-video rounded-md overflow-hidden bg-zinc-800">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                    {/* Duration badge */}
                    <span className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-mono text-zinc-300">
                      <Clock className="size-2 opacity-70" />
                      {video.duration}
                    </span>
                    {/* Play overlay on hover */}
                    <div className="absolute inset-0 bg-brand-cyan/0 group-hover:bg-brand-cyan/10 transition-colors duration-150 flex items-center justify-center">
                      <div className="size-8 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Popcorn className="size-4 text-brand-cyan" />
                      </div>
                    </div>
                  </div>
                  <div className="px-0.5">
                    <p className="text-[11px] font-semibold text-zinc-200 line-clamp-2 leading-snug group-hover:text-brand-cyan transition-colors">
                      {video.title}
                    </p>
                    <p className="text-[9px] text-zinc-500 mt-0.5 truncate">{video.author}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Searching Skeleton */}
        {isSearching && (
          <div className="absolute inset-0 p-4 grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex flex-col gap-2 bg-zinc-900/40 border border-zinc-800/30 rounded-lg p-2 animate-pulse">
                <div className="w-full aspect-video rounded-md bg-zinc-800" />
                <div className="px-0.5 space-y-1.5">
                  <div className="h-2.5 bg-zinc-800 rounded w-full" />
                  <div className="h-2.5 bg-zinc-800 rounded w-3/4" />
                  <div className="h-2 bg-zinc-800/60 rounded w-1/2 mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video Player */}
        {isPlayerVisible && (
          <div className="absolute inset-0">
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

        {/* Empty State */}
        {!isSearching && showSearch && searchResults.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="relative">
              <div className="size-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Popcorn className="size-7 text-zinc-600" />
              </div>
              <div className="absolute -top-1 -right-1 size-5 rounded-full bg-brand-cyan/10 border border-brand-cyan/30 flex items-center justify-center">
                <Search className="size-2.5 text-brand-cyan" />
              </div>
            </div>
            <div className="space-y-1 max-w-[200px]">
              <p className="text-xs font-semibold text-zinc-300">
                Watch together
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Search for a YouTube video above and everyone in the call watches in sync.
              </p>
            </div>
          </div>
        )}

        {/* Blank while video URL set but showSearch triggered */}
        {!isSearching && !showSearch && !isYouTube(videoSyncState.url) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-zinc-600">
              <Popcorn className="size-10 opacity-20" />
              <p className="text-xs">No video selected</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
