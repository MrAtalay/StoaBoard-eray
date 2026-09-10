# Proje bazlı erişim — tasarım notu

**Durum:** Ürün kararları verildi · kodlanmadı
**Tarih:** 9 Eylül 2026 (tasarım) · 10 Eylül 2026 (kararlar)

Bu not, çalışma alanı üyeliği ile proje görünürlüğü arasındaki mevcut boşluğu
ve olası çözüm yolunu kaydeder. Ürün kararı verilmeden şemaya ya da uçlara
dokunulmamalı.

## Neden önemli

Bugünkü erişim modeli kabaca şöyledir:

```text
Kullanıcı → çalışma alanı üyesi → çalışma alanındaki bütün projeler
```

Çalışma alanına alınan bir üye, proje bazında ayrıca atanmadığı hâlde o alandaki
projelerin görevlerini ve ilgili verilerini görebilir. Yazma izinlerinin ayrı
olması bu sorunu çözmez: gereksiz okuma erişimi zaten veri sızıntısıdır.

Gerçek hayatta aynı çalışma alanında müşteri projeleri, iç operasyon, insan
kaynakları ve ürün geliştirme yan yana durabilir. Müşteri A için davet edilen
kişinin Müşteri B görevlerini görmesi kötü niyet gerektirmeyen bir kapsam
hatasıdır; ele geçirilmiş bir hesabın erişim yarıçapını da büyütür.

## Önerilen ilk model

İlk sürümün sorusu tek olmalı: **Bu kullanıcı bu projeyi görebilir mi?**

```text
WorkspaceMember
  └── ProjectMember
        ├── projectId
        └── userId
```

Başlangıçta `ProjectMember` yalnızca üyelik taşıyabilir; proje bazlı ikinci bir
izin sistemi kurmak gerekmez.

- Çalışma alanı sahibi ve yöneticiler bütün projeleri görür.
- Diğer üyeler yalnızca açıkça atanmış oldukları projeleri görür.
- Proje yöneticisi rolleri ve ayrıntılı proje izinleri sonraki aşamaya kalır.
- Mevcut kullanıcıların erişimi geçiş anında kesilmez; mevcut üyelikler
  başlangıçta mevcut projelere aktarılır.
- Yeni üyeler, proje ataması yapılmadan proje göremez.

Bu varsayılanlar ürün kararıdır; özellikle yöneticilerin otomatik olarak tüm
projeleri görmesi ayrıca onaylanmalıdır.

## Uygulama sınırı

Kontrol yalnızca arayüzde proje gizleyerek yapılmamalı. Sunucuda ortak bir
`loadProjectWithAccess(user, projectId)` ya da eşdeğer bir yardımcı bulunmalı;
proje erişimi isteyen uçlar aynı kapıdan geçmeli.

En az şu yüzeyler birlikte ele alınmalı:

- proje listesi ve proje seçimi
- görev listesi, görev detayı ve görevle ilgili alt kaynaklar
- görev oluşturma, taşıma, düzenleme ve silme
- proje çöp kutusu
- raporlar ve CSV dışa aktarma
- göreve bağlı notlar
- MCP `list_projects`, `list_tasks` ve `get_task` araçları
- sohbet kanalları veya proje ile ilişkilendirilecek başka kaynaklar

MCP için ayrı bir kural yazılmamalı. MCP mevcut HTTP API'ye gittiği için API
kapsamı doğru kurulursa aynı erişim kararı oraya da yansır.

## Güvenli geçiş sırası

1. Ürün kararı: üyelik varsayılanı, yönetici davranışı ve proje atamasını
   kimin yapacağı netleştirilir.
2. Şema değişikliği ve `ProjectMember` modeli hazırlanır.
3. Mevcut çalışma alanı üyeleri mevcut projelere bir defalık aktarılır.
4. Ortak sunucu erişim yardımcısı eklenir ve okuma uçları önce bu kapıya alınır.
5. Yazma, rapor, çöp kutusu, not ve MCP yüzeyleri aynı kapsamla güncellenir.
6. Arayüzde proje üyeliği yönetimi eklenir.
7. IDOR, üye olmayan kullanıcı, yönetici ve boş üyelik durumları test edilir.

