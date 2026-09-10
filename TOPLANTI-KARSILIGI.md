# Toplantı geri bildirimlerinin karşılığı

**Kaynak:** BDH Netaş StoaBoard tanıtım toplantısı, 1 Eylül 2026.
**Tur:** `raporlama` dalı — 21 commit, 41 dosya, +4.161 satır. Dal 2 Eylül
2026'da `main`e birleştirildi (58b1a6d).

Bu dosya ikinci toplantı için yazıldı: her geri bildirimin karşısında **ne
yapıldı**, **ne yapılmadı** ve **neden**. Yapılmayanlar da burada — "yetişmedi"
diye değil, "kapsam dışı bıraktım, sebebi şu" diye.

---

## Özet tablo

| Toplantı notu | Durum |
|---|---|
| Raporlama 6 ayda bir | ✅ Yapıldı · dönem dondurma hariç |
| Log girişi, manuel giriş, work log developer | ✅ Yapıldı |
| Furkan hangi task'larda çalışmış, kim ne yaptı | ✅ Yapıldı |
| Development workflow oluşturma | ✅ Yapıldı · Jira'nın motoru değil, bilinçli |
| Teknik tarafta sistem açıkları | ✅ Turun en büyük parçası oldu |
| SAP kullanımı, mail | ◑ Mail yapıldı · SAP kapsam dışı |
| Jira daha kompleks | — Ürün kararı, kod değil |

---

## 1 · "Raporlama 6 ayda bir" · "Kim ne kadar süre harcadı" · "Furkan hangi task'larda çalışmış"

Üç ayrı not, tek talep: **kişi bazlı, geriye dönük, süre içeren raporlama.**
Turun çıkış noktası buydu.

**Yapılan**

- **Üç rapor.** Kişi (kim, hangi işte, ne kadar süre) · Dönem (ne açıldı, ne
  bitti, ne bekliyor) · Akış (işler kaç günde bitiyor, nerede bekliyor).
- **Aralık ön ayarları:** bu ay · son 3 ay · **son 6 ay** · bu yıl. İstenen
  altı aylık dönem doğrudan karşılanıyor.
- **CSV çıktısı** — yöneticiler veriyi kendi kesip biçiyor.
- **Yazdırma sayfası** — tarayıcı PDF'e çeviriyor.

**Bunun için önce veri altyapısı kuruldu**

Rapor geriye dönüktür; veri, rapor istenmeden önce var olmak zorundadır ve
geçmiş geri doldurulamaz. Üç şey eklendi:

- `task_transitions` — kart her taşındığında bir satır: görev, önceki/yeni
  kolon, kim, ne zaman. Kartın ilk yerleşimi de geçiş sayılıyor.
- `work_logs` — kişinin göreve harcadığı emek, manuel giriş.
- `tasks.completed_at` — **yoktu.** "Bu iş ne kadar sürede tamamlandı" sorusu
  bu alan olmadan hiçbir şekilde cevaplanamıyordu.

> **Anlatırken vurgulanacak ayrım:** geçiş süresi ile harcanan emek ayrı
> şeylerdir. Bir iş **üç haftada** bitmiş ama **altı saat** emek almış olabilir;
> ilki süreç tıkanıklığını, ikincisi maliyeti gösterir. Jira'nın da ayrı
> tuttuğu ayrım bu.

**Tasarım kararı:** bu üç tabloda **yabancı anahtar bilerek kurulmadı** ve
alanlar denormalize edildi. Çöp kutusu 30 günde kalıcı sildiği için, kayıtlar
göreve bağlı olsaydı altı aylık rapor delik çıkardı.

**Yapılmayan:** *dönem dondurma.* Kapanmış bir dönemin raporu şu an her
seferinde yeniden hesaplanıyor. Aradaki düzeltmeler yüzünden aynı dönemin
sayıları altı ay sonra değişebilir; yönetime iki kez farklı rakam gitmesi
raporlamaya olan güveni bitirir. Sıradaki turda.

---

## 2 · "Log girişi, manuel giriş, work log developer"

**Yapılan.** Görev çekmecesinde süre girişi. `90` · `1:30` · `1s 30d`
biçimlerini kabul ediyor. Kişi kendi süresini giriyor; başkasının kaydını
yalnızca görev yönetme izni olan silebiliyor. İleri tarihe ve 24 saatten uzun
tek kayda izin yok.

