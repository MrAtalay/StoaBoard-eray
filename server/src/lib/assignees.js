// Görev atamasının denetimi — saf mantık, veritabanısız.
//
// ── Kusur (11 Eylül 2026) ─────────────────────────────────────────────────
//
// `POST /projects/:id/tasks` ve `PATCH /tasks/:id` atanacak kişiyi yalnızca
// slug'ıyla arıyordu (`user.findUnique({ where: { slug } })`); alan üyeliğine
// hiç bakılmıyordu. `manage_tasks` izni olan herhangi bir üye, platformdaki
// HERHANGİ bir kullanıcıyı karta atayabiliyordu ve o kişiye görev başlığını
// taşıyan bildirim gidiyordu: başka bir şirketin kullanıcısına bildirim atmak
// ve görev başlığını sızdırmak mümkündü. MCP'ye yazma araçları gelince aynı
// kapı Claude'un eline de geçerdi.
//
// ── Kural ─────────────────────────────────────────────────────────────────
//
// Yeni eklenen atanan, kartın alanının üyesi olmalı; değilse istek 400 ile
// reddedilir. Sessizce atlanmaz: sessiz atlama bu depoda üç kusurun kök
// sebebiydi ve istemci "atadım" sanırdı.
//
// İki bilinçli istisna:
//
// **Zaten atanmış kişi korunur**, alandan çıkarılmış olsa bile. Üye
// çıkarılınca atamaları silinmiyor ve bu bir ürün kararı (`f789c37`:
// "çıkarılan kişinin adı kartlarda kalır"). Arayüz atama listesinin tamamını
// geri gönderiyor (`drawer.jsx`, `patchTask({ assignees: next })`); kaba bir
// "üye değilse reddet" kuralı o kartları düzenlenemez hâle getirirdi.
//
// **Platformda olmayan slug da aynı biçimde reddedilir.** Önceden sessizce
// atlanıyordu. Üye olmayan için 400, olmayan için 201 dönseydik yanıt bir
// kahin olurdu: "bu slug platformda var" bilgisi başka şirketlerin
// kullanıcılarını yoklamaya yarardı (GUVENLIK.md soru 8).
//
// Bu dosya `prisma` görmez; sorgular `routes/tasks.js` içindeki
// `atamalariCoz`ta, karar burada. Sebep test: `guvenlik.test.js` kararı
// veritabanı olmadan sınıyor.

/**
 * İstenen atama listesini denetler.
 *
 * @param {object} p
 * @param {string[]} p.istenen                         istemcinin gönderdiği slug'lar
 * @param {{id: number, slug: string}[]} p.kullanicilar slug'ı çözülebilen kullanıcılar
 * @param {Set<number>} p.uyeIdleri                      kartın alanına üye olanlar
 * @param {Set<number>} [p.mevcutIdler]                  kartta zaten atanmış olanlar
 * @returns {{ gecerli: {id: number, slug: string}[], reddedilen: string[] }}
 */
export function atananlariDenetle({ istenen, kullanicilar, uyeIdleri, mevcutIdler = new Set() }) {
  const slugla = new Map((kullanicilar || []).map((k) => [k.slug, k]));
  const gecerli = [];
  const reddedilen = [];
  const gorulen = new Set();
  for (const ham of istenen || []) {
    const slug = String(ham);
    if (gorulen.has(slug)) continue;
    gorulen.add(slug);
    const k = slugla.get(slug);
    // Kullanıcı yoksa da üye değilse de aynı dal — ikisi ayırt edilemesin.
    if (k && (mevcutIdler.has(k.id) || uyeIdleri.has(k.id))) gecerli.push(k);
    else reddedilen.push(slug);
  }
  return { gecerli, reddedilen };
}

/**
 * İstemcinin gönderdiği atama alanını slug listesine indirger.
 *
 * Dizi olmayan girdi atama sayılmıyor: oluşturma ucu eskiden
 * `for (... of data.assignees || [])` ile dolaşıyordu ve düz bir metin
 * gelince harflerini tek tek slug diye arıyordu. Tekrarlar elenir; değerler
 * metne çevrilir ki sayı ya da nesne gelirse sessizce düşmesin, "bulunamadı"
 * dalından reddedilsin.
 */
export function atamaSluglari(girdi) {
  if (!Array.isArray(girdi)) return [];
  return [...new Set(girdi.map(String))];
}
