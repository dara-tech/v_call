import React, { useEffect, useRef, useState } from 'react';

interface DailyMotionSyncPlayerProps {
  videoId: string;
  playing: boolean;
  playbackRate?: number;
  onPlay: () => void;
  onPause: () => void;
  onProgress: (state: { playedSeconds: number }) => void;
  onEnded?: () => void;
  onDuration?: (seconds: number) => void;
}

export const DailyMotionSyncPlayer = React.forwardRef<any, DailyMotionSyncPlayerProps>(
  ({ videoId, playing, playbackRate = 1, onPlay, onPause, onProgress, onEnded, onDuration }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const [isReady, setIsReady] = useState(false);
    const ignoreNextPlayPause = useRef(false);

    useEffect(() => {
      let isSubscribed = true;

      const loadSDK = async () => {
        if (!window.dailymotion) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://geo.dailymotion.com/player.js';
            script.onload = () => resolve();
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        if (!containerRef.current || !isSubscribed) return;

        try {
          const player = await window.dailymotion.createPlayer(containerRef.current, {
            video: videoId,
          });

          if (!isSubscribed) return;

          playerRef.current = player;

          player.on('play', () => {
            if (ignoreNextPlayPause.current) return;
            onPlay();
          });

          player.on('pause', () => {
            if (ignoreNextPlayPause.current) return;
            onPause();
          });

          player.on('timeupdate', (state: any) => {
            if (state && typeof state.playerTime === 'number') {
              onProgress({ playedSeconds: state.playerTime });
            }
          });

          player.on('video_end', () => {
            onEnded?.();
          });

          player.on('videochange', (state: any) => {
            if (state?.videoDuration) onDuration?.(state.videoDuration);
          });

          setIsReady(true);
        } catch (err) {
          console.error('[DailyMotion] Error initializing player:', err);
        }
      };

      loadSDK();

      return () => {
        isSubscribed = false;
        if (playerRef.current) {
          // Cleanup player if method exists
          if (typeof playerRef.current.destroy === 'function') {
            playerRef.current.destroy();
          }
        }
      };
    }, [videoId]);

    useEffect(() => {
      if (!isReady || !playerRef.current) return;

      try {
        ignoreNextPlayPause.current = true;
        if (playing) {
          playerRef.current.play();
        } else {
          playerRef.current.pause();
        }
        setTimeout(() => {
          ignoreNextPlayPause.current = false;
        }, 100);
      } catch (err) {
        console.error('[DailyMotion] Error changing playback state:', err);
        ignoreNextPlayPause.current = false;
      }
    }, [playing, isReady, playbackRate]);

    useEffect(() => {
      if (!isReady || !playerRef.current) return;
      try {
        if (typeof playerRef.current.setPlaybackRate === 'function') {
          playerRef.current.setPlaybackRate(playbackRate);
        }
      } catch {}
    }, [playbackRate, isReady]);

    // Expose methods to parent via ref
    React.useImperativeHandle(ref, () => ({
      getCurrentTime: () => {
        // The dailymotion object doesn't have a direct getter in all versions, 
        // but we assume it might, or we just rely on timeupdate.
        // As a fallback, we return 0 if not supported.
        if (playerRef.current && typeof playerRef.current.getState === 'function') {
          return playerRef.current.getState()?.playerTime || 0;
        }
        return 0;
      },
      seekTo: (seconds: number) => {
        if (playerRef.current && typeof playerRef.current.seek === 'function') {
          playerRef.current.seek(seconds);
        }
      }
    }));

    return (
      <div 
        ref={containerRef} 
        className="w-full h-full bg-black flex items-center justify-center"
      >
        {!isReady && (
          <div className="text-zinc-500 text-xs animate-pulse">Loading DailyMotion...</div>
        )}
      </div>
    );
  }
);

DailyMotionSyncPlayer.displayName = 'DailyMotionSyncPlayer';

// Add type for global window
declare global {
  interface Window {
    dailymotion: any;
  }
}
