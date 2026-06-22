import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import ytSearch from 'yt-search';
import { setupAIProxy } from './ai-proxy.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5002;

app.use(cors({
  origin: '*'
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Signaling and AI Proxy Server running' });
});

app.get('/api/calls/turn-credentials', (req, res) => {
  // Return dummy or default ICE servers to prevent 404
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  });
});

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query) return res.json({ videos: [], sources: {} });

    console.log(`[Search] Searching YouTube for: ${query}`);
    const r = await ytSearch(query);
    
    const videos = r.videos.slice(0, 24).map(v => ({
      id: v.videoId,
      source: 'youtube',
      title: v.title,
      thumbnail: v.thumbnail,
      duration: v.timestamp,
      author: v.author.name,
      url: v.url
    }));

    res.json({
      videos,
      sources: {
        youtube: videos.length
      }
    });
  } catch (error) {
    console.error('[Search] Error:', error);
    res.status(500).json({ error: 'Failed to search videos' });
  }
});

const server = http.createServer(app);

// Setup AI Proxy WebSocket on /ai-proxy
setupAIProxy(server);

// Setup Socket.IO for WebRTC Signaling
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Basic room tracking
const rooms = new Map(); // roomId -> Set of socketIds

io.on('connection', (socket) => {
  console.log(`[Signaling] Socket connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, userId, userName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.userName = userName;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);

    console.log(`[Signaling] User ${userName} (${socket.id}) joined room ${roomId}`);

    // Notify others in the room
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      userId,
      userName
    });
  });

  socket.on('relay-signal', ({ targetSocketId, signalData }) => {
    // Relay WebRTC signals to the target peer
    io.to(targetSocketId).emit('signal', {
      senderSocketId: socket.id,
      signalData
    });
  });

  socket.on('video-sync', ({ roomId, videoState }) => {
    // Broadcast Youtube Watch Party state to everyone else in the room
    socket.to(roomId).emit('video-sync-update', videoState);
  });

  socket.on('chat-message', ({ roomId, message }) => {
    // Broadcast chat messages
    socket.to(roomId).emit('chat-message', message);
  });

  socket.on('toggle-hand', ({ roomId, socketId, handRaised }) => {
    socket.to(roomId).emit('hand-toggled', { socketId, handRaised });
  });

  socket.on('reaction', ({ roomId, socketId, emoji }) => {
    socket.to(roomId).emit('reaction-triggered', { socketId, emoji });
  });

  socket.on('add-virtual-user', ({ roomId, virtualId, userName }) => {
    io.in(roomId).emit('virtual-user-added', { virtualId, userName });
  });

  socket.on('remove-virtual-user', ({ roomId, virtualId }) => {
    io.in(roomId).emit('virtual-user-removed', { virtualId });
  });

  socket.on('disconnect', () => {
    console.log(`[Signaling] Socket disconnected: ${socket.id}`);
    if (socket.roomId) {
      if (rooms.has(socket.roomId)) {
        rooms.get(socket.roomId).delete(socket.id);
        if (rooms.get(socket.roomId).size === 0) {
          rooms.delete(socket.roomId);
        }
      }
      socket.to(socket.roomId).emit('user-left', { socketId: socket.id });
    }
  });
});

server.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
  console.log(`📡 Signaling available at http://localhost:${port}`);
  console.log(`🤖 AI Proxy available at ws://localhost:${port}/ai-proxy`);
});
