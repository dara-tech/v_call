import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import ytSearch from 'yt-search';
import { setupAIProxy } from './ai-proxy.js';
import { isYoutubeWatchUrl, pipeYoutubeAudio } from './youtubeAudio.js';
import { isAllowedStreamUrl, pipeIptvStream } from './iptvProxy.js';
import puppeteer from 'puppeteer';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../client/dist');

const app = express();
const port = process.env.PORT || 5001;

// nginx/sslip.io terminates TLS — needed so IPTV proxy rewrites use https:// URLs.
app.set('trust proxy', 1);

app.use(cors({ origin: '*' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Signaling and AI Proxy Server running', timestamp: new Date() });
});

app.get('/api/calls/turn-credentials', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  });
});

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query) return res.json({ videos: [], sources: {} });

    console.log(`[Search] Searching YouTube for: ${query}`);
    const r = await ytSearch(query);

    const videos = r.videos.slice(0, 24).map((v) => ({
      id: v.videoId,
      source: 'youtube',
      title: v.title,
      thumbnail: v.thumbnail,
      duration: v.timestamp,
      author: v.author.name,
      url: v.url,
    }));

    res.json({ videos, sources: { youtube: videos.length } });
  } catch (error) {
    console.error('[Search] Error:', error);
    res.status(500).json({ error: 'Failed to search videos' });
  }
});

app.get('/api/calls/youtube-audio', (req, res) => {
  const url = req.query.url;
  const startSeconds = Math.max(0, Number(req.query.t) || 0);
  if (!url || !isYoutubeWatchUrl(String(url))) {
    return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
  }
  console.log(`[YouTube Audio] Streaming from ${startSeconds}s: ${url}`);
  pipeYoutubeAudio(req, res, { url: String(url), startSeconds });
});

app.get('/api/tvgarden/proxy', (req, res) => {
  const url = req.query.url;
  if (!url || !isAllowedStreamUrl(String(url))) {
    return res.status(400).json({ error: 'Invalid or missing stream URL' });
  }
  pipeIptvStream(req, res, {
    url: String(url),
    userAgent: req.query.ua ? String(req.query.ua) : undefined,
    referrer: req.query.ref ? String(req.query.ref) : undefined,
  });
});

const server = http.createServer(app);
setupAIProxy(server);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// roomId -> { participants: { socketId: { userId, userName } } }
const rooms = {};
const socketToRoom = {};

let browser = null;
const browserPages = new Map();

function handleLeave(socket) {
  const roomId = socketToRoom[socket.id];
  if (!roomId) return;

  const room = rooms[roomId];
  if (!room?.participants[socket.id]) return;

  const { userName, userId } = room.participants[socket.id];
  console.log(`[Leave Room] User "${userName}" (${userId}) left room "${roomId}"`);

  delete room.participants[socket.id];
  delete socketToRoom[socket.id];

  socket.to(roomId).emit('user-left', { socketId: socket.id, userId });

  if (Object.keys(room.participants).length === 0) {
    console.log(`[Room Empty] Deleting room "${roomId}"`);
    delete rooms[roomId];
  }
}

