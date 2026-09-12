# StoaBoard — Claude Code için yönlendirme

Takımlar için gerçek zamanlı proje yönetim uygulaması. Node.js + Express +
Prisma + PostgreSQL (Neon) arka uç, React 18 + Vite ön yüz, Socket.IO ile
gerçek zamanlı sohbet ve bildirimler. **Canlı:** stoaboard.com (Railway).

---

## Önce bunları oku

Hangi işe girersen gir, ilgili belgeyi açmadan başlama:

| Belge | Ne zaman |
|---|---|
| [DEVIR.md](DEVIR.md) | **İlk sırada.** Proje iki makinede sürüyor; son oturum nerede bıraktı |
| [TODO.md](TODO.md) | Her zaman. Ne kapatıldı, ne bekliyor, **gerekçeleriyle** |
| [GUVENLIK.md](GUVENLIK.md) | **Yeni bir uç, ayar veya ekran eklerken zorunlu** |
| [BILDIRIMLER.md](BILDIRIMLER.md) | Bildirimlere dokunurken |
| [TOPLANTI-KARSILIGI.md](TOPLANTI-KARSILIGI.md) | Ürün yönü / kapsam sorusu geldiğinde |
| [RAPORLAMA-TESTI.md](RAPORLAMA-TESTI.md) | `raporlama` dalını ayağa kaldırıp test ederken |
| [MCP-SURUMLER.md](MCP-SURUMLER.md) | MCP yüzeyine dokunurken — sürüm geçmişi, kırıcı değişiklikler |

---

## Şu anki durum (11 Eylül 2026)

`raporlama` dalı **`main`e birleştirildi** (58b1a6d). Şema production'a
uygulandı (Neon SQL Editor, üç tablo + üç sütun, doğrulandı) ve `db push`
deploy zincirinden çıkarıldı — artık şema bilinçli, elle gönderiliyor.

**Depo durumu:** `main` ve `origin/main` eşit, çalışma ağacı temiz, bekleyen
push yok. Son commit `df113c3`. Proje iki makinede sürdürülüyor; işe başlamadan
`git fetch && git status` çalıştır. `raporlama` dalı tamamen `main`in içinde,
artık ölü ağırlık.

**2 Eylül:** çöp kutusu boşaltma yetki kapısı, denetim kaydı kapsamı (üye
çıkarma, rol değişikliği, toplu silme), bahsetme bildirimi kapsam sızıntısı,
ön yüz kod bölme (satıcı + tembel görünümler), raporlama saf mantık testleri,
görünüm alanına `ErrorBoundary`.

**3 Eylül:** `session` tablosu şemaya tanıtıldı (6242a7c) — `prisma db push`
artık onu düşürmeye çalışmıyor, gerekçe aşağıda tuzaklar bölümünde. Ardından
dil turu: Raporlar ve süre kaydı ekranları, sonra on route dosyasındaki
sunucu hata mesajları çeviriye bağlandı (`32644b9`, `2449240`, `df113c3`).
Öksüz `list.jsx` silindi.

**11 Eylül:** MCP okuma yüzeyi kapandı — sürüm **0.3.0**, on araç
(`list_workspaces`, `list_members`, `search_tasks` eklendi). Yanıt biçimi
`server/src/lib/mcpShape.js`e taşındı ve saf: kimlik normalizasyonu, kırpma,
süzme, uyarı metni. Araç **başlıkları** artık iki dilli (`description` kural
dışı, gerekçesi dosyanın başında). Yol boyunca çıkan kusur: açık görev sayısı
çöp kutusundaki kartları da sayıyordu (`projects.js`, `api.js`).

Aynı akşam **0.3.1**: gerçek istemcinin bulguları. En önemlisi, MCP başka
alandaki kaydı aktif alanınmış gibi döndürüyordu; artık tek kapıdan
(`aktifProje`) geçiyor. Yol boyunca açık bir güvenlik kusuru bulundu: görev ataması alan
üyeliğini kontrol etmiyordu — aynı gece kapatıldı (DEVIR 0-G).

Gece, ev makinesinde: 0.3.1 uçtan uca doğrulandı, `main`e birleştirildi
(`23c34f0`) ve canlıda da tarandı (53 geçti, 0 kaldı). MCP taraması artık
depoda (`npm run mcp:tara`); canlıya karşı `MCP_URL=https://www.stoaboard.com/mcp`
ile koşulur (DEVIR 0-F).

