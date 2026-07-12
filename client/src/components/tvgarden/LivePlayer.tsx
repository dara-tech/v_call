import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Loader2, RefreshCw, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import type { LiveChannel } from '@/lib/tvgarden/types';
import {
  describeStreamFailure,
  proxiedStreamUrl,
  type StreamFailureReason,
} from '@/lib/tvgarden/streamUtils';

interface LivePlayerProps {
  channel: LiveChannel | null;
}

function isHlsUrl(url: string) {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('format=m3u8');
}

function mapHlsError(data: { type?: string; details?: string; response?: { code?: number } }): StreamFailureReason {
  if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT || data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
    return 'timeout';
  }
  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
    const code = data.response?.code;
    if (code === 502 || code === 504) return 'proxy_down';
    if (code === 404 || code === 410) return 'offline';
    if (code === 403 || code === 401) return 'offline';
    return 'offline';
  }
  if (data.type === Hls.ErrorTypes.MEDIA_ERROR) return 'format';
  return 'unknown';
}

export function LivePlayer({ channel }: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const failHandlerRef = useRef<(reason: StreamFailureReason) => void>(() => {});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureReason, setFailureReason] = useState<StreamFailureReason>('unknown');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [playToken, setPlayToken] = useState(0);

  const sources = channel?.streams?.length ? channel.streams : channel ? [{ url: channel.streamUrl }] : [];
  const currentSource = sources[sourceIndex] ?? null;

  useEffect(() => {
    setSourceIndex(0);
    setPlayToken(0);
    setFailed(false);
  }, [channel?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel || !currentSource) return;

    setLoading(true);
    setFailed(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const originalUrl = currentSource.url;
    const isHls = isHlsUrl(originalUrl);
    // IPTV almost always blocks browser CORS — server proxy rewrites the full HLS chain.
    const playUrl = proxiedStreamUrl({
      ...currentSource,
      referrer: currentSource.referrer || (() => { try { return new URL(originalUrl).origin; } catch { return undefined; } })(),
    });

    const onReady = () => setLoading(false);

    const onFail = (reason: StreamFailureReason) => {
      setLoading(false);
      if (sourceIndex + 1 < sources.length) {
        setSourceIndex((i) => i + 1);
        setPlayToken((t) => t + 1);
        return;
      }
      setFailureReason(reason);
      setFailed(true);
    };

    failHandlerRef.current = onFail;

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        // Web workers often fail on hosted/TV builds (wrong chunk URL) → black video.
        enableWorker: false,
        lowLatencyMode: false,
        manifestLoadingTimeOut: 20000,
        fragLoadingTimeOut: 20000,
        maxBufferLength: 30,
      });
      hlsRef.current = hls;
      hls.loadSource(playUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        onReady();
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        failHandlerRef.current(mapHlsError(data));
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playUrl;
      video.oncanplay = onReady;
      video.onerror = () => failHandlerRef.current('offline');
      video.play().catch(() => {});
    } else {
      video.src = playUrl;
      video.load();
      video.oncanplay = onReady;
      video.onerror = () => failHandlerRef.current('offline');
      video.play().catch(() => {});
    }

    return () => {
      video.oncanplay = null;
      video.onerror = null;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [channel, currentSource, sourceIndex, playToken]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const handleRetry = () => {
    setFailed(false);
    setSourceIndex(0);
    setPlayToken((t) => t + 1);
  };

  if (!channel) {
    return (
      <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-6 text-center backdrop-blur-md">
        <p className="text-sm text-zinc-400">Select a channel from the list</p>
        <p className="text-xs text-zinc-600">Streams play via v_server proxy · many free links are offline</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{channel.name}</p>
          <p className="truncate text-[11px] text-zinc-400">
            {channel.countryCode} · {channel.countryName}
            {sources.length > 1 && ` · source ${sourceIndex + 1}/${sources.length}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMuted((m) => !m)} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10">
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <button type="button" onClick={() => videoRef.current?.requestFullscreen?.()} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10">
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative aspect-video w-full bg-zinc-950">
        <video ref={videoRef} className="h-full w-full bg-black object-contain" playsInline controls={false} />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="size-8 animate-spin text-brand-cyan" />
          </div>
        )}

        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center">
            <AlertCircle className="size-8 text-brand-rose" />
            <p className="text-sm font-medium text-zinc-200">Stream unavailable</p>
            <p className="max-w-xs text-xs leading-relaxed text-zinc-500">{describeStreamFailure(failureReason)}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              <RefreshCw className="size-3.5" /> Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
