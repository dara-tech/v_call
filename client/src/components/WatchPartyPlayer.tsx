import React, { useRef, useEffect, useState } from 'react';
import ReactPlayerImport from 'react-player';
const ReactPlayer = (ReactPlayerImport as any).default || ReactPlayerImport;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Popcorn, Search, RotateCcw, Loader2, Clock, Link2, Youtube } from 'lucide-react';
import type { VideoSyncState } from '../hooks/useWebRTC';

interface WatchPartyPlayerProps {
  videoSyncState: VideoSyncState;
  broadcastVideoState: (state: VideoSyncState) => void;
  onClose: () => void;
}

type SearchMode = 'search' | 'url';

// Platforms react-player supports natively via URL paste
const SUPPORTED_PLATFORMS = [
  { name: 'YouTube',    icon: '▶', color: 'text-red-400',    hint: 'youtube.com' },
  { name: 'Vimeo',      icon: '◆', color: 'text-brand-cyan', hint: 'vimeo.com' },
  { name: 'Twitch',     icon: '◉', color: 'text-violet-400', hint: 'twitch.tv' },
  { name: 'Facebook',   icon: '◈', color: 'text-blue-400',   hint: 'facebook.com' },
  { name: 'DailyMotion',icon: '◎', color: 'text-orange-400', hint: 'dailymotion.com' },
  { name: 'Streamable', icon: '◐', color: 'text-green-400',  hint: 'streamable.com' },
  { name: 'Direct MP4', icon: '◇', color: 'text-zinc-400',   hint: '.mp4 / .m3u8' },
];

export const WatchPartyPlayer: React.FC<WatchPartyPlayerProps> = ({
  videoSyncState,
  broadcastVideoState,
  onClose,
}) => {
  const playerRef = useRef<any>(null);
  const [mode, setMode] = useState<SearchMode>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [showSearch, setShowSearch] = useState(!videoSyncState.url);
  const [isPlaying, setIsPlaying] = useState(false);
  const seekingRef = useRef(false);

  useEffect(() => {
    setIsPlaying(videoSyncState.playing);
    if (playerRef.current && !seekingRef.current) {
      const currentPlayerTime =
        typeof playerRef.current.getCurrentTime === 'function'
          ? playerRef.current.getCurrentTime() : 0;
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

  const handleYouTubeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';
      const res = await fetch(`${SERVER_URL}/api/youtube/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.videos) setSearchResults(data.videos);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError('');
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    // Basic URL validation
    try {
      new URL(trimmed);
    } catch {
      setUrlError('Please enter a valid URL (e.g. https://vimeo.com/...)');
      return;
    }

    if (!ReactPlayer.canPlay(trimmed)) {
      setUrlError('This URL is not supported. Try YouTube, Vimeo, Twitch, Facebook, DailyMotion, Streamable, or a direct .mp4 link.');
      return;
    }

    broadcastVideoState({ url: trimmed, playing: true, playedSeconds: 0, timestamp: Date.now() });
    setShowSearch(false);
    setUrlInput('');
  };

  const handleSelectVideo = (videoId: string) => {
    broadcastVideoState({ url: `https://www.youtube.com/watch?v=${videoId}`, playing: true, playedSeconds: 0, timestamp: Date.now() });
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
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowSearch(true)}
              className="h-6 px-2 text-[10px] text-zinc-400 hover:text-brand-cyan hover:bg-brand-cyan/10 gap-1"
            >
              <RotateCcw className="size-3" /> Change
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose}
            className="size-6 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Mode Tabs + Inputs ── */}
      {(showSearch || !videoSyncState.url) && (
        <div className="shrink-0 border-b border-zinc-900 bg-zinc-950/80">
          {/* Tab switcher */}
          <div className="flex border-b border-zinc-900">
            <button
              onClick={() => setMode('search')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors ${
                mode === 'search'
                  ? 'text-brand-cyan border-b-2 border-brand-cyan -mb-px'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Youtube className="size-3" />
              YouTube Search
            </button>
            <button
              onClick={() => { setMode('url'); setUrlError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors ${
                mode === 'url'
                  ? 'text-brand-cyan border-b-2 border-brand-cyan -mb-px'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Link2 className="size-3" />
              Paste URL
            </button>
          </div>

          {/* YouTube Search input */}
          {mode === 'search' && (
            <form onSubmit={handleYouTubeSearch} className="flex gap-2 p-3">
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
              <Button type="submit" disabled={isSearching || !searchQuery.trim()} size="sm"
                className="h-8 px-3 bg-brand-cyan hover:bg-brand-cyan/85 text-zinc-950 font-bold text-[11px] gap-1.5 shrink-0 disabled:opacity-40">
                {isSearching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </form>
          )}

          {/* Paste URL input */}
          {mode === 'url' && (
            <div className="p-3 space-y-2">
              <form onSubmit={handleUrlSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
                  <Input
                    type="url"
                    placeholder="https://vimeo.com/... or any supported URL"
                    value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
                    className="pl-8 h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-brand-cyan/40 focus-visible:border-brand-cyan/50"
                  />
                </div>
                <Button type="submit" disabled={!urlInput.trim()} size="sm"
                  className="h-8 px-3 bg-brand-cyan hover:bg-brand-cyan/85 text-zinc-950 font-bold text-[11px] gap-1 shrink-0 disabled:opacity-40">
                  Watch
                </Button>
              </form>
              {urlError && (
                <p className="text-[10px] text-brand-rose px-1">{urlError}</p>
              )}
              {/* Supported platforms */}
              <div className="flex flex-wrap gap-1.5 px-0.5 pb-0.5">
                {SUPPORTED_PLATFORMS.map(p => (
                  <span key={p.name} className="flex items-center gap-1 bg-zinc-900 border border-zinc-800/60 px-2 py-0.5 rounded-full text-[9px] text-zinc-400">
                    <span className={`${p.color} text-[8px]`}>{p.icon}</span>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Content Area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Search Results */}
        {mode === 'search' && showSearch && searchResults.length > 0 && !isSearching && (
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
                    <img src={video.thumbnail} alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200" />
                    <span className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-mono text-zinc-300">
                      <Clock className="size-2 opacity-70" />{video.duration}
                    </span>
                    <div className="absolute inset-0 bg-brand-cyan/0 group-hover:bg-brand-cyan/10 transition-colors flex items-center justify-center">
                      <div className="size-8 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Popcorn className="size-4 text-brand-cyan" />
                      </div>
                    </div>
                  </div>
                  <div className="px-0.5">
                    <p className="text-[11px] font-semibold text-zinc-200 line-clamp-2 leading-snug group-hover:text-brand-cyan transition-colors">{video.title}</p>
                    <p className="text-[9px] text-zinc-500 mt-0.5 truncate">{video.author}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skeleton while searching */}
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

        {/* Empty State */}
        {!isSearching && showSearch && searchResults.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="relative">
              <div className="size-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Popcorn className="size-7 text-zinc-600" />
              </div>
              <div className="absolute -top-1 -right-1 size-5 rounded-full bg-brand-cyan/10 border border-brand-cyan/30 flex items-center justify-center">
                {mode === 'search'
                  ? <Search className="size-2.5 text-brand-cyan" />
                  : <Link2 className="size-2.5 text-brand-cyan" />
                }
              </div>
            </div>
            <div className="space-y-1 max-w-[220px]">
              <p className="text-xs font-semibold text-zinc-300">Watch together</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {mode === 'search'
                  ? 'Search for a YouTube video above — everyone in the call watches in sync.'
                  : 'Paste a link from YouTube, Vimeo, Twitch, Facebook, DailyMotion, or a direct video file.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
