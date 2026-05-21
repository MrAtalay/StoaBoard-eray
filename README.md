# StoaBoard

Takımlar için gerçek zamanlı proje yönetim uygulaması. Workspace, proje, board, takvim, liste, notlar, chat ve bildirimler tek bir Flask + React kabuğu içinde çalışır.

## Özellikler

- **Workspace & üyelik** – Davet kodu ile workspace'e katılma, roller ve özel rol başlıkları
- **Projeler** – İkon seçimi, üye atama, proje bazlı board/list/calendar/notes görünümleri
- **Board (Kanban)** – Sürükle-bırak kolonlar, "done" işaretli kolonlar, etiketler, atama tarihleri
- **Takvim & Liste** – Aynı görevlerin farklı görünümleri, start/due tarihleri, kişi bazlı atama tarihleri
- **Notlar** – Modal tabanlı not editörü
- **Chat** – Kanallar (default `general`), direkt mesaj, mesaj sabitleme, reply, soft delete, okundu bilgisi
- **Bildirimler** – Görev, mention, davet ve chat bildirimleri; Socket.IO ile canlı
- **Presence** – `online / away / dnd / offline` durumları, kullanıcı bazlı `away_timeout`
- **Auth** – E-posta + parola, Google Sign-In, şifre sıfırlama akışı
- **Tema sistemi** – `oklch()` + `color-mix()` üzerine kurulu accent renk sistemi, açık/krem/koyu tema, custom hex desteği. Marka rengi `#1a4a70` (navy).

## Teknoloji

**Backend**
- Flask 3 + Flask-SQLAlchemy + Flask-SocketIO
- SQLite (dev) / PostgreSQL (prod, Neon)
- Eventlet worker (prod), threading (dev / Python 3.14+)
- Google Auth, Werkzeug security

**Frontend**
- React 18 (CDN, Babel JSX in-browser)
- Tek sayfa SPA, `templates/index.html` üzerinden bootstrap
- `static/src/` altında modüler JSX (views, modals, drawer, chat, notifications, palette, tweaks)

## Proje Yapısı

```
StoaBoard/
├── app/
│   ├── __init__.py        # create_app, db.create_all, idempotent migrations, seed
│   ├── models.py          # User, Workspace, Project, Task, Channel, ChatMessage, ...
│   ├── online_state.py    # Presence tracking
│   └── routes/
│       ├── auth.py        # /api/auth (register, login, google, password reset)
│       ├── api.py         # /api (workspace, project, task, notification, upload)
│       └── chat.py        # Socket.IO event handlers
├── static/
│   ├── src/               # Çalışan React kaynakları (CDN üzerinden serve edilir)
│   │   ├── app.jsx
│   │   ├── views/         # auth, dashboard, board, list, calendar, notes, settings
│   │   ├── modals.jsx, drawer.jsx, chat.jsx, notifications.jsx,
│   │   │   palette.jsx, tweaks.jsx, shell.jsx, icons.jsx, data.jsx
│   ├── styles.css         # oklch tabanlı tema + accent sistemi
│   └── uploads/           # Logo ve chat dosya yüklemeleri (dev)
├── templates/
│   └── index.html         # SPA bootstrap
├── scripts/
│   └── cleanup_orphans.py
├── config.py              # Env tabanlı config (DB, secret, CORS, session)
├── run.py                 # eventlet monkey_patch + socketio.run
├── requirements.txt
├── Procfile               # gunicorn -k eventlet -w 1 run:app
├── railway.toml
└── DEPLOYMENT.md
```

> **Not:** Asıl çalışan frontend kodu [static/src/](static/src/) altındadır. Bir `src/` dev kopyası varsa serve edilmez — değişiklikleri [static/src/](static/src/)'e uygulayın.

## Kurulum (Geliştirme)

### Gereksinimler
- Python 3.12+ önerilir (3.14 destekli, ama eventlet yerine threading'e düşer)
- pip

### Adımlar

```bash
git clone <repo-url>
cd StoaBoard

python -m venv .venv
. .venv/Scripts/activate    # PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python run.py
```

Uygulama [http://localhost:5000](http://localhost:5000) adresinde açılır.

İlk çalıştırmada:
- `stoaboard.db` (SQLite) otomatik oluşur
- `.secret_key` dosyası dev için kalıcı secret üretir
- Schema migration'ları ve `general` kanal seed'i otomatik çalışır

`init_db.py` çalıştırmanıza **gerek yoktur**; `db.create_all()` zaten `create_app()` içinde tetiklenir.

### Opsiyonel .env

```env
SECRET_KEY=optional-dev-secret
DATABASE_URL=postgresql://...        # boş bırakılırsa SQLite
GOOGLE_CLIENT_ID=...                 # Google Sign-In için
CORS_ORIGINS=http://localhost:3000   # frontend ayrı domaindeyse
SOCKETIO_ASYNC_MODE=threading        # eventlet sorunluysa
```

## Production Deploy

`GitHub → Railway → Neon PostgreSQL` akışı önerilir. Detaylı adımlar için [DEPLOYMENT.md](DEPLOYMENT.md) dosyasına bakın.

Kısaca:

```env
DATABASE_URL=postgresql://USER:PASS@HOST/DB?sslmode=require
SECRET_KEY=long-random-secret
FLASK_ENV=production
SESSION_COOKIE_SECURE=true
SOCKETIO_ASYNC_MODE=eventlet
```

Start komutu (`Procfile` + `railway.toml`):

```bash
gunicorn -k eventlet -w 1 --bind 0.0.0.0:$PORT run:app
```

> **Uyarı:** `static/uploads/` Railway gibi efemer filesystem'lerde kalıcı değildir. Gerçek kullanımda Cloudinary / S3 / R2 / Supabase Storage'a taşıyın.

## Tema & Renk Sistemi

Accent renk sistemi `oklch()` + `color-mix()` üzerine kuruludur. Yeni renk eklerken hex yerine oklch tercih edilir; soft/softer/ink türevleri otomatik üretilir.

- CSS değişkenleri: [static/styles.css](static/styles.css) → `:root` (default navy) + `[data-accent="..."]` + `[data-accent="custom"]`
- Accent state: `localStorage.stoa.tweaks` JSON, anahtar `accent` ve opsiyonel `accentHex`
- App.jsx içinde `document.documentElement.dataset.accent` set edilir; `custom` durumunda `--accent` inline yazılır
- Auth ekranları (`static/src/views/auth.jsx`) bilinçli olarak hardcoded `#1a4a70` kullanır — login öncesi tweaks yüklü değildir

## Güvenlik Notları

- Secret key prod'da env üzerinden zorunlu, dev'de `.secret_key` dosyasında tutulur
- CORS env ile kısıtlanır (`CORS_ORIGINS`)
- Rate limiting, session lifetime (30 gün), HttpOnly + SameSite=Lax cookie
- Production'da `SESSION_COOKIE_SECURE=true` ile HTTPS zorunlu
- `X-Content-Type-Options`, `X-Frame-Options=SAMEORIGIN`, `Referrer-Policy` header'ları
- Upload limiti 10 MB (`MAX_CONTENT_LENGTH`)

## Bilinen Sınırlamalar

- Filesystem upload'ları (logo, chat dosyaları) MVP içindir — prod için object storage gerekir
- Eventlet, Python 3.14 ile uyumsuz; otomatik olarak threading moduna düşer
- Frontend React CDN + in-browser Babel ile çalışır — build pipeline yoktur (kasıtlı tercih)

## Lisans

Özel proje. Yayım hakları sahibine aittir.
