import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Repeat, Shuffle, ListMusic, Gauge,
} from 'lucide-react';
import type { VideoSyncState } from '../hooks/types';
import { DEFAULT_PLAYBACK_RATE, expectedPlayhead, formatTime } from '../lib/watchPartyUtils';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface WatchPartyControlsProps {
  videoSyncState: VideoSyncState;
  isPlaying: boolean;
  duration: number;
  localVolume: number;
  isMuted: boolean;
  showControls: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleLoop: () => void;
  onToggleShuffle: () => void;
  onToggleQueue: () => void;
  queueOpen: boolean;
}

export const WatchPartyControls: React.FC<WatchPartyControlsProps> = ({
  videoSyncState,
  isPlaying,
  duration,
  localVolume,
  isMuted,
  showControls,
  onTogglePlay,
  onSeek,
  onPrevious,
  onNext,
  onVolumeChange,
  onToggleMute,
  onPlaybackRateChange,
  onToggleLoop,
  onToggleShuffle,
  onToggleQueue,
  queueOpen,
}) => {
  const currentTime = expectedPlayhead(videoSyncState);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const displayTime = scrubbing ? scrubTime : currentTime;
  const progress = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const playbackRate = videoSyncState.playbackRate ?? DEFAULT_PLAYBACK_RATE;
  const queueLength = videoSyncState.queue?.length ?? 0;

  const commitScrub = () => {
    setScrubbing(false);
    onSeek(scrubTime);
  };

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/90 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300 sm:px-4 sm:pb-4 ${
        showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="mb-3 group/progress">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={Math.min(displayTime, duration || 0)}
          onPointerDown={() => {
            setScrubbing(true);
            setScrubTime(Math.min(currentTime, duration || 0));
          }}
          onChange={(e) => {
            const t = Number(e.target.value);
            if (scrubbing) setScrubTime(t);
            else onSeek(t);
          }}
          onPointerUp={commitScrub}
          onPointerLeave={() => { if (scrubbing) commitScrub(); }}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-brand-cyan group-hover/progress:h-1.5 transition-all [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-cyan"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] font-medium tabular-nums text-zinc-400">
          <span>{formatTime(displayTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {videoSyncState.thumbnail && (
          <img
            src={videoSyncState.thumbnail}
            alt=""
            className="hidden size-10 shrink-0 rounded-lg border border-white/10 object-cover sm:block"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white sm:text-sm">
            {videoSyncState.title || 'Now playing'}
          </p>
          {videoSyncState.author && (
            <p className="truncate text-[10px] text-zinc-400">{videoSyncState.author}</p>
          )}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onPrevious}
            className="size-8 text-zinc-300 hover:bg-white/10 hover:text-white">
            <SkipBack className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onTogglePlay}
            className="size-10 rounded-full bg-white/10 text-white hover:bg-white/20">
            {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 ml-0.5" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onNext}
            className="size-8 text-zinc-300 hover:bg-white/10 hover:text-white">
            <SkipForward className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon-sm" onClick={onToggleMute}
            className="size-8 text-zinc-400 hover:text-white">
            {isMuted || localVolume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : localVolume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="hidden h-1 w-14 cursor-pointer appearance-none rounded-full bg-white/20 accent-brand-cyan sm:block"
          />
        </div>

        <div className="relative hidden sm:block">
          <select
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange(Number(e.target.value))}
            className="h-8 cursor-pointer appearance-none rounded-lg border border-white/10 bg-black/50 pl-7 pr-2 text-[10px] font-semibold text-zinc-200 focus:border-brand-cyan/50 focus:outline-none"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>{rate}x</option>
            ))}
          </select>
          <Gauge className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
        </div>

        <Button variant="ghost" size="icon-sm" onClick={onToggleLoop}
          className={`size-8 ${videoSyncState.loopQueue ? 'text-brand-cyan' : 'text-zinc-500 hover:text-white'}`}>
          <Repeat className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onToggleShuffle}
          className={`size-8 ${videoSyncState.shuffle ? 'text-brand-violet' : 'text-zinc-500 hover:text-white'}`}>
          <Shuffle className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onToggleQueue}
          className={`relative size-8 ${queueOpen ? 'text-brand-orange' : 'text-zinc-500 hover:text-white'}`}>
          <ListMusic className="size-4" />
          {queueLength > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand-orange text-[9px] font-bold text-black">
              {queueLength}
            </span>
          )}
        </Button>
      </div>

      <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/10 sm:hidden">
        <div className="h-full bg-brand-cyan transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
};
