// MCP yanıtlarının biçimi — saf mantık, veritabanısız.
//
// ── Neden ayrı dosya ──────────────────────────────────────────────────────
//
// `routes/mcp.js` HTTP ve SDK'ya bağlı; oradaki hiçbir şey veritabanı olmadan
// koşturulamıyor. 9-10 Eylül'deki iki kusur da tam olarak burada, biçimin
// içinde doğdu: kimlik alanı metin dönerken şema sayı istiyordu, `weeklyDone`
// kolon slug'ını yanlış adla arıyordu. İkisi de "kod doğru, sözleşmeler
// arasında boşluk var" sınıfından ve hiçbir birim testi göremiyordu.
//
// Biçimlendirmenin tamamı buraya taşındı ki `mcp.test.js` veritabanı
// istemeden koşsun. Kural: bu dosya `prisma`, `fetch` ya da `req` görmez.
// Tek içe aktarması `permissions.js` — o da saf.
//
// ── Girdi ne ──────────────────────────────────────────────────────────────
//
// Buradaki fonksiyonlar Prisma kaydı değil, **kendi HTTP API'mizin döndüğü
// sözlükleri** alır (`taskToDict`, `noteToDict`, `memberToDict` çıktıları).
// MCP katmanı zaten API'nin üstünde duruyor; biçim düzeltmesi de orada
// yapılmalı, ortak serileştiricide değil — `String(id)` sözleşmesini
// değiştirmek ön yüzü kırar (serializers.js'teki yoruma bak).

import { memberPermissions } from './permissions.js';

// ─── Kimlik ────────────────────────────────────────────────────────────────

/**
 * Kimliği metne sabitler.
 *
 * Sunucu iki türlü kimlik dönüyor: `taskToDict`/`projectToDict` metin
 * (`String(p.id)`), `noteToDict` sayı (`note.id`). İkisi de kendi tarafında
 * doğru ve değiştirilemez, ama tek bir MCP yüzeyinde yan yana durunca model
 * "bu araç sayı mı metin mi istiyor" sorusuyla kalıyor — 10 Eylül denemesinde
 * istemci bunu kendisi rapor etti.
 *
 * Yüzeyin tamamı metne çekiliyor. Araç girdileri `z.coerce` ile ikisini de
 * kabul ettiği için tur kapanıyor: ne dönerse geri verilebiliyor.
 */
export function metinKimlik(deger) {
  return deger === null || deger === undefined ? null : String(deger);
}

/**
 * Yanıtın içindeki bütün kimlik alanlarını metne çeker — derinlemesine.
 *
 * 0.3.0'da kimlikler alan alan çevrildi ve biri kaçtı: `list_workspaces` "1"
 * dönerken `whoami` ve her yanıttaki `workspace.id` 1 (sayı) dönüyordu, çünkü
 * o alan Prisma'dan geliyordu. Canlı denemede istemci yakaladı. Alan alan
 * çevirmek, her yeni alanda aynı kaçağı yeniden davet etmek demek.
 *
 * Kural bu yüzden tek noktada ve adla tanımlı: adı `id` olan ya da `_id` ile
 * biten her alan, değeri sayıysa metne çevrilir. `sonuc()` her yanıtı buradan
 * geçiriyor; yeni bir araç ya da yeni bir alan kuralı unutamaz.
 *
 * **Neden metin, sayı değil.** Temel kod tabanı karışık: alan kimlikleri
 * sayı, proje/görev kimlikleri metin (Python aslından). MCP yüzeyinde ise
 * metin çoğunluktaydı ve proje/görev kimlikleri 0.2'den beri metin — sayıya
 * çekmek en çok kullanılan kimlikleri kırardı. En az kıran yön metin.
 */
export function kimlikleriMetinle(deger) {
  if (Array.isArray(deger)) return deger.map(kimlikleriMetinle);
  if (deger && typeof deger === 'object') {
    const d = {};
    for (const [anahtar, v] of Object.entries(deger)) {
      const kimlikAlani = anahtar === 'id' || anahtar.endsWith('_id');
      d[anahtar] = kimlikAlani && typeof v === 'number' ? String(v) : kimlikleriMetinle(v);
    }
    return d;
  }
  return deger;
}

// ─── Metin karşılaştırma ───────────────────────────────────────────────────

