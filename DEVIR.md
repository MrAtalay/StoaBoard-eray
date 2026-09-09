# Devir notu — makineler arası

Bu proje iki makinede sürdürülüyor ve oturumlar birbirini görmüyor. Bu dosya,
projeyi yeni devralan oturuma "şu an gerçekte ne doğru" demek için var.
Belgelerde birbiriyle çelişen ifadeler bulursan **bu dosyaya ve `git log`a**
güven, düzyazıya değil.

**Son güncelleme:** 9 Eylül 2026 akşamı, **ev makinesinde** — `4039e33` çekildi
ve 2. adım okuma araçları ilk kez gerçek veriyle uçtan uca tarandı.

---

## 0-A. 9 Eylül, ikinci tur — 2. adımın uçtan uca taraması (ev makinesi)

Ofis makinesi 2. adımı yazıp "gerçek veriyle denenmedi" diye işaretlemişti.
Bu tur o boşluğu kapattı ve **boşluğun ardında gerçek bir kusur çıktı.**

**Ortam notu — kısıt sanıldığından dar:** ev ağında 5432 açık, `[db] warmup ok`.
Yerel sunucu + production Neon ile tam tur atılabiliyor; canlıya dağıtım
beklemeye gerek yok. Yerel `.env` **production veritabanını** gösteriyor, bu
yüzden tarama bilinçli olarak salt-okuma tutuldu.

**Sonuç: 21/21.** Protokol, kapı (anahtarsız/yanlış anahtar 401, GET 405), el
sıkışma (`stoaboard / 0.2.0`), hız sınırı (600), durum tutmayan kip, yedi
aracın listesi, `whoami`, `list_projects`, `list_columns`, `list_tasks` + üç
süzgeci, `get_task`, `list_notes` (gövde sızdırmıyor), `get_note` ve hata
yolları (404 → `isError`, yanlış tip ve olmayan araç reddi) doğrulandı.

**Doğru çalışma alanında koşmak şart:** ilk turda aktif alan "Mytherra: Veil of
The Ancient" idi (1 proje, 0 görev, 0 not) ve `get_task`/`get_note` başarı
yolunda hiç çalıştırılamadı. Tarayıcıdan "StoaBoard" alanına geçilince
(rol `member`, 7 izin — DEVIR'in 1. adım notundaki ölçümle birebir aynı)
3 proje, 15 görev ve 1 notla ikisi de doğrulandı. **MCP'yi denerken önce
`whoami` çağır ve alan adına bak** — boş alanda yeşil görünen bir tarama
hiçbir şey kanıtlamıyor.

**Bulunan ve kapatılan kusur — belgelenen yolun tamamı kırıktı.**
`projectToDict`/`taskToDict` kimliği **metin** döndürüyor (`id: String(p.id)`,
Python aslından gelen sözleşme), araç şemaları ise `z.number().int()`
istiyordu. `list_projects` `"21"` veriyor, aracın kendi açıklaması "diğer
araçların istediği project_id buradan alınır" diyor, `list_columns` o değeri
`-32602 expected number, received string` ile geri çeviriyordu. **Kimlik alan
dört aracın hiçbiri gerçek bir kimlikle çağrılamıyordu.** Şemalar `z.coerce`
ile metni de kabul edecek şekilde düzeltildi — düzeltme MCP katmanında, çünkü
`String(id)` sözleşmesini değiştirmek ön yüzü kırar.

İkinci, daha sessiz kusur: `list_columns` açıklaması "kolonun **slug**
değerini buradan al" diyordu ama yanıtta `slug` diye bir alan yok —
`columnToDict` slug'ı `id` adıyla veriyor (`id: c.slug`, sayısal satır kimliği
ise `db_id`). Model olmayan bir alanı arıyordu. Açıklama düzeltildi.

**Bu turun dersi 3 Eylül'ünkinin eşi:** o tur *bir testin* yalan söylediğini
göstermişti, bu tur *bir araç açıklamasının* yalan söylediğini gösterdi. İkisi
de yeşil görünüyordu. 154 birim testin hiçbiri bu kusuru göremezdi, çünkü hepsi
şemayı değil kodu ölçüyor — **kusur kodun içinde değil, iki sözleşmenin
arasındaydı.** Yeni bir araç eklerken onu bir kez de gerçek yanıtın çıktısıyla
besle; elle uydurduğun argümanla değil.

