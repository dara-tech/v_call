import type { VideoSyncState, WatchPartyVideo } from '../hooks/types';

export const DEFAULT_PLAYBACK_RATE = 1;

export function createEmptyVideoSyncState(): VideoSyncState {
  return {
    url: null,
    playing: false,
    playedSeconds: 0,
    timestamp: Date.now(),
    playbackRate: DEFAULT_PLAYBACK_RATE,
    title: null,
    thumbnail: null,
    author: null,
    queue: [],
    queueIndex: -1,
    loopQueue: false,
    shuffle: false,
  };
}

export function videoFromResult(video: {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  author?: string;
  source?: string;
  duration?: string;
}): WatchPartyVideo {
  return {
    id: `${video.source ?? 'video'}-${video.id}`,
    url: video.url,
    title: video.title,
    thumbnail: video.thumbnail,
    author: video.author,
    source: video.source,
    duration: video.duration,
  };
}

export function expectedPlayhead(state: VideoSyncState): number {
  if (!state.playing) return state.playedSeconds;
  const elapsed = (Date.now() - state.timestamp) / 1000;
  return state.playedSeconds + elapsed * (state.playbackRate ?? DEFAULT_PLAYBACK_RATE);
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function playVideoAtIndex(state: VideoSyncState, index: number): VideoSyncState {
  const queue = state.queue ?? [];
  if (index < 0 || index >= queue.length) return state;
  const video = queue[index];
  return {
    ...state,
    url: video.url,
    title: video.title,
    thumbnail: video.thumbnail ?? null,
    author: video.author ?? null,
    playing: true,
    playedSeconds: 0,
    timestamp: Date.now(),
    queueIndex: index,
  };
}

export function getNextQueueIndex(state: VideoSyncState): number | null {
  const queue = state.queue ?? [];
  if (queue.length === 0) return null;
  const current = state.queueIndex ?? -1;

  if (state.shuffle && queue.length > 1) {
    let next = current;
    while (next === current) {
      next = Math.floor(Math.random() * queue.length);
    }
    return next;
  }

  const next = current + 1;
  if (next < queue.length) return next;
  if (state.loopQueue) return 0;
  return null;
}

export function getPreviousQueueIndex(state: VideoSyncState): number | null {
  const queue = state.queue ?? [];
  if (queue.length === 0) return null;
  const current = state.queueIndex ?? 0;
  const prev = current - 1;
  if (prev >= 0) return prev;
  if (state.loopQueue) return queue.length - 1;
  return null;
}
