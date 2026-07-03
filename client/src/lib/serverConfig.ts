const DEFAULT_SERVER = 'http://localhost:5002';

/** HTTP base URL for v_call signaling + REST APIs (set via VITE_SIGNALING_SERVER in production). */
export const SIGNALING_SERVER = (
  import.meta.env.VITE_SIGNALING_SERVER ||
  import.meta.env.VITE_SERVER_URL ||
  DEFAULT_SERVER
).replace(/\/$/, '');

export function toWebSocketUrl(httpUrl: string, path: string): string {
  const wsBase = httpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${wsBase}${normalizedPath}`;
}

export function getAiProxyUrl(): string {
  return toWebSocketUrl(SIGNALING_SERVER, '/ai-proxy');
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SIGNALING_SERVER}${normalizedPath}`;
}