**Taramanın asıl kazancı bir kod kusuru değil, bir VERİ kusuru oldu.**
Gerçek veriye bakınca çıktı: `list_tasks(overdue: true)` proje 1'de **14 görev**
diyor, oysa panoda 9 kart `done` kolonunda duruyor. Sebep, `done` kolonundaki
9 karttan 8'inde `completed_at` olmaması — tek istisna #4, damgası
`2026-09-02T10:48`, yani kolonun `isDone` işaretinin konduğu gün. Ondan
öncekiler işaretsiz kolona taşındığı için `completedAt` hiç yazılmamış (#7'de
`progress` bile 0'da kalmış). Dört projenin üçünde bitiş kolonu hâlâ hiç
işaretli değil. Ayrıntı ve yapılacaklar TODO'da.

**Bunun önemi MCP'nin ne için var olduğuyla ilgili.** TODO "kazandıran cümle
'bugün bende ne var, ne gecikti'" diyor. O cümle bugün **yanlış** cevap
veriyor ve yanlışlığı görünmüyor: ölçüt (`due < bugün && !completed_at`) doğru,
araç doğru, besleyen veri eksik. DEVIR'in "bayat bilgiye güvenmek hiç bilgi
olmamasından kötüdür" cümlesi artık soyut bir risk değil, ölçülmüş bir durum —
ve yazma araçlarından önce kapatılması gereken şey bu.

**İkinci yapısal boşluk TODO'ya yazıldı:** MCP yalnızca **aktif** çalışma
alanını görüyor, alanları listeleyen ya da değiştiren araç yok. Aktif alan
`users.currentWorkspaceId` sütununda duruyor (`currentMember`) — yani
tarayıcıdan bir tıkla değişiyor ve MCP tarafında hiçbir uyarı çıkmıyor.
Taramanın ilk turu tam olarak buna kurban gitti.

**Tarayıcının açık olması gerekmiyor.** Aktif alan oturumda değil kullanıcı
satırında tutulduğu ve `selfApi` kendi kısa ömürlü oturumunu ürettiği için MCP
tarayıcıdan tamamen bağımsız çalışıyor. Tarayıcı yalnızca aktif alanı
*değiştirmenin* tek yolu — okumanın koşulu değil.

**Tarama betiği oturumluk, repoda değil.** Tekrarı için 0. bölümün sonundaki
curl merdiveni yeterli; kalıcı bir koşum istenirse `server/test/` altına
alınmalı (veritabanı istediği için birim testlerinden ayrı bir komutla).

---

## 0. 9 Eylül turu — MCP entegrasyonu, 1. adım

**Aşağıdaki 1. bölüm 3 Eylül'den kalma ve dal tablosu bayat** (`main` o gün
`df113c3`ti, bugün `0566ecf`). Bu bölüm onu geçersiz kılar.

**Yapılan.** Claude'un panoyu MCP üzerinden sürmesi için kimlik iskeleti ve
salt-okuma yüzeyi. Araçlar `whoami`, `list_projects`, `list_columns`,
`list_tasks`, `get_task`, `list_notes` ve `get_note`; henüz yazma aracı yok.
Planın tamamı ve gerekçeleri
[TODO.md](TODO.md) → "MCP entegrasyonu" bölümünde; 2. adım okuma araçları,
3. adım yazma araçları.

**Dokunulan dosyalar** — hepsi yeni ya da katkı niteliğinde, hiçbir mevcut
davranış değişmedi:

```
YENİ  server/src/lib/mcpToken.js     anahtar çözümlemesi (saf, testli)
YENİ  server/src/lib/mcpAuth.js      requireMcpToken ara yazılımı
YENİ  server/src/routes/mcp.js       POST /mcp + whoami aracı
      server/src/config.js           config.mcp.tokens
      server/src/app.js              /mcp mount + ayrı hız sınırı
      server/src/lib/audit.js        AUDIT.MCP_AUTH_FAILED
      server/test/yetki.test.js      tarayıcı sıkılaştırıldı + MCP kapısı
      server/test/guvenlik.test.js   8 regresyon testi
      server/test/dil.test.js        HATA_DOSYALARI += mcp.js
      client/src/data.jsx            4 err_mcp_* anahtarı (tr + en)
      server/.env.example            STOA_MCP_TOKENS belgesi
```