**Bilinçli olarak yapılmayan:** otomatik sayaç. Sekmenin ne kadar açık kaldığını
ölçer, çalışılan süreyi değil. Kurumsal raporlamada istenen veri **beyan edilmiş
emek**.

**İkinci toplantıya götürülecek açık soru:** *süreyi kim girer — geliştirici mi,
yönetici mi; girilmezse ne olur?* Şu an zorunluluk ve hatırlatma yok, çünkü bu
gerçekten tartışmalı bir konu ve masadakilerin deneyimi bizimkinden fazla.

---

## 3 · "Development workflow oluşturma" (+ gösterilen Jira ekranı)

Toplantıda `KU New Workflow` ekranı gösterildi. Asıl mesaj durum sayısı değil,
sol üstteki satırdı: **"Current status: Open · This work item can be moved to:
In Review."**

**Yapılan.** Kolon geçiş kuralı. Her kolon için "buradan hangi kolonlara
gidilebilir" tanımlanıyor; kolon menüsünden yönetiliyor. İzin verilmeyen bir
taşımada kart geri dönüyor ve kullanıcı sebebi görüyor.

Kural tanımlanmayan kolonlarda kısıt yok — **mevcut panoların davranışı
değişmiyor.**

**Bilinçli olarak yapılmayan:** Jira'nın iş akışı motorunun geri kalanı —
doğrulayıcılar, otomatik eylemler (post-function), ekran şemaları, koşullar.
Gerekçe: bunlar Jira'yı ağır yapan katman. Peşine düşmek hem yıllar alır hem
StoaBoard'un tek gerçek üstünlüğü olan sadeliği bitirir.

> Not: o 12 durumlu şema StoaBoard'da **bugün de kurulabiliyordu** — kolon
> açmak yeterliydi. Eksik olan tek şey geçiş kısıtıydı ve eklenen o.

---

## 4 · "Teknik tarafta sistem açıkları"

Turun en çok mesai alan parçası bu oldu. Aranmadan bir açık bulunduysa,
arayınca daha fazlası çıkar diye düşünüldü — çıktı.

**Kapatılan kusurlar**

| Kusur | Etkisi |
|---|---|
| **CSV formül enjeksiyonu** | Bir üye kart başlığını `=HYPERLINK(...)` yapıp **raporu açan yöneticinin makinesinde** veri sızdırabilirdi. Saldırı veriyi değil, veriyi açan kişiyi hedefliyor. |
| **İç hata mesajı sızıntısı** | Veritabanı sunucusunun adresi ve sorgu adı, **kayıt ekranından, giriş yapmadan** görülebiliyordu. |
| **Hayalet kanallar** | Kanal satırı bulunamayınca üyelik kontrolü tamamen atlanıyordu; kanal listesinde görünmeyen, üyeliği ve moderasyonu olmayan yazışma alanı açılabiliyordu. Dört yerde. |
| **Hayalet izin** | Arayüz "Üye davet et" iznini sunuyor ama sunucu kontrol etmiyordu — yönetici verdiğini sandığı yetkiyi vermiyordu. |
| **Eksik izin** | `manage_workspace` sunucuda uygulanıyor ama arayüzde listelenmediği için hiçbir role verilemiyordu. |
| **Oturumlar parolayla düşmüyordu** | Hesabı ele geçirilen kullanıcı parolasını değiştirse bile **saldırganın oturumu yaşamaya devam ediyordu.** |
| **Kullanıcı varlığı oracle'ı** | Yanıt farkı, platformdaki tüm hesaplar için "bu kullanıcı var mı" bilgisi veriyordu. |
| **Parola alt sınırı tutarsız** | Profil ekranı 6, kayıt/sıfırlama 8 istiyordu; zayıf parola profilden konularak kural dolaşılabiliyordu. |

**Kurulan yapı — asıl anlatılacak şey bu**

- **`GUVENLIK.md`** — çalışma biçimi belgesi. Tehdit modeli, yaşanmış güvenlik
  krizlerinden çıkarılıp StoaBoard'un kendi yüzeyine bağlanmış dersler ve
  **her yeni özelliğin geçmesi gereken on soruluk elek.** Güvenlik ayrı bir
  sprint değil, her özelliğin parçası.
