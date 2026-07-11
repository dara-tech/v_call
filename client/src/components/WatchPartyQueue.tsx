import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Play, Trash2, GripVertical } from 'lucide-react';
import type { VideoSyncState } from '../hooks/types';

interface WatchPartyQueueProps {
  videoSyncState: VideoSyncState;
  onPlayIndex: (index: number) => void;
  onRemove: (videoId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export const WatchPartyQueue: React.FC<WatchPartyQueueProps> = ({
  videoSyncState,
  onPlayIndex,
  onRemove,
  onClear,
  onClose,
}) => {
  const queue = videoSyncState.queue ?? [];
  const currentIndex = videoSyncState.queueIndex ?? -1;

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-full max-w-xs flex-col border-l border-zinc-800 bg-zinc-950/95 backdrop-blur-xl sm:max-w-sm">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-900 px-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Up Next</h3>
          <p className="text-[10px] text-zinc-500">{queue.length} video{queue.length !== 1 ? 's' : ''} in queue</p>
        </div>
        <div className="flex items-center gap-1">
          {queue.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}
              className="h-7 px-2 text-[10px] text-zinc-500 hover:text-brand-rose">
              Clear
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose}
            className="size-7 text-zinc-500 hover:text-white">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {queue.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-xs text-zinc-500">Queue is empty</p>
            <p className="text-[10px] text-zinc-600">Search videos and tap + Queue or Play Now</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {queue.map((video, index) => {
              const isActive = index === currentIndex;
              return (
                <div
                  key={video.id}
                  className={`group flex items-center gap-2 rounded-xl border p-2 transition-colors ${
                    isActive
                      ? 'border-brand-cyan/30 bg-brand-cyan/5'
                      : 'border-transparent bg-zinc-900/40 hover:border-white/10 hover:bg-zinc-900/70'
                  }`}
                >
                  <GripVertical className="size-3.5 shrink-0 text-zinc-700" />
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="size-12 shrink-0 rounded-lg bg-zinc-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[11px] font-semibold ${isActive ? 'text-brand-cyan' : 'text-zinc-200'}`}>
                      {video.title}
                    </p>
                    <p className="truncate text-[10px] text-zinc-500">{video.author}</p>
                    {video.duration && (
                      <p className="text-[9px] text-zinc-600">{video.duration}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {!isActive && (
                      <Button variant="ghost" size="icon-sm" onClick={() => onPlayIndex(index)}
                        className="size-7 text-zinc-400 hover:text-brand-cyan">
                        <Play className="size-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => onRemove(video.id)}
                      className="size-7 text-zinc-500 hover:text-brand-rose">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