Aynı gece **MCP 0.4.0**: ilk yazma araçları (`create_task`, `update_task`,
`move_task`) — zorunlu `workspace_id` + 409, her yazma denetim kaydına
(DEVIR 0-H). Açık güvenlik işi: kart yorumundaki `@bahsetme` alıcıyı bütün
platformda arıyor (TODO).

12 Eylül sabahı 0.4.0 **canlıda doğrulandı** (tarama 64/0/2) ve ilk gerçek
yazma Cowork'ten yapıldı (kart #114, denetim kaydında üç `mcp.task_*` satırı).
Aynı turda `/.well-known/*` 404 döndürülmeye başlandı (DEVIR 0-I).
Kart yorumundaki `@bahsetme` sızıntısı da kapandı (DEVIR 0-J): bahsedilen kişi
artık yalnızca kartın alanının üyeleri arasında aranıyor, belirsiz önek
kimseye bildirim göndermiyor.
Hemen ardından **0.4.1**: `add_comment` aracı (DEVIR 0-K). Yorum aracı 0.4.0'da
bilerek bekletilmişti; bahsetme kapsamı daralınca açıldı.

Test sayısı **333**, hepsi geçiyor. Ayrıntılı durum için **her zaman
[DEVIR.md](DEVIR.md)** — bu blok bayatlamaya yatkın, oradaki 0-* bölümleri
tarihli ve daha güvenilir.

---

## Bilinmesi gereken tuzaklar

**Şema deploy'da kendiliğinden gitmiyor — artık.** 2 Eylül 2026'ya kadar
`postinstall`, `npm start` ve Railway build komutu `prisma db push
--accept-data-loss` çalıştırıyordu. Her deploy şemayı `DATABASE_URL`in
gösterdiği yere itiyor, üstelik şemada olmayan tabloyu sormadan düşürebiliyordu:
koda geri dönmek, veritabanında istenmeyen bir `DROP` anlamına geliyordu.
Üç çağrı da kaldırıldı. `npm install` ve `npm start` artık güvenli,
`--ignore-scripts` gerekmiyor.

**Şema değişikliğini bilerek uygularsın.** İki yol:

```bash
npm run prisma:push          # --accept-data-loss yok; yıkıcı değişikliği reddeder

# ya da DDL'i çevrimdışı üret, Neon SQL Editor'den çalıştır:
npx prisma migrate diff --from-schema-datamodel <eski>.prisma   --to-schema-datamodel prisma/schema.prisma --script
```

İkincisi kurumsal ağda tek seçenek: 5432 kapalıyken bile tarayıcı içi SQL
Editor HTTPS üzerinden çalışır. `migrate diff` veritabanına bağlanmaz.

**`session` modelini şemadan çıkarma.** Tabloyu Prisma değil
`connect-pg-simple` oluşturuyor (`app.js`, `createTableIfMissing: true`) ve
uygulama kodu bu modeli hiç kullanmıyor — tanım yalnızca Prisma'ya "bu tablo
bilinir, dokunma" demek için var. Olmadığında `db push` tek işlem olarak
`DROP TABLE "session"` üretiyor: `npm run prisma:push` her seferinde veri
kaybı uyarısıyla duruyor, oradaki refleks de `--accept-data-loss` eklemek
oluyordu. O bayrak tabloyu gerçekten siler ve giriş yapmış herkes düşer.
Modeli kaldırırsan tuzak aynen geri gelir (6242a7c).

**Windows PowerShell'de `npm` değil `npm.cmd`.** `npm` → `npm.ps1`e çözümlenip
execution policy'ye takılıyor. Git Bash'te düz `npm` çalışır.

**`server/.env` repoda yok** ve olmamalı. Üretim bağlantısı yalnızca Railway
ortam değişkenlerinde; hiçbir geliştirici makinesinde durmuyor. Yerel test için
Neon'da ayrı bir dal kullanılıyor.

**İki `.env` varsa `server/.env` kazanır.** `config.js` önce `server/.env`'i,
sonra kök `.env`'i yüklüyor ve dotenv var olan değişkeni ezmiyor: aynı ad
ikisinde de varsa kökteki sessizce yok sayılır. 11 Eylül'de canlı MCP anahtarı
köke yazıldı, tarama `server/.env`'deki eskisini gönderdi ve sebep bir saat
dağıtımda arandı. Değişkeni `server/.env`'e yaz.

**`/api` dışındaki her adres SPA'ya düşüyor — yokluk 404 ile söylenmeli.**
12 Eylül'de bağlayıcı kurulamadı, çünkü `/.well-known/oauth-*` 200 + HTML
dönüyordu ve Claude bunu "OAuth var" diye okudu ("Detected"), sonra kayıt
düştü. `app.js` artık `/.well-known` için 404 veriyor, testle kilitli. Makine
okuyan yeni bir yol eklerken aynı soruyu sor: bu adres **yokken** istemci ne
görüyor?

