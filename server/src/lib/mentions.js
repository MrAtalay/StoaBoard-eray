// Kart yorumundaki `@bahsetme` — kimin bildirim alacağına saf karar.
//
// ── Kusur (12 Eylül 2026) ─────────────────────────────────────────────────
//
// `POST /tasks/:id/comments` bahsedilen kişiyi şöyle arıyordu:
//
//   prisma.user.findFirst({ where: { name: { startsWith: fname, mode: 'insensitive' } } })
//
// Yani **bütün platformda**, alan üyeliğine bakmadan, ve ilk eşleşene
// bildirimi gönderiyordu. "@Ali" yazan bir üye, başka bir şirketteki adı Ali
// ile başlayan birine yorumun ilk 80 karakterini bildirim olarak
// gönderebiliyordu. Atama açığıyla (DEVIR 0-G) aynı sınıf: kapsamı
// daraltmayan bir arama. Sohbet tarafındaki bahsetme 2 Eylül'de
// `mentionAllowed` ile kapatılmıştı; kart yorumu o turun dışında kalmış.
//
// ── Kural ─────────────────────────────────────────────────────────────────
//
// Bahsedilen kişi **kartın çalışma alanının üyeleri** arasında aranır. Arama
// anlamı korunuyor (ad öneki, büyük/küçük harf ayrımsız), yalnızca havuz
// daralıyor: üye olmayan hiçbir koşulda bildirim almaz.
//
// **Belirsizlik sessizce çözülmez.** Önek birden fazla üyeye uyuyorsa
// (“@Efe” → Efe Kapan, Efe Yıldız) kimseye bildirim gitmez: yanlış kişiye
// göndermek, hiç göndermemekten kötü. Çağıran taraf bunu günlüğe yazar —
// koşulun yokluk hâli ya reddetmeli ya gürültü çıkarmalı (CLAUDE.md).
//
// Yorumun kendisi her durumda kaydedilir: bahsetme çözülemedi diye bir
// kullanıcının yazdığı yorumu reddetmek orantısız olurdu.

/**
 * Ad karşılaştırması için harf katlama.
 *
 * `toLowerCase()` tek başına yetmiyor: Türkçe'de I/ı ve İ/i ayrı çiftler ve
 * JavaScript varsayılan olarak İngilizce kuralını uyguluyor. Aramada dörtlü
 * nokta ayrımı bilinçli olarak siliniyor — "@ilker" ile "İlker" eşleşmeli.
 * `mcpShape.js`teki `katla` ile aynı karar, ayrı yüzey.
 */
export function adKatla(metin) {
  return String(metin ?? '')
    .replace(/[İIı]/g, 'i')
    .toLocaleLowerCase('tr');
}

/**
 * Bahsedilen adları alan üyeleriyle eşleştirir.
 *
 * @param {string[]} bahsedilenler  metinden çıkarılan adlar (`@` olmadan)
 * @param {{id: number, name: string}[]} uyeler  kartın alanının üyeleri
 * @returns {{
 *   eslesen: {id: number, name: string}[],
 *   belirsiz: {ad: string, adaylar: string[]}[],
 *   bulunamayan: string[],
 * }}
 *
 * Aynı kişi iki kez bahsedilse bile bir kez döner: bildirim tekrarı istemci
 * tarafında değil burada elenir.
 */
export function bahsedilenleriCoz(bahsedilenler, uyeler) {
  const havuz = (uyeler || []).filter((u) => u && u.id !== undefined && u.name);
  const eslesen = [];
  const belirsiz = [];
  const bulunamayan = [];
  const gorulenAd = new Set();
  const gorulenId = new Set();

  for (const ham of bahsedilenler || []) {
    const ad = String(ham);
    const anahtar = adKatla(ad);
    if (!anahtar || gorulenAd.has(anahtar)) continue;
    gorulenAd.add(anahtar);

    const adaylar = havuz.filter((u) => adKatla(u.name).startsWith(anahtar));
    if (adaylar.length === 0) {
      bulunamayan.push(ad);
      continue;
    }
    if (adaylar.length > 1) {
      // Tam ad birebir uyuyorsa belirsizlik yok: "@Efe" iki kişiye uyarken
      // "@Efe Kapan" değil. Ad tek parça geldiği için bu ancak adın tamamı
      // yazıldığında olur.
      const tam = adaylar.filter((u) => adKatla(u.name) === anahtar);
      if (tam.length !== 1) {
        belirsiz.push({ ad, adaylar: adaylar.map((u) => u.name) });
        continue;
      }
      adaylar.length = 0;
      adaylar.push(tam[0]);
    }
    const kisi = adaylar[0];
    if (gorulenId.has(kisi.id)) continue;
    gorulenId.add(kisi.id);
    eslesen.push(kisi);
  }

  return { eslesen, belirsiz, bulunamayan };
}
