import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    socket.on('join', (room: string) => {
      socket.join(room);
      console.log(`🔌 Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('leave', (room: string) => {
      socket.leave(room);
      console.log(`🔌 Socket ${socket.id} left room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

export const emitToUser = (userId: string, event: string, data: any) => {
  if (io) {
    io.to(userId).emit(event, data);
  }
};

export const emitToRoom = (room: string, event: string, data: any) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};