**Veritabanına bağlanamıyorsan** (`P1001`, `ECONNRESET`, zaman aşımı) muhtemelen
ağ 5432'yi engelliyor — kurumsal ağlarda yaygın. "Can't reach database server" =
ağ sorunu; "kullanıcı bulunamadı" = bağlantı iyi, mesele veride. Neon'un
tarayıcı içi SQL Editor'ü HTTPS üzerinden çalıştığı için o ağlarda bile açılır.

---

## Çalışma biçimi

**Testleri çalıştır.** Değişiklikten sonra `cd server && npm test` — 333 test,
veritabanı gerektirmez, birkaç saniye sürer. Çıktıda `[db] warmup failed` /
"Can't reach database server" görürsen bu bir test hatası **değil**: uygulama
modülü yüklenirken bağlantıyı deniyor, kurumsal ağda 5432 kapalı. Ölçüt en
alttaki `pass` / `fail` satırlarıdır.

```bash
cd server && npm test        # PowerShell'de: npm.cmd test
cd client && npm run build   # ön yüz derlemesi
cd server && npm run mcp:tara # MCP taraması — çalışan sunucu + veritabanı ister
```

**MCP'ye dokunduysan taramayı da koş.** `npm test` MCP'yi yalnızca saf
katmanda (`mcpShape.js`) görüyor; araçların gerçek yanıtlarını ve araçlar
arası tutarlılığı `npm run mcp:tara` ölçüyor. Açık bir sunucu ve veritabanı
ister — 5432 kapalı ağda koşmaz. Çıkış kodu 2 "atlanan var" demek: atlanan
kontrol geçmiş sayılmaz, sebebi çıktının sonunda.

**Makine kurulumu, bir kez:**

```bash
git config core.hooksPath .githooks
```

Bunu yapmadan `pre-push` kancası çalışmaz. Kanca push'tan önce testleri ve
derlemeyi çalıştırıp kırmızıysa push'u iptal ediyor. Kancalar `.git/hooks`
içinde takip edilmediği için depoda `.githooks/` klasöründe duruyorlar; komut
git'e oraya bakmasını söylüyor. Bilerek atlamak için `git push --no-verify`.

**Kanca ofis ağında da çalışır.** 333 testin hiçbiri veritabanı istemiyor;
çalışmayan tek şey uygulamanın kendisi. Kanca sahte bir `DATABASE_URL` ile
koşuyor ki test koşusu ağa bağımlı hale gelip asılı kalmasın.

