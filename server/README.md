# StoaBoard — Node.js Backend

Bu klasör, Python/Flask backend'inin Node.js + Express karşılığıdır.
Frontend (`static/src/*.jsx`) değişmedi — aynı API endpoint'lerini konuşur.

## Stack

- **Express** — HTTP server (Flask karşılığı)
- **Prisma** — ORM (SQLAlchemy karşılığı)
- **PostgreSQL** — aynı veritabanı, sıfır veri kaybı
- **Socket.IO** — real-time chat (Flask-SocketIO karşılığı)
- **express-session** — session yönetimi
- **bcryptjs** — şifre hash (werkzeug.security karşılığı)

## Kurulum

```bash
cd server
npm install
cp .env.example .env
# .env içine DATABASE_URL, SECRET_KEY vs. ekle

# Mevcut DB'den şemayı çek (sıfırdan model yazmana gerek yok)
npm run prisma:pull
npm run prisma:generate
```

## Geliştirme

```bash
npm run dev   # nodemon ile hot-reload
```

Sunucu `http://localhost:5000` adresinde çalışır.

## Python karşılıkları

| Node dosyası | Python karşılığı |
|---|---|
| `src/index.js` | `run.py` |
| `src/app.js` | `app/__init__.py` |
| `src/config.js` | `config.py` |
| `src/db.js` | `app/__init__.py` (`db = SQLAlchemy()`) |
| `src/routes/auth.js` | `app/routes/auth.py` |
| `src/routes/api.js` | `app/routes/api.py` |
| `src/sockets/chat.js` | `app/routes/chat.py` |
| `prisma/schema.prisma` | `app/models.py` |