**Testler 143 → 153, hepsi geçiyor.** Ön yüz derlemesi temiz.

**Yolda bulunan ve kapatılan gerçek kusur:** `yetki.test.js`in uç tarayıcısı
ara yazılımı sabit 400 karakterlik bir pencerede arıyordu. Kayıtlar tek satıra
sığdığında pencere bir sonraki kaydın içine taşıyor ve **korumasız bir uç,
komşusunun `requireAuth`ını görüp aklanıyordu.** Mevcut route dosyalarında
kayıtlar çok satırlı olduğu için kusur hiç görünmemişti; MCP ucunun kapısını
doğrulamak için bilerek korumasız bir uç bırakıldığında test yeşil kaldı ve
böyle bulundu. Pencere artık bir sonraki kayıtta kesiliyor. Aynı sınıf dil
testinde de görülmüştü (`f3c5907`). **Bu tur bir testin yalan söylediğini
gösterdi — yeni bir kapı eklerken önce kapıyı kırmayı dene.**

### Uçtan uca deneme — YAPILDI, dördü de geçti (9 Eylül)

Canlıda doğrulandı. Ofis ağından koşulabildi: engellenen 5432 (Postgres),
HTTPS değil — veritabanına Railway kendi tarafından bağlanıyor. Yani bu tür
denemeler için ev makinesini beklemeye gerek yokmuş, ders bu.

| Adım | Sonuç |
|---|---|
| 1 · Anahtarsız çağrı | `401 err_mcp_token_invalid` — uç canlıda, kapı kapalı |
| — Hız sınırı | `ratelimit-limit: 600`, `policy 600;w=900` |
| 2 · El sıkışma | `serverInfo: stoaboard / 0.1.0` |
| 3 · `tools/list` | tek araç: `whoami` |
| 4 · `whoami` | Neon'dan gerçek veri: slug, ad, çalışma alanı, izinler |

**Tek arıza slug'dı ve tahmin edilmişti:** `STOA_MCP_TOKENS`e önce `eray`
yazılmıştı, doğrusu `eray-atalay`. Kod değişmedi, yalnızca ortam değişkeni.
Hata `err_mcp_user_unknown` olarak döndü — yani kapalı başarısızlık çalıştı ve
teşhis tek bakışta yapıldı. Gerçek slug'a bakmanın en hızlı yolu: giriş
yapmışken `https://www.stoaboard.com/api/auth/me` — dönen JSON'daki `id`
alanı slug'ın kendisi (`userToDict` onu `id` diye adlandırıyor).

**Not:** apex `stoaboard.com` ofis ağından bağlantı sıfırlanmasıyla düşüyor,
`www.stoaboard.com` çalışıyor. Denemeleri `www` üzerinden yap.

**Yolda görülen:** `eray-atalay` çalışma alanı 1'de `owner` değil `member` ve
dokuz izinden yedisine sahip — `view_reports` ile `manage_workspace` yok.
Bugün bir şeyi engellemiyor ama rapor okuyan bir MCP aracı eklendiğinde o uç
403 dönecek. Karar anı geldiğinde hatırla.

### Denemeyi tekrarlamak için

Bir sonraki turda uç hâlâ ayakta mı diye bakmak ya da yeni araç eklendikten
sonra aynı yoldan geçmek için. **Kod değişikliği dağıtılmadan bu komutlar eski
sürümü ölçer:** Railway depodan derliyor, ortam değişkenini eklemek tek başına
yetmiyor — sıra push → dağıtım → deneme.

```bash
TOKEN=<STOA_MCP_TOKENS içindeki anahtar>
H='-H Content-Type:application/json -H Accept:application/json,text/event-stream'

# 1) Uç var mı, kapı kapalı mı — anahtarsız
curl -i -X POST https://stoaboard.com/mcp $H   -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
#    beklenen: 401 + {"error":"err_mcp_token_invalid"}
#    HTML dönerse dağıtım kodu almamış (SPA yedeği devrede) — en net teşhis

# 2) El sıkışma — anahtarla, aynı gövde + -H "Authorization: Bearer $TOKEN"
#    beklenen: serverInfo → stoaboard / 0.1.0

# 3) {"jsonrpc":"2.0","id":2,"method":"tools/list"}
#    beklenen: tek araç, whoami

# 4) {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"whoami","arguments":{}}}
#    beklenen: slug, ad, çalışma alanı adı, izin listesi
#    err_mcp_user_unknown gelirse: STOA_MCP_TOKENS'teki slug users.slug ile
#    eşleşmiyor. Tek düzeltilecek yer orası.
```

