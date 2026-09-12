// Ortak yorum tarayıcısının kendi testleri.
//
// NİÇİN VAR: `yardimcilar.js` artık kaynağı tarayan bütün testlerin tek
// okuyucusu. Bu iyi bir şey — "yorum nedir" sorusunun tek bir cevabı olsun
// diye toplandı — ama bedeli şu: tarayıcıdaki tek bir kör nokta artık tek bir
// testi değil, hepsini birden sessizce zayıflatır. O yüzden tarayıcının
// kendisi, bağımlılarından daha sıkı sınanmak zorunda.
//
// Aşağıdaki üç kalıp uydurma değil: tarayıcı yazılırken gerçek kaynak kümesi
// üzerinde ölçüldü ve üçü de o ölçümde yakalandı.
//   1. Tırnak taşıyan düzenli ifade — `csv.js` içindeki /[";\n\r]/ tarayıcıya
//      sahte bir dize açtırıyor, o noktadan sonraki yorumlar boşalmıyordu.
//      (server/src'te 7 yorum satırı)
//   2. JSX metnindeki Türkçe kesme işareti — `Claude'un`, `Chat'e`.
//      (client/src'te 5 yorum satırı)
//   3. Şablon dizesi içindeki `${...}` bölgesinde duran yorum — data.jsx:222.
//
// Son test bunu bir daha ölçüm işi olmaktan çıkarıyor: gerçek kaynak kümesini
// her koşuda tarıyor ve boşalmamış tek bir yorum satırı bile bırakmıyor.
// Yani bu dosyadaki iddia bayatlarsa test kırılır, belge yanlış kalmaz.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yorumsuzKaynak, kaynakDosyalari } from './yardimcilar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUNUCU = path.resolve(__dirname, '..', 'src');
const ISTEMCI = path.resolve(__dirname, '..', '..', 'client', 'src');

const satirlari = (s) => s.split('\n');

describe('yorum tarayıcısı — değişmezler', () => {
  test('satır yorumu boşalır; uzunluk ve satır sayısı korunur', () => {
    const src = 'const a = 1; // not\nconst b = 2;\n';
    const out = yorumsuzKaynak(src);
    assert.equal(out.length, src.length, 'uzunluk değişti — konum hesapları kayar');
    assert.equal(satirlari(out).length, satirlari(src).length, 'satır sayısı değişti');
    assert.equal(satirlari(out)[0].trimEnd(), 'const a = 1;', 'satır ortasındaki yorum kalmış');
    assert.ok(out.includes('const b = 2;'), 'kod silinmiş');
  });

  test('blok yorumu boşalır, satır sınırları korunur', () => {
    const src = 'const a = 1;\n/* iki\n   satır */\nconst b = 2;\n';
    const out = yorumsuzKaynak(src);
    assert.equal(out.length, src.length);
    assert.equal(satirlari(out).length, satirlari(src).length);
    assert.equal(satirlari(out)[1].trim(), '', 'blok yorumunun ilk satırı boşalmadı');
    assert.equal(satirlari(out)[2].trim(), '', 'blok yorumunun ikinci satırı boşalmadı');
    assert.ok(out.includes('const b = 2;'));
  });

  test('kapanmamış blok yorumu uzunluğu bozmuyor', () => {
    const src = 'const a = 1;\n/* bitmeyen yorum';
    const out = yorumsuzKaynak(src);
    assert.equal(out.length, src.length, 'dosya sonunda taşma var');
  });

  test('dize içeriği korunur — yorum gibi görünse bile', () => {
    const src = "const u = 'http://ornek/yol'; // not\n";
    const out = yorumsuzKaynak(src);
    assert.ok(out.includes("'http://ornek/yol'"), 'dize içindeki // silinmiş');
    assert.equal(satirlari(out)[0].trimEnd(), "const u = 'http://ornek/yol';");
  });

  // ── Ölçümle bulunan üç kör nokta ─────────────────────────────────────────

  test('tırnak taşıyan düzenli ifade dize açmıyor (csv.js kalıbı)', () => {
    const src = 'return /[";\\n\\r]/.test(g);\n// yorum\nconst b = 2;\n';
    const out = yorumsuzKaynak(src);
    assert.equal(satirlari(out)[1].trim(), '',
      'düzenli ifadedeki tırnak sahte dize açtı; sonraki yorum boşalmadı');
    assert.ok(out.includes('const b = 2;'));
  });

  test('ters tırnak taşıyan düzenli ifade dize açmıyor (notes.js kalıbı)', () => {
    const src = 'const RE = /[`>#*_~]/g;\n// yorum\nconst b = 2;\n';
    const out = yorumsuzKaynak(src);
    assert.equal(satirlari(out)[1].trim(), '',
      'düzenli ifadedeki ters tırnak sahte şablon açtı; sonraki yorum boşalmadı');
  });

  test('JSX metnindeki kesme işareti dize açmıyor', () => {
    const src = "  <div>Claude'un notu</div>\n  // yorum\n  <b>x</b>\n";
    const out = yorumsuzKaynak(src);
    assert.equal(satirlari(out)[1].trim(), '',
      'JSX metnindeki kesme işareti sahte dize açtı; sonraki yorum boşalmadı');
    assert.ok(out.includes("Claude'un notu"), 'JSX metni bozuldu');
  });

  test('şablon dizesi içindeki ${...} bölgesindeki yorum boşalır (data.jsx kalıbı)', () => {
    const src = [
      'const u = `/api/x?${new URLSearchParams({',
      '  // CSV dili dışa aktaranı izler',
      "  lang: 'tr',",
      '}).toString()}`;',
      '',
    ].join('\n');
    const out = yorumsuzKaynak(src);
    assert.equal(satirlari(out)[1].trim(), '',
      'interpolasyon içindeki yorum boşalmadı — şablon opak sanıldı');
    assert.ok(out.includes("lang: 'tr'"), 'interpolasyon içindeki kod silinmiş');
  });

  test('şablon metni olduğu gibi kalır', () => {
    const src = 'const s = `satır // değil */ ve metin`;\n';
    const out = yorumsuzKaynak(src);
    assert.equal(out, src, 'şablon metni değişti');
  });

  test('bölme işareti düzenli ifade sanılmıyor', () => {
    const src = 'const oran = a / b; // not\nconst c = 3;\n';
    const out = yorumsuzKaynak(src);
    assert.equal(satirlari(out)[0].trimEnd(), 'const oran = a / b;');
    assert.ok(out.includes('const c = 3;'));
  });
});