Okuma kapısı kurulmadan yazma kapısını değiştirmek tutarsız bir güvenlik
modeli üretir. Önce “görme” sınırı tek yerde doğru çalışmalı.

## Verilen kararlar (10 Eylül 2026)

Geçiş sırasının 1. adımı — üyelik varsayılanı, yönetici davranışı ve proje
atamasını kimin yapacağı — **cevaplandı.** Şema ve uçlar bu kararların
üstüne kurulacak.

**Projeye üyeyi kim ekler:** çalışma alanı yöneticisi her projeye, projeyi
açan kişi kendi projesine. Yönetici darboğaz olmuyor, ama erişim de kendi
kendine büyümüyor — projede çalışan biri arkadaşını kendi başına çağıramaz.

**Yönetici bütün projeleri görür.** Zaten üyeleri, rolleri ve alanı yönetiyor;
projeleri görmemesi tutarsız olurdu ve kendini ekleyerek nasılsa girebilirdi.
Bilinçli karşılığı: yönetici rolü gerçek güven istiyor, dağıtırken buna göre
davran. Alan sahibi ile yönetici arasına ayrım konmadı.

**Yeni üye hiçbir proje görmez.** Çalışma alanına katılmak tek başına hiçbir
projeye erişim vermez; açıkça eklenmesi gerekir. Özelliğin bütün amacı bu —
kazayla veri görmek imkânsız hâle geliyor. Kabul edilen karşılığı: davet eden
kişi ayrıca projeye de eklemeyi unutursa yeni üye boş ekranla karşılaşır.
Arayüz bunu açıklamalı ("henüz bir projeye eklenmedin"), boş liste gösterip
susmamalı.

**Projeden çıkarılan kişinin adı kartlarda kalır**, projeye erişimi biter.
Geçmiş olduğu gibi durur, raporlar delik çıkmaz. Bu karar deponun mevcut
mantığıyla aynı yönde: raporlama tabloları bilerek ilişkisiz ve denormalize,
çünkü kişi ya da görev silinse bile kayıt yaşamalı. "Eski üye" diye ayrı bir
görünüm şimdilik yok; gerekirse sonra eklenir.

## Hâlâ açık — sonraki dilimlere ait

Bunlar ilk dilimi (okuma kapısı) bloklamıyor, o yüzden ertelendi:

- Özel notlar proje üyeliğinden bağımsız kalabilir mi?
- Bir görev birden fazla projeye bağlanabilir mi, yoksa kapsam yalnızca proje
  üzerinden mi kurulacak?
- Genel kanal çalışma alanı düzeyinde mi kalacak, yoksa projeye mi bağlanacak?
- Raporlarda kişi ve proje görünürlüğü aynı kurala mı tabi olacak?

## Projesiz üye ekranı — tasarım yönü

Kararın kabul edilen karşılığı, yeni üyenin bazen hiçbir projeye eklenmemiş
olması. Bunun **iki** cevabı var ve ikisi de gerekli.

**Birincisi, kazayla olmasını engellemek.** Alana katılma zaten onaydan
geçiyor (`POST /workspaces/join-requests/:reqId/approve`), yani yeni üyenin
girdiği tek kapıda bir yönetici duruyor. Proje seçimi o onay ekranına konur
ve en az bir seçim yapılmadan onay tamamlanmaz. "Şimdilik projesiz kabul et"
seçeneği bilinçli olarak durur — yasak değil, ama sessiz de değil. Böylece
boş ekran kazara değil, yalnızca bilerek oluşur.

**İkincisi, oluştuğunda ekranın kendini açıklaması.** Boş liste gösterip
susmak bu deponun tekrar eden kusuru. Ekranın dili giriş sayfasından
geliyor — ama `auth.jsx` incelendiğinde kopyalanmaması gereken beş nokta
çıktı.

### Giriş ekranı incelemesi — dikkat edilecekler

