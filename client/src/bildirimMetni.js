// Bildirim ve etkinlik metinlerinin saf çekirdeği.
//
// NİÇİN AYRI DOSYA: bu fonksiyonların çıktısı `dangerouslySetInnerHTML` ile
// basılıyor (`notifications.jsx`, `views/dashboard.jsx`), yani doğrudan HTML
// olarak yorumlanıyor. React'e ve `window`a bağlı olmadıkları için buraya
// alındılar; böylece `server/test/guvenlik.test.js` gerçek fonksiyonu içe
// aktarıp sınayabiliyor — kaynağı tarayarak değil, davranışı çalıştırarak.
//
// KUSUR (12 Eylül 2026): şablonlar HTML taşıyor (`<strong>{who}</strong>`) ve
// değerler kaçışsız yerleştiriliyordu:
//
//     tpl.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '')
//
// Değerlerin hepsi kullanıcı girdisi: `preview` doğrudan sohbet mesajından
// (`text.slice(0, 80)`), `title` kart başlığından, `who` kullanıcı adından,
// `channel` ve `workspace` takım/kanal adından. Yani sıradan bir DM'e ya da
// kart başlığına yazılan `<img src=x onerror=…>` alıcının tarayıcısında
// çalışıyordu — **saklı XSS**, üstelik hedef seçilebiliyordu.
//
// Ham metin dalı daha da açıktı: JSON olarak çözülemeyen ya da sözlükte
// karşılığı olmayan gövde hiç dokunulmadan HTML olarak basılıyordu. Serbest
// metin kabul eden `POST /api/notifications` ucu tam olarak bu dala düşüyor.
//
// KURAL: şablonun kendi etiketleri bizim ve sabittir; **içeri giren her değer
// kaçışlanır.** Kaçışı sunucuda yapmak yanlış olurdu — metin depoda duruyor ve
// başka tüketicileri var (e-posta kendi düz-metin temizliğini yapıyor).
// Tehlike HTML olarak yorumlandığı yerde doğuyor, düzeltme de orada.

const KACIS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const COZUM = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** HTML'e girecek her değer buradan geçer. `&` ilk sırada olmalı. */
export function htmlKacir(deger) {
  return String(deger ?? '').replace(/[&<>"']/g, (c) => KACIS[c]);
}

/**
 * Kaçışı geri çözer — yalnızca DÜZ METİN bağlamları için (toast gibi).
 * HTML'e geri yazmak için kullanılmaz.
 */
export function htmlCoz(metin) {
  return String(metin ?? '').replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => COZUM[m]);
}

/** Şablondaki `{alan}` yer tutucularını KAÇIŞLI değerlerle doldurur. */
export function sablonDoldur(tpl, params) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => htmlKacir(params?.[k] ?? ''));
}

function coz(raw) {
  try {
    const d = JSON.parse(raw);
    return d && typeof d === 'object' && d.type ? d : null;
  } catch (_) {
    return null;
  }
}

/**
 * Bildirim gövdesini HTML'e çevirir. `ceviri` bir anahtarı şablona çeviren
 * fonksiyon (uygulamada `window.t`); parametre olarak alınıyor ki bu modül
 * saf kalsın ve test edilebilsin.
 */
export function bildirimMetni(raw, ceviri) {
  const d = coz(raw);
  if (d) {
    const tpl = ceviri?.('notif_' + d.type);
    if (tpl) return sablonDoldur(tpl, d);
  }
  // Çevrilemeyen gövde de kaçışlanır. Eskiden burası `return raw` idi ve
  // serbest metin doğrudan HTML olarak basılıyordu.
  return htmlKacir(raw);
}

/** Etkinlik akışı için aynısı — `activity_` önekli anahtarlarla. */
export function etkinlikMetni(raw, ceviri) {
  const d = coz(raw);
  if (d) {
    const tpl = ceviri?.('activity_' + d.type);
    if (tpl) return sablonDoldur(tpl, d);
  }
  return htmlKacir(raw);
}
