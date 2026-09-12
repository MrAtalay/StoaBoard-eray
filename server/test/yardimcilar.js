// Kaynağı tarayan testlerin ortak yardımcıları.
//
// NİÇİN VAR: Bu depoda kaynak metnini okuyup desen arayan bir düzine test var
// ve 12 Eylül 2026'ya kadar "yorum nedir" sorusunun ÜÇ ayrı cevabı vardı:
//
//   1. `satir.trim().startsWith('//')`              — dil, yetki, guvenlik
//   2. `.replace(/\/\*[\s\S]*?\*\//g, '')` + satır  — mcp, guvenlik, global
//   3. dil.test.js içindeki karakter tarayıcı       — yalnızca tek yerde
//
// Bu, CLAUDE.md'de adı konmuş kusur sınıfının ta kendisi: **aynı olgunun
// birden çok okuyucusu**. Üçü de farklı şeyi kaçırıyordu. (1) satır ortasında
// başlayan yorumu ve blok yorumunun içini göremiyor; (2) yorum satırlarını
// SİLDİĞİ için satır numaralarını kaydırıyor, dolayısıyla `dosya:satır`
// bildiren taramalarda kullanılamıyor; (3) doğru yaklaşımdı ama tek bir
// dosyada hapisti ve iki kör noktası vardı (aşağıda).
//
// Niçin önemli: kaynağı tarayan bir test, yorumu kod sanarsa İKİ YÖNDE de
// yanılır. 11 Eylül'de bir tarama, kuralı ANLATAN yorumu kod sanıp ihlali
// örttü; aynı gün başka bir tarama, blok yorumundaki eski kod alıntısını
// gerçek kod sanıp OLMAYAN bir ihlal uydurdu. Tuzağın ironisi kayda değer:
// kuralı açıklayan yorum, kuralın ihlalini gizliyor.
//
// ÖLÇÜLDÜ, VARSAYILMADI: bu dosya yazılırken mevcut karakter tarayıcısı
// gerçek kaynak kümesine karşı koşuldu. `server/src` içinde 7, `client/src`
// içinde 9 yorum satırını BOŞALTAMIYORDU — yani dil taraması bugün de kör bir
// tarayıcıyla çalışıyordu, yalnızca henüz yanlış bir sonuca yol açmamıştı.
// Aşağıdaki üç mekanizma o ölçümle eklendi; şu an iki ağaçta da sayı sıfır.
// `yardimcilar.test.js` bunu her koşuda yeniden ölçer, yani bu paragraf
// bayatlarsa test kırılır.

import fs from 'node:fs';
import path from 'node:path';

// Bir `/` bölme işareti mi, düzenli ifade başlangıcı mı? Soldaki son anlamlı
// belirteç karar veriyor. Gerekliydi: `csv.js` içindeki `/[";\n\r]/` ve
// `notes.js` içindeki /[`>#*_~\[\]]/g düzenli ifadeleri tırnak karakteri
// taşıyor. Tarayıcı bunları kod sayıp içlerindeki tırnağı "dize başlıyor"
// diye okuyunca, o noktadan sonraki yorumlar hiç boşalmıyordu.
//
// `<` ve `>` bilerek listede DEĞİL: JSX'te `</div>` kalıbı `<`'ten hemen sonra
// bir `/` getiriyor ve bu küme onu düzenli ifade başlangıcı sanardı.
const REGEX_ONCESI_NOKTALAMA = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~',
]);
const REGEX_ONCESI_KELIME = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await',
]);

function regexOlabilir(out) {
  const kirpik = out.replace(/\s+$/, '');
  if (kirpik === '') return true;
  const son = kirpik[kirpik.length - 1];
  if (REGEX_ONCESI_NOKTALAMA.has(son)) return true;
  if (/[A-Za-z0-9_$]/.test(son)) {
    const kelime = (kirpik.match(/[A-Za-z0-9_$]+$/) || [''])[0];
    return REGEX_ONCESI_KELIME.has(kelime);
  }
  return false;
}

// Kapanış tırnağı aynı satırda mı? JS'te tek ve çift tırnaklı dize ham satır
// sonu taşıyamaz; taşıyor görünüyorsa o tırnak dize açmıyordur.
//
// Gerekliydi: JSX metnindeki Türkçe kesme işareti (`Claude'un`, `Chat'e`)
// tarayıcıya sahte bir dize açtırıyor ve dizenin "kapandığı" yere kadar olan
// bütün yorumlar boşalmadan kalıyordu.
function ayniSatirdaKapanis(src, i, tirnak) {
  let j = i + 1;
  while (j < src.length) {
    const d = src[j];
    if (d === '\\') { j += 2; continue; }
    if (d === '\n') return -1;
    if (d === tirnak) return j;
    j += 1;
  }
  return -1;
}

