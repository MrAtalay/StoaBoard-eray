# Güvenlik çalışma biçimi

Bu dosya bir "yapılacaklar" listesi değil, **her yeni özelliğin üstünden geçmesi
gereken elek.** Güvenlik ayrı bir sprint değil; her özelliğin bir parçası.

---

## 1 · Temel varsayım

> **Bir kullanıcı hesabı er geç kötüye kullanılacak** — ya sahibi sızdırmak
> isteyecek, ya hesabı ele geçirilecek. İkisi de aynı soruyu sorar:
> **bir hesabın patlama yarıçapı ne kadar?**

Bu yüzden "kullanıcıya güvenilir mi" diye sormuyoruz. Sorduğumuz üç şey:

1. Bu hesap **ne kadarına** erişebiliyor? (yarıçapı küçült)
2. Erişileni **dışarı çıkarabiliyor mu**, çıkarırsa **iz kalıyor mu**? (izle)
3. Yanlış giderse **ne kadar sürede fark ederiz**? (tespit)

Engelleme her zaman mümkün değil: veriyi meşru olarak görebilen biri onu
kopyalamayı da başarır. O yüzden üçüncü savunma hattı **izlenebilirlik**.

---

## 2 · Tehdit modeli — kime karşı

| Aktör | Ne yapabilir | Ana kontrolümüz |
|---|---|---|
| **İçerideki üye** | Meşru erişimini kötüye kullanır, toplu veri çeker | En az yetki + dışa aktarma kaydı |
| **Ele geçirilmiş hesap** | Üyenin yapabildiği her şey | Yarıçap küçültme + oturum hijyeni |
| **Dışarıdan saldırgan** | Kimlik doğrulamayı aşmaya, IDOR aramaya çalışır | Kapsam kontrolü, kapalı başarısızlık |
| **Meraklı üye** | Kendi yetkisinin sınırını yoklar | Sunucu tarafı kontrol (istemciye asla güvenme) |
| **Kaza** | Yanlış kişiye erişim verilir, veri yanlış yere gider | Varsayılanların dar olması |

---

## 3 · Yaşanmış krizlerden çıkardığımız dersler

Her satır gerçek bir olaydan, ve karşısında **bizim** karşılığımız var.

**Tek hesabın yarıçapı — Uber, 2022.**
Bir taşeronun kimlik bilgileri ele geçirildi, saldırgan çok sayıda doğrulama
isteği göndererek kullanıcıyı yıldırıp içeri girdi; içeride bulduğu erişimlerle
yatay olarak yayıldı.
→ *Bizde:* bir üyeyi kabul ettiğinde o kişi **çalışma alanındaki bütün
projeleri, bütün kartları ve `general` kanalının katılmadan önceki tüm
geçmişini** görüyor. Yarıçap bugün geniş. **Proje bazlı üyelik** bu yüzden yol
haritasında.

**Yönetim araçları taçtır — Okta/Lapsus$, 2022.**
Üçüncü taraf bir destek çalışanının makinesi ele geçirildi; o hesabın müşteri
yönetim araçlarına erişimi vardı.
→ *Bizde:* denetim kaydı, davet kodu, rol yönetimi ve üye çıkarma en hassas
yüzey. Denetim kaydı bu yüzden `manage_workspace` ile kapalı — herkese açık
olsaydı kimin ne yaptığı sıradan bir üyeye açılırdı.

**Geliştirici makinesi üretim yüzeyidir — LastPass, 2022.**
Bir mühendisin ev bilgisayarı ele geçirildi, oradan üretim yedeklerine giden
anahtarlara ulaşıldı.
→ *Bizde:* üretim `DATABASE_URL` **hiçbir geliştirici makinesinde durmuyor**,
yalnızca Railway ortam değişkenlerinde. Yerel test için Neon'da ayrı bir dal
kullanılıyor. Bu kazara doğru yapılmıştı; artık bilinçli bir kural.

**Servisin kendi yetkisi de fazla olabilir — Capital One, 2019.**
Bir uygulama açığı, arkasındaki fazla yetkili kimlik sayesinde toplu veri
sızıntısına dönüştü.
→ *Bizde:* uygulamanın veritabanı kullanıcısı tek ve tam yetkili. Kısa vadede
değişmiyor ama not edildi: açığın ciddiyetini belirleyen şey çoğu zaman açığın
kendisi değil, arkasındaki yetkidir.

