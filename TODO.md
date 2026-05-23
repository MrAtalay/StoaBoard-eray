# StoaBoard — To-Do

## ✅ Tamamlananlar

- **#1** Vite dev'de `/static/` proxy eklendi (`vite.config.js`)
- **#2** NotesView render-fazı setState hatası düzeltildi (`notes.jsx` + `useEffect`)
- **#3** Görev drawer tam ekran → view değişince temizleme (`app.jsx` `useEffect([view])`)
- **#4** Çizelge proje değiştirince bozulma — `BoardView key={currentProject?.id}` zaten var, state sıfırlanıyor ✓
- **#5** Çizelge sticky panel z-index düzeltildi (`.tl-side` z-index: 2, group: 3)
- **#6** Notes sort dropdown — `appearance: none` + custom arrow SVG eklendi
- **#7** Notes filters select — `appearance: none` + custom arrow SVG eklendi
- **#8** Bildirim time input — `color-scheme`, focus ring, picker indicator düzeltildi
- **#9** Dashboard bar chart — arka plan rail, ince bar (70%), dark theme renkleri eklendi
- **#10** Takvim haftalık holiday dot — absolute konumlandırıldı, layout shift giderildi
- **#11** Google OAuth `.env.local` oluşturuldu

---

## ⚙️ Deploy (Railway) — commit öncesi bekliyor

### 12. Railway environment variables
- `DATABASE_URL` — Neon connection string
- `SECRET_KEY` — güçlü rastgele string
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `VITE_GOOGLE_CLIENT_ID` — aynı değer (build-time, Vite için)
- `NODE_ENV=production`
- `SESSION_COOKIE_SECURE=true`

### 13. Railway ilk deploy sonrası
- `prisma db push` build command'a eklendi (railway.toml'da mevcut)
- Deploy logunda "Your database is now in sync" mesajı kontrol edilecek
