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
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { sessionPool, SESSION_TABLE } from './lib/sessionStore.js';
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
import { mcpRouter } from './routes/mcp.js';
import { chatRouter } from './routes/chat.js';
import {
  taskWorkLogsRouter,
  workLogsRouter,
  reportsRouter,
} from './routes/reports.js';

// Session store — varsayılan memory store server restart'ta tüm oturumları
// siliyordu. PostgreSQL store kullanarak NeonDB'de "session" tablosunda
// kalıcılaştırılıyor. Havuz ve oturum sonlandırma lib/sessionStore.js'te:
// parola değişince oturumları düşürmek için auth/api uçlarının da erişmesi
// gerekiyor ve buradan almak dairesel import yaratırdı.
const PgSession = connectPgSimple(session);

// Tek bir session middleware instance — hem Express hem Socket.IO ile paylaşılır
// (Socket.IO el sıkışmasında aynı cookie'den oturumu çözebilelim diye).
export const sessionMiddleware = session({
  name: config.session.cookieName,
  secret: config.secretKey,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    pool: sessionPool,
    tableName: SESSION_TABLE,
    createTableIfMissing: true, // ilk başlangıçta otomatik oluştur
  }),
  cookie: {
    httpOnly: config.session.cookieHttpOnly,
    secure: config.session.cookieSecure,
    sameSite: config.session.cookieSameSite,
    maxAge: config.session.maxAge,
  },
});

function loadIndexHtml() {
  const indexPath = path.join(config.distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    if (config.isProduction) throw new Error('static/dist/index.html not found — run the client build first.');
    return '<html><body><pre>Dev mode: run "cd client && npm run build" first, then restart the server.</pre></body></html>';
  }
  return fs.readFileSync(indexPath, 'utf8');
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

  // MCP ucu ayrı bir limitleyici istiyor: protokol konuşkan (initialize,
  // tools/list, tools/call ayrı isteklerdir), yani /api/auth'un 30'luk sınırı
  // normal kullanımı keserdi. 600/15dk ≈ 40 istek/dk; üç kişi tek ofis IP'sinin
  // arkasından rahat çalışır, döngüye giren bir model ise durur.
  const mcpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'err_mcp_rate_limited', message: 'Çok fazla MCP isteği' },
  });
  app.use('/mcp', mcpLimiter);

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
  app.use('/api/tasks', taskWorkLogsRouter);    // /tasks/:taskId/worklogs
  app.use('/api/tasks', tasksRouter);
  app.use('/api/worklogs', workLogsRouter);
  app.use('/api/reports', reportsRouter);
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

  // MCP bilinçli olarak /api altında değil: /api'nin altındaki her şey
  // tarayıcıdan, oturum çereziyle çağrılıyor. Burası tek istisna — istek
  // kullanıcının Claude istemcisinden geliyor ve çerez taşımıyor. Ayrı yol,
  // ayrı kapı (requireMcpToken), karışmasın.
  app.use('/mcp', mcpRouter);

  // --- Vite build assets (hashed filenames → immutable cache) ---
  app.use('/assets', express.static(path.join(config.distDir, 'assets'), {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  // --- Static files: uploads + images (no build step, served as-is) ---
  app.use('/static', express.static(config.staticDir, {
    setHeaders: (res, filePath) => {
      if (/\.(png|ico|svg|webp|gif|jpg|jpeg)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
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
  //
  // Beklenmeyen hataların mesajı istemciye verilmez. Prisma bağlantı hataları
  // sorgu adını ve veritabanı sunucusunun adresini metnin içinde taşıyor; bu
  // mesaj kayıt ve giriş uçlarından, yani kimlik doğrulaması olmadan, herkese
  // görünüyordu. Ayrıntı yalnızca sunucu günlüğüne yazılır.
  //
  // Bilinçli fırlatılan hatalar (err.status ile işaretlenmiş 4xx) kullanıcıya
  // anlamlı bilgi taşıdığı için olduğu gibi geçer.
  app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    const status = err.status || 500;

    if (status < 500) {
      return res.status(status).json({ error: err.message || 'Bad Request' });
    }

    const body = { error: 'Şu an bağlanılamıyor. Lütfen birazdan tekrar deneyin.' };
    // Geliştirmede gerçek sebep lazım; production'da asla dışarı çıkmaz.
    if (!config.isProduction) body.detail = err.message;
    res.status(status).json(body);
  });

  return app;
}
