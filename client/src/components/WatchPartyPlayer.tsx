import React, { useRef, useEffect, useState } from 'react';
import ReactPlayerImport from 'react-player';
const ReactPlayer = (ReactPlayerImport as any).default || ReactPlayerImport;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Play, Link as LinkIcon } from 'lucide-react';
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
  
  // Local state to prevent bouncing when we are the ones seeking
  const [isPlaying, setIsPlaying] = useState(false);
  const seekingRef = useRef(false);

  useEffect(() => {
    setIsPlaying(videoSyncState.playing);
    
    // If the sync state timestamp is recent, it's a seek command from someone else
    if (playerRef.current && !seekingRef.current) {
      const currentPlayerTime = typeof playerRef.current.getCurrentTime === 'function' 
        ? playerRef.current.getCurrentTime() 
        : 0;
      // If time difference is more than 2 seconds, sync it
      if (Math.abs(currentPlayerTime - videoSyncState.playedSeconds) > 2) {
        if (typeof playerRef.current.seekTo === 'function') {
          playerRef.current.seekTo(videoSyncState.playedSeconds, 'seconds');
        }
      }
    }
  }, [videoSyncState]);

  // When a new URL is broadcasted, hide search results
  useEffect(() => {
    if (videoSyncState.url) {
      setShowSearch(false);
    }
  }, [videoSyncState.url]);

  const handlePlay = () => {
    setIsPlaying(true);
    const currentTime = typeof playerRef.current?.getCurrentTime === 'function' ? playerRef.current.getCurrentTime() : 0;
    broadcastVideoState({
      ...videoSyncState,
      playing: true,
      playedSeconds: currentTime,
      timestamp: Date.now()
    });
  };

  const handlePause = () => {
    setIsPlaying(false);
    const currentTime = typeof playerRef.current?.getCurrentTime === 'function' ? playerRef.current.getCurrentTime() : 0;
    broadcastVideoState({
      ...videoSyncState,
      playing: false,
      playedSeconds: currentTime,
      timestamp: Date.now()
    });
  };

  const handleSeek = (seconds: number) => {
    seekingRef.current = false;
    broadcastVideoState({
      ...videoSyncState,
      playedSeconds: seconds,
      timestamp: Date.now()
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setShowSearch(true);
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
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    broadcastVideoState({
      url,
      playing: true,
      playedSeconds: 0,
      timestamp: Date.now()
    });
    setShowSearch(false);
    setSearchQuery('');
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden relative shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-brand-cyan">
          <Play className="size-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Watch Party</span>
        </div>
        <div className="flex items-center gap-2">
          {videoSyncState.url && !showSearch && (
            <Button variant="outline" size="sm" onClick={() => setShowSearch(true)} className="h-6 text-[10px] bg-zinc-950">
              Find another video
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Search Input Form */}
      {(showSearch || !videoSyncState.url || !(videoSyncState.url.includes('youtube.com') || videoSyncState.url.includes('youtu.be'))) && (
        <form onSubmit={handleSearch} className="flex gap-2 p-3 bg-zinc-900/50">
          <Input 
            type="text" 
            placeholder="Search YouTube..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-8 text-xs bg-zinc-950 border-zinc-800"
          />
          <Button type="submit" disabled={isSearching} size="sm" className="h-8 bg-brand-cyan hover:bg-brand-cyan/90 text-zinc-950 font-bold px-3">
            {isSearching ? <span className="animate-spin mr-1">⚪</span> : <LinkIcon className="size-3.5 mr-1" />} 
            Search
          </Button>
        </form>
      )}

      {/* Video Player Area or Search Results */}
      <div className="flex-1 bg-black relative flex flex-col items-center justify-center overflow-y-auto overflow-x-hidden">
        {showSearch && searchResults.length > 0 ? (
          <div className="absolute inset-0 p-4 grid grid-cols-2 gap-4 auto-rows-max overflow-y-auto">
            {searchResults.map((video) => (
              <div 
                key={video.id} 
                onClick={() => handleSelectVideo(video.id)}
                className="flex flex-col gap-2 cursor-pointer group bg-zinc-900/50 p-2 rounded border border-zinc-800/50 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="relative aspect-video rounded overflow-hidden">
                  <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <span className="absolute bottom-1 right-1 bg-black/80 px-1 text-[9px] rounded font-mono text-zinc-300">
                    {video.duration}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-zinc-200 line-clamp-2 leading-snug group-hover:text-brand-cyan transition-colors">
                    {video.title}
                  </span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">{video.author}</span>
                </div>
              </div>
            ))}
          </div>
        ) : videoSyncState.url && (videoSyncState.url.includes('youtube.com') || videoSyncState.url.includes('youtu.be')) ? (
          <ReactPlayer
            ref={playerRef}
            url={videoSyncState.url}
            playing={isPlaying}
            controls={true}
            width="100%"
            height="100%"
            onPlay={handlePlay}
            onPause={handlePause}
            onProgress={(state) => {
              if (Math.abs(state.playedSeconds - videoSyncState.playedSeconds) > 3) {
                handleSeek(state.playedSeconds);
              }
            }}
            config={{
              youtube: {
                playerVars: { disablekb: 1 }
              }
            }}
            style={{ position: 'absolute', top: 0, left: 0 }}
          />
        ) : (
          <div className="text-zinc-500 text-sm flex flex-col items-center">
            <Play className="size-12 mb-2 opacity-20" />
            <p>Search YouTube above to start watching.</p>
          </div>
        )}
      </div>
    </div>
  );
};