- **Denetim kaydı** (`audit_logs`) — kim, ne zaman, hangi raporu, hangi
  aralıkla, kaç satır dışa aktardı. İçeriden sızıntıya karşı pratikte işe
  yarayan kontrol engelleme değil izlenebilirliktir.
- **130 otomatik test** — kapatılan her kusur kilitlendi. Veritabanı
  gerektirmiyor, saniyeler içinde koşuyor. Aralarında, arayüzdeki izin listesi
  ile sunucunun uyguladığı listeyi birebir karşılaştıran bir test de var:
  "hayalet izin" sınıfı hata bir daha sessizce giremez.

**Denetlenip temiz bulunanlar:** çalışma alanları arası veri sızıntısı (IDOR)
yok · e-posta genel serileştiricide dönmüyor · direkt mesajlar ve özel kanallar
korunuyor · CSRF `SameSite=lax` ile kapalı · ham SQL yok · sıfırlama kodu
kriptografik rastgele · hayalet kanal kusuru geçmişte **istismar edilmemiş**
(üretim veritabanında kayıt yok).

---

## 5 · "SAP kullanımı, mail"

**Mail — yapıldı.** Atama ve bahsetme bildirimleri e-postaya bağlandı. SMTP
altyapısı zaten kuruluydu ama yalnızca şifre sıfırlamada kullanılıyordu.
Kurumsalda insanlar gün boyu Outlook'ta yaşıyor; uygulamaya girmedikleri sürece
bildirimi görmüyorlar.

Varsayılan **kapalı** (`NOTIFY_EMAIL=1` ile açılıyor). Gerçek insanlara posta
gönderen bir özellik sessizce açılmamalı.

**SAP — bilinçli olarak kapsam dışı.** Bu bir entegrasyon meselesi değil, giriş
bileti meselesi: gerçek bir kurum ve gerçek bir teknik şartname çıkmadan
yapılacak iş değil.

---

## 6 · "Uygulamalar ile farkı nedir, Jira daha kompleks"

Bu bir yapılacak iş değil, **konumlandırma teyidi** — ve lehimize. Karşı taraf
Jira'nın karmaşık olduğunu kendisi söyledi.

Kullanılacak cümle: **"Jira'nın çözdüğü problemi çözmüyoruz; onun ağır geldiği
yerde duruyoruz."**

Doğru rakip kümesi Jira değil, Trello / Asana / Notion. Kıyas Jira üzerinden
kurulursa StoaBoard hep eksik görünür; o küme üzerinden kurulursa **içinde
sohbet ve notlar olması** öne çıkar (Jira'da bunların karşılığı Slack ve
Confluence — ayrı ürünler, ayrı lisanslar).

---

---

## 7 · Büyüme fikirleri — arama, ücretlendirme, masaüstü/mobil

*(10 Eylül 2026. Üç fikir sunuldu, üçü de burada tartılıyor. Ölçüt bu belgenin
kendi ölçütü: "Jira'yı ağır yapan katmanı kovalamak iddiayı bitirir.")*

### 7.1 · Sesli/görüntülü arama ve ekran paylaşımı

**Değerlendirme: yapılmamalı — en azından şimdi değil.**

Tezle çelişmiyor: bu belge farkı "içinde sohbet ve notlar olması" diye kuruyor
ve arama o çizginin devamı sayılabilir. Ama fark **eşzamansız** olanda: işin
yanında duran konuşma ve not. Arama eşzamanlı ve o pazar doymuş; ekibin zaten
açık bir Meet/Discord'u var. Kimse proje aracını arama kalitesine bakarak
seçmiyor.

**Teknik yük bir özellik değil, ikinci bir ürün.** Sinyalleşme mevcut
(Socket.IO). Geri kalanı yeni: STUN bedava ama bağlantıların yaklaşık altıda
biri simetrik NAT arkasında kalıp **TURN** ister (bant genişliği faturası);
3-4 kişiyi geçen aramada mesh çöker ve **SFU** gerekir. Yankı engelleme, cihaz
izinleri, mobil tarayıcı tuhaflıkları, yeniden bağlanma.

**Maliyet modeli değişiyor.** Bugün Railway + Neon aşağı yukarı sabit gider.
Medya sayaçlı: dört kişilik bir saatlik görüşme 1-2 GB. Henüz gelir üretmeyen
bir üründe kullandıkça artan bir kalem açmak demek.