`.github/workflows/ci.yml` aynı işi GitHub tarafında yapıyor ama **şu anda
çalışmıyor**: depo sahibi hesabın (`crashnn`) faturalandırması kilitli, işler
hiç başlamıyor ("The job was not started because your account is locked due to
a billing issue"). Dosya yerinde duruyor, kilit açılınca değişiklik gerekmeden
çalışacak. **Repoda CI dosyası görüp korunduğunu varsayma** — bugün koruyan
şey kanca.

**Kuralı belgeye değil, doğrulayana yaz.** Bu depoda kanıtlanmış bir ders:
dil kuralı CLAUDE.md'de net biçimde yazılıydı ve yine de 31 yerde ihlal
edildi — kuralı uygulamaya çalışan biri tarafından. Bir kuralı kalıcı kılmak
istiyorsan onu şu merdivende yukarı taşı:

```
belge → gözden geçirme listesi → test → CI kapısı → lint/tip → tasarımen imkânsız
```

Bu deponun en olgun iki hamlesi en üst basamakta: `db push --accept-data-loss`
"deploy'da çalıştırma" diye belgelenmedi, **çağrı silindi**; `session` tablosu
için "uyarıya hayır de" kuralı konmadı, **uyarının çıkması engellendi**. Bir
kusuru kapatırken sor: *bunu bir daha yapmayı imkânsız kılabilir miyim?*

**Güvenlik eleği zorunlu.** Yeni bir uç, ayar veya ekran eklerken
[GUVENLIK.md](GUVENLIK.md) bölüm 4'teki on soru cevaplanmadan iş bitmiş sayılmaz.
Cevaplar commit mesajına yazılır.

**Kapatılan her kusur için regresyon testi.** `server/test/guvenlik.test.js`
içine, koruduğu kusuru anlatan bir yorumla birlikte.

**Her yeni uç `requireAuth` taşır.** `server/test/yetki.test.js` bunu kilitliyor:
113 ucun 9'u bilinçli olarak açık ve hepsi gerekçesiyle `ACIK_UCLAR` listesinde.
Uç gerçekten herkese açık olacaksa listeye **niçin** olduğunu yazarsın; test
seni karar vermeye zorlar, sessizce geçmene izin vermez. Aynı dosya soket
tarafını da kilitliyor: kimlik yalnızca `socket.request.session.userId`'den
okunur, olay gövdesinden asla — gövde tamamen istemci denetiminde.

Kapsamlamanın *doğruluğu* (hangi uç hangi izni istemeli) statik olarak
doğrulanamıyor ve bilinçli olarak denenmedi; gerekçesi testin sonundaki notta
ve TODO.md'de. Oraya bakmadan "yetki testi var" diye güvenme.

**Dil kapsamı zorunlu — Türkçe *ve* İngilizce.** Kullanıcının gördüğü hiçbir
metin doğrudan yazılmaz. Anahtar `client/src/data.jsx` içindeki `APP_I18N`'e
**iki sözlüğe birden** (`tr` ve `en`) eklenir; çağrı yeri
`T('anahtar', 'Türkçe yedek')` ya da `window.t?.('anahtar') || 'Türkçe yedek'`
biçiminde olur. Bu kural `title`, `placeholder` ve `aria-label` için de geçerli.

Yalnızca `tr`ye eklemek işe yaramış gibi görünür ve gözden kaçar: `window.t`
İngilizce karşılığı bulamayınca sessizce Türkçe'ye düşer, yani ekran çalışır
ama yanlış dilde durur. Raporlar ve süre kaydı ekranları bu yüzden İngilizce
arayüzde tamamen Türkçe kalmıştı *(3 Eylül)*.

**Sunucu hata mesajları da aynı kurala tabi.** Sözleşme:
`{ error: 'err_kod', message: 'Türkçe' }`. Metin doğrudan `error` alanına
yazılmaz — `apiFetch` kodu sözlükten geçiriyor, karşılığı yoksa `message`a
düşüyor. Çeviri tek noktada yapıldığı için çağrı yerlerine dokunmak gerekmiyor.
İçine değer gömülen dinamik mesajlar (kolon geçiş hatası gibi) istemcide
çevrilemez; onlarda cümle sunucuda kurulur ve dil `reqLang(req)` ile okunur
(`?lang` ya da `X-Stoa-Lang` başlığı, ikincisini `apiFetch` her isteğe ekliyor).

Kural `server/test/dil.test.js` ile kilitli: iki sözlüğün anahtar kümesi
birebir eşleşmeli, görünüm dosyalarında çıplak Türkçe metin kalmamalı, ve
`routes/*` içindeki her `error` alanı sözlükte karşılığı olan bir kod olmalı.
Yeni bir route dosyası eklenirse testteki `HATA_DOSYALARI` listesine yazılmalı.
`de`/`es`/`ru` bilinçli olarak kapsam dışı — onlar zaten Türkçe'ye düşüyor.

**Testin sorduğu soru "metin nerede duruyor" değil, "metnin çevirisi var mı".**
3 Eylül'de ölçüt değişti. Eski tarama satır satır çalışıp yalnızca aynı
satırdaki `>metin<` kalıbını arıyordu; süslü parantez içindeki metni, çok
satırlı JSX metnini ve sabit tablolardaki metni kaçırıyordu. Yeni tarama
dosyanın tamamını okuyor ve bir Türkçe metni ancak **çevirisinin var olduğunu
gösterebiliyorsa** geçiriyor. Dört meşru kalıp:

```jsx
T('rep_kind_person', 'Kişi raporu')          // sözlük anahtarı + yedek
window.t?.('cal_months') || 'Ocak,Şubat,…'   // aynısı, çağrı biçimi farklı
{ k: 'rep_kind_person', fb: 'Kişi raporu' }  // tablo/çift kalıbı
{ label: 'Klasör', label_en: 'Folder' }      // kardeş alan kalıbı
```

Anahtarın `APP_I18N`de **gerçekten var olduğu** doğrulanıyor: uydurma bir
anahtar metni aklamaz. Kardeş alan kalıbı (`label`/`label_en`) yalnızca tooltip
gibi sözlüğe taşımanın gereksiz şişme yaratacağı yerlerde kullanılıyor —
`PROJECT_ICONS`ın 50 etiketi ve `TEMPLATE_META`. Aynı mantık dosya düzeyinde
de var: `const TR_X` tablosu, aynı dosyada `const EN_X` varsa dil verisi
sayılıyor (takvim tatilleri böyle).

Muafiyetler dar ve gerekçeli: `legal.jsx` (hukuki metin, çevirisi ürün kararı),
giriş ekranındaki mimari çizimin SVG etiketleri (teknik resim), ve dil adları
(endonim — İngilizce arayüzde de "Türkçe" yazmalı).

`auth.jsx` kendi `AUTH_I18N` sözlüğünü taşıyor, çünkü giriş ekranı uygulama
sözlüğü yüklenmeden çalışmak zorunda. O bloğun tr/en denkliği ayrı bir testle
kilitli — aynı kural, ayrı mekanizma.

**Kaynağı tarayan test, yorumları önce silmeli.** 11 Eylül'de bir tarama
testi tam da koruduğu mutasyonu kaçırdı: sorgudan `deletedAt: null`
çıkarıldığı hâlde geçti, çünkü pencere hemen üstteki **açıklama yorumundaki**
aynı metni kod sandı. Tuzağın ironisi kayda değer — kuralı anlatan yorum,
kuralın ihlalini örtüyor. `mcp.test.js` artık `yorumsuz()` ile okuyor;
`dil.test.js` ve `yetki.test.js` de kaynak tarıyor ve **orada bu kontrol
henüz yapılmadı.**

Aynı gün tuzak iki biçimde daha düştü: **blok yorumu** olmayan bir ihlal
uydurdu (JSDoc'taki eski kod alıntısı), ve **iç içe parantezi geçemeyen bir
desen** (`[^)]*`) gerçekçi gerilemeyi kaçırdı. Üç tarama testinin üçü de ilk
hâlinde bir yönden yanlıştı ve üçünü de mutasyon buldu. **Kaynak tarayan test
yazdıysan, koruduğu satırı kasten bozup kırıldığını görmeden bitmiş sayma.**

**Sessiz başarısızlıktan kaçın.** Bu depoda üç kusurun kök sebebi buydu:
`if (!window.io) return`, `window.showToast?.()`, `if (satır && !yetki)`.
Koşulun **yokluk hâli** ya reddetmeli ya gürültü çıkarmalı — sessizce atlamamalı.

**Yorumlar Türkçe ve gerekçe anlatır.** "Ne yaptığını" değil "neden böyle
olduğunu" yazar. Commit mesajları da aynı: uzun, gerekçeli, kararın sebebini
kaydeden. Mevcut kalıba uy.

**Raporlama tabloları bilerek ilişkisiz.** `task_transitions`, `work_logs` ve
`audit_logs` yabancı anahtar kullanmaz ve denormalize alanlar taşır: görev,
proje veya kullanıcı silinse de kayıt yaşamalı. Çöp kutusu 30 günde kalıcı
sildiği için aksi hâlde altı aylık rapor delik çıkardı. **Bu tablolara ilişki
ekleme.**

---

## Kapsam dışı — bilinçli kararlar

Bunlar eksik değil, **seçim**. Önermeden önce
[TOPLANTI-KARSILIGI.md](TOPLANTI-KARSILIGI.md) oku:

Jira'nın iş akışı motoru (doğrulayıcılar, otomatik eylemler, ekran şemaları) ·
JQL · sprint ve hız (velocity) · story point · özel alanlar · kayıt tipleri
(Hikâye/Hata/Epik) · SAP entegrasyonu.

Ortak gerekçe: bunlar Jira'yı ağır yapan katman. StoaBoard'un iddiası sadelik.

---

## Sıradaki işler

Öncelik sırasıyla — ayrıntı `GUVENLIK.md` ve `TODO.md` içinde:

1. **Proje bazlı üyelik.** Bugün bir üye çalışma alanındaki her şeyi görüyor;
   okuma izni diye bir kavram yok. En büyük açık.
2. **Dönem dondurma.** Kapanmış dönemin raporu mühürlensin, yeniden
   hesaplanmasın.
3. **Kanal geçmişi kesimi.** Yeni üye katılmadan önceki mesajları görüyor.
4. **Denetim kaydının kapsamı.** Üye çıkarma, rol değişikliği ve toplu çöp
   boşaltma yazılıyor *(2 Eylül)*. Kalan: davet kodu görüntüleme (ayrı uç gerek).
5. **Uç testleri.** Saf mantık test ediliyor, yetkilendirme akışları hâlâ elle.

Karar bekleyen tasarım soruları (kod değil, ürün kararı): süreyi kim girer ·
hangi bildirim ekranı kesmeli · sohbet kapsamı. Bunlar cevaplanmadan ilgili
işlere girme.
