# StoaBoard Deploy Notlari

Bu proje su an tek Flask servisi olarak calisir. Frontend dosyalari Flask tarafindan
`templates/` ve `static/` altindan servis edildigi icin ilk yayin icin onerilen yapi:

```text
GitHub -> Railway Flask service -> Neon PostgreSQL
```

Vercel'i ancak frontend daha sonra ayri bir React/Vite uygulamasina ayrilirsa eklemek
daha mantiklidir.

## 1. Neon

1. Neon'da yeni bir project/database olustur.
2. Connection string'i kopyala.
3. String'in sonunda `sslmode=require` oldugundan emin ol.

Ornek:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

## 2. Railway

Railway'de GitHub repo'yu yeni service olarak bagla. Bu repo icin start komutu zaten
`railway.toml` ve `Procfile` icinde hazir:

```bash
gunicorn -k eventlet -w 1 --bind 0.0.0.0:$PORT run:app
```

Railway service variables icine sunlari ekle:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
SECRET_KEY=long-random-secret
FLASK_ENV=production
SESSION_COOKIE_SECURE=true
SOCKETIO_ASYNC_MODE=eventlet
```

Repo kokundeki `.python-version` Railway/Nixpacks icin Python 3.12 secer. Bu, eventlet
ve PostgreSQL paketleri icin daha stabil bir production runtime saglar.

`CORS_ORIGINS` bos kalabilir, cunku frontend ve backend ayni Flask domaininden servis
ediliyor. Daha sonra frontend ayri domain'e tasinirsa ekle:

```env
CORS_ORIGINS=https://frontend-domain.example
```

## 3. Ilk yayin testi

Deploy bittikten sonra Railway URL'inde sunlari test et:

1. Register
2. Login
3. Workspace olusturma
4. Project/task/column islemleri
5. Chat ve bildirimlerin anlik gelmesi
6. Logout/login sonrasi oturumun korunmasi

## 4. Bilinen production notu

Logo ve chat dosya upload'lari su an `static/uploads/` altina kaydediliyor. Railway gibi
platformlarda local filesystem kalici depolama gibi dusunulmemeli. MVP yayini icin kabul
edilebilir, fakat gercek kullanimda Cloudinary, S3, Cloudflare R2 veya Supabase Storage
gibi dis bir dosya depolama servisine tasinmali.
