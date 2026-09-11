# Devir notu — makineler arası

Bu proje iki makinede sürdürülüyor ve oturumlar birbirini görmüyor. Bu dosya,
projeyi yeni devralan oturuma "şu an gerçekte ne doğru" demek için var.
Belgelerde birbiriyle çelişen ifadeler bulursan **bu dosyaya ve `git log`a**
güven, düzyazıya değil.

**Son güncelleme:** 11 Eylül 2026, **ofis makinesinde** (5432 kapalı).
MCP okuma yüzeyi tamamlandı: on araç, sürüm 0.3.0. En yenisi 0-D bölümü.

---

## 0-D. 11 Eylül — MCP okuma yüzeyi kapandı (0.3.0), ev makinesi gerekmedi

**Ortam:** ofis makinesi, 5432 kapalı. Kod, test ve derleme burada koştu.

### Önce ortam notu: ev makinesi bu iş için gerekmiyordu

DEVIR 0-C "2.5. adım **ev makinesinde** yapılmalı" diyordu. Gerekçesi
doğruydu (gerçek yanıtla beslenmeyen araç yalan söyler) ama sonucu yanlış:
şart *doğrulama*, *makine* değil. **Claude bağlayıcısı stoaboard.com'a senin
ağından değil Anthropic tarafından gidiyor** — 5432'nin kapalı olması o yolu
hiç ilgilendirmiyor. Ofisteki tek fark hız: yerel sunucu olmadığı için her
tur bir Railway dağıtımı bekliyor.

**Yeni kısıt, kayda geçsin:** bu makinedeki kabuktan `stoaboard.com`a TLS el
sıkışması düşüyor (`curl` exit 35, `-k` ile de; `example.com` 200 dönüyor,
DNS çözülüyor). Kurumsal vekil o alan adını kesiyor. Tarayıcı vekilin
sertifikasıyla geçtiği için açılıyor, `curl` geçemiyor. **Canlıyı komut
satırından yoklayamazsın**; doğrulama tarayıcıdan ya da bağlayıcıdan geçmek
zorunda.

### Yapılan: 2.5. adım + 1. dilim, tek turda

Yüzey yedi araçtan **ona** çıktı. Yeni olanlar `list_workspaces`,
`list_members` (isteğe bağlı açık iş sayımıyla) ve `search_tasks`.

Aynı turda 1. dilimin tamamı: bağlam her yanıta girdi, kimlik tipleri metne
sabitlendi, `col_is_done` geldi, `include_done` geldi, açıklamalar listede
kırpılıyor, `updated_ago` yüzeyden kalktı, `warning` belgelendi.

**Bir davranış değişikliği var, devralan bunu bilmeli:** `list_tasks`
süzgeçsiz çağrıldığında artık yalnızca **açık** kartları döndürüyor. Eskiden
her şeyi döndürüyordu ama kendi açıklaması "bütün açık görevler gelir"
diyordu — araç belgesiyle çelişiyordu. Tanım uydurulmadı, sunucunun kendi
tanımı alındı: açık = bitmiş işaretli kolonda olmayan kart, yani
`projectWithOpenCount`in `list_projects` için hesapladığı şeyin aynısı.

### Yol boyunca çıkan gerçek kusur

**Açık görev sayısı çöp kutusundaki kartları da sayıyordu.** İki yerde
(`projects.js`, `api.js`) bitiş kolonu eleniyor ama `deletedAt: null`
konmuyordu; oysa görev listesi silinmiş kartı hiç vermiyor. Kenar çubuğu 9
derken pano 6 kart gösterebiliyordu ve çöp 30 gün tuttuğu için fark
haftalarca yaşıyordu. **Üçüncü kez aynı sınıf:** kusur kodun içinde değil,
iki sözleşmenin arasında. İlk ikisi 9 ve 10 Eylül'deydi.

Bu kez fark edilme sebebi yeni: sayıyı **bir model okudu**. MCP aynı rakamı
yüzeye taşıdığı için tutarsızlık göze battı.

### Test — ve kırılabildiği kanıtlandı

