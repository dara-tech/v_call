import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import ytSearch from 'yt-search';

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());

// YouTube Search API
app.get('/api/youtube/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query parameter q is required' });
    const result = await ytSearch(query);
    const videos = result.videos.slice(0, 15).map(v => ({
      id: v.videoId,
      source: 'youtube',
      title: v.title,
      thumbnail: v.thumbnail,
      duration: v.timestamp,
      author: v.author.name,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
    }));
    res.json({ videos });
  } catch (error) {
    console.error('[YouTube API Error]', error);
    res.status(500).json({ error: 'Failed to fetch YouTube results' });
  }
});

// DailyMotion Search API (free public API, no key required)
app.get('/api/dailymotion/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query parameter q is required' });
    const dmUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=id,title,thumbnail_360_url,duration,owner.screenname&limit=10&family_filter=1`;
    const response = await fetch(dmUrl);
    const data = await response.json();
    const videos = (data.list || []).map(v => ({
      id: v.id,
      source: 'dailymotion',
      title: v.title,
      thumbnail: v.thumbnail_360_url,
      duration: v.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}` : '',
      author: v['owner.screenname'] || '',
      url: `https://www.dailymotion.com/video/${v.id}`,
    }));
    res.json({ videos });
  } catch (error) {
    console.error('[DailyMotion API Error]', error);
    res.status(500).json({ error: 'Failed to fetch DailyMotion results' });
  }
});

// Unified parallel search — queries all sources simultaneously
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query parameter q is required' });

  const BASE = `http://localhost:${process.env.PORT || 5001}`;
  const [ytResult, dmResult] = await Promise.allSettled([
    fetch(`${BASE}/api/youtube/search?q=${encodeURIComponent(query)}`).then(r => r.json()),
    fetch(`${BASE}/api/dailymotion/search?q=${encodeURIComponent(query)}`).then(r => r.json()),
  ]);

  const youtube  = ytResult.status  === 'fulfilled' ? (ytResult.value.videos  || []) : [];
  const dailymotion = dmResult.status === 'fulfilled' ? (dmResult.value.videos || []) : [];

  // Interleave: 2 YT, 1 DM, 2 YT, 1 DM ... so results feel mixed
  const merged = [];
  let yi = 0, di = 0;
  while (yi < youtube.length || di < dailymotion.length) {
    if (yi < youtube.length)    { merged.push(youtube[yi++]); }
    if (yi < youtube.length)    { merged.push(youtube[yi++]); }
    if (di < dailymotion.length){ merged.push(dailymotion[di++]); }
  }

  res.json({ videos: merged, sources: { youtube: youtube.length, dailymotion: dailymotion.length } });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // For local dev and flexibility
    methods: ['GET', 'POST'],
  },
});

// Track rooms and participants in-memory
// structure: rooms[roomId] = { participants: { socketId: { userId, userName } } }
const rooms = {};

// Map socketId -> roomId (for quick lookup on disconnect)
const socketToRoom = {};

