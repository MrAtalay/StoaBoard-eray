// Python karşılığı: app/__init__.py'deki create_app() fonksiyonu
//
// Express uygulamasını kurar:
//  - middleware (CORS, JSON parser, session, rate limit, security headers)
//  - route'lar (auth, api)
//  - static frontend servis (static/ klasörü)
//  - Socket.IO daha sonra index.js'te http server'a bağlanır

import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { workspacesRouter } from './routes/workspaces.js';
import { projectsRouter, columnsRouter } from './routes/projects.js';
import {
  projectTasksRouter,
  tasksRouter,
  subtasksRouter,
  commentsRouter,
} from './routes/tasks.js';
import { notificationsRouter } from './routes/notifications.js';
import {
  notesRouter,
  meTasksRouter,
  taskLinkedNotesRouter,
} from './routes/notes.js';
import {
  taskAttachmentsRouter,
  attachmentsRouter,
  chatUploadRouter,
} from './routes/attachments.js';
import { channelsRouter } from './routes/channels.js';
import { chatRouter } from './routes/chat.js';

// Session store — varsayılan memory store server restart'ta tüm
// oturumları siliyordu (kullanıcı her server restart'ta tekrar login).
// PostgreSQL store kullanarak NeonDB'de "session" tablosunda kalıcılaştır.
const PgSession = connectPgSimple(session);
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon SSL gerektirir
  ssl: { rejectUnauthorized: false },
});

// Tek bir session middleware instance — hem Express hem Socket.IO ile paylaşılır
// (Socket.IO el sıkışmasında aynı cookie'den oturumu çözebilelim diye).
export const sessionMiddleware = session({
  name: config.session.cookieName,
  secret: config.secretKey,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    pool: sessionPool,
    tableName: 'session',
    createTableIfMissing: true, // ilk başlangıçta otomatik oluştur
  }),
  cookie: {
    httpOnly: config.session.cookieHttpOnly,
    secure: config.session.cookieSecure,
    sameSite: config.session.cookieSameSite,
    maxAge: config.session.maxAge,
  },
});

// index.html'i bir kez okuyup, Google Client ID'yi inject ederek cache'le.
// (Flask'taki Jinja {{ config.get('GOOGLE_CLIENT_ID') | tojson }} karşılığı —
// tek bir placeholder olduğu için template engine'e gerek yok.)
function loadIndexHtml() {
  const raw = fs.readFileSync(path.join(config.viewsDir, 'index.html'), 'utf8');
  return raw.replace(
    '{{GOOGLE_CLIENT_ID_JSON}}',
    JSON.stringify(config.googleClientId),
  );
}

export function createApp() {
  const indexHtml = loadIndexHtml();
  const app = express();

  // --- Body parsers ---
  app.use(express.json({ limit: config.maxContentLength }));
  app.use(express.urlencoded({ extended: true, limit: config.maxContentLength }));

  // --- CORS — Flask'ta CORS_ORIGINS env ile aynı mantık ---
  if (config.corsOrigins) {
    app.use(
      cors({
        origin: config.corsOrigins === '*' ? true : config.corsOrigins,
        credentials: true,
      }),
    );
  }

  // --- Session — Flask-Session karşılığı, cookie-based ---
  app.set('trust proxy', 1); // Railway/Heroku gibi proxy'ler için
  app.use(sessionMiddleware);

  // --- Rate limit — sadece /api/auth (login/register brute-force koruması) ---
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dk
    max: 30,                  // IP başına 30 deneme
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, try again later.' },
  });
  app.use('/api/auth', authLimiter);

  // --- Güvenlik header'ları (Flask after_request karşılığı) ---
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // --- Route'lar ---
  // Daha spesifik mount path'ler önce gelsin — Express ilk eşleşeni kullanır.
  app.use('/api/auth', authRouter);
  // Daha spesifik path'ler önce mount edilmeli (Express ilk eşleşen handler'a düşer).
  app.use('/api/workspaces/me/tasks', meTasksRouter);
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/projects/:projectId/tasks', projectTasksRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/columns', columnsRouter);
  app.use('/api/tasks', taskAttachmentsRouter); // /tasks/:taskId/attachments
  app.use('/api/tasks', tasksRouter);
  app.use('/api/subtasks', subtasksRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/channels', channelsRouter);
  // /api/chat/upload daha spesifik — /api/chat'ten önce mount
  app.use('/api/chat/upload', chatUploadRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/tasks', taskLinkedNotesRouter);
  app.use('/api', apiRouter);

  // --- Static frontend servis (static/ klasörü) ---
  // Versiyonlu URL'ler (?v=46) için immutable cache — istemci aynı URL'i bir
  // daha hiç istemez. Versiyonsuz isteyenler (dev'de manuel test) için 7 gün.
  app.use('/static', express.static(config.staticDir, {
    setHeaders: (res, filePath) => {
      const isVersioned = res.req?.query?.v;
      if (/\.(png|ico|svg|webp|gif|jpg|jpeg)$/i.test(filePath)) {
        // Görseller: 30 gün
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      } else if (/\.(jsx|js|css)$/i.test(filePath)) {
        if (isVersioned) {
          // Versiyonlu kod: 1 yıl + immutable — F5'te yeniden yüklenmez
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          // Versiyonsuz: kısa cache, dev sırasında değişiklikleri yakala
          res.setHeader('Cache-Control', 'public, max-age=300');
        }
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  }));

  // --- Root: index.html'i servis et (Flask'taki render_template karşılığı) ---
  app.get('/', (_req, res) => {
    res.type('html').send(indexHtml);
  });

  // --- 404 fallback ---
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'Not found' });
    } else {
      // SPA — bilinmeyen route'lar için index.html'i döndür
      res.type('html').send(indexHtml);
    }
  });

  // --- Error handler ---
  app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  });

  return app;
}