**Fark etme süresi — birçok büyük ihlalde ortak.**
Saldırganların aylarca fark edilmediği olaylarda asıl kayıp, girişin kendisi
değil **fark edilmeden geçen süre** oldu.
→ *Bizde:* denetim kaydı bu yüzden var. Engellemiyor, **görünür kılıyor.**

**Kontrol atlanırsa kontrol yoktur — kapalı-başarısızlık.**
Birçok ihlalde asıl kusur eksik kontrol değil, **belirli bir durumda hiç
çalışmayan** kontroldü.
→ *Bizde:* sohbette `if (kanalSatırı && !yetki)` kalıbı vardı. Kanal satırı
bulunamayınca üyelik kontrolü tamamen atlanıyor, kanal listesinde görünmeyen
"hayalet kanallar" açılabiliyordu. 1 Eylül 2026'da dört yerde kapatıldı.
Ders: koşulun **yokluk hâli** her zaman reddetmeli.

**Yönetici, verdiğini sandığı yetkiyi vermemiş olabilir.**
Yanlış yapılandırma, açıktan daha sık ihlale yol açar. Tehlikeli olan yalnızca
"fazla yetki" değil, yöneticinin kafasındaki tablonun gerçekle uyuşmamasıdır.
→ *Bizde:* ayarlar ekranı "Üye davet et" (`invite_members`) iznini sunuyordu
ama sunucu bu izni **hiçbir yerde kontrol etmiyordu** — yani verilen yetkinin
hiçbir etkisi yoktu. Ters yönde de bir uyumsuzluk vardı: `manage_workspace`
sunucuda uygulanıyor ama arayüzde listelenmediği için kimseye verilemiyordu.
İkisi de 1 Eylül 2026'da düzeltildi. Ders: **arayüzdeki izin listesi ile
sunucunun uyguladığı izinler birebir aynı olmalı** ve bu, izin eklerken
kontrol edilmeli.

**Parola değiştirmek erişimi kesmiyorsa, parola değiştirmek işe yaramaz.**
Hesabı ele geçirilen kullanıcının ilk refleksi parolasını değiştirmektir. Eğer
saldırganın açık oturumu bundan etkilenmiyorsa kurban güvende olduğunu sanır
ama değildir — ve bu yanlış güven, ihlalin süresini uzatır.
→ *Bizde:* oturumlar veritabanında kalıcı, `reset-password` ise yalnızca parola
özetini güncelleyip dönüyordu. Eski parolayla açılmış oturumlar yaşamaya devam
ediyordu. 1 Eylül 2026'da kapatıldı. Ders: kimlik bilgisi değişen her yerde
**mevcut oturumların da sonlandırılması** gerekir.

**Sessiz başarısızlık, gürültülü başarısızlıktan tehlikelidir.**
Bir kontrol hata fırlatırsa dakikalar içinde bulunur; usulca `return` ederse
aylarca yaşar. Zararı da güvenlik açığıyla sınırlı değil: kullanıcı, işlemin
neden olmadığını hiç öğrenemez.
→ *Bizde:* bekleme lobisi `if (!window.io) return;` diyordu. O global Vite
geçişinde kayboldu, kontrol hep erken çıktı ve davet kodunu giren kullanıcıya
onay hiç ulaşmadı — canlı bir müşteri toplantısında ortaya çıktı. Aynı taramayı
yapınca iki kusur daha çıktı: `window.showToast` (bütün bildirimler sessizce
yutuluyordu) ve `window._parseServerDate` (sohbette saat ve gün ayracı).
Ders: **yokluk hâli ya gürültü çıkarmalı ya da testle korunmalı.** Bu sınıf
artık `server/test/global.test.js` ile kapalı.

**Dosya biçiminin kendisi silah olabilir — CSV formül enjeksiyonu.**
Bilinen bir sınıf: Excel, `=` `+` `-` `@` ile başlayan hücreyi formül sayıp
çalıştırır. Saldırgan veriyi değil, **veriyi açan kişiyi** hedefler.
→ *Bizde:* 1 Eylül 2026'da bulundu ve kapatıldı. Rapor CSV'lerindeki görev
başlıkları ve kişi adları kullanıcı girdisiydi, raporu açan da yönetici.

---

## 4 · Her yeni özellik için elek

Yeni bir uç, ayar ya da ekran eklendiğinde **bu on soru cevaplanmadan
birleştirilmez.** Cevaplar commit mesajına ya da PR açıklamasına yazılır.

