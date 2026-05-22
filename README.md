# StoaBoard

Takımlar için gerçek zamanlı proje yönetim uygulaması. Workspace, proje, board, takvim, liste, notlar, chat ve bildirimler tek bir Node.js + React kabuğu içinde çalışır.

## Özellikler

- **Workspace & üyelik** — Davet kodu ile workspace'e katılma, roller ve özel rol başlıkları
- **Projeler** — İkon seçimi, üye atama, proje bazlı board/list/calendar/notes görünümleri
- **Board (Kanban)** — Sürükle-bırak kolonlar, "done" işaretli kolonlar, etiketler, atama tarihleri
- **Takvim & Liste** — Aynı görevlerin farklı görünümleri, start/due tarihleri, kişi bazlı atama tarihleri
- **Notlar** — Modal tabanlı not editörü, workspace görünürlüğü, görev linkleme
- **Chat** — Kanallar (default `general`), direkt mesaj, mesaj sabitleme, reply, soft delete, okundu bilgisi
- **Bildirimler** — Görev, mention, davet ve chat bildirimleri; Socket.IO ile canlı
- **Presence** — `online / away / dnd / offline` durumları, kullanıcı bazlı `away_timeout`
- **Auth** — E-posta + parola, Google Sign-In, şifre sıfırlama akışı
- **Tema sistemi** — `oklch()` + `color-mix()` üzerine kurulu accent renk sistemi, açık/krem/koyu tema, custom hex desteği. Marka rengi `#1a4a70` (navy).

## Teknoloji

**Backend** (`server/`)
- Node.js 20+ / Express 4
- Prisma ORM
- PostgreSQL (Neon)
- Socket.IO (real-time chat + presence)
- express-session + connect-pg-simple (PostgreSQL-backed sessions)
- google-auth-library, nodemailer, multer

**Frontend** (`static/`)
- React 18 (CDN, Babel JSX in-browser)
- Tek sayfa SPA, `server/views/index.html` üzerinden bootstrap
- `static/src/` altında modüler JSX (views, modals, drawer, chat, notifications, palette, tweaks)

## Proje Yapısı

```
StoaBoard/
├── server/
│   ├── src/
│   │   ├── index.js            # HTTP + Socket.IO başlat
│   │   ├── app.js              # Express app + middleware
│   │   ├── config.js           # Env odaklı config
│   │   ├── db.js               # Prisma client (warmup ile)
│   │   ├── routes/             # auth, api, workspaces, projects, tasks,
│   │   │                       # channels, chat, notes, notifications, attachments
│   │   ├── sockets/chat.js     # Socket.IO event handler'ları
│   │   └── lib/                # password, session, rateLimit, user, workspace,
│   │                           # channels, notes, projects, uploads, serializers
│   ├── prisma/
│   │   └── schema.prisma       # DB şeması (Neon ile senkron)
│   ├── views/index.html        # SPA bootstrap (Babel + React CDN)
│   └── package.json
├── static/
│   ├── src/                    # React kaynak dosyaları
│   ├── styles.css              # oklch tabanlı tema
│   └── *.png/svg               # marka asset'leri
├── railway.toml                # Railway deploy config
├── nixpacks.toml               # Node 20 pin
└── README.md
```

## Geliştirme

### Gereksinimler
- Node.js 20+
- PostgreSQL erişimi (önerilen: Neon ücretsiz tier)

### Adımlar

```bash
git clone https://github.com/crashnn/StoaBoard.git
cd StoaBoard/server

# Bağımlılıklar (postinstall ile Prisma Client de generate edilir)
npm install

# .env oluştur
cp .env.example .env
# DATABASE_URL, SECRET_KEY, GOOGLE_CLIENT_ID değerlerini doldur

# Mevcut DB şemasını çek (ilk kurulumda)
npm run prisma:pull
npm run prisma:generate

# Çalıştır
npm run dev          # nodemon + hot reload
# veya
npm start            # production modu
```

Uygulama [http://localhost:5000](http://localhost:5000) adresinde açılır.

### Önemli env değişkenleri

```env
# Zorunlu
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
SECRET_KEY=long-random-string-en-az-32-byte

# Opsiyonel
PORT=5000
NODE_ENV=development              # production'da otomatik tetiklenir
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
CORS_ORIGINS=http://localhost:5000  # virgülle ayır; '*' tüm origin
SESSION_COOKIE_SECURE=false       # production'da true

# SMTP (şifre sıfırlama mailı için; yoksa konsola yazar)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=no-reply@stoaboard.app
```

## Production Deploy (Railway)

`GitHub → Railway → Neon PostgreSQL` akışı:

1. Railway'de yeni proje, GitHub repo'sunu bağla
2. Environment Variables ekle:
   - `DATABASE_URL` (Neon'dan al, `?sslmode=require` ile)
   - `SECRET_KEY` (32+ byte rastgele)
   - `SESSION_COOKIE_SECURE=true`
   - `NODE_ENV=production`
   - `GOOGLE_CLIENT_ID` (opsiyonel)
3. Deploy otomatik tetiklenir

[railway.toml](railway.toml) build ve start komutlarını yönetir:
- Build: `cd server && npm ci && npx prisma generate`
- Start: `cd server && npm start`
- Healthcheck: `GET /`

> **Uyarı:** `chat upload` ve `task attachment` dosyaları PostgreSQL'de bytea olarak tutulur. Bu, Railway gibi efemer filesystem'lerde kayıp riskini önler. Yüksek hacimli kullanım için Cloudinary/S3/R2 entegrasyonu önerilir.

## Tema & Renk Sistemi

Accent renk sistemi `oklch()` + `color-mix()` üzerine kuruludur. Yeni renk eklerken hex yerine oklch tercih edilir; soft/softer/ink türevleri otomatik üretilir.

- CSS değişkenleri: [static/styles.css](static/styles.css) → `:root` (default navy) + `[data-accent="..."]` + `[data-accent="custom"]`
- Accent state: `localStorage.stoa.tweaks` JSON, anahtar `accent` ve opsiyonel `accentHex`
- App.jsx içinde `document.documentElement.dataset.accent` set edilir; `custom` durumunda `--accent` inline yazılır
- Auth ekranları (`static/src/views/auth.jsx`) bilinçli olarak hardcoded `#1a4a70` kullanır — login öncesi tweaks yüklü değildir

## Güvenlik Notları

- `SECRET_KEY` production'da env üzerinden zorunlu
- CORS env ile kısıtlanır (`CORS_ORIGINS`)
- Rate limiting (`/api/auth` için 15 dk içinde 30 deneme), session lifetime 30 gün, HttpOnly + SameSite=Lax cookie
- Production'da `SESSION_COOKIE_SECURE=true` ile HTTPS zorunlu
- `X-Content-Type-Options`, `X-Frame-Options=SAMEORIGIN`, `Referrer-Policy` header'ları
- Upload limiti 10 MB; attachment 20 MB; chat upload 50 MB
- Şifre hash: Node'un yerleşik `crypto.scryptSync` (werkzeug scrypt formatıyla uyumlu)
- Session store: PostgreSQL (`connect-pg-simple`), server restart'ında oturum kaybı yok

## Lisans

Özel proje. Yayım hakları sahibine aittir.
