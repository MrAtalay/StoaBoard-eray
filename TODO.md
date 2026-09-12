# StoaBoard — To-Do

Canlı: [stoaboard.com](https://www.stoaboard.com) · Railway + Neon PostgreSQL,
`main`e push ile otomatik dağıtım.

---

> **Toplantı geri bildirimlerinin karşılığı** — hangi not için ne yapıldı, ne
> yapılmadı ve neden: [TOPLANTI-KARSILIGI.md](TOPLANTI-KARSILIGI.md).
> Güvenlik çalışma biçimi ve her özelliğin geçmesi gereken elek:
> [GUVENLIK.md](GUVENLIK.md).

---

## ✅ Güvenlik turu — 1 Eylül 2026

Raporlama turunun hemen ardından, dal üzerinde yapılan güvenlik denetimi ve
sonuçları. Çalışma biçimi ve tehdit modeli artık [GUVENLIK.md](GUVENLIK.md)
içinde — **her yeni özellik oradaki on soruluk elekten geçmeli.**

**Denetimden çıkan ve kapatılan bulgular**
- **CSV formül enjeksiyonu (yüksek).** Rapor CSV'lerindeki görev başlıkları ve
  kişi adları kullanıcı girdisi. Excel `=` `+` `-` `@` ile başlayan hücreyi
  formül sayıp çalıştırıyor; tırnaklamak engellemiyor. Bir üye kart başlığını
  `=HYPERLINK(...)` yapıp **raporu açan yöneticinin makinesinde** veri
  sızdırabilirdi. Saldırı verinin kendisini değil, veriyi açan kişiyi hedefliyor.
- **Kullanıcı varlığı oracle'ı (düşük).** `/api/reports/person?user=<slug>`
  çözümlemesi tüm platformda ve yetki kontrolünden **önce** yapılıyordu:
  olmayan slug 404, olan 403. Arama artık çalışma alanı üyeleriyle sınırlı.
- **İç hata mesajı sızıntısı.** Hata yakalayıcı her `err.message`ı olduğu gibi
  döndürüyordu; Prisma bağlantı hataları sorgu adını ve veritabanı sunucusunun
  adresini taşıyor ve bu **kayıt/giriş ekranından, kimlik doğrulaması olmadan**
  görülebiliyordu.

**Denetim kaydı (`audit_logs`)**
- Kim, ne zaman, hangi raporu, hangi aralıkla, kaç satır dışa aktardı — IP ve
  tarayıcı bilgisiyle. İçeriden sızıntıya karşı pratikte işe yarayan kontrol
  engelleme değil izlenebilirlik: veriyi görmesi meşru olan biri onu kopyalamayı
  zaten başarır, ama kaydın tutulduğunu bilmek caydırır.
- Rapor ekranında **Denetim kaydı** sekmesi. Yalnızca `manage_workspace` —
  denetim kaydının kendisi de hassas bir yüzey.
- Kayda asla veri içeriği yazılmıyor, yalnızca bağlam.
- Geçiş ve süre kayıtlarıyla aynı gerekçeyle ilişkisiz: sildiğin kullanıcıyla
  birlikte kaybolan denetim kaydı, denetim kaydı değildir.

**Denetlenip temiz bulunanlar**
- Çalışma alanları arası IDOR yok — `?project=` çalışma alanıyla AND'leniyor,
  yabancı proje kimliği boş küme veriyor.
- `userToDict` e-posta döndürmüyor; genel/özel serileştirici ayrımı sağlam.
- Direkt mesajlar çalışma alanı ortaklığıyla, özel kanallar üyelikle korunuyor.
- CSRF `SameSite=lax` ile kapalı; ham SQL yok.

---

## ✅ Raporlama turu — 1 Eylül 2026

Netaş toplantısındaki geri bildirimler üzerine. Toplantının üç ayrı notu
("6 ayda bir raporlama", "log girişi / work log developer", "Furkan hangi
task'larda çalışmış") tek bir talebe işaret ediyordu: **kişi bazlı, geriye
dönük, süre içeren raporlama.**

**Veritabanı — kayıt bugünden birikmeye başlıyor**
- **Görev geçiş kaydı** (`task_transitions`). Kart her taşındığında bir satır:
  görev, önceki/yeni kolon, kim, ne zaman. Kartın ilk yerleşimi de geçiş sayılır.
  **İlişki (FK) bilerek kurulmadı** — görev, proje veya kullanıcı silinse de
  satır yaşamalı; çöp kutusu 30 günde kalıcı sildiği için aksi hâlde altı aylık
  rapor delik çıkardı. Görev başlığı, kişi adı ve kolon başlıkları o anki
  hâliyle kopyalanıyor.
- **Süre kaydı** (`work_logs`). Kişinin göreve harcadığı emek, manuel giriş.
  Aynı gerekçeyle ilişkisiz ve denormalize.
- **`tasks.completed_at`.** Yoktu; "bu iş ne kadar sürede tamamlandı" sorusu bu
  yüzden hiçbir şekilde cevaplanamıyordu. Bitiş kolonuna girişte yazılıyor,
  çıkışta siliniyor; iki bitiş kolonu arasında gezinirken ilk zaman korunuyor.

> Geçiş süresi ile harcanan emek **ayrı şeylerdir**: bir iş üç haftada bitmiş
> ama altı saat emek almış olabilir. İlki tıkanıklığı, ikincisi maliyeti
> gösterir. Jira'nın da ayrı tuttuğu ayrım bu.

**Raporlar**
- **Kişi raporu** — kim, hangi işte, ne kadar süre. Başkasının raporu için
  `view_reports` izni gerekiyor; kişi kendi raporunu her zaman görüyor.
- **Dönem raporu** — ne açıldı, ne bitti, ne bekliyor; kolon hareketleri.
- **Akış raporu** — ortalama/ortanca tamamlanma süresi, kolonlarda bekleme,
  en uzun süren işler.
- Aralık ön ayarları: bu ay / son 3 ay / **son 6 ay** / bu yıl.
- **CSV** (noktalı virgül + BOM — Türkçe Excel doğru açsın diye) ve
  **yazdırma sayfası**. PDF kütüphanesi bilinçli olarak eklenmedi: tarayıcının
  "PDF olarak kaydet"i aynı işi görüyor, maliyeti onda biri.

**E-posta bildirimi**
- SMTP altyapısı kuruluydu ama yalnızca şifre sıfırlamada kullanılıyordu. Atama
  ve bahsetme bildirimleri postaya bağlandı.
- **Varsayılan kapalı.** `NOTIFY_EMAIL=1` verilmeden tek posta gitmez — SMTP
  zaten tanımlı olduğu için aksi hâlde ilk dağıtımda herkese posta giderdi.
  `NOTIFY_EMAIL_TYPES` ile tür seçilebiliyor, kullanıcı bazında kapatılabiliyor.

**Kolon geçiş kuralı**
- Toplantıda gösterilen Jira ekranındaki "Open → yalnızca In Review" kısıtının
  karşılığı. Kolona izin verilen sonraki kolonlar tanımlanabiliyor; boş
  bırakılırsa kısıt yok, mevcut panolar aynen çalışıyor. **Kolon menüsünden
  yönetiliyor**; engellenen taşımada kullanıcı sebebi görüyor.

**Yol üstünde bulunan hata**
- **Yeni projelerde bitiş kolonu işaretlenmiyordu.** Varsayılan kolonlar
  oluşturulurken "Tamamlandı" kolonuna `is_done` konmuyordu; bu yüzden yeni
  projelerde tamamlanan sayacı, ilerlemenin %100'e çekilmesi ve tamamlanma
  zamanı hiç çalışmıyordu. Düzeltildi (yalnızca yeni projeleri etkiler).

> ✅ **Veritabanı adımı tamamlandı (2 Eylül).** Şema production'a uygulandı —
> Neon SQL Editor üzerinden, **üç yeni tablo** (`task_transitions`, `work_logs`,
> `audit_logs`) ve **üç yeni sütun** (`tasks.completed_at`,
> `board_columns.allowed_next`, `users.email_notifications`) yerinde ve
> doğrulandı. Hepsi katkı niteliğindeydi, veri kaybı olmadı.
>
> Bunun için açılan Neon `raporlama-test` dalı **artık atıl** — silinebilir.
> [RAPORLAMA-TESTI.md](RAPORLAMA-TESTI.md) tarihsel kayıt olarak duruyor;
> yeniden kurulum talimatı değil.
>
> Bundan sonraki şema değişikliklerinde `db push`'un deploy zincirinden
> çıkarıldığını unutma — şema artık **bilinçli ve elle** gönderiliyor
> (gerekçe: [CLAUDE.md](CLAUDE.md), tuzaklar bölümü).

---

## ✅ Bu turda kapatılanlar

Canlı sistem üzerinde yapılan inceleme sonucu bulunan ve düzeltilen hatalar.

### Veri bütünlüğü
- **Not gövdesi hiç yüklenmiyordu.** Liste ucu notları `includeBody: false` ile
  döndürüyor, gövde yalnızca `GET /api/notes/:id`den geliyor — ama istemci o
  çağrıyı hiç yapmıyordu. Not boş açılıyor, kullanıcı bir şey yazıp alandan
  çıkınca boş gövde kaydedilip **içerik siliniyordu.** Açılışta gövde çekiliyor,
  yüklenmeden kaydetme yapılmıyor, gövde sonradan gelince editöre aktarılıyor.
- **İlerleme yüzdesi bayat kalıyordu.** Hesap yalnızca `PATCH /api/subtasks/:id`
  içinde yapılıyordu; alt görev eklenince, silinince ve kart "tamamlandı"
  kolonundan çıkarılınca güncellenmiyordu. Ortak `recalcTaskProgress()`
  yardımcısı eklendi, üç çağrı yerine bağlandı.

### Ana sayfa
- **Haftalık ilerleme grafiği hiçbir zaman çalışmıyordu.** Sunucu kolonu
  `{ id: <slug>, db_id, ... }` olarak gönderiyor — `slug` alanı yok. Ana sayfa
  19 yerde `c.slug` okuyordu; sonuç `undefined` olunca her günün toplamı sıfır
  çıkıyor ve "veri olmayan günleri gizle" filtresi grafiği tamamen boşaltıyordu.
  Aylık görünüm ve "bu hafta tamamlanan" göstergesi de aynı sebeple ölüydü.

### Arayüz
- **Sol panel kaydırılamıyordu** — proje/DM birikince alt kısım kırpılıyor ve
  ulaşılamıyordu. Orta blok `.sidebar-scroll` içine alındı; çubuk gizli, tekerlek
  ve dokunmatik ile geziniyor.
- **Bildirim paneli ikinci tıklamada kapanmıyordu** — panelin `mousedown` dışarı
  tıklama kapanışı ile butonun `click` toggle'ı birbirini iptal ediyordu. Zil
  butonu `data-notif-toggle` ile istisna tutuldu.
- **Çöp Kutusu sola yapışıyordu** — `max-width` var ama ortalama yok. Diğer
  görünümler gibi alanı dolduruyor.

### Mobil
- **Sohbet dar bir sütuna sıkışıyordu.** Izgara `:has()` kurallarıyla tanımlı
  (0,2,0); mobil kural sade `.chat-fp-grid` (0,1,0). Medya sorgusu özgüllük
  eklemediği için mobil kural hiç uygulanmıyordu — panel `display:none` olsa bile
  sütunu yer kaplamaya devam ediyordu. **760–1100px arası da aynı sebeple
  bozuktu.** Her iki kırılımda `:has()` varyantları yazıldı.
- **Pano araç çubuğu taşıyordu** — Liste/Kanban/Tablo/Çizelge sekmeleri ekran
  dışında kalıp erişilemiyordu. 768px altında yatay kaydırma eklendi.
- **Ayarların 13 sekmesinin devamı belli olmuyordu** — çubuk gizlendi, sağ kenara
  soluma ipucu kondu.

### Temizlik
- Vite'a geçmeden önceki CDN tabanlı ön yüz kaldırıldı: `static/src/`,
  `static/styles.css`, `server/views/index.html` — **~26.000 satır ölü kod.**
  Artık servis edilmiyordu, `static/dist` kullanılıyor.
- README güncel mimariye çekildi (client/ + Vite, iki paketli kurulum,
  gerçek Railway build komutu, `VITE_GOOGLE_CLIENT_ID`).

---

## 🔜 Sıradakiler

### 🔌 MCP entegrasyonu — Claude panoyu sürsün (9 Eylül 2026, başlandı)

**Amaç.** Ekip bugün proje yönetimini Notion + MCP üzerinden yürütüyor, oysa
pano elimizde. StoaBoard bir MCP sunucusu açarsa Claude Desktop / Cowork
üzerinden görev açılır, atanır, taşınır, kapatılır; arkadaşların tarafında
hiçbir şey değişmez — onlar sadece panoyu görür. Kazanç tek taraflı, ama araç
AI'a hiç dokunmayan için de aynen çalışmaya devam ediyor. Notion ölmüyor:
**belge Notion'da kalır, görev StoaBoard'a taşınır.**

**Mimari kararı.** MCP sunucusu Express'in içinde bir router
(`server/src/routes/mcp.js`), Railway'de ikinci servis yok. Prisma'ya
**dokunmuyor** — kendi HTTP API'sini çağırıyor. Gerekçe: görev oluşturmak bu
depoda satır yazmak değil. `POST /projects/:id/tasks` tek çağrıda izin
kontrolü, atama bildirimi, soket yayını, aktivite kaydı ve `task_transitions`
geçişini birlikte yapıyor. Doğrudan `INSERT` bunların hepsini atlar: kartlar
bildirimsiz kalır, raporlarda görünmez, izin kapısından hiç geçmez. API
üzerinden gidince kolon geçiş kuralları (`allowedNext`) da bedava geliyor —
Claude yasak geçiş denerse 409 alıp sebebini okuyor.

**Araç → uç eşlemesi.** Sekiz aracın yedisi mevcut uçlara birebir oturuyor,
tek satır yeni iş mantığı yok:

| Araç | Uç |
|---|---|
| `list_projects` / `create_project` | `GET` / `POST /api/projects` |
| `list_tasks` | `GET /api/projects/:id/tasks` |
| `get_task` | `GET /api/tasks/:id` |
| `create_task` | `POST /api/projects/:id/tasks` |
| `assign_task` · `move_task` · `close_task` | `PATCH /api/tasks/:id` |
| `comment_task` | `POST /api/tasks/:id/comments` |
| `my_open_tasks` | **yok — aşağıya bak** |

Kapatma ayrı uç değil: kartı `isDone` kolonuna taşımak `completedAt`i yazıyor,
ilerlemeyi 100 yapıyor, geçişi kaydediyor.

- [x] ~~**1. adım — kimlik iskeleti.**~~ **Yapıldı (9 Eylül, 13a012c).**
      `requireMcpToken`, `lib/mcpToken.js` (saf, 8 testli), `routes/mcp.js`,
      ayrı hız sınırı, başarısız denemeler denetim kaydına. Tek araç `whoami`,
      yazma yok. **Uçtan uca doğrulandı (9 Eylül, canlıda):** kapı kapalı,
      el sıkışma geçiyor, `whoami` Neon'dan gerçek veriyi getiriyor.
      Ayrıntı DEVIR.md'de.
- [x] ~~**2. adım — okuma araçları.**~~ **Yapıldı (9 Eylül).** `list_projects`,
      `list_columns`, `list_tasks`, `get_task`, `list_notes` ve `get_note`.
      Hepsi mevcut HTTP API'ye kısa ömürlü gerçek oturumla gidiyor; MCP içinde
      ikinci bir kapsamlama/izin mantığı yok. Liste yanıtlarında aktif çalışma
      alanı görünür tutuluyor; görev süzgeçleri (`col`, `assignee`, `overdue`)
      MCP katmanında uygulanıyor çünkü karşılık gelen uç yalnızca ham liste
      döndürüyor.
      **Uçtan uca doğrulandı (9 Eylül, ev makinesi, yerel sunucu + Neon) —
      21/21.** Protokol, kapı, yedi araç ve hata yolları; hepsi "StoaBoard"
      çalışma alanının gerçek verisiyle (3 proje, 15 görev, 1 not).
      **Tarama zinciri kıran bir kusur buldu ve kapatıldı:** `projectToDict` ve
      `taskToDict` kimliği METİN döndürüyor (`id: String(p.id)`), oysa araç
      şemaları `z.number().int()` istiyordu. `list_projects` `"21"` veriyor,
      açıklama "project_id buradan alınır" diyor, `list_columns` ise
      `-32602 expected number, received string` ile geri çeviriyordu — yani
      belgelenen yolun tamamı (proje → kolon → görev) kullanılamaz durumdaydı.
      Dört araçtan hiçbiri gerçek bir kimlikle çağrılamıyordu. Şemalar
      `z.coerce` ile metni de kabul ediyor; düzeltme MCP katmanında, çünkü
      `String(id)` sözleşmesini değiştirmek ön yüzü kırar.
      Ayrıca `list_columns` açıklaması olmayan bir alana yönlendiriyordu:
      kolon slug'ı yanıtta `slug` değil `id` adıyla duruyor (`columnToDict`
      → `id: c.slug`); açıklama düzeltildi.
      **Bilinen sınır:** araçların saf birim testi yok; yetki ve veri kapsamı
      mevcut API uçlarından geçerek doğrulanıyor. Tarama betiği artık
      depoda: `npm run mcp:tara` *(11 Eylül 2026 — DEVIR 0-F)*; veritabanı
      gerektirdiği için birim testlerinden ayrı bir komut.
      Ürün riski düşük ve **değerin çoğu burada**: "Claude, kart aç" cümlesi panoda
      zaten iki tık; kazandıran cümle "bugün bende ne var, ne gecikti".
      Yalnızca yazma aracı koyan entegrasyonlar iki haftada terk ediliyor.
- [x] **`completed_at` boşluğu — pano "bitti" diyor, sistem "gecikmiş" diyor.**
      *(Kapatıldı 10 Eylül 2026.)* Dünkü teşhis "veri kusuru, kod kusuru değil"
      diyordu. **Yanlıştı — altında yaşayan bir kod kusuru vardı.**

      **Kök sebep:** pano iki yerde kuruluyor. `projects.js` `isDone`u
      koyuyordu, şablonla çalışma alanı açan `workspaces.js` yolu **hiç
      koymuyordu**. Panolar geri doldurulmadığı için değil, o yoldan
      doğdukları için işaretsizdi; kusur bugüne kadar yaşıyor, her yeni
      çalışma alanında yeniden üretiliyordu. Düzeltildi ve
      `raporlama.test.js`te altı testle kilitlendi (şablon başına iki).

      İşaret şablon verisine **açıkça** kondu, ada göre tahmin edilmiyor:
      tasarım şablonunun bitiş kolonu `delivery` ("Delivered"). `slug ===
      'done'` kuralı oraya taşınsaydı o şablonu sessizce kaçırırdı.

      **Kapsam dörde değil 18 projeye yayılmıştı** (11 çalışma alanı). Dünkü
      "dört projenin üçü" ölçümü eksikti, çünkü MCP yalnızca aktif çalışma
      alanını görüyor — aşağıdaki maddenin teorik olmadığının kanıtı.
      Altı panoda `is_done` SQL ile işaretlendi (kolon kimlikleri 10, 32, 49,
      73, 77, 102); işaretsiz pano sayısı 0 olarak doğrulandı.

      **39 karta sahte tarih yazılmadı — bilinçli karar.** Geçiş defteri
      sağlam (8 kayıt, 2 Eylül 10:48 - 10 Eylül 08:25, 2'si bitiş geçişi;
      ilk kaydın damgası tek damgalı kartınkiyle saniyesine aynı) ama 39
      kartın hiçbirinin kaydı yok: hepsi defter açılmadan önce taşınmış.
      Dürüst bir geriye dönük tarih yok; uydurulanı rapora sahte bir zirve
      olarak girerdi.

      Onun yerine ölçüt düzeltildi: `completed_at` türetilmiş bir kopyadır
      (bitiş kolonuna girince yazılır, çıkınca silinir - `tasks.js`), **kolon
      gerçeğin kendisidir.** MCP `list_tasks` artık kolona bakıyor; kart bitiş
      kolonundaysa damgası olmasa da gecikmiş sayılmıyor. Üretim verisine tek
      satır yazılmadan çözüldü.

      **Kabul edilen sınır:** 3 Eylül öncesi işlerin bitiş tarihi bilinmiyor;
      dönem raporları o aralığı kapsamayacak.
- [ ] **İşaretsiz panoda arayüz uyarısı.** *(10 Eylül'de yarısı yapıldı.)*
      Ürün kararı: bitiş kolonunu silmek ve işareti kaldırmak **serbest
      kalsın**, ama sistem sessiz kalmasın. Silmeyi engellemek yeni bir tuzak
      kurardı ve deliği de kapatmazdı - kolonu silmeden işareti kaldırmak aynı
      sonucu veriyor; üstelik "her panonun tamamlandı kavramı olmak zorunda"
      kuralı her pano için doğru değil.
      MCP tarafı yapıldı: `list_tasks` yanıtına `warning` alanı giriyor ve
      araç açıklaması onu kullanıcıya aktarmayı söylüyor. **Eksik olan arayüz:**
      pano ve rapor ekranında "bu panoda tamamlandı kolonu yok, gecikme ve süre
      rakamları eksik" satırı. Dil kuralı gereği tr/en birlikte.
- [ ] **Dashboard'un geri kalanı taranmalı — bir uydurma veri çıktı, başkası
      olabilir.** 10 Eylül'de ilerleme grafiği değiştirilirken "Ay" görünümünün
      **imal edilmiş** olduğu bulundu: haftalık toplamı 0.9 / 1.2 / 0.8 / 1.0
      ile çarpıp dört hafta üretiyordu. Ekranda "Ay" yazıyor, kullanıcı gerçek
      sanıyordu. Grafik panonun gerçek dağılımını gösteren yatay yığılmış
      çubukla değiştirildi; veri artık kartların kendisinden okunuyor.

      **Kalan iki iş:**

      **(a) `throughput.js` yanlış deftere dayanıyor.** `ActivityLog`'un
      serbest metnini JSON olarak ayrıştırıp kolon **başlığını** slug'a
      eşliyor (`titleToSlug`). Kolon yeniden adlandırılırsa geçmiş eşleşmeyi
      bırakıyor — sessizce, çünkü eşleşmeyen kayıt atlanıyor
      (`if (!slug) continue`). Oysa `task_transitions` aynı olayı kolon
      **kimliğiyle** doğru kaydediyor ve raporlama için zaten kurulmuş.
      İki defter aynı olguyu tutuyor, dashboard kötü olanı okuyor.
      Taşınmalı. Bu, "bu hafta tamamlandı" sayacını (`weeklyDone`) da
      etkiliyor — o da aynı kaynaktan besleniyor.

      **(b) Zaman grafiği veri birikince geri gelmeli.** Bilerek kaldırıldı:
      `task_transitions` 2 Eylül'de açıldı ve 8 günde 8 hareket taşıyor.
      Bu veriyle çizgi grafiği sıfırda yatan düz bir çizgi olurdu. Birkaç
      hafta gerçek kullanımdan sonra yeniden değerlendirilmeli; o noktada
      çizgi grafiği doğru form.

      **Tarama kapsamı:** dashboard'daki her sayının kaynağı tek tek
      doğrulanmalı. "Ay" verisinin uydurma olduğu iki oturum boyunca kimsenin
      dikkatini çekmemişti; aynı ekranda başka bir tahmin daha olabilir.
- [ ] **Bildirim okundu bilgisi sunucuya hiç yazılmıyor.** *(Bildirildi ve
      doğrulandı, 10 Eylül 2026.)* Belirti: her girişte rozet dolu görünüyor,
      panel açılınca sıfırlanıyor, günler önce okunmuş bildirim tekrar tekrar
      geri geliyor.

      **Mekanizma:** paneli açan ve kapatan her yol `setNotifCount(0)`
      çağırıyor (`app.jsx` 1098, 1104, 1229, 1231, 1232) — bu **yalnızca yerel
      React durumu.** Hiçbiri sunucuya istek atmıyor. Açılışta ise
      `setNotifCount(unread)` (`app.jsx:633`) gerçek veritabanı sayısını
      okuyor. Yani döngü şu: bildirim `read: false` olarak duruyor, panel
      açılınca rozet yerel olarak sıfırlanıyor, bir sonraki girişte sunucu
      "hâlâ okunmadı" diyor ve rozet geri geliyor. Kayıt asla değişmiyor.

      Sunucu tarafı suçsuz: `POST /api/notifications/read-all` ve
      `POST /api/notifications/:id/read` ikisi de doğru çalışıyor
      (`notifications.js`). Sorun onların **hiç çağrılmaması** — `markAllRead`
      yalnızca "hepsini okundu işaretle" düğmesine bağlı.

      Bu, deponun tekrar eden kalıbı: arayüz bir şey yapmış gibi görünüyor,
      aslında hiçbir şey yazılmıyor. Sessiz atlama.

      **Karar gerekiyor — düz bir hata değil, ürün sorusu:** paneli açmak
      *her şeyi* okundu saysın mı? Sayarsa "Okunmamış" sekmesi anlamsızlaşır.
      Seçenekler: (a) panel açılınca `markAllRead` çağır — en basit, sekme
      işlevsizleşir; (b) yalnızca ekranda görünen bildirimleri okundu yap;
      (c) rozeti "okunmamış sayısı" değil "son bakıştan beri gelen" diye
      yeniden tanımla ve okundu işaretlemeyi tamamen kullanıcıya bırak.
      (c) sekmeyi korur ve bugünkü davranışa en yakın olanıdır.
      Cevap verilmeden kod yazılmamalı; [BILDIRIMLER.md](BILDIRIMLER.md) oku.
- [~] **Bildirimler test altına alınmalı — bu depoda en çok kusur çıkan alan.**
      *(Kısmen kapandı 12 Eylül 2026 — DEVIR 0-O.)* **Metin sözleşmesi**
      kapandı: on bir bildirim türü kaynaktan envantere alındı, her tür için
      istemci sözlüğünde iki dilde anahtar ve şablondaki her yer tutucunun
      üreticide gerçekten üretildiği doğrulanıyor (`_fillTemplate` eksik
      parametreyi boş dizeye çeviriyor — sessiz yanlışın mekanizması buydu).
      `throughput.js` dikişi de kilitli: `task_moved` kaydına slug yazılırsa
      akış raporu sessizce boşalıyordu. Sözleşme dışından serbest metinle
      yazan tek uç muafiyet listesinde, gerekçesiyle. 46 test, altı
      mutasyonun altısı yakalandı.
      **Kalan:** okundu durumu — aşağıdaki "okundu bilgisi sunucuya hiç
      yazılmıyor" maddesine bağlı; saf fonksiyona indirmek üretim davranışını
      değiştirmek demek, o yüzden ayrı ele alınacak.
      Geçmiş sayıyor: bahsetme bildiriminin çalışma alanı/kanal kapsamını
      aşması (`de25569`), panelin ikinci tıklamada kapanmaması, sohbet/bildirim
      panel çakışması (`6e95261`), sekme açılınca dashboard'a kayma
      (`28fce2a`), mobil turda çıkanlar (`6be4893`), ve bugün bulunan okundu
      bilgisinin hiç yazılmaması. Hepsi elle bulundu; hiçbirini bir test
      yakalamadı.

      **Neden bu alan bu kadar kırılgan:** bildirim üç katmana birden
      dokunuyor — veritabanı kaydı, soket yayını ve panel durumu — ve üçü
      arasındaki tutarsızlık ekranda "sessiz yanlış" olarak görünüyor. Kusurun
      hiçbiri istisna fırlatmıyor.

      **Önce saf mantık, veritabanı gerektirmeyen kısım.** En değerlisi
      **kapsam**: `de25569`'daki kusur bir bahsetmenin yanlış çalışma alanına
      düşmesiydi — yani "bu bildirim kime gitmeli" sorusu. Bu soru saf bir
      fonksiyona çekilebilirse (kim üye, kim kanalda, kim bahsedilmiş →
      alıcı listesi) doğrudan test edilir ve aynı sızıntı bir daha geçemez.
      `buildNotificationText`in ürettiği JSON şekli de sabitlenmeli; `throughput.js`
      onu ayrıştırıyor ve biçim sessizce değişirse rapor boşalır.

      Sonra okundu durumu: rozet sayısı ile veritabanındaki `read` alanı
      arasındaki ilişki tek bir saf fonksiyona indirilmeli ki yukarıdaki
      okundu kusuru bir daha sessizce dönemesin.

      [BILDIRIMLER.md](BILDIRIMLER.md) önce okunmalı. Not: bu iş, bildirim
      davranışının **yeniden tasarlanmasını** beklemek zorunda değil — mevcut
      davranışı kilitlemek de değer üretir, çünkü tasarım değişirken neyin
      bilerek değiştiğini görürsün.
- [ ] **Soket yolu bildirim e-postası göndermiyor.** `sockets/chat.js` bildirimi
      doğrudan `prisma.notification.create` ile yazıyor ve `createAndPush`ı
      atlıyor; e-posta gönderimi (`dispatchEmail`) yalnızca orada çağrılıyor.
      Sonuç: HTTP sohbet ucundan gelen bir bahsetme e-posta üretirken soketten
      gelen üretmiyor. Metin sözleşmesi bozuk değil — asimetri sessiz, kullanıcı
      neden bazı bahsetmelerde posta aldığını bilmiyor. *(DEVIR 0-O)*
- [x] **`POST /api/notifications` üyelik kontrolü yapmıyor.** *(Kapandı 12
      Eylül 2026 — DEVIR 0-Q: hedef artık gönderenin aktif alanının üyesi
      olmak zorunda; olmayan kullanıcı ile üye olmayan aynı 403'ü alıyor, yani
      kullanıcı-var-mı kahini de kapandı. Ucun gerçekten gerekli olup olmadığı
      hâlâ açık: istemcide tanımlı ama hiç çağrılmıyor.)* Hedef kullanıcı
      için yalnızca "var mı" diye bakıyor; çalışma alanı ya da üyelik kapısı
      yok. Kimliği doğrulanmış herhangi biri, herhangi bir kullanıcıya bildirim
      gönderebiliyor. Metin artık kaçışlanıyor (DEVIR 0-P) yani XSS değil, ama
      istenmeyen bildirim ve kimlik avı metni hâlâ mümkün. GUVENLIK.md §4'ün
      2. ve 3. soruları bu uçta cevapsız. Ucun istemcide tek çağrısı
      `API.createNotification`; gerçekten gerekli mi, o da sorulmalı.
- [ ] **Giriş ekranındaki istatistikler uydurma.** `auth.jsx:673` "1.200+ aktif
      takım" ve "38k+ görev tamamlandı", `auth.jsx:1293` "6k+ takım", "%98
      memnuniyet", "15m+ görev" diyor. Veritabanında 11 çalışma alanı ve ana
      projede 15 görev var. Bunlar pazarlama metni ve öyle olduğu sürece bir
      **ürün kararı**, kusur değil — ama uydurma "Ay" grafiğiyle aynı aileden:
      gerçek gibi sunulan sayı. Ya gerçek sayılara bağlanmalı, ya da açıkça
      hedef/iddia diline çevrilmeli. Karar senin.
- [ ] **Özel vurgu rengi koyu temada açılmıyor.** Hazır altı seçenek koyu
      temada bilinçli olarak açılıyor (L %50-55 → %68-72) ama "özel renk"
      seçeneğinde `--accent` JS ile satır içi veriliyor ve olduğu gibi
      kalıyor (`styles.css`, `[data-theme="dark"][data-accent="custom"]`
      yalnızca soft/softer/ink tanımlıyor). Kullanıcı kendi seçtiği rengi
      aynen aldığı için bugün yanlış bir şey göstermiyor; ama koyu bir özel
      renk seçilirse koyu zeminde okunmaz. Hazır seçenekler için yapılan
      düzeltme buraya uygulanmadı.
- [x] **Açık görev sayısı çöp kutusundaki kartları da sayıyordu.**
      *(Bulundu ve kapatıldı 11 Eylül 2026.)* `projectWithOpenCount`
      (`routes/projects.js`) ve bootstrap'taki toplu sayım (`routes/api.js`)
      bitiş kolonunu eliyordu ama `deletedAt: null` süzgecini koymuyordu.
      Oysa `GET /projects/:id/tasks` silinmiş kartı hiç döndürmüyor: kenar
      çubuğu 9 derken pano 6 kart gösterebiliyordu ve çöp kutusu 30 gün
      tuttuğu için fark haftalarca yaşıyordu.

      Yine **iki sözleşmenin arası**: iki sorgu da kendi başına doğru
      görünüyor. MCP `list_projects` aynı sayıyı modele aktardığı için yalan
      büyüyordu — sayıyı ilk defa bir model okuyunca fark edildi.

      `mcp.test.js` iki sayımı da tarayıp `deletedAt` süzgecini şart koşuyor.
      **Testin ilk hâli mutasyonu kaçırdı** ve sebebi kayda değer: pencere,
      kuralı ANLATAN yorumdaki "deletedAt: null" metnini kod sandı. Kaynağı
      tarayan her test bu tuzağı taşıyor; tarama artık yorumları siliyor.
- [x] **MCP başka alandaki kaydı aktif alanınmış gibi döndürüyordu.**
      *(Bulundu ve kapatıldı 11 Eylül 2026, MCP 0.3.1.)* Aktif alan StoaBoard
      iken `list_columns {project_id: 21}` Mytherra'nın kolonlarını döndürdü
      ve üstüne `workspace: StoaBoard` damgası bastı. Kök neden: API "kullanıcı
      projenin alanının ÜYESİ mi" diye soruyor (`loadProjectWithAccess`),
      "proje AKTİF alanda mı" diye değil. Yetkisiz sızıntı değil — kullanıcı
      Mytherra'nın sahibi — ama bağlam yanlıştı ve yazma araçlarında kart
      yanlış panoya açılırdı. `get_task` ve `get_note` aynı durumdaydı.
      Düzeltme MCP katmanında, tek kapıda (`aktifProje`): aktif alanda
      olmayan kayıt, hiç var olmayanla birebir aynı 404. `mcp.test.js`
      `project_id` alan her aracın bu kapıdan geçtiğini tarıyor.
      **API'deki 403/404 kahini duruyor** (üye olmadığın alanın projesi 403,
      olmayan 404 — GUVENLIK.md soru 8); MCP onu devralmıyor ama API geneline
      yayılmış hâli ayrı bir iş.
- [x] **Görev ataması alan üyeliğini kontrol etmiyor — güvenlik.**
      *(Bulundu ve kapatıldı 11 Eylül 2026.)* `POST /projects/:id/tasks`
      (`tasks.js` ~190) ve `PATCH /tasks/:id` (~383) atanacak kişiyi
      `tx.user.findUnique({ where: { slug } })` ile arıyor: platformdaki
      HERHANGİ bir kullanıcı atanabiliyor ve ona görev başlığını taşıyan
      bildirim gidiyor. `manage_tasks` izni olan bir üye, başka bir şirketin
      kullanıcısına bildirim atabilir ve görev başlığını sızdırabilir.
      Kapatmak küçük: slug'ı çözdükten sonra `memberForWorkspace(u.id,
      project.workspaceId)` yoksa atla ya da 400 dön — hangisi olacağı
      karar (sessiz atlamak bu deponun bilinen kusur kalıbı; 400 tercih
      edilmeli). Regresyon testi `guvenlik.test.js`e. `efe-kapan-1` gibi
      yetim slug'ların muhtemel iki kaynağından biri bu (öteki aşağıda).

      **Kapatıldı (DEVIR 0-G):** yeni eklenen atanan alan üyesi değilse 400
      (`err_assignee_not_member`), işlem başlamadan. Kartta zaten atanmış
      kişi korunur — arayüz listenin tamamını geri gönderiyor ve `f789c37`
      çıkarılanın adını kartta tutuyor. Platformda olmayan slug da aynı 400'ü
      alıyor (eskiden sessizce atlanıyordu): "üye değil / yok" farkı bir
      kahin olurdu. Karar saf `lib/assignees.js`te, iki uç `atamalariCoz`tan
      geçiyor; kaynak taraması beş mutasyonla sınandı. Kart kopyalama
      atananları bugünkü üyelere süzüyor. Uçtan uca, veri yazmadan
      doğrulandı: kart #6'da `efe-kapan-1` korundu, yanına eklenen hayalet
      slug reddedildi.
- [x] **Kart yorumundaki `@bahsetme` alıcıyı bütün platformda arıyor — güvenlik.**
      *(Bulundu 11 Eylül, kapatıldı 12 Eylül 2026.)* `POST
      /tasks/:id/comments` (`tasks.js`, `MENTION_RE` sonrası) bahsedilen
      kişiyi `prisma.user.findFirst({ where: { name: { startsWith: fname,
      mode: 'insensitive' } } })` ile arıyor; alan üyeliğine bakılmıyor.
      "@Ali" yazan bir üye, başka bir şirketteki adı Ali ile başlayan
      herhangi birine yorumun ilk 80 karakterini bildirim olarak
      gönderebilir. Canlıda, normal arayüzden. Atama açığıyla (0-G) aynı
      sınıf; sohbetteki bahsetme 2 Eylül'de `mentionAllowed` ile
      kapatılmıştı, kart yorumu kapsam dışında kalmış. Düzeltme: aramayı
      kartın alanının üyeleriyle sınırla. Birden fazla eşleşme ayrı bir soru
      (bugün ilk bulunan alıyor). **MCP `add_comment` bu kapanmadan
      açılmamalı.** Regresyon testi `guvenlik.test.js`e.
      **Kapatıldı (DEVIR 0-J):** bahsedilen kişi artık kartın alanının
      üyeleri arasında aranıyor; arama anlamı (ad öneki, harf katlamalı) aynı,
      havuz daraldı. Karar saf `lib/mentions.js`te. Belirsiz önek kimseye
      bildirim göndermiyor ve sunucu günlüğüne yazılıyor — sessiz atlama yok.
      Yorum her durumda kaydediliyor. 12 yeni test, altı mutasyonun altısı
      yakalanıyor; altıncısı ilk turda kaçtı ve eksik olan testi ortaya
      çıkardı. Bildirim metni bilerek düz metin kaldı: `renderNotification`ın
      `mention` dalı yok, JSON verilseydi gövdesi boş bildirim çıkardı.
- [ ] **Yetim atanan slug'ları — MCP'de işaretlenmeli.** 11 Eylül denemesinde
      5 ve 6 numaralı kartlarda `efe-kapan-1` göründü; alan üyesi
      `efe-kapan`. `-1` eki `uniqueSlug`tan geliyor (`lib/user.js`): aynı adla
      ikinci bir hesap açılmış (kayıt ya da farklı e-postayla Google girişi,
      `auth.js` 88 / 258). Slug yanıtta göründüğüne göre kullanıcı satırı
      YAŞIYOR — silinmiş hesap değil, yalnızca bu alanın üyesi değil. İki
      yoldan biri: (a) üyeydi ve çıkarıldı — çıkarma atamaları silmiyor ve bu
      bilinçli (`f789c37`: "çıkarılan kişinin adı kartlarda kalır"); (b) hiç
      üye olmadı ve yukarıdaki açıktan atandı. Hangisi olduğu SQL ile
      görülür. **Öneri:** atamayı düşürme (ürün kararı onu koruyor), ama MCP
      kartında üye olmayan atananları ayrı bir alanda ver
      (`assignees_not_members`) — model bugün `efe-kapan-1`i `list_members`te
      bulamayıp "bu kim" diye kalıyor.
- [ ] **`stoaboard.com` (kök alan adı) komut satırından HTTPS vermiyor.**
      *(Bulundu 11 Eylül 2026, ev makinesi — DEVIR 0-F.)* A kaydı
      `85.159.66.93` (nginx; düz HTTP'de `302 Location: /`), HTTPS el
      sıkışması sıfırlanıyor. `www.stoaboard.com` Railway'e CNAME ve sağlıklı.
      0-D bu belirtiyi ofis vekiline bağlamıştı; evde de aynısı çıktı.
      Bakılacaklar: tarayıcıda kök adres açılıyor mu (açılıyorsa hangi
      yoldan), Claude bağlayıcısına hangi adres yazılı, A kaydı bilerek mi
      orada (alan adı firmasının yönlendirme sunucusu olabilir). Biri
      `stoaboard.com` yazıp açamıyorsa bu bir ürün kusuru.
- [ ] **MCP taramasının iki kör noktası veriyle kapanır.** `npm run
      mcp:tara` iki kontrolü veri yokluğundan atlıyor: (a) öbür alanlarda
      not yok, not kapısı alan dışı sınanamıyor; (b) aktif alanın çöpünde
      bitmemiş kart yok, açık sayımın çöp kutusu kusuru (11 Eylül) görünmüyor
      — mutasyonla doğrulandı. İkisi de production'a bir kayıt koymakla
      kapanır (Dershane'de bir not, StoaBoard'da çöpe atılmış bir kart).
      Veri yazmak olduğu için karar kullanıcının; o güne kadar ikisi
      `mcp.test.js`te kaynak düzeyinde kilitli.
- [ ] **`mcp:tara` hangi anahtarı gönderdiğini söylemiyor, sunucu da hangilerini
      yüklediğini.** *(11 Eylül 2026 — DEVIR 0-F.)* Canlıya karşı 401
      alındığında sebep bir saat dağıtımda arandı; asıl sebep canlı anahtarın
      kök `.env`'de, taramanın ise `server/.env`'deki eskisini göndermesiydi.
      Öneri: betik başlıkta anahtar özetinin (SHA-256) ilk 8 hanesini bassın,
      sunucu da açılışta yüklediği anahtarları slug + özet önekiyle loglasın
      (`[mcp] 1 anahtar: eray-atalay (1a2b3c4d)`). Yan yana konunca
      "gönderilen anahtar sunucuda var mı" tek bakışta cevaplanır; özetin
      önekinden anahtar geri üretilemez. Değişken hiç yoksa sunucu bugün
      hiçbir şey yazmadan her isteği reddediyor — kapalı başarısızlık doğru,
      ama sessiz; açılışta gürültü çıkarmalı.
- [ ] **`currentMember` okurken yazıyor.** Aktif alan sütunu boşsa ya da
      üyelik silinmişse ilk üyeliği seçip `users.currentWorkspaceId`ye
      YAZIYOR. Yani salt okuma işaretli `whoami` bir yazma yapabiliyor ve
      tarayıcıdaki aktif alanı değiştirebiliyor. Bugün pratikte zararsız
      (yalnızca bozuk durumda tetikleniyor) ama "salt okuma" iddiasıyla
      çelişiyor; yazma araçları gelmeden bakılmalı.
- [ ] **`whoami`'ye `available_tools`.** *(Öneri, karar bekliyor.)* Araç
      listesi bağlantı başında bir kez okunuyor ve sunucu "değişti" diyemiyor
      (bkz. `MCP-SURUMLER.md`). Araç ÇAĞRILARI ise canlı. `whoami` sunucunun o
      anki araç adlarını dönerse, bayat bir sohbet kendi listesinde olmayan
      aracı görüp kullanıcıya "yeni sohbet aç" diyebilir. Bayatlığı imkânsız
      kılmıyor, görünür kılıyor.
- [x] **`dil.test.js` ve `yetki.test.js` tarayıcıları yorumları silmiyor.**
      *(Kapandı 12 Eylül 2026 — DEVIR 0-L.)* Sorun maddede yazandan genişti:
      "yorum nedir" sorusunun depoda **üç ayrı cevabı** vardı ve üçü de farklı
      şeyi kaçırıyordu. Tarayıcı `test/yardimcilar.js` içine çıkarıldı, on iki
      çağrı yeri (beş test dosyası) ona bağlandı. Taşımadan önce gerçek kaynak
      kümesine karşı ölçüldü ve üç kör nokta buldu — tırnak taşıyan düzenli
      ifade, JSX metnindeki Türkçe kesme işareti, şablon içindeki `${...}`
      bölgesi; üçü de kapandı. Mutasyon **iki yönlü** koşuldu (ihlal önce kod,
      sonra yorum biçiminde), 16/16 beklendiği gibi.
- [x] **Serileştirici sözleşmesi teste bağlanmalı.** *(Kapandı 12 Eylül 2026
      — DEVIR 0-M.)* Maddede önerilen hâliyle **yetmezdi**: alan kümesini
      dondurmak, alıntılanan iki kusurun hiçbirini yakalamazdı — `columnToDict`
      hep böyle yazıyordu, üretici hiç değişmedi. Kusur sözleşmenin **iki
      tarafı arasında**. `test/sozlesme.test.js` üç katman kuruyor: üretici
      şekil kilidi (18 serileştirici; tablo elle bakımlı değil, kaynak
      taranarak denetleniyor), **dikiş** (tüketici artık gerçek üretici
      çıktısıyla besleniyor — `mcp.test.js` elle yazılmış sözlük kullandığı
      için kusuru hiç görememişti) ve kimlik anlamları (slug / metne
      çevrilmiş sayı / ham sayı). Yedi mutasyonun yedisi de yakalandı.
- [ ] **MCP anahtarı kendi kendine alınabilmeli — bugün her kişi için Railway
      elle düzenleniyor.** Bugünkü akış: anahtar üret → `STOA_MCP_TOKENS`
      sonuna ekle → yeniden dağıt → anahtarı kişiye özel olarak ulaştır.
      İki-üç kişide katlanılır, beşte dayanılmaz, ekip değiştikçe imkânsız.

      **Ortak "servis hesabı" bu sorunu çözmez, elendi.** Gerekçeyi buraya
      yazıyorum çünkü soru tekrar sorulacak. Teknik olarak kırılıyor: aktif
      çalışma alanı `users.currentWorkspaceId` sütununda, yani **kullanıcı
      başına tek**. Ortak hesapta iki kişi aynı anda kullanırsa birbirlerinin
      panosunu değiştirirler — hata vermeden, sessizce yanlış cevap üreterek.
      Üstüne denetim kaydı anlamsızlaşır ("bunu kim yaptı" → hep aynı hesap),
      izinler herkesin işini görecek kadar geniş olmak zorunda kalır (proje
      bazlı erişimle kapatmaya çalıştığımız açığın ta kendisi), "bana atanan
      işler" ölür, ve bir kişinin erişimi herkesinkini kesmeden iptal
      edilemez. `mcpToken.js` bunu zaten yazıyor: *"Anahtar kişiye bağlıdır,
      ekibe değil."*

      **İki basamak var ve birincisi ikincisinin ön koşulu:**

      **(a) Kendi kendine anahtar üretme sayfası.** Kullanıcı StoaBoard'a
      zaten giriş yapmış durumda; ayarlarda "Claude bağlantısı" bölümünden
      kendi anahtarını üretir, bir kez görür, kopyalar. Railway'e dokunmak ve
      yeniden dağıtım gerekmez. Anahtarlar ortam değişkeninden **veritabanına**
      taşınır — özet olarak saklanır (ham hâli asla), oluşturulurken bir kez
      gösterilir, iptal edilebilir, son kullanım tarihi tutulur. Ortam
      değişkeni yolu ilk kurulum için kalabilir.
      Kullanıcı yine de anahtarı elle bağlayıcıya yapıştırır.

      **(b) OAuth.** Kullanıcı Claude'da "Connect" der, kendi StoaBoard
      hesabıyla giriş yapar, jeton otomatik gelir. Hiç kopyala-yapıştır yok.
      Zincir: 401 yanıtında `WWW-Authenticate` → `/.well-known/oauth-protected-resource`
      ve `/.well-known/oauth-authorization-server` → `/register` (dinamik
      istemci kaydı, bağlayıcının bugün aradığı ve bulamadığı şey) → PKCE'li
      `/authorize` → `/token`. `/authorize` mevcut oturuma (`req.session.userId`)
      yaslanabilir, yani sıfırdan kimlik sistemi kurulmuyor.

      (a) yapılırsa (b) için gereken jeton deposu da kurulmuş olur; boşa iş
      değil. **İkisi de 3. adımdan (yazma araçları) önce gelmeli** — jetonun
      kimi temsil ettiği ve nasıl iptal edildiği, kart atayan bir araçta çok
      daha kritik.

      Auth yazmak aceleye gelmez; bu madde "bir oturumda bitir" işi değil.
- [x] **MCP araç başlıkları kullanıcıya görünüyor — dil kuralı buraya da
      geçerli.** *(Yapıldı 11 Eylül 2026.)* Ayrım yapıldı ve ikisi aynı kefeye
      konmadı: **`title` kullanıcı metnidir, `description` değildir.**
      Başlıklar `lib/mcpShape.js` içindeki `ARAC_BASLIKLARI` tablosunda, iki
      dilde. Açıklamalar Türkçe kaldı ve gerekçe bu kez ölçülü — onları model
      okuyor, modelin cevabı zaten kullanıcının dilinde çıkıyor; yüzlerce
      satırlık yönlendirme metnini iki dilde sürdürmenin karşılığı yok.
      `mcp.js`'in başındaki yanlış not düzeltildi.

      **Dil nereden okunuyor — burada gerçek bir sınır var.** MCP
      `initialize` isteği dil alanı taşımıyor; protokolde yok. Elde iki HTTP
      sinyali kaldı: bağlayıcıya yapıştırılan adresteki `?lang=en` (kullanıcı
      açıkça söyler, en güvenilir yol) ve `Accept-Language` (istemci
      gönderirse). Yedek `tr`. Çözülen dil `whoami` yanıtında
      `server.title_language` olarak görünüyor — sinyal gelmediğinde "neden
      hâlâ Türkçe" sorusunun cevabı başka hiçbir yerde olmazdı.
      **Claude bağlayıcısının `Accept-Language` gönderip göndermediği
      doğrulanmadı;** gerçek istemciyle bakılmalı. Göndermiyorsa yol
      `?lang=en` ve bu belgelenmeli.

      Kural testle kilitli (`mcp.test.js`): kayıtlı her aracın başlığı tabloda
      ve iki dilde olmalı, tabloda öksüz kayıt kalmamalı, ve `mcp.js` içinde
      düz metin `title:` bulunmamalı. Mutasyonla doğrulandı — `title: 'Kimlik'`
      yazıldığında test kırılıyor.
- [x] **MCP 2.5. adım — üç salt-okuma aracı.** *(Yapıldı 11 Eylül 2026;
      sürüm 0.3.0.)* `list_members`, `search_tasks` ve `list_workspaces`
      eklendi; yüzey yedi araçtan ona çıktı. Üçü de salt okuma, bildirim
      üretmiyor. İhtiyacı 10 Eylül'deki uçtan uca denemede modelin kendisi
      söylemişti: hangi soruları cevaplayamadığını en iyi o biliyor.

      **`list_members`** ekibi slug, ad, rol ve izinle veriyor;
      `with_task_counts` (varsayılan açık) her üyenin açık iş sayısını da
      hesaplıyor. Sayım için bütün projeler taranıyor — tek bir "çalışma
      alanını ver" ucu yok ve `/bootstrap` bu iki aracın istediğinden çok
      fazlasını (kanallar, sohbet, bildirimler) taşıyor. Maliyet proje başına
      iki yerel istek; parametre kapatılabilsin diye var.

      **`search_tasks`** başlık ve açıklamada arıyor. Harf katlama Türkçe'ye
      özel: I, İ, ı, i hepsi "i" sayılıyor. `toLowerCase()` "İZİN" aramasını
      kaçırıyor, `toLocaleLowerCase('tr')` ise "IT" aramasını kırıyordu; pano
      iki dilli olduğu için nokta ayrımı aramada bilinçli olarak silindi.
      Kesme sessiz değil: `truncated` alanı yanıtta.

      **`list_workspaces`** aşağıdaki "alanı göremiyor" maddesinin okuma
      yarısını kapatıyor.

      Denemede çıkan kalan eksikler düşük öncelikli: etiket listesi, proje
      detayı, ek dosya içeriği.

      **Sohbetin kapsam dışılığı da söylenir hâle geldi.** Kullanıcı
      `manage_channels` ve `delete_messages` izinlerini taşıyor, MCP'de
      karşılığı olan araç yok; model bunu fark edip "sohbeti yönetebilirim"
      beklentisine girmişti. `whoami` artık `permissions_without_tools`
      döndürüyor ve liste **araç yüzeyinden türetiliyor** — yazma araçları
      gelince kendiliğinden küçülecek. Elle tutulan bir muafiyet listesi
      bayatlardı.
- [x] **Not önizlemesi uzun gövdede kırpılıyor mu.** *(Kaynaktan doğrulandı
      11 Eylül 2026.)* Kırpıyor: `noteToDict` (`lib/notes.js`) önizlemeyi
      `markdownToPlain(body).slice(0, 240)` ile üretiyor. Denemede tamamı
      görünmesinin sebebi notun 240 karakterden kısa olmasıydı — model
      "kusur değil, doğrulanmamış" diye işaretlemişti, ayrım doğruydu.
      Sınır artık `list_notes` açıklamasında yazılı, yani istemci bunu
      denemeden biliyor.
- [~] **MCP çalışma alanını göremiyor, değiştiremiyor.** *(Okuma yarısı
      yapıldı 11 Eylül 2026: `list_workspaces`. Değiştirme hâlâ yok ve
      3. adıma ait.)* Bütün araçlar
      **aktif** çalışma alanına bakıyor ve o alan yalnızca tarayıcıdan
      değişiyor. Sonuç: kullanıcının tarayıcısı başka bir alandayken Claude
      diğer panoya hiç ulaşamıyor — üstelik o panonun var olduğunu bile
      göremiyor, çünkü alanları listeleyen bir araç yok. Taramada tam olarak
      bu yaşandı: aktif alan boş olan "Mytherra" idi, StoaBoard panosuna
      erişilemedi. `whoami` ve liste yanıtlarının alan adını taşıması yanlış
      alanı *fark ettiriyor* ama *düzeltmiyor*. En küçük çözüm salt-okuma bir
      `list_workspaces`; alan değiştirmek yazma sayılır ve 3. adıma aittir.
- [~] **MCP sunucu iyileştirmeleri — gerçek istemci denemesinden çıkan liste.**
      10 Eylül'de Claude uçtan uca kullandı ve eksikleri kendisi raporladı.
      **1. dilim 11 Eylül'de kapandı** (aşağıda tek tek işaretli); kalan
      dilimler 2-5 ve her biri bir karar ya da yazma yüzeyi bekliyor.

      **[bitti, 0.4.0] Yazma araçlarına zorunlu `workspace_id` + uyuşmazlıkta 409.** Bu
      listenin en iyi fikri ve "alanları listeleyen araç ekleyelim"den daha
      güçlü: o, sorunu *görünür* kılıyordu; bu **imkânsız** kılıyor. Aktif alan
      `users.currentWorkspaceId`'de ve tarayıcıdan bir tıkla değişiyor; yazma
      aracı sessizce o anki alana yazmak yerine reddetmeli. **Uygulandı
      (11 Eylül):** `yazmaKapisi`, her yazma aracında; testle ve mutasyonla kilitli.

      **[bitti] Bağlam her yanıta girmeli.** *(11 Eylül.)* On aracın onunda
      da `workspace` alanı var. Modelin en çok baktığı yanıtlar (`list_tasks`,
      `get_task`, `list_notes`) tam da sessiz olanlardı.

      **[bitti] Kimlik tipleri tek tip olmalı.** *(11 Eylül.)* Yüzeyin tamamı
      metne çekildi (`metinKimlik`). Düzeltme MCP katmanında yapıldı, ortak
      serileştiriciye dokunulmadı: `String(id)` ön yüzün yaslandığı bilinçli
      bir sözleşme. Araç girdileri `z.coerce` ile ikisini de kabul ettiği için
      tur kapanıyor — ne dönüyorsa geri verilebiliyor.

      **[bekliyor] Görevde `created_at` / `updated_at`.** *(2. dilim —
      bilinçli olarak 11 Eylül'e alınmadı.)* `createdAt` şemada **var**, sadece
      `taskToDict` yayımlamıyor; tek satır. Ama `updatedAt` **yok** ve sütun
      eklemek üretime yazmak demek — bu depoda şema değişikliği ayrı, elle
      yapılan bir iş. **Tuzak:** sütun eklendiğinde mevcut kartların geçmişi
      olmayacak, yani "hangi kart aylardır kımıldamadı" haftalarca yanlış cevap
      verecek. `completed_at` ile 10 Eylül'de yaşadığımızın aynısı; orada sahte
      tarih yazmamayı seçtik.

      **Karar bekliyor, varsayıma bırakılmamalı:** sütun `now()` ile mi
      doldurulacak (basit, yanlış), boş mu bırakılacak (dürüst, her sorgu
      null'ı ayıklamalı), yoksa `task_transitions`ten mi türetilecek (en
      dürüstü, en pahalısı). İkisi aynı commit'e de girmemeli: `created_at`
      şemasız gelir, `updated_at` şema dilimine ait.

      **[bitti] Görevde `col_is_done`.** *(11 Eylül.)* Hem listede hem
      detayda. Bilgi zaten elde: açık/kapalı süzgeci için kolonlar nasılsa
      çekiliyor. Kolon bilgisi yoksa alan **hiç konmuyor** — `false` yazmak
      "bitmemiş" diye okunurdu, oysa bilinmiyor; testle kilitli.

      **[bitti] "Açık görev" tanımı ve `include_done`.** *(11 Eylül.)*
      Burada **davranış değişti, dikkat:** `list_tasks` süzgeçsiz çağrıldığında
      artık yalnızca açık kartları döndürüyor. Eskiden her şeyi döndürüyordu
      ama kendi açıklaması "projedeki bütün açık görevler gelir" diyordu —
      yani araç, belgesiyle çelişiyor ve modeli yanlış bilgilendiriyordu.
      Tanım uydurulmadı, sunucunun kendi tanımı alındı: açık = bitmiş olarak
      işaretli kolonda olmayan kart; `projectWithOpenCount` `list_projects`in
      `open` sayısını tam olarak böyle hesaplıyor. Bitmişler için
      `include_done=true`.

      **[bitti] Token verimliliği — `desc` kırpma.** *(11 Eylül.)* Liste
      yanıtlarında açıklama 200 karaktere kırpılıyor ve kırpıldığında
      `desc_truncated: true` konuyor; tamamı `get_task`te. Sessizce kısaltmak,
      modelin eksik metni tam sanması demek olurdu.

      **[bekliyor] Sayfalama (`limit` + `cursor`) 5. dilimde.**
      `search_tasks` şimdilik `limit` + `truncated` ile geliyor; `cursor`
      sözleşmesi o dilime ait ve yanıt biçimi ona uyacak şekilde kuruldu, yani
      sonra kırıcı değişiklik gerekmeyecek.

      **[bitti] `updated_ago` gerçek bir kusur.** *(11 Eylül: MCP yüzeyinden
      kaldırıldı.)* `noteToDict`te duruyor ve `updated_at` ile birebir aynı ISO
      damgayı taşıyor. Ortak serileştiricide **düzeltilmedi**: ön yüz o alanı
      okuyup kendisi göreliye çeviriyor (`drawer.jsx`, `fmtTimeAgo`); adı orada
      da yanıltıcı ama çalışıyor. MCP yanıtından düşürmek yanlış vaadi tek
      hamlede kaldırıyor ve arayüzü kırmıyor — zaman gerektiğinde `updated_at`
      zaten var.

      **[kısmen] `allowed_next` her kolonda boş.** Kısıt sunucuda uygulanıyor
      ama hiçbir panoda tanımlı değil. Alan **kaldırılmadı** ve gerekçesi şu:
      boşluk kusur değil, henüz kimsenin kural koymamış olması demek —
      kaldırılsaydı kural konduğu gün model onu hiç görmezdi. Bunun yerine
      `list_columns` açıklamasına "bütün panolarda boşsa hiçbir kısıt
      tanımlanmamış demektir, alanı yok sayma" yazıldı. Asıl iş ürün
      tarafında: bir panoda gerçekten kullanılsın.

      **[bitti] `list_tasks`in `warning` alanı.** *(11 Eylül: belgelendi
      **ve** koşulu genişletildi.)* İstemcinin "ölü alan" teşhisi doğru
      gözlemdi, yanlış sonuçtu: alan yalnızca `overdue=true` iken çıkıyordu ve
      10 Eylül sabahı bütün panolara `is_done` konduğu için bir daha hiç
      tetiklenemezdi. Ölçüt artık doğru soruyu soruyor: **"bitmiş" bilgisine
      ihtiyaç duyduk mu, pano onu veriyor mu?** Açık görev süzmek de gecikme
      hesaplamak da o bilgiye dayanıyor. Koşul araç açıklamasında, davranış
      `mcp.test.js`te dört testle kilitli.

      **Uygulama sırası:** ~~(1) salt-okuma iyileştirmeleri~~ **bitti
      (11 Eylül)**; (2) `updatedAt` şema değişikliği, ayrı, çünkü üretime
      yazıyor; (3) zorunlu `workspace_id` kapısı; (4) yazma araçları;
      (5) sayfalama ve `list_labels`.

      **Kabul ölçütü — istemcinin kendi koyduğu ve haklı:** yeni araç
      açıklamaları mevcutların kalitesinde olmalı; sadece ne yaptığını değil,
      belirsizlikte istemcinin **ne yapması gerektiğini** de söylemeli
      ("beklediğin alan değilse kullanıcıya sor, devam etme"). Bu açıklamalar
      sunucunun en güçlü tarafı.
- [x] **3. adım — yazma araçları.** *(Tamamlandı 13 Eylül 2026 — 0.5.0, DEVIR
      0-S. 0.4.0–0.4.1'de `create_task`, `update_task`, `move_task`,
      `add_comment`; 0.5.0'da `delete_task`, `restore_task`, `add_subtask`,
      `update_subtask`, `delete_subtask`, `set_active_workspace` ve
      `update_task`'a etiket. Yirmi araç, onu yazıyor. Silme çöpe taşımadır —
      kalıcı silme yüzeye bilinçli olarak çıkmadı.)* En sona, çünkü **atama bildirim üretiyor.**
      Sohbet kapsam dışı bırakıldı, ama "sadece pano" dendiğinde bile dışa
      dokunan nokta bu: kart açmak sessiz, atamak arkadaşının ekranında beliriyor.
- [ ] **4. adım — `my_open_tasks` ucu.** İki hafta gerçek kullanımdan sonra,
      ihtiyacın şekli belli olunca. İlk sürümde MCP projeleri gezip birleştirir;
      üç kişi ve birkaç projede yeni uç gerekmiyor.

**Kimlik: token `.env`de, tabloda değil.** Şemada token modeli yok ve bu depoda
şema değişikliği bilinçli, elle yapılan bir iş — bir tablo uğruna o zinciri
işletmeye değmedi. `STOA_MCP_TOKENS` içinde `kullanıcı_slug:anahtar` çiftleri,
üç kişi için üç satır. **Ödünü açıkça:** iptal/rotasyon arayüzü yok, token
değiştirmek Railway değişkenini düzenleyip yeniden dağıtmak demek. Üç kişide
sorun değil, on kişide değil — o noktada `ApiToken` tablosuna geçilir.
Token **kişiye** bağlı, ekibe değil: aksi halde denetim kaydında "kim yaptı"nın
cevabı yok ve bildirim kime gidecek belirsiz. Kişiye bağlı olması kapsamı da
kendiliğinden çözüyor — Claude tam olarak o kullanıcının gördüğünü görür,
MCP katmanında ikinci bir izin modeli belirmez.

**"Claude üzerinden" izi `lib/audit.js`e düşüyor.** Denetim kaydı zaten "kim ne
yaptı" tablosu: serbest `action` + `detail` alıyor, hiçbir koşulda hata
fırlatmıyor, isteği bekletmiyor. Her MCP yazma işlemi bu sarmalın içinden
geçiyor (`mcp.task_created`, `mcp.task_moved`, …), böylece panodan yapılan
işlemle Claude'un yaptığı ayrışıyor ve **mevcut route dosyalarının tek satırına
dokunulmuyor.**

- [x] ~~**`yetki.test.js` genişletilecek — muafiyet yazılmayacak.**~~
      **Yapıldı (9 Eylül).** Ayrıca tarayıcının kendisinde gerçek bir kusur
      çıktı ve ayrı commit'te kapatıldı (`4836220`): ara yazılım penceresi
      sabit 400 karakterdi ve sınırı yoktu, tek satırlık kayıtlarda komşunun
      `requireAuth`ını sayıyordu. Kapıyı bilerek kırmaya çalışırken bulundu.
      Kararın gerekçesi: MCP ucu bearer
      token taşıyor, oturum çerezi değil; test her uçta `requireAuth` arıyor.
      Ucu `ACIK_UCLAR`a yazmak kolay ama yanlış olurdu: uç *açık* değil, **farklı**
      korunuyor. Bunun yerine test `requireMcpToken`ı denk koruma sayacak ve her
      MCP ucunda onu **şart koşacak**. CLAUDE.md'deki merdivende bir basamak
      yukarısı; muafiyet listesi bayatlar, kapı bayatlamaz.
- [x] ~~**`dil.test.js` → `HATA_DOSYALARI`na `mcp.js`.**~~ **Yapıldı (9 Eylül).**
      Dört `err_mcp_*` kodu iki sözlüğe de girdi. MCP araç açıklamaları kural
      dışı: onları kullanıcı görmüyor, model okuyor ve cevabını zaten
      kullanıcının diliyle veriyor.
- [x] ~~**Regresyon testi** (`guvenlik.test.js`).~~ **Yapıldı (9 Eylül).** Sekiz
      test, hepsi saf: anahtar yoksa / tanınmıyorsa / kullanıcısı silinmişse
      401; kısa anahtar atılıyor; aynı anahtar iki kişideyse ikisi de düşüyor;
      ham anahtar bellekte durmuyor. Korunan sınıf, "yapılandırılmamışsa
      serbest bırak" — bu depodaki üç kusurun kök sebebi sessiz atlamaydı.
- [x] ~~**Hız sınırı.**~~ **Yapıldı (9 Eylül):** `/mcp` için 600/15dk ≈ 40
      istek/dk. `/api/auth`un 30'luk sınırı burada normal kullanımı keserdi —
      MCP konuşkan bir protokol, `initialize`/`tools/list`/`tools/call` ayrı
      isteklerdir. Üç kişi tek ofis IP'sinin arkasından rahat çalışır, döngüye
      giren bir model durur.
- [x] ~~**Yeni bağımlılık:** `@modelcontextprotocol/sdk`.~~ **Kuruldu (1.30.0).**
      Transport **Streamable HTTP**, durum tutmayan kipte ve düz JSON yanıtla
      (`enableJsonResponse`) — araçlar istek/yanıt biçiminde, akışa ihtiyaç yok
      ve Railway'in ters vekili uzun ömürlü bağlantıyı boşta kalma zaman
      aşımıyla düşürebiliyor. Müstakil HTTP+SSE zaten spesifikasyonda geriye
      dönük uyumluluğa indirilmişti.
      **Kipin dayandığı varsayım:** SDK sunucusu `initialize` görmemiş isteği
      reddetmiyor — her istekte yeni sunucu kurulduğu için bu şart. 1.30.0'da
      doğrulandı; sürüm yükseltmesinde yeniden bakılmalı.

**Yan kazanç.** Bu kullanım biçimi `task_transitions` ve `work_logs`'a ilk kez
gerçek veri yazar. Raporlama katmanı bugüne kadar boş bir odaydı; iş akışı
oturduğunda ilk anlamlı raporlar oradan çıkar.

**Asıl risk teknik değil, alışkanlıkta.** Döngünün tamamı arkadaşların panoyu
dürüst tutmasına bağlı. Görevler geç kapanırsa Claude tarafındaki görüntü bayat
olur — ve bayat bilgiye güvenmek, hiç bilgi olmamasından kötüdür. Panoyu
güncellemek ucuz kalmalı: az görev, az durum. Sadelik iddiası burada işe yarıyor.

**Kapsam dışı (bilinçli).** Sohbete **yazmak**: dışa dönük, bildirim üreten bir
eylem ve "mesajı kim yazdı" sorusunu doğuruyor — "Claude" diye bir kullanıcı
belirirse kanal kirlenir, senin adına yazarsa arkadaşların sana yazmışsın sanır.
Sohbeti **okumak** değerli (kanaldaki karar panoda görünmüyor) ve ileride
düşünülebilir; yazmak ilk sürümde yok.

**Yolda bulundu, ayrı iş:** `GET /api/workspaces/me/tasks` silinmiş görevleri de
döndürüyor (`deletedAt` filtresi yok). Notlar'ın bağlantı seçicisi için yazılmış
hafif bir uç, çöp kutusundaki kartlar orada listeleniyor.


### Eray — yerelde çalıştırma kısıtı

Bu bölüm koda değil, **çalışma ortamına** ait. Kararı ve denemesi Eray'da;
bir sonraki oturumda buradan devam edilebilir.

**Durum.** Ofis ağı (BDH Netaş) dışarıya giden 5432'yi kesiyor. TCP el sıkışması
tamamlanıyor ama ilk pakete cevap gelmiyor: araya giren şeffaf bir güvenlik
duvarı var. Kodda ya da Neon'da sorun yok. Sonuç: **iş bilgisayarında uygulama
yerel olarak ayağa kaldırılamıyor**, çünkü veritabanına ulaşamıyor. Evde
kısıtlama yok, ama ev vakti sınırlı.

**Bu kısıtın göründüğü kadar geniş olmadığı 3 Eylül'de ölçüldü.** 143 testin
hiçbiri veritabanı istemiyor; `DATABASE_URL` tamamen boşken de 143/143 geçiyor.
Ön yüz derlemesi de veritabanı istemiyor. Yani ofiste yapılabilecek iş
sanıldığından çok daha geniş:

| Ofiste yapılabilir (CI doğruluyor) | Ev işi (gerçek veritabanı gerekiyor) |
|---|---|
| Arayüz, dil, metin | Şema değişikliği ve göç |
| Saf mantık ve hesaplar | Prisma sorgu doğruluğu |
| Test yazmak, refactor | Uçtan uca akış denemesi |
| Belgeler | Gerçek veriyle kontrol |

CI, GitHub'ın sunucusunda çalıştığı için ofis güvenlik duvarından etkilenmiyor.
Ofiste dal itmek, yerelde **alınamayan** bir doğrulama sağlıyor.

- [ ] **Neon'un HTTP/WebSocket sürücüsünü dene.** `@prisma/adapter-neon` +
      `@neondatabase/serverless`, 5432 yerine 443 üzerinden bağlanıyor. Prisma
      5.22 kullanılıyor, `driverAdapters` preview özelliğiyle destekleniyor.
      Çalışırsa ofiste de yerel geliştirme açılır ve bu kısıt tamamen kalkar.
      **Garanti değil:** kurumsal proxy WebSocket'i de kesebilir. Denemesi bir
      oturumluk iş, kazancı büyük. Sadece yerel geliştirme için denenmeli,
      üretim bağlantısı değiştirilmemeli.
- [ ] **Alternatif: ofiste yerel Postgres.** Docker ve `psql` iş makinesinde
      kurulu değil (3 Eylül'de kontrol edildi), kurulum yönetici hakkı
      isteyebilir. Seed betikleri hazır (`stoa-seed.mjs`, `stoa-seed-more.mjs`,
      toplantı klasöründe), yani veritabanı ayağa kalkarsa doldurmak kolay.
      Yukarıdaki madde çalışmazsa bu denenir.
- [ ] **Şu anki çalışma biçimi** (kısıt kalkana kadar): ofiste dala it, CI
      yeşilse `main`e al. PR ve branch protection gerekmiyor; korumayı sağlayan
      şey CI'ın dağıtımdan önce çalışması.

### Hemen yapılabilir — depo dışı, 5 dakikalık işler
- [ ] **GitHub faturalandırma kilidi (crashnn hesabı).** CI kuruldu ama hiç
      çalışamıyor: "The job was not started because your account is locked due
      to a billing issue". İşler başlamıyor, yani kırmızı da değil, sessiz.
      Actions faturası **depo sahibine** kesiliyor, iten kişiye değil; bu
      yüzden kilidi `crashnn` açmalı (`github.com/settings/billing`).
      Mesaj "spending limit exceeded" değil, yani dakika bitmesi değil ödeme
      sorunu: ayın başını beklemek çözmez.
      **Not:** bu iş yükü ücretsiz sınırın çok altında. İki iş x ~1.5 dakika =
      push başına ~3 dakika; private depoda ücretsiz hesaba ayda 2.000 dakika
      dahil. Yani kilit büyük ihtimalle Actions'tan değil, başka ödenmemiş bir
      kalemden geliyor ve çözülünce CI maliyetsiz çalışacak.
      Kilit hesap düzeyinde olduğu için `4. Proje Panosu` deposunu da etkiliyor.
- [ ] **CI'ı gerçek kapıya çevir.** Yukarıdaki kilit açıldıktan SONRA.
      GitHub'da `Settings → Branches → Add rule → main` → **Require status
      checks to pass before merging** açılıp `sunucu testleri` ve
      `ön yüz derlemesi` seçilmeli. Uyarı: bu ayar doğrudan `main`e push'u da
      engeller, yani PR akışına geçmek gerekir. Kararı verilmedi.
      Şu an koruma `pre-push` kancasında (`.githooks/pre-push`), merdivende
      4.5 basamak: otomatik ama `--no-verify` ile atlanabilir.
- [x] ~~`dil-ve-ci` dalını main'e al.~~ **Yapıldı (3 Eylül).** 11 commit
      fast-forward ile main'e alındı, dal yerelde ve uzakta silindi.
- [x] ~~`raporlama` dalını sil.~~ **Yapıldı (3 Eylül).** Yerelde ve uzakta
      silindi; `main`'in tamamen içindeydi, tek fazla commit'i yoktu.
- [ ] **Kök dizindeki öksüz `package-lock.json`.** Kökte `package.json` yok
      ama kilit dosyası var ve git'te takipli. `client/` ve `server/` kendi
      kilitlerini taşıyor. Muhtemelen kökte bir kez `npm install` çalıştırılmasından
      kalma. Silinmeli; şu an sadece karışıklık yaratıyor.

### Öncelikli
- [ ] **Uç testleri — kapsamlamanın DOĞRULUĞU test edilmiyor.** 3 Eylül'de
      `yetki.test.js` eklendi ve iki değişmezi kilitledi: her uç `requireAuth`
      taşıyor (113 uçtan 9'u gerekçeli açık listede), ve hiçbir soket
      işleyicisi kimliği olay gövdesinden okumuyor. Bu, "kimlik doğrulaması
      unutuldu" sınıfını kapatıyor.
      **Kapanmayan sınıf:** bir ucun kapsamlamasının *doğru* olup olmadığı.
      Denendi ve bilinçli olarak vazgeçildi — statik tarama 70 mutasyon
      ucunun 46'sını işaretledi, hepsi yanlış pozitifti. Sebep kapsamlamanın
      tek biçimde yapılmaması: kimi uç `userId: user.id` ile, kimi aktif
      çalışma alanıyla, kimi `loadTaskWithAccess(permission:)` ile, kimi
      `requireWorkspacePermission` ile kapsanıyor. Dördü de doğru, hiçbiri
      aynı imzada. Ayırt etmek için isteğin gerçekten çalıştırılması gerek.
      **Gereken:** supertest benzeri bir koşum + sahte oturum + veritabanı
      taklidi. Asıl engel bu. Yazılınca ilk hedef: çalışma alanları arası
      IDOR, rol yükseltme, ve `view_reports` olmadan başkasının raporu.
- [x] **`yetki.test.js` yalnızca `routes/` ve `sockets/` tarıyor.** *(Kapandı
      12 Eylül 2026 — DEVIR 0-N.)* Madde küçük görünüyordu ama **fiilî** bir
      kör nokta vardı: `app.js:189`'daki `app.get('/')` taramanın desenine
      uymadığı için hiç görünmüyordu — "her uç kimlik doğrulamasından geçer"
      testi o ucu hiç görmeden yeşil kalıyordu. Kapsam artık elle değil
      **kaynaktan** türetiliyor: `app.js` neyi mount ediyorsa tarama onu
      görmek zorunda, mount edilen her dosyada en az bir uç bulunmalı, ve
      `app.js` de taranıyor. Beş mutasyonun beşi de yakalandı.
- [ ] **Test kapsamı saf mantıkla sınırlı.** ~~Otomatik test yok.~~ 1–3 Eylül
      arasında sıfırdan **137 test** yazıldı (`server/test/`): güvenlik
      regresyonları, modül yükleme (smoke), raporlama saf mantığı ve dil
      sözlüğü/hata kodu kilidi. Hiçbiri veritabanı istemiyor.
      **Kalan açık:** uçların kendisi test edilmiyor. İzin katmanı
      (`hasPermission`) ve soket olaylarının yetki kontrolleri hâlâ elle
      doğrulanıyor — en riskli ve en çok değişen kod orası. Gerçek testi
      yazmak için istek düzeyinde (supertest benzeri) bir koşum gerekiyor;
      asıl engel oturum/veritabanı taklidi.
- [ ] **Dosya depolama ölçeklenmiyor.** Yüklenen dosyalar veritabanında `bytea`
      olarak duruyor. S3/R2'ye taşınmalı; kod tarafında yerelleştirilmiş bir
      değişiklik (`lib/uploads.js` + `routes/attachments.js`).
- [ ] **Veritabanı göçleri sürümsüz.** `prisma db push` kullanılıyor — hızlı
      ama migration geçmişi tutmuyor. 2 Eylül 2026'da `--accept-data-loss`
      deploy zincirinden çıkarıldı (`postinstall`, `npm start`, `railway.toml`),
      yani şema artık kendiliğinden gitmiyor ve sessiz `DROP` riski yok.
      3 Eylül'de `session` tablosu şemaya tanıtıldı (6242a7c): elle çalıştırılan
      `prisma db push` de artık onu düşürmeye çalışmıyor, yani
      `--accept-data-loss` yazma ihtiyacı hiç doğmuyor.
      Kalan eksik geçmiş: hangi şemanın ne zaman gittiği kayıtlı değil.
      Gerçek kullanıcı verisi büyümeden düzenli migration dosyalarına geçilmeli.

### Rol adları ve profil unvanı (3 Eylül'de bulundu)

- [ ] **Varsayılan roller yalnızca Türkçe tohumlanıyor.** `workspaces.js`
      çalışma alanı kurarken `Yönetici` / `Düzenleyici` / `Görüntüleyici`
      rollerini yazıyor ve `WorkspaceRole` modelinde tek bir `name` alanı var.
      Oysa varsayılan **kolonlar** iki dilli tohumlanıyor: `BoardColumn`
      hem `title` (İngilizce) hem `titleTr` taşıyor ve pano dile göre
      seçiyor. Aynı sorun, iki farklı çözüm: tutarsızlık.
      Roller kullanıcı tarafından yeniden adlandırılabildiği için tam olarak
      "kullanıcı verisi" de değil, "uygulama tohumu" da; kolonlarla aynı
      kalıp doğru cevap gibi duruyor (`name` + `name_tr`).
      **Şema değişikliği gerektiriyor** (katkı niteliğinde, veri kaybı yok),
      yani ev işi: elle ve bilinçli uygulanmalı.
- [ ] **Profil "Title / Role" alanı sabit Türkçe tohumlanıyor.**
      `auth.js` kayıtta ve Google girişinde `roleTitle: 'Üye'` yazıyor.
      İngilizce arayüzde kaydolan kullanıcının unvanı "Üye" oluyor.
      **Ayrıca tasarım sorusu:** bu alan bir *iş unvanı* (Geliştirici,
      Tasarımcı) ama çalışma alanı *yetki rolünün* yanında gösteriliyor
      (`settings.jsx` üye satırı `Sahip · Üye` üretiyor). İki farklı kavram
      aynı ada sahip ve yan yana duruyor.
      **Öneri:** varsayılanı tamamen kaldır, boş bırak. Alan zaten
      "E.g: Developer, Designer..." ipucu gösteriyor; boş bir unvan dürüst,
      uydurulmuş "Üye" ise hem gereksiz hem yetki rolüyle çakışıyor.
      Bu, projenin kendi ilkesiyle de uyumlu: bilinmeyen değer uydurulmaz.
      Karar verilmeden koda girilmemeli.

### Bilinen kusurlar
- [ ] Topbar'daki sohbet butonu bazı ekranlarda tepki vermiyor (yeniden
      üretilemedi — adım tarifi gerekiyor).
- [ ] Alt görevi olmayan bir kart "tamamlandı" kolonundan çıkarılınca ilerleme
      %100 kalıyor. Alt görev yoksa hesaplanacak bir kaynak da yok; bilinçli
      olarak dokunulmadı.
      **Kararı yeniden düşün — 10 Eylül'de ölçüldü ve kenar durum değilmiş.**
      MCP ile gerçek panoya bakıldığında geciken 6 kartın **5'i**
      `progress: 100` taşırken `todo`/`doing` kolonunda duruyor ve
      `completed_at` boş. Yani ilerleme yüzdesi kolon durumundan tamamen
      kopmuş: kart "%100" diyor, pano "yapılacak" diyor, sistem "gecikmiş"
      diyor. Üçü aynı anda doğru olamaz. "Hesaplanacak kaynak yok" gerekçesi
      hâlâ geçerli ama sonucu yanlış: kaynak yoksa **sıfırlamak**, eski
      değeri korumaktan daha dürüst. Alternatif, alt görevi olmayan kartta
      ilerlemeyi hiç göstermemek.
- [x] ~~Paket boyutu 787 KB, kod bölme yapılmadı.~~ **Yapıldı (2 Eylül).**
      Satıcı bölme (react-vendor 143 KB, realtime 42 KB ayrı, önbelleklenir) +
      altı açılış-dışı görünüm tembel yükleniyor (reports, notes, settings,
      calendar, dashboard, trash). İlk boya 806→~642 KB (ham), derleme uyarısı
      kalktı. ChatPanel/NotifPanel bilerek eager (ikişer render noktası).
- [ ] `chat.jsx` ve `data.jsx` beklenenden kalın; bölünmeleri gerekiyor.
- [x] ~~`client/src/views/list.jsx` öksüz.~~ **Silindi (3 Eylül).** Liste
      görünümü board alt-görünümüne taşınınca render edilmez olmuştu; app.jsx'teki
      ölü import 2 Eylül'de kaldırılmış, dosyanın kendisi kalmıştı. `ListView`
      adının depoda başka geçtiği yer yoktu, derleme silmeden sonra da temiz.
- [ ] Almanca, İspanyolca ve Rusça yalnızca gezinme ve ayarlar düzeyinde
      (43'er anahtar); eksikler Türkçe'ye düşüyor. TR/EN tam: **1154'er
      anahtar**, 106'sı sunucu hata kodu.
      Dördüncü dil eklemek artık daha kolay ama otomatik değil: `dil.test.js`
      bilinçli olarak yalnızca tr/en denkliğini kilitliyor. Yeni dil gerçekten
      benimsenecekse testteki dil listesi genişletilmeli, yoksa eksik anahtar
      yine sessizce Türkçe'ye düşer.
- [x] ~~**`dil.test.js`'in kör noktası.**~~ **Kapatıldı (3 Eylül).** Ölçüt
      "metin nerede duruyor"dan "metnin çevirisi var mı"ya çevrildi; tarama
      artık dosyanın tamamını okuyor. Tur 58 kaçak buldu ve kapattı — bunların
      **31'i kodda çağrılıp sözlüğe hiç eklenmemiş anahtardı**, yani ekran
      doğru yazılmış ama İngilizce arayüzde Türkçe duruyordu. Ayrıntı:
      [CLAUDE.md](CLAUDE.md) dil bölümü.

### Tasarım kararı bekleyenler
- [ ] **Bildirimler baştan ele alınacak.** Toplantıda mesaj gönderildi, karşı
      tarafta toast çıkmadı. İki sebebi vardı: biri kırık koddu (düzeltildi),
      diğeri tasarım boşluğu ve **hâlâ açık** — görev atama, bahsetme ve yorum
      bildirimleri hiçbir zaman toast üretmiyor, yalnızca zil rozeti ve ses.
      Kurumsalda en kritik bildirim en sessiz olanı. Harita, boşluklar ve karar
      bekleyen beş soru: [BILDIRIMLER.md](BILDIRIMLER.md).
- [ ] **Süreyi kim girer?** Geliştirici mi, yönetici mi; girilmezse ne olur?
      Şu an herkes yalnızca kendi süresini giriyor, zorunluluk yok. Kurumsalda
      gerçekten tartışmalı bir konu — **ikinci toplantıda masaya konacak soru
      bu.** Karar verilmeden hatırlatma/zorunluluk mekanizması yazılmamalı.
- [x] ~~**Kolon geçiş kuralı arayüzü.** Kolon ayarından mı, proje düzeyinde akış
      ekranından mı?~~ **Karar verildi ve yapıldı (1 Eylül, 9035c2a).** Kural
      kolon menüsünden yönetiliyor (`views/board.jsx`); proje düzeyinde ayrı
      akış ekranı bilinçli olarak seçilmedi — o, Jira'nın karmaşıklığına doğru
      bir adımdı. Hiçbiri seçili değilse kısıt yok, mevcut panolar aynen
      çalışıyor; engellenen taşımada kullanıcı sebebi görüyor.
      **Kalan iş:** bu menünün metinleri çevrilmedi ("Geçiş kuralı", "kısıt
      yok", "Kuralı kaldır", yardım cümlesi hâlâ çıplak Türkçe) ve
      `dil.test.js` bunları göremiyor — kör noktası [CLAUDE.md](CLAUDE.md)
      dil bölümünde anlatıldı.
- [ ] **Sohbet kapsamı.** Şu an kanallar çalışma alanı geneli. Seçenekler:
      (A) böyle kalsın, (B) her projeye özel sohbet, (C) kanallar genel kalsın
      ama istenirse bir projeye bağlanabilsin. **Öneri: C** — B küçük takımlarda
      ıssız kanallar üretiyor, A ise proje–konuşma bağını hiç kurmuyor.