**Ucuz karşılığı, istenirse:** aramayı yapmak değil bağlamak. Projeye/kanala
görüşme bağlantısı alanı (ekip ne kullanıyorsa), kartta "görüşmeye katıl",
çevrimiçi bilgisi (zaten var). Değerin çoğu, işin çok azı. Gerçekten WebRTC
yazılacaksa **yalnızca 1:1 ekran paylaşımı** — SFU gerekmez, en çok istenen
kısım odur.

**Kayda geçen çekince:** bu fikir heyecan verici olduğu için, sıkıcı ve zor
işin (erişim modeli, bildirimler) önüne geçme riski taşıyor. Sıralamada en
sonda durmasının sebebi maliyeti değil, bu.

### 7.2 · Paketleme ve ücretlendirme (Basic / Pro / VIP)

**Değerlendirme: niyet doğru, ama bugün sorulacak soru bu değil.**

**Önce teknik ön koşul:** paket demek çalışma alanı başına sınır uygulamak
demek — kaç üye, kaç proje, hangi özellik. Bu sınırların uygulandığı katman,
yetkilendirmenin yaşadığı katmanla aynı. Bugün orada durum şu: *bir üye
çalışma alanındaki her şeyi görüyor.* Yani **proje bazlı erişim yalnızca bir
güvenlik açığı değil, satışın ön koşulu.** Bu, o işe girmek için ikinci ve
bağımsız bir gerekçe.

**Sonra asıl soru.** "Hangi kademeler" sorusu, satacak bir şey ve satılacak
biri varken anlamlı. Bugün cevaplanması gereken soru *"birileri buna para
verecek kadar istiyor mu"* ve bu üç-beş gerçek ekibi kullandırarak öğrenilir,
kademe tasarlayarak değil.

