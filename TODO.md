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
- [ ] **2. adım — okuma araçları.** `list_projects`, `list_tasks`, `get_task`.
      Risk sıfır ve **değerin çoğu burada**: "Claude, kart aç" cümlesi panoda
      zaten iki tık; kazandıran cümle "bugün bende ne var, ne gecikti".
      Yalnızca yazma aracı koyan entegrasyonlar iki haftada terk ediliyor.
- [ ] **3. adım — yazma araçları.** En sona, çünkü **atama bildirim üretiyor.**
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
- [ ] **`yetki.test.js` yalnızca `routes/` ve `sockets/` tarıyor.** Yeni bir
      dizine uç eklenirse tarama onu görmez. Uç kayıtları başka bir yere
      taşınırsa testteki `ROUTES`/`SOCKETS` yolları güncellenmeli.
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
