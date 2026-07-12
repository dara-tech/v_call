import http from 'http';
import https from 'https';

const BLOCKED_HOSTS = /^localhost$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./i;

function isPrivateHost(hostname) {
  return BLOCKED_HOSTS.test(hostname) || hostname.endsWith('.local');
}

export function isAllowedStreamUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (isPrivateHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function buildProxyUrl(originUrl, proxyBase, userAgent, referrer) {
  const params = new URLSearchParams({ url: originUrl });
  if (userAgent) params.set('ua', userAgent);
  if (referrer) params.set('ref', referrer);
  return `${proxyBase}/api/tvgarden/proxy?${params.toString()}`;
}

/** Public origin for playlist rewrites — must match the page protocol (https on Vercel/sslip.io). */
export function getProxyBase(req) {
  const forwarded = req.get('x-forwarded-proto');
  let proto = (forwarded ? forwarded.split(',')[0].trim() : req.protocol) || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  // nginx on VPS may omit X-Forwarded-Proto; sslip.io is always HTTPS from the browser.
  if (proto === 'http' && host && /\.sslip\.io$/i.test(host)) {
    proto = 'https';
  }
  return `${proto}://${host}`;
}

function rewriteUriAttribute(line, base, proxyBase, userAgent, referrer) {
  return line.replace(/URI=(["'])([^"']+)\1/gi, (_m, quote, uri) => {
    try {
      const abs = new URL(uri, base).href;
      return `URI=${quote}${buildProxyUrl(abs, proxyBase, userAgent, referrer)}${quote}`;
    } catch {
      return _m;
    }
  });
}

function rewritePlaylist(text, baseUrl, proxyBase, userAgent, referrer) {
  const base = new URL(baseUrl);
  return text.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      return rewriteUriAttribute(trimmed, base, proxyBase, userAgent, referrer);
    }

    try {
      const abs = new URL(trimmed, base).href;
      return buildProxyUrl(abs, proxyBase, userAgent, referrer);
    } catch {
      return line;
    }
  }).join('\n');
}

function looksLikeM3u8(url, contentType, bodyHead) {
  if (/\.m3u8(\?|$)/i.test(url)) return true;
  if (contentType && /mpegurl|m3u8/i.test(contentType)) return true;
  if (bodyHead && bodyHead.trimStart().startsWith('#EXTM3U')) return true;
  return false;
}

function requestOnce(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(
      url,
      {
        method: 'GET',
        headers,
        timeout: 20000,
        servername: parsed.hostname,
      },
      (res) => {
        resolve({ res, url });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Upstream timed out'));
    });
    req.end();
  });
}

async function fetchUpstream(url, headers, redirectsLeft = 5) {
  const { res, url: finalUrl } = await requestOnce(url, headers);

  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
    res.resume();
    const next = new URL(res.headers.location, url).href;
    return fetchUpstream(next, headers, redirectsLeft - 1);
  }

  return { res, url: finalUrl };
}

function readBody(res, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    res.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        res.destroy();
        reject(new Error('Response too large'));
        return;
      }
      chunks.push(chunk);
    });
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
}

/** Proxy IPTV/HLS — rewrites m3u8 playlists so every segment also goes through this proxy. */
export async function pipeIptvStream(req, res, { url, userAgent, referrer }) {
  if (!isAllowedStreamUrl(url)) {
    res.status(400).json({ error: 'Invalid stream URL' });
    return;
  }

  const ua = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const ref = referrer || (() => { try { return new URL(url).origin; } catch { return undefined; } })();
  const headers = { 'User-Agent': ua, Accept: '*/*' };
  if (ref) headers.Referer = ref;

  const proxyBase = getProxyBase(req);

  try {
    const { res: upRes, url: finalUrl } = await fetchUpstream(url, headers);

    if (upRes.statusCode && upRes.statusCode >= 400) {
      res.status(upRes.statusCode).json({ error: 'Upstream stream unavailable' });
      upRes.resume();
      return;
    }

    const contentType = upRes.headers['content-type'] || '';
    const isProbablyPlaylist = looksLikeM3u8(finalUrl, contentType, '');

    if (isProbablyPlaylist) {
      const body = await readBody(upRes, 2 * 1024 * 1024);
      const text = body.toString('utf8');

      if (looksLikeM3u8(finalUrl, contentType, text)) {
        const rewritten = rewritePlaylist(text, finalUrl, proxyBase, ua, ref);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(rewritten);
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      if (contentType) res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(body);
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    upRes.pipe(res);
    req.on('close', () => upRes.destroy());
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: err.message || 'Stream proxy failed' });
    }
  }
}
