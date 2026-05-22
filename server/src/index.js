// Python karşılığı: run.py
//
// HTTP server + Socket.IO server'ı kurar ve dinlemeye başlar.

import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

import { config } from './config.js';
import { createApp } from './app.js';
import { registerChatHandlers } from './sockets/chat.js';

const app = createApp();
const server = http.createServer(app);

// Socket.IO — Flask-SocketIO karşılığı
const io = new SocketIOServer(server, {
  cors: {
    origin: config.corsOrigins === '*' ? true : (config.corsOrigins || false),
    credentials: true,
  },
});

// Socket.IO instance'ını Express request'lerinden erişebilir kıl (req.app.get('io'))
app.set('io', io);

registerChatHandlers(io);

server.listen(config.port, () => {
  console.log(
    `[stoaboard] server listening on http://localhost:${config.port}  ` +
      `(env=${config.isProduction ? 'production' : 'development'})`,
  );
});
