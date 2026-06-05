import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Serve Gemini API Key securely to the client
app.get('/api/live-key', (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });
  }
  res.json({ success: true, key });
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

  // Relay signal data (offers, answers, ICE candidates) between peers
  socket.on('relay-signal', ({ targetSocketId, signalData }) => {
    if (!targetSocketId) {
      console.warn(`[Relay Failed] No targetSocketId specified from ${socket.id}`);
      return;
    }
    // Relay signal with sender's socket ID
    io.to(targetSocketId).emit('signal-received', {
      senderSocketId: socket.id,
      signalData,
    });
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

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
  console.log(`[V-Call Server] Listening on port ${PORT}`);
});