/**
 * Arama için harf katlama.
 *
 * `toLowerCase()` tek başına yetmiyor: Türkçe'de I/ı ve İ/i ayrı çiftler ve
 * JavaScript varsayılan olarak İngilizce kuralı uyguluyor ("İ" → noktalı i,
 * iki kod birimi). `toLocaleLowerCase('tr')` ise ters yönde kırıyor — "IT"
 * araması "it" geçen kartı bulamaz hâle geliyor.
 *
 * Pano iki dilli olduğu için dörtlü nokta ayrımı aramada bilinçli olarak
 * siliniyor: I, İ, ı, i hepsi "i" sayılıyor. Arama bulmak içindir, ayırmak
 * için değil.
 */
export function katla(metin) {
  return String(metin ?? '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase();
}

/**
 * Metni sınırda keser — kelimenin ortasından değil.
 *
 * 0.3.0 düz `slice` kullanıyordu ve istemci "...için efek" gibi yarım
 * kelimeyle biten açıklamalar gördü. Kesme son boşlukta yapılıyor ve sona
 * "…" konuyor; metnin devam ettiği göz kararıyla da anlaşılıyor.
 *
 * İki kenar durumu:
 * - Kesme noktası zaten bir boşluğa denk geliyorsa son kelime tamdır, geri
 *   gidilmiyor — yoksa sağlam bir kelime boşuna düşerdi.
 * - Son boşluk sınırın çok gerisindeyse (tek, çok uzun bir sözcük ya da
 *   boşluksuz bir adres) kelime sınırı aranmıyor: 200 karakterlik kotayı 20
 *   karaktere indirmek, kırpmayı kırpılan şeyden daha zararlı yapardı.
 *
 * Sonuç en fazla `sinir + 1` karakter (üç nokta tek karakter).
 */
export function kelimedeKes(metin, sinir) {
  const s = String(metin ?? '');
  if (s.length <= sinir) return s;
  const kaba = s.slice(0, sinir);
  if (/\s/.test(s[sinir])) return `${kaba.trimEnd()}…`;
  const bosluk = kaba.search(/\s\S*$/);
  const kesit = bosluk >= sinir * 0.6 ? kaba.slice(0, bosluk) : kaba;
  return `${kesit.trimEnd()}…`;
}

// ─── Görev ─────────────────────────────────────────────────────────────────

/** Liste yanıtlarında görev açıklamasının kırpıldığı sınır. */
export const DESC_SINIRI = 200;

/**
 * Liste yanıtı için görev özeti.
 *
 * İki şey yapıyor:
 *
 * **`col_is_done`.** Kartın bitmiş kolonda olup olmadığı listeden okunabilsin;
 * bunun için ayrıca `list_columns` çağırmak gerekmesin. Bilgi zaten elde —
 * açık/gecikmiş süzgeci için kolonlar nasılsa çekiliyor.
 *
 * **`desc` kırpma.** Uçtan uca denemede istemcinin saydığı ilk maliyet buydu:
 * 15 kartta sorun değil, 200 kartlık panoda yanıt istemcinin bağlamını yiyor.
 * Tamamı `get_task`te duruyor ve araç açıklaması oraya yönlendiriyor. Kesme
 * kelime sınırında (`kelimedeKes`). Kırpma olduğunda `desc_truncated`
 * işaretleniyor — sessizce kısaltmak, modelin eksik metni tam sanması demek
 * olurdu.
 */
export function gorevOzeti(gorev, { bitisKolonlari, descSiniri = DESC_SINIRI } = {}) {
  const desc = String(gorev.desc ?? '');
  const kirpildi = desc.length > descSiniri;

  const d = {
    ...gorev,
    id: metinKimlik(gorev.id),
    project_id: metinKimlik(gorev.project_id),
    desc: kirpildi ? kelimedeKes(desc, descSiniri) : desc,
  };
  if (kirpildi) d.desc_truncated = true;
  // Set verilmemişse alan hiç konmuyor: `false` yazmak "bitmiş değil" diye
  // okunur, oysa bilinmiyor. Bu deponun tekrar eden kusuru olan sessiz
  // varsayım tam buradan giriyor.
  if (bitisKolonlari) d.col_is_done = bitisKolonlari.has(gorev.col);
  return d;
}

/** Detay yanıtı için görev — açıklama kırpılmıyor, kimlik yine metin. */
export function gorevDetayi(gorev, { bitisKolonlari } = {}) {
  const d = {
    ...gorev,
    id: metinKimlik(gorev.id),
    project_id: metinKimlik(gorev.project_id),
  };
  if (bitisKolonlari) d.col_is_done = bitisKolonlari.has(gorev.col);
  return d;
}

/**
 * "Açık görev" — bitmiş olarak işaretli kolonda **olmayan** kart.
 *
 * Tanım uydurulmadı, sunucunun kendi tanımı: `projectWithOpenCount`
 * (`routes/projects.js`) `list_projects`in `open` sayısını tam olarak böyle
 * hesaplıyor. İki yerde iki ayrı tanım olsaydı model "proje 6 açık iş diyor
 * ama liste 9 kart verdi" durumuyla karşılaşırdı.
 *
 * Çöp kutusundaki kartlar zaten gelmiyor: `GET /projects/:id/tasks`
 * `deletedAt: null` süzgeciyle çalışıyor.
 */
export function acikMi(gorev, bitisKolonlari) {
  return !bitisKolonlari.has(gorev.col);
}

/**
 * Görev süzgeci.
 *
 * Süzgeçler birleşimli (AND). MCP katmanında uygulanıyor çünkü karşılık gelen
 * uç yalnızca ham liste döndürüyor.
 *
 * `overdue` ölçütü kolona bakıyor, damgaya değil. `completed_at` türetilmiş bir
 * kopyadır (kart bitiş kolonuna girince yazılır, çıkınca silinir — tasks.js);
 * kolonun kendisi gerçektir. 10 Eylül 2026'da ölçüldü: geçiş defteri 2 Eylül'de
 * açıldığı için ondan önce bitiş kolonuna taşınan 39 kartta damga hiç
 * yazılmamıştı ve "Ana Proje"de gecikmiş sayısı 14 görünüyordu, oysa 9 kart
 * panoda bitmiş kolonda duruyordu.
 */
export function gorevSuz(gorevler, {
  col = null,
  assignee = null,
  overdue = false,
  includeDone = false,
  bitisKolonlari,
  bugun,
} = {}) {
  return (Array.isArray(gorevler) ? gorevler : []).filter((t) => {
    if (col && t.col !== col) return false;
    if (assignee && !(t.assignees || []).includes(assignee)) return false;
    if (!includeDone && !acikMi(t, bitisKolonlari)) return false;
    if (overdue) {
      if (!(t.due && t.due < bugun)) return false;
      if (!acikMi(t, bitisKolonlari)) return false;
    }
    return true;
  });
}

/**
 * İşaretsiz panonun uyarısı.
 *
 * Koşul 11 Eylül'de genişledi ve sebebi kayda değer. Önceden yalnızca
 * `overdue=true` iken çıkıyordu; 10 Eylül sabahı bütün panolara `is_done`
 * konduğu için alan bir daha hiç tetiklenemedi ve istemci onu "ölü alan"
 * sandı — doğru gözlem, yanlış sonuç.
 *
 * Gerçek ölçüt şu: **"bitmiş" bilgisine ihtiyaç duyduk mu, pano onu veriyor
 * mu?** Açık görev süzmek de gecikme hesaplamak da bu bilgiye dayanıyor.
 * Pano tanımlamamışsa eleyebileceğimiz kart yok, yani liste olduğundan uzun —
 * ve bunu yalnızca yanıtın kendisi söyleyebilir.
 */
export function listeUyarisi({ bitisKolonSayisi, includeDone = false, overdue = false }) {
  const bitmisBilgisiGerekli = overdue || !includeDone;
  if (!bitmisBilgisiGerekli || bitisKolonSayisi > 0) return null;
  return 'Bu panoda "tamamlandı" olarak işaretli kolon yok. Bitmiş kartlar '
    + 'ayırt edilemediği için liste olduğundan uzun ve gecikme sayısı '
    + 'olduğundan yüksek. Kullanıcıya bunu söyle.';
}

// ─── Aktif alan kapsamı ────────────────────────────────────────────────────
//
// 11 Eylül canlı denemesinin P0 bulgusu: aktif alan StoaBoard iken
// `list_columns {project_id: 21}` Mytherra'nın kolonlarını döndürdü ve üstüne
// `workspace: StoaBoard` damgası bastı.
//
// Kök neden API'nin sorusu: `loadProjectWithAccess` "kullanıcı projenin
// alanının ÜYESİ mi" diye soruyor, "proje AKTİF alanda mı" diye değil.
// Kullanıcı Mytherra'nın sahibi olduğu için kapı açıldı. Yetkisiz birine
// sızıntı yok; sorun bağlam: yanıt başka alanın verisini bu alanınmış gibi
// etiketliyordu. Yazma araçları geldiğinde bu, kartın yanlış panoya açılması
// demek olurdu.
//
// Düzeltme API'de değil burada, çünkü kural MCP'ye özgü: tarayıcı üye olduğun
// her alanın kaydını açabilmeli (bildirimden gelen bağlantılar böyle
// çalışıyor), MCP ise yalnızca aktif alanı görür. "Aktif alanın projeleri"
// tanımı da uydurulmuyor — `GET /api/projects`in döndürdüğü liste, yani
// API'nin kendi tanımı. İkinci bir kapsam modeli doğmuyor.

/** Aktif alanın proje listesinde kimliği ara — metin/sayı farkı gözetmeden. */
export function projeyiBul(projeler, projectId) {
  if (projectId === null || projectId === undefined) return null;
  const aranan = String(projectId);
  return (Array.isArray(projeler) ? projeler : [])
    .find((p) => String(p.id) === aranan) || null;
}

/**
 * Not aktif alana mı ait?
 *
 * İki taraftan biri bilinmiyorsa HAYIR — kapalı başarısızlık. `if (not &&
 * ...)` kalıbı bu depoda üç kusurun kök sebebiydi: satır yoksa kontrol hiç
 * çalışmıyor ve sessizce geçiliyordu.
 */
export function notAlandaMi(not, workspaceId) {
  if (workspaceId === null || workspaceId === undefined) return false;
  const notAlani = not?.workspace_id;
  if (notAlani === null || notAlani === undefined) return false;
  return String(notAlani) === String(workspaceId);
}

/**
 * Yazma aracının hedeflediği alan aktif alan mı?
 *
 * Yazma araçları `workspace_id`yi zorunlu alıyor ve aktif alanla
 * karşılaştırıyor. Aktif alan tarayıcıdan bir tıkla değişiyor; model ise
 * birkaç dakika önceki alanı hatırlıyor olabilir. Uyuşmazlıkta yazma
 * yapılmıyor: kartın yanlış panoya açılması görünür kılınmıyor, **imkânsız**
 * kılınıyor (TODO, "Yazma araçlarına zorunlu workspace_id + 409").
 *
 * İki taraftan biri bilinmiyorsa HAYIR — kapalı başarısızlık.
 */
export function alanUyusuyor(istenenId, aktifAlan) {
  if (istenenId === null || istenenId === undefined) return false;
  const aktif = aktifAlan?.id;
  if (aktif === null || aktif === undefined) return false;
  return String(istenenId) === String(aktif);
}

// ─── Atama listesi ─────────────────────────────────────────────────────────

/**
 * `update_task` için yeni atama listesi: mevcut − çıkarılanlar + eklenenler.
 *
 * API atama listesini baştan yazıyor (`PATCH /tasks/:id`, `assignees`). Araç
 * tam liste alsaydı, "Umut'u da ekle" diyen bir model tek kişilik liste
 * gönderip öbür atananları sessizce silebilirdi. Bu yüzden ekle/çıkar ayrı
 * alanlar; tam liste burada, kartın mevcut atananlarının üstünde kuruluyor.
 *
 * Sıra korunur, tekrar olmaz. Aynı kişi hem ekle hem çıkar listesindeyse
 * istek çelişkili: tahmin yürütülmüyor, `celiski` dolu dönüyor ve araç
 * reddediyor.
 */
export function atamaListesi(mevcut, { ekle = [], cikar = [] } = {}) {
  const cikarKume = new Set(cikar.map(String));
  const celiski = [...new Set(ekle.map(String))].filter((s) => cikarKume.has(s));
  const liste = [];
  for (const s of [...(mevcut || []).map(String), ...ekle.map(String)]) {
    if (cikarKume.has(s) || liste.includes(s)) continue;
    liste.push(s);
  }
  return { liste, celiski };
}

// ─── Not ───────────────────────────────────────────────────────────────────

/**
 * Not özeti.
 *
 * `updated_ago` düşürülüyor. Alan `noteToDict`te `updated_at` ile **birebir
 * aynı** ISO damgayı taşıyor; adı göreli süre vaat edip mutlak değer veriyor
 * ve istemci bunu 10 Eylül'de kusur olarak bildirdi.
 *
 * Düzeltme ortak serileştiricide değil burada: ön yüz o alanı okuyup kendisi
 * göreliye çeviriyor (`drawer.jsx`, `fmtTimeAgo`). Adı orada da yanıltıcı ama
 * çalışıyor; MCP yüzeyinden çıkarmak yanlış vaadi tek hamlede kaldırıyor ve
 * arayüzü kırmıyor. Zamana ihtiyaç olduğunda `updated_at` zaten duruyor.
 */
export function notOzeti(not) {
  const { updated_ago: _atilan, ...kalan } = not;
  return { ...kalan, id: metinKimlik(not.id) };
}

// ─── Üye ───────────────────────────────────────────────────────────────────

/**
 * Üye özeti.
 *
 * `memberToDict` arayüz için yazılmış ve modele hiçbir şey söylemeyen alanlar
 * taşıyor: avatar rengi, baş harfler, fotoğraf adresi, çevrimdışı zaman aşımı.
 * Yüzeye olduğu gibi konsa her üye için yarım düzine ölü alan dönerdi.
 *
 * `id` alanının slug taşıdığına dikkat — `userToDict` böyle kuruyor ve atama,
 * üyelik, sohbet uçlarının tamamı kullanıcıyı bu slug ile adresliyor. MCP'de
 * adı açıkça `slug` konuyor: `id` demek, kimliğin sayısal olduğu diğer
 * araçlarla karışırdı.
 *
 * **İzinler `memberPermissions`ten geliyor, `role_permissions`ten değil.**
 * 0.3.0'da owner `permissions: []` dönüyordu ve model bunu "sahibin izni yok"
 * diye okudu. Sebep yine iki okuyucu, tek olgu: `memberToDict` izinleri rol
 * satırından alıyor ve owner'ın rol satırı yok; `memberPermissions` ise
 * owner'ı kısa devreyle tam yetkili sayıyor — `whoami` de onu kullanıyor.
 * Artık ikisi aynı fonksiyondan besleniyor.
 */
export function uyeOzeti(uye, { acikGorev = null } = {}) {
  const d = {
    slug: uye.id,
    name: uye.name,
    title: uye.role || '',
    ws_role: uye.ws_role || null,
    role_name: uye.role_name || null,
    permissions: memberPermissions({
      role: uye.ws_role,
      workspaceRole: { permissions: uye.role_permissions },
    }),
  };
  if (acikGorev !== null) d.open_tasks = acikGorev;
  return d;
}

// ─── Arama ─────────────────────────────────────────────────────────────────

/** Görev başlığında ya da açıklamasında arama metni geçiyor mu? */
export function aramaEslesir(gorev, sorgu) {
  const q = katla(sorgu).trim();
  if (!q) return false;
  return katla(gorev.title).includes(q) || katla(gorev.desc).includes(q);
}

// ─── İzinler ───────────────────────────────────────────────────────────────

/**
 * MCP'nin karşılığı olmayan izinler.
 *
 * `whoami` izin listesini olduğu gibi veriyor ve 10 Eylül denemesinde istemci
 * `manage_channels` / `delete_messages` görüp "sohbeti yönetebilirim"
 * beklentisine girdi. Kusur değil — sohbet bilinçli olarak kapsam dışı — ama
 * söylenmeyen sınır, modelin yanlış varsayması demektir.
 *
 * Liste araç yüzeyinden türetiliyor, elle yazılmıyor: yeni bir araç
 * geldiğinde burası kendiliğinden küçülsün, bayat bir muafiyet listesi
 * kalmasın.
 */
export function kullanilmayanIzinler(izinler, kapsanan) {
  return (izinler || []).filter((p) => !kapsanan.has(p));
}

// ─── Araç başlıkları ───────────────────────────────────────────────────────
//
// **Başlık kullanıcı metnidir, açıklama değildir.** Ayrım 10 Eylül'de ekran
// görüntüsüyle kanıtlandı: Claude'un bağlayıcı ekranı araçları `title` ile
// listeliyor — "Not detayı", "Görev detayı", "Kolonlar". Dosyanın başındaki
// eski not "buradaki metinleri kullanıcı görmüyor" diyordu ve yanlıştı;
// İngilizce arayüz kullanan biri o listeyi Türkçe görüyordu.
//
// `description` kuralın dışında kalıyor ve gerekçe korunuyor: onu gerçekten
// model okuyor, modelin cevabı da zaten kullanıcının dilinde çıkıyor. İkisini
// aynı kefeye koymak, yüzlerce satırlık yönlendirme metnini iki dilde
// sürdürmek demekti — bakım maliyeti yüksek, kazancı yok.
//
// Dil nereden okunuyor: aşağıdaki `araclarinDili`. Sözlüğe taşınmadılar
// çünkü `APP_I18N` istemci paketinde; sunucu onu görmüyor ve on dört anahtar
// için ikinci bir yükleme zinciri kurmak bu kazancın karşılığı değil. Kardeş
// alan kalıbının (`label`/`label_en`) sunucudaki karşılığı sayılır.

export const ARAC_BASLIKLARI = {
  whoami: { tr: 'Kimlik', en: 'Identity' },
  list_workspaces: { tr: 'Çalışma alanları', en: 'Workspaces' },
  list_members: { tr: 'Ekip', en: 'Team' },
  list_projects: { tr: 'Projeler', en: 'Projects' },
  list_columns: { tr: 'Kolonlar', en: 'Columns' },
  list_tasks: { tr: 'Görevler', en: 'Tasks' },
  search_tasks: { tr: 'Görev arama', en: 'Search tasks' },
  get_task: { tr: 'Görev detayı', en: 'Task detail' },
  list_notes: { tr: 'Notlar', en: 'Notes' },
  get_note: { tr: 'Not detayı', en: 'Note detail' },
  create_task: { tr: 'Görev oluştur', en: 'Create task' },
  update_task: { tr: 'Görevi düzenle', en: 'Edit task' },
  move_task: { tr: 'Görevi taşı', en: 'Move task' },
  add_comment: { tr: 'Yorum ekle', en: 'Add comment' },
};

/**
 * Araç başlıklarının dili.
 *
 * MCP `initialize` isteğinde dil alanı **yok** — protokol taşımıyor. Elde iki
 * sinyal var ve ikisi de HTTP tarafında:
 *
 * **`?lang=en`** — bağlayıcıya yapıştırılan adresin sonuna yazılıyor
 * (`https://stoaboard.com/mcp?lang=en`). Kullanıcının açıkça söylediği şey,
 * o yüzden en üstte; istemciden istemciye değişmiyor ve belgelenebiliyor.
 *
 * **`Accept-Language`** — istemci gönderirse kullanılıyor. Fırsatçı bir
 * sinyal: Claude'un bağlayıcısının bunu gönderip göndermediği doğrulanmadı,
 * gönderse de tarayıcının dili arayüzün dili olmayabilir.
 *
 * Yedek 'tr', deponun her yerindeki kuralla aynı. Çözülen dil `whoami`
 * yanıtında görünüyor: sinyal gelmediğinde bunu ancak yanıt söyleyebilir,
 * yoksa "neden hâlâ Türkçe" sorusunun cevabı hiçbir yerde olmaz.
 *
 * Yalnızca araç BAŞLIKLARINI belirliyor; veri alanlarının diline dokunmuyor
 * (kolon adı `title` İngilizce, `title_tr` Türkçe — `columnToDict`).
 */
export function araclarinDili({ sorgu, acceptLanguage } = {}) {
  const acik = String(sorgu ?? '').toLowerCase();
  if (acik.startsWith('en')) return 'en';
  if (acik.startsWith('tr')) return 'tr';
  return String(acceptLanguage ?? '').toLowerCase().startsWith('en') ? 'en' : 'tr';
}

/** Araç başlığı — bilinmeyen araçta patlamak yerine adın kendisi döner. */
export function baslik(arac, dil) {
  const kayit = ARAC_BASLIKLARI[arac];
  if (!kayit) return arac;
  return kayit[dil] || kayit.tr;
}