/**
 * Yorumları boşlukla değiştirir.
 *
 * İki değişmezi korur, ikisi de çağrı yerleri için kritik:
 *   - UZUNLUK: çıktı girdiyle aynı uzunlukta. `src.indexOf(...)` ve
 *     `m.index` ile hesaplanan konumlar geçerli kalır.
 *   - SATIR: satır sayısı ve satır sınırları aynı. `dosya:satır` bildiren
 *     taramalar doğru numarayı verir.
 *
 * Dize içerikleri olduğu gibi kalır; yalnızca yorum karakterleri boşluğa
 * döner. Şablon dizesindeki `${...}` bölgesi kod sayılır — oradaki yorum da
 * boşalır (data.jsx:222 bu yüzden görülmüyordu).
 */
export function yorumsuzKaynak(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // Yığın: 'sablon' = şablon dizesinin metin kısmı, sayı = `${...}` içindeki
  // açık süslü parantez derinliği. Yığın boşsa sıradan kod bölgesindeyiz.
  const yigin = [];
  const sablonda = () => yigin.length > 0 && yigin[yigin.length - 1] === 'sablon';

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (sablonda()) {
      if (c === '\\') { out += c; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
      if (c === '`') { out += c; i += 1; yigin.pop(); continue; }
      if (c === '$' && c2 === '{') { out += '${'; i += 2; yigin.push(0); continue; }
      out += c; i += 1; continue;
    }

    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '; i += 1;
      }
      // Kapanış `*/` de boşluğa döner. Yorum kapanmadan dosya bitmişse
      // kalan kadar boşluk yazılır — uzunluk değişmezi korunsun diye.
      const kalan = Math.min(2, n - i);
      out += ' '.repeat(kalan);
      i += 2;
      continue;
    }
    if (c === '`') { out += c; i += 1; yigin.push('sablon'); continue; }
    if (c === '"' || c === "'") {
      if (ayniSatirdaKapanis(src, i, c) === -1) { out += c; i += 1; continue; }
      out += c; i += 1;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { out += src[i]; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
        out += src[i]; i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
      continue;
    }
    if (c === '/' && regexOlabilir(out)) {
      out += c; i += 1;
      let sinif = false;
      while (i < n && src[i] !== '\n') {
        const d = src[i];
        if (d === '\\') { out += d; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
        if (d === '[') sinif = true;
        else if (d === ']') sinif = false;
        else if (d === '/' && !sinif) { out += d; i += 1; break; }
        out += d; i += 1;
      }
      continue;
    }
    // `${...}` içindeyken süslü parantez derinliği izleniyor; kapanan parantez
    // interpolasyonu bitirip şablon metnine döndürür.
    const tepe = yigin.length > 0 ? yigin[yigin.length - 1] : null;
    if (typeof tepe === 'number') {
      if (c === '{') { yigin[yigin.length - 1] = tepe + 1; out += c; i += 1; continue; }
      if (c === '}') {
        if (tepe === 0) yigin.pop();
        else yigin[yigin.length - 1] = tepe - 1;
        out += c; i += 1; continue;
      }
    }
    out += c; i += 1;
  }
  return out;
}

/**
 * Dosyayı okur, satır sonunu normalize eder ve yorumları boşaltır.
 * Satır sonu normalizasyonu bilinçli: çok satırlı çapa dizeleri
 * ("router.post(\n  '/',") CRLF'li bir çalışma kopyasında eşleşmiyordu.
 */
export function yorumsuzDosya(yol) {
  return yorumsuzKaynak(fs.readFileSync(yol, 'utf8').replace(/\r\n/g, '\n'));
}

/** Dizin ağacındaki kaynak dosyaları — desen `/\.jsx?$/` gibi. */
export function kaynakDosyalari(dizin, desen) {
  const out = [];
  for (const ad of fs.readdirSync(dizin)) {
    const tam = path.join(dizin, ad);
    if (fs.statSync(tam).isDirectory()) out.push(...kaynakDosyalari(tam, desen));
    else if (desen.test(ad)) out.push(tam);
  }
  return out;
}