1–3 kodun ayakta olduğunu, 4 kimliğin ve veritabanı yolunun gerçekten
çalıştığını kanıtlıyor. Dördü de geçerse 1. adım kapanır ve Claude istemcisine
bağlamaya geçilebilir.

---

## 1. Depo gerçekten nerede

```
main       = df113c3              3 Eylül gecesi, evdeki oturumdan
dil-ve-ci  = 4462c01              main'in 5 commit ÖNÜNDE  ← bu turun işi
raporlama                         tamamen main'in içinde — ölü ağırlık
```

**`dil-ve-ci` dalı bu oturumda açıldı ve 5 commit taşıyor.** Doğrudan `main`e
işlenmedi çünkü aynı turda CI kurulduğu için değerin tamamı Railway canlıya
dağıtmadan ÖNCE doğrulamaktan geliyor. Push ve birleştirme kullanıcıya
bırakıldı; sen devraldığında `git fetch` sonrası dalın uzağa gidip gitmediğine
ve `main`e birleşip birleşmediğine bak.

```
0af6df9  fix  - 58 dil kaçağı (31'i sözlüğe eklenmemiş anahtar)
be5e6e9  test - dil taramasının ölçütü değişti
fe1bc91  ci   - testler ve derleme her itmede
271bcd9  docs - belge çelişkileri + bu dosya + zorlama merdiveni
4462c01  test - yetkilendirmenin uygulanması kilitlendi
```

`raporlama` dalı hem yerelde hem uzakta duruyor ama `main`e göre tek bir fazla
commit'i yok (`git log origin/main..raporlama` boş). Silinebilir; bilinçli
olarak dokunulmadı, karar kullanıcının.

**İşe başlamadan `git fetch && git status` çalıştır.** Diğer makine gece
çalışmış olabilir; 3 Eylül'deki altı commit tam olarak böyle geldi.

**CI ilk kez push'ta çalışacak.** O ana kadar `.github/workflows/ci.yml`
yerelde doğrulandı ama gerçek runner'da hiç koşmadı. İlk koşuda kırılırsa en
olası sebep `npm ci` → `postinstall` → `prisma generate` adımıdır; sahte
`DATABASE_URL` tam da bunun için verildi, gerekçesi `fe1bc91`'de.

---

## 2. Kafa karıştıran dört çelişki — düzeltildi

Bu dosyanın yazılma sebebi. Belgeler koddan geride kalmıştı ve dördü de
okuyanı yanlış yöne sürüyordu. Hepsi 3 Eylül'de düzeltildi, ama nasıl
oluştuklarını bilmek işine yarar:

| Belge ne diyordu | Gerçek |
|---|---|
| "Otomatik test yok. En büyük teknik açık." | **137 test var**, hepsi geçiyor |
| "Şema hiçbir veritabanına gönderilmedi" | 2 Eylül'de **production'a uygulandı**, doğrulandı |
| "Kolon geçiş kuralı arayüzü: karar bekliyor" | 1 Eylül'de **yapıldı** (`9035c2a`), kolon menüsünde |
| "main HENÜZ PUSH EDİLMEMİŞ olabilir" | Push edildi; belge o cümleyle donmuştu |

Ortak sebep aynı: iş bittiğinde TODO'nun **iki ayrı yeri** güncellenmesi
gerekiyordu ve yalnızca biri güncellendi. Örneğin geçiş kuralı, "kapatılanlar"
bölümüne yazılmış ama "tasarım kararı bekleyenler" bölümünden silinmemişti.
Bir maddeyi kapatırken belgede o maddenin **başka nerede geçtiğini ara.**

---

## 3. Son turda ne yapıldı (3 Eylül gecesi)

Altı commit, tek konu: **İngilizce arayüzde Türkçe kalan metinler.**

- `6242a7c` — `session` tablosu şemaya tanıtıldı. Prisma değil
  `connect-pg-simple` oluşturuyor; şemada tanımlı olmadığı için `db push`
  her seferinde `DROP TABLE "session"` üretiyordu. **Bu modeli şemadan
  çıkarma**, tuzak aynen geri gelir.
