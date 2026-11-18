import 'dotenv/config';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { app } from './app.js';
import { db } from './db/index.js';

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' } });
io.use((socket,next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const user = jwt.verify(token,process.env.JWT_SECRET || 'local-demo-only-change-this-secret');
    socket.data.userId = user.id;
    next();
  } catch {
    next(new Error('Session expired'));
  }
});
io.on('connection',socket => socket.join(`user:${socket.data.userId}`));
app.set('io',io);
const port = Number(process.env.PORT || 4000);
server.listen(port,() => console.log(`CivicGaps API listening on http://localhost:${port}`));
for (const signal of ['SIGINT','SIGTERM']) {
  process.on(signal,() => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