// ─── Gerçek kaynak kümesi ───────────────────────────────────────────────────
//
// Yukarıdaki testler tarayıcının bildiğimiz kalıplarda doğru olduğunu
// söylüyor. Bu bölüm bilmediklerimizi arıyor: depodaki her sunucu ve istemci
// dosyasını tarayıp boşalmamış yorum satırı kalmadığını doğruluyor. Yeni
// yazılan bir kaynak tarayıcıyı kör ederse burada kırılır.

describe('gerçek kaynak kümesi — tarayıcı kör nokta bırakmıyor', () => {
  const dosyalar = [
    ...kaynakDosyalari(SUNUCU, /\.js$/),
    ...kaynakDosyalari(ISTEMCI, /\.jsx?$/),
  ];

  test('tarama gerçekten dosya buluyor', () => {
    // Yürüyüş bozulursa aşağıdaki test boş kümeyle sessizce geçerdi.
    assert.ok(dosyalar.length > 50, `beklenenden az kaynak dosyası: ${dosyalar.length}`);
  });

  test('her yorum satırı boşalıyor, kod ve konumlar bozulmuyor', () => {
    const sorunlar = [];
    let bosalan = 0;

    for (const tam of dosyalar) {
      const ham = fs.readFileSync(tam, 'utf8').replace(/\r\n/g, '\n');
      const out = yorumsuzKaynak(ham);
      const rel = path.relative(path.resolve(__dirname, '..', '..'), tam).split(path.sep).join('/');

      if (out.length !== ham.length) {
        sorunlar.push(`${rel}: uzunluk değişti (konum hesapları kayar)`);
      }
      const a = satirlari(ham);
      const b = satirlari(out);
      if (a.length !== b.length) {
        sorunlar.push(`${rel}: satır sayısı değişti (satır numaraları kayar)`);
        continue;
      }
      for (let i = 0; i < a.length; i += 1) {
        if (!a[i].trim().startsWith('//')) continue;
        if (b[i].trim() === '') bosalan += 1;
        else sorunlar.push(`${rel}:${i + 1} yorum boşalmadı — tarayıcı desenkron`);
      }
    }

    // Tarayıcı hiçbir şey yapmasa da üstteki döngü sessizce geçerdi.
    assert.ok(bosalan > 200, `tarayıcı beklenenden az yorum boşalttı: ${bosalan}`);
    assert.deepEqual(
      sorunlar, [],
      'Tarayıcı bu satırlarda kör kaldı. Yeni bir dil kalıbı (düzenli ifade, '
      + 'şablon, JSX metni) tarayıcıyı desenkron ediyor olabilir; yardimcilar.js '
      + 'içindeki karakter tarayıcısına o kalıp öğretilmeli.',
    );
  });
});