**269 test** (211'di), hepsi geçiyor. Yeni dosya `mcp.test.js`; biçimlendirme
`lib/mcpShape.js`e taşındığı için hepsi saf, veritabanı istemiyor.

**Mutasyon denemesi bir testi yalanladı ve bu turun en iyi dersi bu.** Açık
görev sayımını koruyan tarama testi, `deletedAt: null` sorgudan
çıkarıldığında **geçti**. Sebep: pencere, kuralı ANLATAN yorumdaki aynı
metni kod sandı. Yani testi yazarken bıraktığım açıklama, testin koruduğu
kuralın ihlalini örtüyordu. Tarama artık yorumları siliyor; mutasyon
tekrarlandı, bu kez iki test birden kırıldı.

**Kaynağı tarayan her test bu tuzağı taşıyor.** `dil.test.js` ve
`yetki.test.js` de kaynak tarıyor — oralarda aynı kontrol yapılmadı, yapılmalı.

### Karar verilenler

**Başlık kullanıcı metnidir, açıklama değildir.** Araç başlıkları iki dilli
oldu (`ARAC_BASLIKLARI`), açıklamalar Türkçe kaldı; onları model okuyor ve
cevabı zaten kullanıcının dilinde veriyor.

**Dilin nereden okunacağı gerçek bir sınır.** MCP `initialize` dil alanı
taşımıyor. Elde `?lang=en` (adrese yazılır, kullanıcının açık beyanı) ve
`Accept-Language` (istemci gönderirse) var; yedek `tr`. Çözülen dil `whoami`
yanıtında görünüyor. **Bağlayıcının `Accept-Language` gönderip göndermediği
doğrulanmadı** — gerçek istemciyle bakılacak ilk şey bu.

**`allowed_next` kaldırılmadı.** Boş olması kusur değil, kimsenin kural
koymamış olması demek; kaldırılsaydı kural konduğu gün model onu hiç
görmezdi. Açıklamaya "boşsa kısıt yok, alanı yok sayma" yazıldı.

### Sıradaki iş

1. **Gerçek istemciyle doğrulama.** 0.3.0 dağıtıldıktan sonra on araç da
   çağrılmalı. `initialize` yanıtındaki `serverInfo.version` dağıtımın
   indiğinin tek kanıtı. Bakılacaklar: başlık dili, `list_members` yük
   sayımının hızı, `search_tasks` Türkçe harf katlama, `include_done`
   varsayılanının şaşırtıp şaşırtmadığı.
2. **Yazma araçları isteniyor ve bir kapısı var.** Bağlanan istemci
   "whoami bana `manage_tasks` diyor ama kullanacak araç yok" diye haklı
   olarak yakındı. TODO'nun kaydı net: kendi kendine anahtar üretme + OAuth
   **3. adımdan önce gelmeli**, çünkü jetonun kimi temsil ettiği ve nasıl
   iptal edildiği kart açan bir araçta çok daha kritik. Bugün anahtar
   Railway ortam değişkeninde: iptal etmek yeniden dağıtım demek.
   **Bu bir ürün kararı, teknik engel değil** — üç kişilik ekipte yazma
   araçlarını anahtar sayfasından önce açmak savunulabilir. Karar verilmeden
   4. dilime girilmemeli.
3. **`updatedAt` şema kararı** (2. dilim) — TODO'da üç seçenek yazılı.

---

## 0-C. 10 Eylül, öğleden sonra — MCP canlı bağlandı, görsel kusurlar ölçüldü

**Ortam:** ofis makinesi, 5432 kapalı. Uygulama yerelde çalışmıyor; her şey
canlıda test edildi. Neon SQL Editor HTTPS üzerinden çalıştı.

### MCP artık Claude'un içinde çalışıyor

Tarayıcı içindeki bağlayıcı ekranı **OAuth istiyor** ve StoaBoard'da
yetkilendirme sunucusu olmadığı için ilk deneme *"Couldn't register with
StoaBoard's sign-in service"* ile düştü. Ekran ek istek başlıklarına izin
veriyor ama başlık adı **kapalı bir listeden** seçiliyor; `Authorization` o
listede yok, `x-auth-token` var.

Bu yüzden MCP kimlik kapısı ikinci bir başlık kabul ediyor
(`f6c58a7`). Gevşeme değil: taşınan sır aynı sır, doğrulama yine tek yerde
(`lookupSlug`), `Authorization` varsa o kazanıyor. Kapının hangi durumda
**açılmayacağı** teste bağlandı — boş başlık, yalnızca `Bearer`, yanlış
şema, fazladan sözcük. Testi yazarken kendi kodumdaki bir kusur çıktı:
`X-Auth-Token: Bearer` (ardında anahtar yok) "Bearer" dizesini anahtar
sanıyordu; düzeltildi.

**Bağlandı ve uçtan uca denendi.** Yedi araç, gerçek panoyla. Sonuç: dünkü ve
bugünkü düzeltmelerin ikisi de tuttu — gecikme **6** (14 değil, `done`
kolonundaki kartlar artık sayılmıyor), kolon zinciri hatasız (dün
`expected number, received string` ile tamamen kırıktı), hata yolu tipli,
not gövdesi listede sızmıyor.

**Sürüm 0.2.3.** Yüzeyi değiştiren commit'te bump etmeyi bir kez atladım ve
sonra düzelttim; `serverInfo.version` dağıtımın indiğini anlamanın tek yolu.

**OAuth hâlâ yok ve ölçeklenme sorunu orada.** Bugün her yeni kişi için
Railway'deki `STOA_MCP_TOKENS` elle düzenleniyor + yeniden dağıtım
gerekiyor. Ortak "servis hesabı" fikri elendi ve gerekçesi TODO'da: aktif
çalışma alanı `users.currentWorkspaceId` sütununda, yani **kullanıcı başına
tek** — ortak hesapta iki kişi birbirinin panosunu sessizce değiştirir.

### Görsel kusurlar — göz kararıyla değil, hesapla

"Beyaz modda bazı yazılar sönük" diye bildirildi. Ölçüldüğünde sorun
tahminden genişti: **üç temanın üçünde de** iki mürekkep tonu metin için
okunamaz durumdaydı (`--ink-faint` 2.29:1, `--ink-dim` 1.68:1; AA 4.5:1
istiyor). `--ink-faint` 71 yerde metin rengiydi.

İlk düzeltme kontrastı düzeltirken **hiyerarşiyi bozdu** — faint, muted ile
eşitlendi, cream'de sıra tersine döndü. Bunu ancak ölçerek gördüm. Üç temaya
hesaplanmış, eşit aralıklı bir ölçek konuldu ve **testle kilitlendi**
(`kontrast.test.js`): test hangi tokenların metin olarak kullanıldığını
kendisi buluyor, sıralamayı da ayrıca doğruluyor.

**Vurgu renkleri:** örnek kareler elle yazılmış sabit değerlerdi ve her zaman
ışıklı tema değerini gösteriyordu; koyu tema seçenekleri bilinçli olarak
açtığı için kullanıcı `#1a4a70` seçip `≈#60a7d6` alıyordu. Üstelik liste
**iki dosyada** kopyalanmıştı. Tek kaynağa bağlandı (`--accent-<ad>`
değişkenleri) ve teste kilitlendi.

### Dashboard

**"Ay" görünümündeki veri uydurmaydı:** haftalık toplamı 0.9 / 1.2 / 0.8 / 1.0
ile çarpıp dört hafta imal ediyordu. Silindi. Yerine panonun gerçek dağılımı
geldi — yatay yığılmış çubuk, veri kartların kendisinden okunuyor.

**`weeklyDone` hep sıfırdı** ve muhtemelen hiç çalışmamıştı: `columnToDict`
slug'ı `id` adıyla veriyor, dashboard `.slug` okuyordu. Dünkü MCP kusurunun
tıpatıp aynısı — **kusur kodun içinde değil, iki sözleşmenin arasında.**
Aynı sınıf iki gün üst üste iki ayrı yerde çıktığı için serileştirici
şekillerinin teste sabitlenmesi TODO'ya yazıldı.

### Sayılar

Test **211** (sabah 154'tü), hepsi geçiyor. Yeni dosya `kontrast.test.js`.
Ön yüz derlemesi temiz. Üretimde elle yapılan tek şey: altı panoda `is_done`
işaretlendi; işaretsiz pano sayısı 0.

### Karar verilenler

Proje bazlı erişimin **ilk dilimi açıldı** (`f789c37`): projeye üyeyi yönetici
ve projeyi açan ekler · yönetici bütün projeleri görür · yeni üye hiçbir
proje görmez · çıkarılan kişinin adı kartlarda kalır. Kalan dört soru
sonraki dilimlere ait. Projesiz üye ekranının tasarım yönü de kayıtlı ve
`auth.jsx` incelemesinden çıkan beş uyarı içeriyor — en önemlisi, o ekran
**tam ekran devralma olmamalı** (kullanıcı içeride, uygulaması çalışıyor) ve
`.auth-visual` mobilde tamamen gizleniyor.

### Sıradaki iş — üç seçenek

1. **MCP 2.5. adım:** `list_members`, `search_tasks`, `list_workspaces`.
   Üçü de salt okuma, bildirim üretmiyorlar. **Ev makinesinde** yapılmalı;
   gerçek yanıtla beslenmeden yazılan araç yalan söylüyor (iki kez kanıtlandı).
2. **İlerleme kusuru:** geciken 6 kartın 5'i `progress: 100` taşırken
   `todo` kolonunda. Küçük iş, ofis makinesinde yapılabilir.
3. **Proje bazlı erişim:** kararlar verildi, şema ve `ProjectMember` sırada.
   En büyük iş; makine engeli yok, şema Neon SQL Editor'den geçebilir.

---

## 0-B. 10 Eylül — `completed_at` boşluğu kapandı, kök sebep bulundu

Dünkü tarama "pano bitti diyor, sistem gecikmiş diyor" boşluğunu bulmuştu.
Bugün kapatıldı — ama **teşhis yanlıştı ve sorun daha büyüktü.**

**Sorun geri doldurma eksikliği değil, yaşayan bir kusurdu.** Pano iki ayrı
yerde kuruluyor: `projects.js` işareti koyuyordu (`isDone: slug === 'done'`),
şablonla çalışma alanı açan yol `workspaces.js` ise `isDone`u **hiç
yazmıyordu**. Yani altı pano geri doldurulmadığı için değil, **o yoldan
doğdukları için** işaretsizdi — ve bugün yeni bir çalışma alanı açan herkes
aynı kusuru üretmeye devam ediyordu. Düzeltildi, testle kilitlendi.

İşaret şablon verisine **açıkça** kondu (`[slug, title, titleTr, color, pos,
isDone]`), ada göre tahmin edilmiyor: tasarım şablonunun bitiş kolonu
`delivery` ("Delivered"), `done` değil. `slug === 'done'` kuralı oraya
taşınsaydı o şablonu sessizce kaçırırdı.

**Kapsam dünkünün dört katıydı.** DEVIR "dört projenin üçünde işaret yok"
diyordu; veritabanının tamamına bakınca **18 proje / 11 çalışma alanı** çıktı.
Dünkü ölçüm eksikti çünkü MCP yalnızca aktif çalışma alanını görüyor — TODO'ya
"yapısal boşluk" diye yazılan madde, dünkü ölçümü fiilen yanlış göstermiş.
**MCP'nin gördüğüyle veritabanında olanı bir tutma.**

**39 karta sahte tarih yazılmadı — bilinçli.** Geçiş defteri sorgulandı:
8 kayıt, 2 Eylül 10:48'den 10 Eylül 08:25'e, bunların 2'si bitiş geçişi.
İlk kaydın damgası tek damgalı kartın (#4) damgasıyla saniyesine aynı, yani
defter sağlam. Ama 39 kartın hiçbirinin kaydı yok: hepsi defter açılmadan
önce taşınmış. **Dürüst bir geriye dönük tarih yok.** Bugünü yazmak raporda
"39 iş 10 Eylül'de bitti" diye sahte bir zirve üretirdi.

Onun yerine soru doğru yere soruldu: `completed_at` türetilmiş bir kopyadır
(kart bitiş kolonuna girince yazılıyor, çıkınca siliniyor — `tasks.js`),
**kolon ise gerçeğin kendisi**. MCP'nin gecikme ölçütü kolona bakacak şekilde
değiştirildi; kart bitiş kolonundaysa damgası olmasa da gecikmiş sayılmıyor.
Üretim verisine tek satır yazmadan sorun bitti.

**Kabul edilen sınır:** 3 Eylül öncesi işlerin bitiş tarihi bilinmiyor.
"Bu ay kaç iş bitti / ortalama kaç günde bitiyor" raporları o dönemi
kapsamayacak. Uydurmak bunu kapatmaz, gizler.

**İşaretsiz pano artık sessiz kalmıyor.** Ürün kararı: kolonu silmek/işareti
kaldırmak serbest kalsın, ama sistem sussun demesin. Silmeyi engellemek yeni
bir tuzak kurardı ve deliği de kapatmazdı — kolonu silmeden **işareti
kaldırmak** aynı sonucu veriyor. MCP `list_tasks` yanıtına `warning` alanı
ekleniyor. **Arayüz tarafındaki uyarı henüz yok, sıradaki iş.**

**Üretimde elle yapılanlar (SQL Editor, ofis ağında HTTPS ile):** altı panoda
`is_done` işaretlendi (kolon kimlikleri 10, 32, 49, 73, 77, 102). Doğrulandı:
işaretsiz pano sayısı 0.

**`UPDATE`e her zaman `RETURNING` ekle.** SQL Editor `UPDATE` için "no result"
yazıyor — satır döndürmediği için, hata olduğu için değil. Bu bugün gerçek bir
kayba yol açtı: yazma sorgusu çalıştı, "no result" hata sanıldı, geri alma
sorgusu çalıştırıldı ve değişiklik geri alındı. `returning` eklendiğinde sorgu
kendi kanıtını gösteriyor.

Test sayısı **160** (154'tü), hepsi geçiyor.

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