1. **Kim çağırabilir?** Kimlik doğrulaması var mı, `requireAuth` bağlı mı?
2. **Neyin üstünde çalışabilir?** Çalışma alanı / proje / kendi kaydı kapsamı
   nasıl daraltılıyor? Sadece "giriş yapmış olmak" yeterli olmamalı.
3. **IDOR denendi mi?** Başkasının id'si verilirse ne oluyor? Kimliği
   tahmin edilebilir mi?
4. **Başarısızlık kapalı mı?** Kayıt/üyelik bulunamazsa **reddediyor** mu,
   yoksa kontrolü atlayıp devam mı ediyor? (`if (row && !yetki)` kalıbı
   tehlikelidir: satır yoksa kontrol hiç çalışmaz.)
5. **Yanıtta ne var?** Serileştirici fazladan alan döndürüyor mu — e-posta,
   iç kimlik, başka kullanıcının verisi? Genel ve özel serileştirici ayrımı
   korunuyor mu?
6. **Girdi nereden geliyor?** Tip, aralık, uzunluk doğrulanıyor mu? Dizi
   beklenen yere nesne gelirse ne olur?
7. **Veri dışarı çıkıyor mu?** Dışa aktarma, indirme, e-posta, dış servis —
   varsa **denetim kaydına yazılıyor mu**? Hedef biçim (Excel, HTML) kendi
   saldırı yüzeyini getiriyor mu?
8. **Hata mesajı ne söylüyor?** İç ayrıntı, sunucu adresi, sorgu adı sızıyor
   mu? Var/yok farkı bir oracle oluşturuyor mu? (404 ile 403 arasındaki fark
   bilgi verir.)
9. **Silme davranışı ne?** Kayıt silinince denetim ve rapor verisi de gidiyor
   mu? Gitmemeli — bu yüzden geçiş, süre ve denetim kayıtları ilişkisiz.
10. **Nasıl test edilir?** En az bir olumsuz senaryo yazılı olmalı: *yetkisiz
    kişi bunu denerse ne görür?* Kapatılan her kusur için
    `server/test/guvenlik.test.js` içine bir regresyon testi eklenir —
    test, koruduğu kusuru anlatan bir yorumla birlikte yazılır.

---

## 5 · Mevcut durum

**Yapıldı**
- Bildirim ve etkinlik metinlerinde **saklı XSS** kapandı: şablon değerleri ve
  çevrilemeyen ham gövde kaçışlanıyor (`client/src/bildirimMetni.js`); her
  `dangerouslySetInnerHTML` sink'i tarama ile kapıya bağlı *(12 Eylül, DEVIR 0-P)*
- Genel/özel kullanıcı serileştirici ayrımı — e-posta yalnızca kişinin kendi
  profilinde
- Direkt mesajlar çalışma alanı ortaklığı ile korunuyor; özel kanallar üyelik
  kontrolünden geçiyor
- Rapor uçlarında çalışma alanı kapsamı; yabancı proje kimliği boş küme veriyor
- İç hata mesajları istemciye kapatıldı *(1 Eylül)*
- CSV formül enjeksiyonu kapatıldı *(1 Eylül)*
- Kullanıcı varlığı oracle'ı kapatıldı *(1 Eylül)*
- Dışa aktarma denetim kaydı *(1 Eylül)*
- Sohbette kapalı-başarısızlık kusuru kapatıldı *(1 Eylül)* — kanal satırı
  bulunamayınca üyelik kontrolü tamamen atlanıyordu
- Hayalet kanal denetimi yapıldı *(1 Eylül)* — üretim ve test dallarında kayıt
  bulunamadı, kusur istismar edilmemiş
- Hayalet izin `invite_members` gerçek hâle getirildi *(1 Eylül)*
- `manage_workspace` artık arayüzden verilebiliyor *(1 Eylül)*
- Rapor erişimi kendi iznine ayrıldı: `view_reports` *(1 Eylül)*
- Parola değişince açık oturumlar düşürülüyor *(1 Eylül)* — sıfırlamada hepsi,
  profilden değiştirmede kendi cihazı hariç hepsi
- Parola alt sınırı her yerde 8 karakter *(1 Eylül)* — profil ekranı 6 ile
  yetiniyor, kayıt/sıfırlamadaki kuralı dolaşmaya izin veriyordu
- Bekleme lobisinin sonsuza kadar beklemesi düzeltildi *(1 Eylül)* — ve bu
  sınıf (atanmamış `window.*` globali) testle kapatıldı
