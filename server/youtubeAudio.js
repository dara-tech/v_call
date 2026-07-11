import { spawn } from 'child_process';

const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i;

export function isYoutubeWatchUrl(url) {
  return typeof url === 'string' && YT_URL_RE.test(url.trim());
}

function logStderr(chunk) {
  const text = chunk.toString();
  if (/^frame=\s*\d+/m.test(text) || text.includes('Press [q] to stop')) return;
  if (text.includes('[download]')) return;
  if (text.includes('Error') || text.includes('ERROR') || text.includes('WARNING')) {
    console.warn('[YouTube Audio]', text.trim());
  }
}

/** Stream YouTube audio to an Express response (requires yt-dlp on PATH). */
export function pipeYoutubeAudio(req, res, { url, startSeconds = 0 }) {
  if (!isYoutubeWatchUrl(url)) {
    res.status(400).json({ error: 'Invalid YouTube URL' });
    return null;
  }

  res.writeHead(200, {
    'Content-Type': 'audio/mp4',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Transfer-Encoding': 'chunked',
  });

  const args = [
    '--no-warnings',
    '--no-playlist',
    '-f', '18/ba/b',
    '--no-part',
    '-o', '-',
  ];

  if (startSeconds > 0) {
    args.push('--download-sections', `*${Math.floor(startSeconds)}-`);
  }

  args.push(url.trim());

  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let clientClosed = false;

  proc.stdout.pipe(res);

  proc.stderr.on('data', logStderr);

  proc.on('error', (err) => {
    console.error('[YouTube Audio] yt-dlp missing or failed:', err.message);
    if (!res.writableEnded) res.end();
  });

  proc.on('close', (code, signal) => {
    // code=null means SIGTERM from client disconnect — normal, not an error
    if (clientClosed || code === null || signal === 'SIGTERM') return;
    if (code !== 0 && !res.writableEnded) {
      console.warn('[YouTube Audio] yt-dlp failed with exit code', code);
      res.end();
    }
  });

  req.on('close', () => {
    clientClosed = true;
    proc.kill('SIGTERM');
  });

  return proc;
}