- `d227159` — öksüz `list.jsx` silindi (154 satır, hiç render edilmiyordu).
- `32644b9` — Raporlar ve süre kaydı ekranları çevrildi.
- `2449240` + `df113c3` — sunucu hata mesajları. On route dosyasındaki
  **174 Türkçe metin 103 hata koduna** çevrildi.

Sunucu hata sözleşmesi artık şu: `{ error: 'err_kod', message: 'Türkçe' }`.
Çeviri **tek noktada**, `apiFetch` içinde: kodu sözlükten geçiriyor, karşılığı
yoksa `message`a, o da yoksa ham koda düşüyor. Bu yüzden yüzden fazla çağrı
noktasının hiçbirine dokunulmadı.

Dinamik mesajlar (içine kolon adı gömülenler) istemcide çevrilemiyor; onlarda
cümle sunucuda kuruluyor ve dil yeni `server/src/lib/lang.js` ile okunuyor —
indirme bağlantılarında `?lang`, diğer her istekte `X-Stoa-Lang` başlığı.

**Davet akışına bilerek dokunulmadı.** `invite_code_required` ve
`invalid_invite_code` `err_` öneki taşımıyor, çünkü `auth.jsx` bunları ham
hâliyle karşılaştırıyor. Bekleme lobisi daha önce canlıda kırıldığı için
elleşilmedi. Oraya girersen bu iki karşılaştırmayı da birlikte taşı.

---

## 4. Dil turu tamamlandı — `dil.test.js` artık gerçek bir kilit

3 Eylül'de testin kör noktası kapatıldı ve çıkan 58 kaçağın hepsi düzeltildi.
Önemli olan **neyin değiştiği**: ölçüt "metin nerede duruyor"dan **"metnin
çevirisi var mı"**ya çevrildi. Tarama artık dosyanın tamamını okuyor ve bir
Türkçe metni ancak çevirisini gösterebiliyorsa geçiriyor.

Turun en çarpıcı bulgusu: **58 kaçağın 31'i "kod doğru, anahtar yok"**du.
Ekranlar `tx('chat_perm_admins', 'Yöneticiler')` diye düzgün yazılmıştı ama o
anahtarlar sözlüğe hiç eklenmemişti — yani kural biliniyordu, uygulanıyordu ve
yine de sessizce başarısız oluyordu. Somut örnekler:

- `app_confirm` yoktu: **her onay kutusundaki "Onayla"** İngilizce arayüzde
  Türkçe çıkıyordu.
- Sekiz izin etiketinden sonradan eklenen ikisi (`view_reports`,
  `manage_workspace`) eksikti: rol ekranında altı satır İngilizce, iki satır
  Türkçe görünüyordu.
- `ErrorBoundary` 2 Eylül'de eklenmiş, üç anahtarı hiç yazılmamıştı.

Ders: belgeye kural yazmak yetmiyor, testin kuralı **doğrulayabiliyor** olması
gerekiyor. Anahtarın sözlükte gerçekten var olduğu kontrol edilmeseydi bu 31
kusurun hiçbiri görünmezdi.

Meşru kalıplar, muafiyetler ve gerekçeleri [CLAUDE.md](CLAUDE.md) dil
bölümünde. Muafiyet eklemen gerekirse **gerekçesini yaz** — listedeki her
istisnanın yanında niçin orada olduğu duruyor.

---

## 5. Bu turda eklenen iki kilit — CI ve yetki

**CI kapısı** (`.github/workflows/ci.yml`). 143 test vardı ama çalıştırmak
geliştiricinin hafızasına bağlıydı; unutulan bir `npm test`, bozuk kodun
main'e gidip Railway tarafından doğrudan canlıya dağıtılması demekti.

> **Bu dosya tek başına kapı DEĞİL, alarm.** Engelleyici olması için GitHub'da
> `Settings → Branches → main → Require status checks to pass before merging`
> açılmalı ve iki iş de (`sunucu testleri`, `ön yüz derlemesi`) seçilmeli.
> O ayar yapılmadan kırmızı CI yalnızca kırmızı bir tik olarak kalır.
> **Bu ayar henüz yapılmadı** — depo dışı bir işlem, kullanıcıya bırakıldı.