- **İlk otomatik testler** *(1 Eylül)* — 55 test, veritabanı gerektirmiyor.
  Bugün kapatılan kusurların hepsi kilitlendi, ayrıca bütün sunucu modüllerinin
  hatasız yüklendiğini doğrulayan bir yükleme testi var. `cd server && npm test`
- Oturumlar PostgreSQL'de; `HttpOnly`, `SameSite=lax`, üretimde `Secure`
- `/api/auth` için hız sınırı
- **Çöp kutusu boşaltma yetki kapısı** *(2 Eylül)* — `DELETE /workspaces/me/trash`
  yalnızca üyelik istiyordu; tekil kalıcı silme `manage_tasks` isterken toplu,
  çalışma alanını kapsayan hâli korumasızdı. Aynı izne sabitlendi, regresyon
  testi eklendi
- **Denetim kaydı kapsamı genişledi** *(2 Eylül)* — dışa aktarmaya ek olarak
  üye çıkarma, rol değişikliği ve toplu çöp boşaltma da yazılıyor. Kayda yalnızca
  bağlam (hedef, rol adı, sayı), içerik değil
- **Bahsetme bildirimi kapsamı** *(2 Eylül)* — sohbetteki @mention bildirimleri
  bahsedilen kişiyi platform genelinde arıyor, çalışma alanı/kanal üyeliği
  kontrol etmiyordu: bir üye @slug yazarak rastgele birine mesaj önizlemesi
  (özel kanalda kanal içeriği, DM'de üçüncü kişiye DM içeriği) sızdırabiliyordu.
  person-report oracle'ıyla aynı sınıf. Karar saf `mentionAllowed`'a çıkarıldı,
  altı regresyon testiyle kilitlendi
- **`session` tablosu şemaya tanıtıldı** *(3 Eylül)* — tabloyu
  `connect-pg-simple` oluşturduğu ve `schema.prisma`'da tanımlı olmadığı için
  Prisma onu yabancı sayıyordu: veritabanına karşı alınan diff tek işlem olarak
  `DROP TABLE "session"` üretiyordu. Deploy zinciri 2 Eylül'de temizlenmişti, ama
  elle çalıştırılan `npm run prisma:push` her seferinde veri kaybı uyarısıyla
  duruyor ve oradaki refleks `--accept-data-loss` eklemek oluyordu — o bayrak
  tabloyu gerçekten siler, giriş yapmış herkes düşer. Model tabloyu yönetmiyor,
  yalnızca "bu tablo bilinir, dokunma" diyor

**Açık — öncelik sırasıyla**
1. **Proje bazlı üyelik.** En büyük yarıçap küçültme. Bugün bir üye çalışma
   alanındaki her şeyi görüyor.
2. **Oturum hijyeni.** Üye çıkarıldığında ve parola değiştiğinde açık oturumlar
   gerçekten düşüyor mu? Denetlenmedi.
3. **Kanal geçmişi kesimi.** Yeni üye katılmadan önceki mesajları görüyor.
4. **Denetim kaydının kapsamı.** Üye çıkarma, rol değişikliği ve toplu çöp
   boşaltma *(2 Eylül)* eklendi. Kalan tek eylem **davet kodu görüntüleme**:
   kod bootstrap yanıtında dönüyor, orada kaydetmek her sayfa yüklemesini
   denetime yazardı — ayrı bir "kodu göster" ucu gerekiyor (ürün kararı).
5. **Test kapsamı dar.** Saf mantık (izinler, CSV, bildirim gövdesi) test
   ediliyor; uçların kendisi (yetkilendirme akışları, IDOR senaryoları) hâlâ
   elle test ediliyor. Sonraki adım: veritabanı gerektiren uç testleri.

---

## 6 · Bilinen ödünleşmeler

Bilerek yapılmış, tartışmaya açık seçimler:

- **Denetim kaydı isteği bekletmiyor.** Yazımı başarısız olursa kullanıcının
  işlemi bozulmuyor, sadece sunucu günlüğüne uyarı düşüyor. Bedeli: veritabanı
  sorunlarında kayıt kaybı olabilir. Kritik hâle gelirse yazma senkron yapılmalı.
- **Süre kayıtları çalışma alanı içinde herkese açık.** Takım şeffaflığı için
  bilinçli. "Süreyi kim görebilir" sorusu açık bir tasarım kararı.
- **Geçiş, süre ve denetim kayıtlarında yabancı anahtar yok.** Kayıtlar silinen
  veriden sağ çıksın diye. Bedeli: veritabanı düzeyinde bütünlük garantisi yok.