**En güçlü ücretli kanca muhtemelen MCP.** "Claude'a sor, panonu okusun"
bugün Trello/Asana/Notion'da düzgün karşılığı olmayan bir şey. Ama MCP şu an
salt okuma, tek kişilik ve ortam değişkeni elle düzenlenerek kuruluyor —
satılabilir olması için en az kendi kendine anahtar üretme (TODO'da) gerekiyor.

**İki tuzak:**

- **Sızıntının tamiri paralı olmamalı.** Proje bazlı erişim "Pro özelliği"
  yapılmamalı; üyelerin her şeyi görmesi bir açıksa kapatmak için para
  istemek kötü okunur. İnce ayarlı roller ücretli olabilir, temel kapsamlama
  olmamalı.
- **Depolama satılmamalı — henüz.** Dosyalar veritabanında `bytea` olarak
  duruyor ve TODO bunun ölçeklenmediğini yazıyor. Bozuk olduğu bilinen bir
  sistemde kota satmak, sorunu müşteriye faturalamaktır.

**Paket sayısı:** üç kademe erken. **Free + Pro** ile başlanmalı; üçüncüsü
talep gelince. *VIP* adı tüketici uygulaması çağrıştırıyor; B2B karşılığı
**Team** ya da **Business**.

**Kod dışı engel:** faturalandırma. Şirket türü, KDV, Stripe'ın Türkiye
durumu. Bu kalem tek başına lansmanı bloklayabilir ve yazılımla çözülmez —
erken bakılmalı.

### 7.3 · Masaüstü ve mobil uygulama

**Değerlendirme: üçü içinde gerçekten değerli olan bu — ama sebebi
"daha çok platform" değil.**

Asıl gerekçe: **telefondan bakılamayan bir pano bakılmaz, bakılmayan pano
ölür.** Bu bir dağıtım meselesi değil, kullanım sürekliliği meselesi.

**PWA ile başlanmalı.** Uygulama zaten duyarlı ve mobil turu yapılmış
(`6be4893`). Manifest + service worker ile ana ekrana kurulabilir, kendi
penceresi olur, çevrimdışı kabuğu çalışır. Günler mertebesinde iş, hem
masaüstü hem mobil kazanılır.

**Masaüstü kabuğu: Electron değil Tauri.** Aynı uygulamayı sarar, çok daha
küçük paket üretir. Gerçek kazanç görsellik değil: sistem tepsisi, yerel
bildirim, global kısayol ve sürekli açık soket — yani bildirimin sekme kapalı
iken de gelmesi.

**React Native ile yerel mobil: hayır, henüz.** Bütün arayüzü yeniden yazmak
demek. Kamera/dosya sistemi gibi gerçek bir yerel ihtiyaç kanıtlanmadan
girilmemeli.

**Ön koşul — atlanmamalı:** push bildirimi bozuk bir bildirim sistemini
büyütür. 10 Eylül'de bulundu: okundu bilgisi sunucuya hiç yazılmıyor. Bu
düzeltilmeden push açılırsa herkesin telefonunda günler önce okunmuş
bildirimler için rozet yanar. Bildirimler zaten bu deponun en çok kusur çıkan
alanı.

### 7.4 · Üçünün de cevaplamadığı soru

Üç fikir de "ürünü büyütme" fikri. Ama 10 Eylül'de MCP ile gerçek veriye
bakıldığında çıkan tablo şu: pano **Mayıs'tan beri güncellenmemiş**, dört
kartın açıklaması birebir aynı, çalışma alanlarının adları `asdasd`,
`ghghhg`, `sadsada`.

Bu veri bir dağıtım ya da paketleme sorununa işaret etmiyor. *"Birileri bunu
gerçekten kullanıyor mu"* sorusuna işaret ediyor. Üç fikir de o soruyu
cevaplamıyor, erteliyor.

Ürün iyi kurulmuş — 211 test, düşünülmüş kararlar, gerçek mimari. Eksik olan
kod değil. **Bir ekibin iki hafta gerçekten kullanması**, hangi özelliğin
eksik olduğunu bu listeden daha iyi söyler. Bu belge zaten "kurumsal tarafın
soracağı ilk soru proje bazlı üyelik" diyor; bir sonraki adım için kanıt
elimizde, tahmine gerek yok.

### 7.5 · Önerilen sıra

1. **Proje bazlı erişim** — kararları verildi (`PROJE-ERISIMI.md`), açığı
   kapatıyor ve **satışın ön koşulu**
2. **Bildirim temizliği** — push'un ön koşulu, en kırılgan alan
3. **PWA + Tauri kabuğu** — ucuz, algılanan değeri yüksek, yeni arka uç yok
4. **Ücretlendirme** — 1 bitmeden başlanamaz
5. **Arama** — en son, ve önce bağlama sürümüyle

İlk ikisi sunulan listede yoktu ama üçünün de altında onlar duruyor. Bu
aşamada yeni özellik eklemek, var olanı satılabilir hâle getirmekten daha az
değer üretiyor.

**Bu bölüm bir karar değil, değerlendirme.** Karar verildiğinde bu belgeye
işlenmeli — özellikle 7.1'e "yine de yapılacak" denirse, gerekçesi buraya
yazılmalı ki maliyetin bilerek kabul edildiği görünsün.

---

## Bilinçli olarak yapılmayanlar

Bunlar "yetişmedi" değil, **seçim**:

- **Jira'nın iş akışı motoru** — doğrulayıcılar, otomatik eylemler, ekran şemaları
- **JQL / gelişmiş sorgu dili**
- **Sprint, hız (velocity), story point** — tahmin alanı bilinçli olarak yok
- **Özel alanlar (custom fields)** — alanlar şemada sabit
- **Kayıt tipleri** (Hikâye/Hata/Epik) — tek tip kart
- **SAP entegrasyonu**

Hepsinin ortak gerekçesi: Jira'yı ağır yapan katman bunlar. StoaBoard'un iddiası
sadelik; bu listeyi kovalamak iddiayı bitirir.

---

## Sıradaki tur

Öncelik sırasıyla — ayrıntıları `GUVENLIK.md` ve `TODO.md` içinde:

1. **Proje bazlı üyelik.** Bugün bir üye çalışma alanındaki **her şeyi** görüyor;
   okuma izni diye bir kavram yok. Kurumsal tarafın soracağı ilk soru bu.
2. **Dönem dondurma.** Kapanmış dönemin raporu mühürlensin.
3. **Kanal geçmişi kesimi.** Yeni üye katılmadan önceki mesajları görüyor.
4. **Denetim kaydının kapsamı.** Üye ekleme/çıkarma ve rol değişikliği de
   yazılsın — eylem adları hazır bekliyor.
5. **Uç testleri.** Saf mantık test ediliyor; yetkilendirme akışları hâlâ elle.