io.on('connection', (socket) => {
  console.log(`[Signaling] Socket connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, userId, userName }) => {
    if (!roomId || !userId) {
      console.warn(`[Join Failed] Invalid roomId or userId from socket ${socket.id}`);
      return;
    }

    if (socketToRoom[socket.id]) {
      handleLeave(socket);
    }

    if (!rooms[roomId]) {
      rooms[roomId] = { participants: {} };
    }

    rooms[roomId].participants[socket.id] = { userId, userName };
    socketToRoom[socket.id] = roomId;
    socket.join(roomId);

    console.log(`[Join Room] User "${userName}" (${userId}) joined room "${roomId}"`);

    const others = Object.entries(rooms[roomId].participants)
      .filter(([id]) => id !== socket.id)
      .map(([id, info]) => ({ socketId: id, userId: info.userId, userName: info.userName }));

    socket.emit('all-users', others);

    socket.to(roomId).emit('user-joined', { socketId: socket.id, userId, userName });
  });

  socket.on('relay-signal', ({ targetSocketId, signalData, virtualSenderId }) => {
    if (!targetSocketId) {
      console.warn(`[Relay Failed] No targetSocketId from ${socket.id}`);
      return;
    }

    const roomId = socketToRoom[socket.id];
    const room = roomId ? rooms[roomId] : null;
    const targetParticipant = room?.participants?.[targetSocketId];
    const resolvedTarget = targetParticipant?.isVirtual
      ? (targetParticipant.hostSocketId || targetSocketId)
      : targetSocketId;

    io.to(resolvedTarget).emit('signal-received', {
      senderSocketId: socket.id,
      signalData,
      targetVirtualId: virtualSenderId || (targetParticipant?.isVirtual ? targetSocketId : undefined),
    });
  });

  socket.on('video-sync', ({ roomId, videoState }) => {
    socket.to(roomId).emit('video-sync-update', videoState);
  });

  socket.on('chat-message', ({ roomId, message }) => {
    socket.to(roomId).emit('chat-message', message);
  });

  socket.on('toggle-hand', ({ roomId, socketId: peerSocketId, handRaised }) => {
    socket.to(roomId).emit('toggle-hand', { socketId: peerSocketId, handRaised });
  });

  socket.on('reaction', ({ roomId, socketId: peerSocketId, emoji }) => {
    socket.to(roomId).emit('reaction', { socketId: peerSocketId, emoji });
  });

  socket.on('add-virtual-user', ({ roomId, virtualId, userName }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { participants: {} };
    }
    rooms[roomId].participants[virtualId] = {
      userId: virtualId,
      userName,
      isVirtual: true,
      hostSocketId: socket.id,
    };
    io.to(roomId).emit('user-joined', { socketId: virtualId, userId: virtualId, userName, hostSocketId: socket.id });
  });

  socket.on('remove-virtual-user', ({ roomId, virtualId }) => {
    const room = rooms[roomId];
    if (room?.participants[virtualId]) {
      delete room.participants[virtualId];
      io.to(roomId).emit('user-left', { socketId: virtualId });
    }
  });

  socket.on('start-ai-browser', async ({ url }) => {
    try {
      if (!browser) {
        browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
      }
      if (browserPages.has(socket.id)) {
        const existing = browserPages.get(socket.id);
        clearInterval(existing.interval);
        await existing.page.close().catch(() => {});
      }

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(url, { waitUntil: 'networkidle2' }).catch((e) => console.log('[AI Browser] Goto error:', e));

      const interval = setInterval(async () => {
        try {
          if (page.isClosed()) {
            clearInterval(interval);
            return;
          }
          const screenshot = await page.screenshot({ type: 'jpeg', quality: 50, encoding: 'base64' });
          socket.emit('ai-browser-frame', { base64Data: screenshot });
        } catch {
          // ignore screenshot errors while navigating
        }
      }, 1000);

      browserPages.set(socket.id, { page, interval });
      console.log(`[AI Browser] Started for ${socket.id} at ${url}`);
    } catch (error) {
      console.error('[AI Browser] Error starting:', error);
    }
  });

  socket.on('ai-browser-click', async ({ x, y }) => {
    const session = browserPages.get(socket.id);
    if (session?.page) {
      try {
        await session.page.mouse.click(x, y);
      } catch {}
    }
  });

  socket.on('ai-browser-scroll', async ({ delta }) => {
    const session = browserPages.get(socket.id);
    if (session?.page) {
      try {
        await session.page.mouse.wheel({ deltaY: delta });
      } catch {}
    }
  });

  socket.on('stop-ai-browser', async () => {
    const session = browserPages.get(socket.id);
    if (session) {
      clearInterval(session.interval);
      await session.page.close().catch(() => {});
      browserPages.delete(socket.id);
      console.log(`[AI Browser] Stopped for ${socket.id}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Signaling] Socket disconnected: ${socket.id}`);
    handleLeave(socket);

    const session = browserPages.get(socket.id);
    if (session) {
      clearInterval(session.interval);
      session.page.close().catch(() => {});
      browserPages.delete(socket.id);
    }
  });
});

// Serve built v_call client in production
app.use(
  express.static(clientDist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') {
    return next();
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

server.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
  console.log(`📡 Signaling + SPA at http://localhost:${port}`);
  console.log(`🤖 AI Proxy at ws://localhost:${port}/ai-proxy`);
});