**Yetki kilidi** (`server/test/yetki.test.js`). Buradaki ayrım önemli ve
yanlış hatırlanmaya açık: `hasPermission`'ın KENDİSİ zaten test ediliyordu
(`guvenlik.test.js`). Eksik olan, kuralın UYGULANDIĞININ garantisiydi — yeni
bir uca `requireAuth` yazmayı unutmak hiçbir yerde yakalanmıyordu. İki
değişmez kilitlendi: her uç `requireAuth` taşır (113 uçtan 9'u gerekçeli açık
listede), ve soket kimliği yalnızca oturumdan okunur, olay gövdesinden asla.

**Kapsamlamanın DOĞRULUĞU hâlâ test edilmiyor** ve bu bilinçli. Statik tarama
denendi: 70 mutasyon ucunun 46'sını işaretledi, hepsi yanlış pozitifti —
kapsamlama tek biçimde yapılmıyor (kimi `userId: user.id` ile, kimi aktif
çalışma alanıyla, kimi `loadTaskWithAccess(permission:)` ile). Ayırt etmek
için isteğin gerçekten çalıştırılması gerekiyor. **"Yetki testi var" diye
güvenme** — neyin kapsanmadığı testin sonundaki notta ve TODO.md'de.

Bu turun yöntemsel dersi: **mutasyon testi.** Geçen bir test hiçbir şey
kanıtlamaz. `tasks.js`'ten `requireAuth` kasten kaldırıldı, test tam yerinden
kırıldı, dosya geri alındı. Yeni bir koruma testi yazdığında aynısını yap —
kırılamayan test, tören.

---

## 6. Değişmeyen tuzaklar

Ayrıntısı [CLAUDE.md](CLAUDE.md) içinde; buradakiler en çok ayağa dolaşanlar:

- **Şema deploy'da kendiliğinden gitmiyor.** `postinstall`, `npm start` ve
  Railway build komutundan `prisma db push --accept-data-loss` kaldırıldı.
  Şema artık bilinçli, elle gönderiliyor. `--accept-data-loss` yazma refleksine
  kapılma — o bayrak `session` tablosunu gerçekten siler ve **giriş yapmış
  herkes düşer.**
- **`npm test` çıktısındaki veritabanı hatası test hatası değil.**
  `[db] warmup failed` / "Can't reach database server" — modül yüklenirken
  bağlantı deneniyor, kurumsal ağda 5432 kapalı. Ölçüt en alttaki
  `pass` / `fail` satırları.
- **Windows PowerShell'de `npm` değil `npm.cmd`.** Git Bash'te düz `npm`.
- **`server/.env` repoda yok ve olmamalı.** Şu an yereldeki `.env` production
  veritabanını gösteriyor — yani `prisma db push` benzeri bir komut **canlıya**
  yazar. Şema komutu çalıştırmadan önce `DATABASE_URL`in nereyi gösterdiğine
  bak.

---

## 7. Sırada ne var

Öncelik sırası [TODO.md](TODO.md) ve [GUVENLIK.md](GUVENLIK.md) içinde; özeti:

1. **Proje bazlı üyelik** — bugün bir üye çalışma alanındaki her şeyi görüyor,
   okuma izni diye bir kavram yok. En büyük açık.
2. **Uç testleri** — `yetki.test.js` (3 Eylül) "kimlik doğrulaması unutuldu"
   sınıfını kapattı: her uç `requireAuth` taşıyor, soket kimliği yalnızca
   oturumdan okunuyor. Kapanmayan sınıf, kapsamlamanın *doğruluğu* — bunun
   için isteği gerçekten çalıştıran bir koşum gerekiyor. Gerekçe TODO.md'de.
3. **Dosya depolama** — yüklenenler veritabanında `bytea`, S3/R2'ye taşınmalı.
4. **Dönem dondurma**, **kanal geçmişi kesimi**.

**Karar bekleyen ürün soruları — bunlar cevaplanmadan ilgili koda girme:**
süreyi kim girer (ikinci toplantıya kalan soru) · hangi bildirim ekranı kesmeli
([BILDIRIMLER.md](BILDIRIMLER.md)) · sohbet kapsamı (öneri: kanallar genel
kalsın ama bir projeye bağlanabilsin).

---

## 8. Bu dosyayı güncel tut

Diğer makineye geçmeden önce buradaki 1. ve 3. bölümü güncelle — hangi
commit'tesin, ne yaptın, yarım bıraktığın ne var. Devrin kırıldığı yer tam
olarak burası.