// Map virtual IDs to host socket IDs
const virtualToHost = {};

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Handle joining a room
  socket.on('join-room', ({ roomId, userId, userName }) => {
    if (!roomId || !userId) {
      console.warn(`[Join Failed] Invalid roomId or userId from socket ${socket.id}`);
      return;
    }

    console.log(`[Join Room] User "${userName}" (${userId}) joining room "${roomId}" (Socket: ${socket.id})`);

    // Leave existing room if any
    if (socketToRoom[socket.id]) {
      handleLeave(socket);
    }

    // Initialize room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        participants: {},
      };
    }

    // Add user to the room
    rooms[roomId].participants[socket.id] = { userId, userName };
    socketToRoom[socket.id] = roomId;
    socket.join(roomId);

    // Get list of other participants in this room to return to the joiner
    const others = Object.entries(rooms[roomId].participants)
      .filter(([id]) => id !== socket.id)
      .map(([id, info]) => ({ socketId: id, userId: info.userId, userName: info.userName }));

    // Send back current users in the room to the newly joined client
    socket.emit('all-users', others);

    // Notify other clients in the room that a new user joined
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      userId,
      userName,
    });
  });

  // Handle adding a virtual peer (like an AI agent hosted by a client)
  socket.on('add-virtual-user', ({ roomId, virtualId, userName }) => {
    if (!rooms[roomId]) return;
    
    virtualToHost[virtualId] = socket.id;
    rooms[roomId].participants[virtualId] = { userId: virtualId, userName };
    
    console.log(`[Virtual User] Added "${userName}" (${virtualId}) to room "${roomId}" hosted by ${socket.id}`);
    
    socket.to(roomId).emit('user-joined', {
      socketId: virtualId,
      userId: virtualId,
      userName,
    });
  });

  // Handle removing a virtual peer
  socket.on('remove-virtual-user', ({ roomId, virtualId }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    if (room && room.participants[virtualId]) {
      console.log(`[Leave Room] Virtual User (${virtualId}) left room "${roomId}"`);
      delete room.participants[virtualId];
      delete virtualToHost[virtualId];
      socket.to(roomId).emit('user-left', {
        socketId: virtualId,
        userId: virtualId,
      });
    }
  });

  // Relay signal data (offers, answers, ICE candidates) between peers
  socket.on('relay-signal', ({ targetSocketId, signalData, virtualSenderId }) => {
    if (!targetSocketId) {
      console.warn(`[Relay Failed] No targetSocketId specified from ${socket.id}`);
      return;
    }
    
    const actualTargetId = virtualToHost[targetSocketId] || targetSocketId;
    const isTargetVirtual = !!virtualToHost[targetSocketId];

    io.to(actualTargetId).emit('signal-received', {
      senderSocketId: virtualSenderId || socket.id,
      signalData,
      targetVirtualId: isTargetVirtual ? targetSocketId : undefined
    });
  });

  // Relay reactions
  socket.on('reaction', (data) => {
    if (data.roomId) {
      socket.to(data.roomId).emit('reaction', data);
    }
  });

  // Relay hand raise
  socket.on('toggle-hand', (data) => {
    if (data.roomId) {
      socket.to(data.roomId).emit('toggle-hand', data);
    }
  });

  // Handle peer disconnected
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    handleLeave(socket);
  });
});

function handleLeave(socket) {
  const roomId = socketToRoom[socket.id];
  if (!roomId) return;

  const room = rooms[roomId];
  if (room && room.participants[socket.id]) {
    const { userName, userId } = room.participants[socket.id];
    console.log(`[Leave Room] User "${userName}" (${userId}) left room "${roomId}"`);

    // Remove user
    delete room.participants[socket.id];
    delete socketToRoom[socket.id];

    // Notify other clients in the room
    socket.to(roomId).emit('user-left', {
      socketId: socket.id,
      userId,
    });

    // Clean up room if empty
    if (Object.keys(room.participants).length === 0) {
      console.log(`[Room Empty] Deleting room "${roomId}"`);
      delete rooms[roomId];
    }
  }
}

// --- Gemini Live API WebSocket Proxy ---
const wss = new WebSocketServer({ server: httpServer, path: '/ai-proxy' });

wss.on('connection', (clientWs) => {
  console.log('[AI Proxy] Client connected to AI Proxy');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[AI Proxy] GEMINI_API_KEY is not set');
    clientWs.close(1011, 'Server configuration error');
    return;
  }

  // Connect to Gemini Multimodal Live API
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
  const geminiWs = new WebSocket(geminiUrl);

  const messageBuffer = [];

  geminiWs.on('open', () => {
    console.log('[AI Proxy] Connected to Gemini API');
    // Flush buffered messages
    while (messageBuffer.length > 0) {
      const msg = messageBuffer.shift();
      geminiWs.send(msg.data, { binary: msg.isBinary });
    }
  });

  geminiWs.on('message', (data, isBinary) => {
    if (!isBinary) {
      const str = data.toString();
      if (!str.includes('serverContent') || !str.includes('modelTurn')) {
        console.log('[AI Proxy] Gemini -> Client:', str.substring(0, 100));
      }
    }
    // Forward Gemini response to Client
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  geminiWs.on('close', () => {
    console.log('[AI Proxy] Gemini API connection closed');
    clientWs.close();
  });

  geminiWs.on('error', (err) => {
    console.error('[AI Proxy] Gemini WS Error:', err);
  });

  // Forward Client messages to Gemini
  clientWs.on('message', (data, isBinary) => {
    // Only log the first few characters to avoid spam
    if (!isBinary) {
      const str = data.toString();
      if (str.includes('realtimeInput')) {
        // console.log('[AI Proxy] Forwarding realtimeInput to Gemini');
      } else {
        console.log('[AI Proxy] Client -> Gemini:', str.substring(0, 100));
      }
    }
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(data, { binary: isBinary });
    } else {
      messageBuffer.push({ data, isBinary });
    }
  });

  clientWs.on('close', () => {
    console.log('[AI Proxy] Client disconnected from AI Proxy');
    geminiWs.close();
  });
});

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
  console.log(`[V-Call Server] Listening on port ${PORT}`);
});
