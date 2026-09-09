# Proje bazlı erişim — tasarım notu

**Durum:** Tasarım düşüncesi · kodlanmadı
**Tarih:** 9 Eylül 2026

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

## Açık ürün soruları

- Projeye üyeyi kim ekleyebilir: çalışma alanı yöneticisi, proje sahibi, ikisi mi?
- Çalışma alanı yöneticisi bütün projeleri varsayılan olarak görmeli mi?
- Proje üyeliği kaldırılınca kişinin görev ve not geçmişi nasıl görünmeli?
- Özel notlar proje üyeliğinden bağımsız kalabilir mi?
- Bir görev birden fazla projeye bağlanabilir mi, yoksa kapsam yalnızca proje
  üzerinden mi kurulacak?
- Genel kanal çalışma alanı düzeyinde mi kalacak, yoksa projeye bağlanacak mı?
- Raporlarda kişi ve proje görünürlüğü aynı kurala mı tabi olacak?

## Karar verilene kadar

Bu konu “eksik özellik” diye sessizce uygulanmamalı. Mevcut çalışma alanı
modelinin bilinçli bir ürün varsayımı olup olmadığı netleştirilmeli; karar
verildiğinde önce [GUVENLIK.md](GUVENLIK.md) bölüm 4'teki sorular cevaplanmalı,
sonra şema ve uçlar küçük bir dilimde değiştirilmeli.