**1. Bu bir tam ekran devralma olmamalı.** `.auth-page` `100vh/100vw`,
`overflow: hidden` ve `grid-template-columns: 2fr 1fr`. Giriş ekranında
doğru, çünkü kullanıcı henüz içeride değil. **Projesiz üye ise içeride:**
sohbeti, notları, ayarları çalışıyor. Ekranı devralırsak çalışan bir
uygulamayı kilitlemiş oluruz. Alınacak olan *estetik*, *devralma* değil —
kart içerik alanında yaşamalı, üst çubuk ve kenar çubuğu yerinde kalmalı.

**2. Mobilde görsel taraf tamamen kayboluyor.** `@media (max-width: 768px)`
içinde `.auth-visual { display: none !important; }`. Kalıp olduğu gibi
kopyalanırsa **telefonda hiçbir şey görünmez** — üstelik projesiz üyenin
gördüğü tek ekran bu olduğu için tamamen boş bir sayfayla karşılaşır.
Mobil düzen ayrıca kararlaştırılmalı: görsel gizlenebilir ama kart ve metin
kalmak zorunda.

**3. Emsal giriş ekranı değil, `workspace-page`.** `auth.jsx` içinde
"çalışma alanın yok" ekranı zaten aynı iskeleti yeniden kullanıyor
(`.auth-page.workspace-page`) ama sol tarafı farklı: fotoğraf kaydırıcısı
yerine **blueprint SVG**, ve açık gradyan katmanı bilinçli olarak kapatılıyor
(`.workspace-page .auth-visual::after { display: none }`). Yani "henüz bir
şeyin yok" durumunun görsel dili bu depoda zaten kurulmuş. Projesiz üye
ekranı giriş sayfasına değil **buna** benzemeli; aksi hâlde iki farklı
"boşsun" estetiği doğar.

**4. Kaydırıcı tembel yükleniyor, kopyalanırken korunmalı.** `loadedSlides`
kümesi yalnızca sırası gelen kareyi yüklüyor; yedi adet 1920px Unsplash
görseli aynı anda inmiyor. Geçiş 1.2sn opaklık, döngü 10 saniyede bir.
Fotoğraf yolu seçilirse bu davranış birlikte taşınmalı.

**5. Toz parçacıkları sonsuz animasyon.** `particleRise` sürekli dönüyor ve
giriş ekranı `prefers-reduced-motion`'a bakmıyor. Projesiz üyenin ekranı
uzun süre açık kalabilir; yeni ekranda hareket azaltma tercihi
desteklenmeli. Mevcut ekranın eksiği, kopyalanacak bir davranış değil.

### Kart içeriği

"Henüz bir projeye eklenmedin." + yöneticiye haber verme eylemi. Alandaki
projelerin **adını** göstermek sızıntı değil, içeriğini göstermek sızıntı —
istersen ad listesi ve "erişim iste" düğmesi konabilir.

`.glass-content` metin rengini tema bağımsız koyuya sabitliyor (kart her
zaman krem), yani koyu temada da olduğu gibi çalışır. Ama kenar boşlukları
(`margin: auto 48px 72px 8vw`) büyük sol panele göre ayarlı; içerik alanında
yeniden ölçülmeli.

Dil kuralı geçerli: metin `APP_I18N`e tr/en birlikte girer. `auth.jsx`in
kendi `AUTH_I18N` sözlüğü burada kullanılmaz — bu ekran uygulama sözlüğü
yüklendikten sonra çalışıyor. Giriş ekranının SVG etiketlerine tanınan
muafiyet de bu ekranı kapsamaz.

## Sıradaki adım

1. adım kapandı. Şimdi 2. adım: `ProjectMember` modeli ve şema değişikliği.
Ardından 3. adım (mevcut üyelerin mevcut projelere bir defalık aktarılması) —
bu ikisi birlikte planlanmalı, çünkü aktarım yapılmadan kapı açılırsa herkes
her projeden düşer.

Kod yazılmadan önce [GUVENLIK.md](GUVENLIK.md) bölüm 4'teki on soru
cevaplanır ve cevaplar commit mesajına girer.
