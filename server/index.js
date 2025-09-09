const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:5001"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('client/build'));

// Store active rooms and users
const rooms = new Map();
const users = new Map();

// Generate unique room codes
const generateRoomCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room with invitation code
  socket.on('join-room', (data) => {
    const { roomCode, username } = data;
    
    if (!rooms.has(roomCode)) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const room = rooms.get(roomCode);
    socket.join(roomCode);
    
    // Store user info
    users.set(socket.id, {
      id: socket.id,
      username,
      roomCode,
      isAudioEnabled: true
    });

    // Add user to room
    room.users.set(socket.id, users.get(socket.id));
    
    // Notify others in room
    socket.to(roomCode).emit('user-joined', {
      user: users.get(socket.id),
      users: Array.from(room.users.values())
    });

    // Send current room state to new user
    socket.emit('room-joined', {
      roomCode,
      users: Array.from(room.users.values()),
      messages: room.messages || []
    });

    console.log(`${username} joined room ${roomCode}`);
  });

  // Create new room
  socket.on('create-room', (data) => {
    const { username } = data;
    const roomCode = generateRoomCode();
    
    // Create new room
    const room = {
      code: roomCode,
      created: new Date(),
      users: new Map(),
      messages: []
    };
    
    rooms.set(roomCode, room);
    
    // Join the room
    socket.join(roomCode);
    
    // Store user info
    users.set(socket.id, {
      id: socket.id,
      username,
      roomCode,
      isAudioEnabled: true
    });
    
    // Add user to room
    room.users.set(socket.id, users.get(socket.id));
    
    socket.emit('room-created', {
      roomCode,
      users: Array.from(room.users.values())
    });

    console.log(`Room ${roomCode} created by ${username}`);
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Handle chat messages
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const room = rooms.get(user.roomCode);
    if (!room) return;

    const message = {
      id: uuidv4(),
      text: data.text,
      sender: user.username,
      senderId: socket.id,
      timestamp: new Date(),
      type: 'text'
    };

    room.messages.push(message);
    
    // Broadcast to all users in room
    io.to(user.roomCode).emit('new-message', message);
  });

  // Handle user media state changes
  socket.on('toggle-audio', () => {
    const user = users.get(socket.id);
    if (user) {
      user.isAudioEnabled = !user.isAudioEnabled;
      socket.to(user.roomCode).emit('user-media-changed', {
        userId: socket.id,
        isAudioEnabled: user.isAudioEnabled
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      const room = rooms.get(user.roomCode);
      if (room) {
        room.users.delete(socket.id);
        
        // Notify others in room
        socket.to(user.roomCode).emit('user-left', {
          userId: socket.id,
          users: Array.from(room.users.values())
        });

        // Clean up empty rooms
        if (room.users.size === 0) {
          rooms.delete(user.roomCode);
          console.log(`Room ${user.roomCode} deleted (empty)`);
        }
      }
      
      users.delete(socket.id);
      console.log('User disconnected:', socket.id);
    }
  });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
