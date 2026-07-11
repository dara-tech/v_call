import { apiUrl, SIGNALING_SERVER } from '@/lib/serverConfig';
import type { StreamSource } from './types';

export function proxiedStreamUrl(source: StreamSource): string {
  const params = new URLSearchParams({ url: source.url });
  if (source.userAgent) params.set('ua', source.userAgent);
  if (source.referrer) params.set('ref', source.referrer);
  return apiUrl(`/api/tvgarden/proxy?${params.toString()}`);
}

export function isProxiedUrl(url: string): boolean {
  return url.includes('/api/tvgarden/proxy') || url.startsWith(SIGNALING_SERVER);
}

export function resolveStreamUrl(relativeOrAbsolute: string, baseUrl: string): string {
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute;
  }
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return relativeOrAbsolute;
  }
}

export type StreamFailureReason = 'offline' | 'cors' | 'timeout' | 'format' | 'proxy_down' | 'unknown';

export function describeStreamFailure(reason: StreamFailureReason): string {
  switch (reason) {
    case 'proxy_down':
      return 'Cannot reach stream proxy — restart v_server (port 5001) and refresh.';
    case 'cors':
      return 'Playback blocked by the broadcaster. Try another channel.';
    case 'timeout':
      return 'Stream timed out — server may be slow or offline.';
    case 'format':
      return 'Unsupported format in this browser.';
    case 'offline':
      return 'This link is dead, geo-blocked, or offline. Try another channel or tap Random.';
    default:
      return 'Could not play. Try another channel or tap Retry.';
  }
}

export type PlaybackMode = 'direct' | 'proxy';
