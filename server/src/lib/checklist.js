// Alt görev ve ilerleme — tek kaynak, tek üretici.
//
// ── Neden bu dosya var ────────────────────────────────────────────────────
//
// 13 Eylül 2026'ya kadar bir kartın yapılacaklar listesi İKİ yerde
// yaşayabiliyordu. Kart açma penceresi ve MCP `subtasks` tablosuna yazıyordu;
// çekmecedeki "Yapılacaklar" bölümü ise listeyi `task.doc` içindeki bir
// `checklist` bloğuna yazıp ilerlemeyi istemcide kendisi hesaplıyordu. `doc`
// bir kez saklanınca çekmece yalnızca onu okuyordu. Ölçüldüğünde iki kaynağı
// birden taşıyan 5 kartın 3'ü birbirinden ayrışmıştı: #19'da tablo "yapılmadı",
// `doc` "yapıldı", ilerleme %100 diyordu. MCP'nin 0.5.0 alt görev araçları
// da çekmecenin göstermediği satırlar yazabiliyordu.
//
// Karar: tek kaynak `subtasks` tablosu (kimliği, yetki kapısı ve MCP zaten
// orada). `doc` artık kontrol listesi taşımıyor — sunucu öyle bir yazımı
// reddediyor, eskileri `scripts/altgorev-gocu.js` bir kez taşıdı.
//
// İlerleme de aynı turda tek üreticiye indi. Eskiden üç ayrı yerde, üç ayrı
// kuralla hesaplanıyordu (çekmece, alt görev ucu, kolon taşıma) ve alt görev
// kalmayınca son değerde donuyordu. Kural artık yalnızca `ilerlemeHesapla`.
//
// Dosya saf: veritabanı istemiyor, testi ve göç betiği aynı işlevleri
// kullanıyor.

/** Serileştiricinin eskiden listenin önüne koyduğu başlıklar. */
const URETILMIS_BASLIKLAR = new Set(['Alt görevler', 'Subtasks']);

/**
 * Kartın ilerleme yüzdesi. Tek kural, tek yer.
 *
 * - **Bitmiş kolondaki kart 100.** Kolon kartın gerçek durumu; 10 Eylül'deki
 *   ölçümde ilerlemenin kolondan kopması ("pano yapılacak diyor, kart %100
 *   diyor") asıl şikâyetti. Kartı bitmiş kolona almak bugün de 100 yapıyordu;
 *   o kolonda alt görev işaretlemek ise oranı yazıyordu — iki kural çelişiyordu.
 * - **Değilse tamamlanan alt görev oranı.**
 * - **Alt görev yoksa 0.** Eskiden hiçbir şey yazılmıyor ve eski değer
 *   kalıyordu; son alt görevi silinen kart `doing` kolonunda %100 gösteriyordu
 *   (13 Eylül, #114). Kaynağı olmayan bir sayıyı korumak, sıfırlamaktan daha az
 *   dürüst.
 *
 * `kolonBitti` bilinmiyorsa (kolonsuz kart, NULL `is_done`) bitmemiş sayılır.
 */
export function ilerlemeHesapla({ altlar, kolonBitti }) {
  if (kolonBitti === true) return 100;
  const liste = Array.isArray(altlar) ? altlar : [];
  if (!liste.length) return 0;
  const biten = liste.filter((s) => s?.done === true).length;
  return Math.round((biten / liste.length) * 100);
}

/** `doc` kontrol listesi bloğu taşıyor mu? Taşıyorsa ikinci bir kaynak demek. */
export function docKontrolListesiVarMi(doc) {
  return Array.isArray(doc) && doc.some((b) => b?.kind === 'checklist');
}

/**
 * `doc`taki bütün kontrol listesi maddeleri, sırasıyla.
 *
 * Maddeler iki biçimde saklanmış: çekmecenin yazdığı `{ text, done }` ve
 * serileştiricinin ürettiği `{ id, text, done }`. Eski bir sürümün düz metin
 * maddesi de çekmecede okunuyordu (`typeof it === 'string'`), o da kabul.
 * Metni boş madde atlanıyor: tabloya boş başlıklı satır yazılmasın.
 */
export function kontrolListesiMaddeleri(doc) {
  if (!Array.isArray(doc)) return [];
  const maddeler = [];
  for (const blok of doc) {
    if (blok?.kind !== 'checklist' || !Array.isArray(blok.items)) continue;
    for (const it of blok.items) {
      const metin = (typeof it === 'string' ? it : it?.text ?? '').trim();
      if (!metin) continue;
      maddeler.push({
        text: metin,
        done: typeof it === 'object' && it !== null && it.done === true,
        id: typeof it === 'object' && it !== null && it.id != null ? Number(it.id) : null,
      });
    }
  }
  return maddeler;
}

/**
 * Kontrol listesi bloklarını ve hemen önlerindeki üretilmiş başlığı çıkarır.
 *
 * Başlık yalnızca bir listenin HEMEN önündeyse ve serileştiricinin koyduğu
 * metinse gidiyor; kullanıcının kendi yazdığı "Alt görevler" başlığı, altında
 * liste yoksa yerinde kalır.
 */
export function docKontrolListesiz(doc) {
  if (!Array.isArray(doc)) return doc;
  return doc.filter((b, i) => {
    if (b?.kind === 'checklist') return false;
    const sonraki = doc[i + 1];
    const baslik = b?.kind === 'h2' || b?.kind === 'h3';
    return !(baslik && URETILMIS_BASLIKLAR.has(b.text) && sonraki?.kind === 'checklist');
  });
}

/** Eşleştirme anahtarı: kırpılmış, Türkçe küçültülmüş, iç boşluğu sıkıştırılmış. */
function anahtar(metin) {
  return String(metin ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
}

/**
 * `doc` maddelerini `subtasks` satırlarına katmanın planı — göçün saf çekirdeği.
 *
 * Eşleştirme önce maddenin taşıdığı kimlikle, sonra METİNLE. Bir satır en fazla
 * bir maddeyle eşleşir; aynı metin iki kez geçiyorsa sırayla eşleşirler (#18:
 * iki ayrı "asdasd").
 *
 * **Eşleşen maddede `done` DOC'tan alınır.** `doc` saklıyken çekmece yalnızca
 * onu gösteriyordu: kullanıcının son gördüğü ve dokunduğu değer o. Tablodaki
 * değer ise o andan sonra hiçbir arayüzde görünmeyen, bayat kopyaydı (#19).
 *
 * Eşleşmeyen madde yeni satır olur. **Doc'ta olmayan tablo satırı silinmez:**
 * pencereyle ya da MCP ile açılmıştı ve panodaki kartın "x/y" sayısında
 * görünüyordu. Göç veri kaybettirmez, yalnızca birleştirir.
 */
export function kontrolListesiBirlestir({ docMaddeler, altlar }) {
  const satirlar = Array.isArray(altlar) ? altlar : [];
  const kullanilan = new Set();
  const guncelle = [];
  const ekle = [];

  for (const m of docMaddeler || []) {
    let eslesen = null;
    if (m.id != null) {
      eslesen = satirlar.find((s) => Number(s.id) === m.id && !kullanilan.has(s.id)) || null;
    }
    if (!eslesen) {
      eslesen = satirlar.find((s) => !kullanilan.has(s.id) && anahtar(s.title) === anahtar(m.text)) || null;
    }
    if (eslesen) {
      kullanilan.add(eslesen.id);
      if (Boolean(eslesen.done) !== m.done) guncelle.push({ id: eslesen.id, done: m.done });
    } else {
      ekle.push({ title: m.text, done: m.done });
    }
  }
  return { guncelle, ekle };
}
