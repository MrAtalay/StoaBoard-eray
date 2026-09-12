// İstemci global testi — okunan ama hiç atanmayan `window.*` var mı?
//
// Neden var: 1 Eylül 2026'da bekleme lobisi `window.io` okuyordu. O global
// yalnızca Vite öncesi CDN kurulumunda vardı; modül importuna geçildikten
// sonra hep undefined kaldı. Kod `if (!window.io) return;` diyerek sessizce
// çıkıyordu, yani davet kodunu giren kullanıcıya onay hiç ulaşmıyordu ve lobi
// sonsuza kadar bekliyordu. Canlı bir müşteri toplantısında ortaya çıktı.
//
// Aynı taramayı elle yaptığımızda iki kusur daha çıktı:
//   window.showToast        — bütün bildirimler sessizce yutuluyordu
//   window._parseServerDate — sohbette saat ve gün ayracı bozuluyordu
//
// Üçü de aynı kök sebep: Vite geçişinde globaller modül export'una döndü,
// çağrı yerleri güncellenmedi, ve `?.` ile erken `return` hatayı yuttu.
//
// Bu test o sınıfı kapatır: deneyimle bulunan bir kusuru, bir daha
// deneyim gerektirmeyecek bir kurala çevirir.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yorumsuzKaynak } from './yardimcilar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', '..', 'client', 'src');

/**
 * Atanması beklenmeyen globaller.
 *   - Tarayıcının kendi API'leri
 *   - Üçüncü taraf betiklerin sağladıkları (Google Sign-In)
 *   - Sunucunun sayfaya gömdüğü, yokluğu tolere edilen değerler
 * Buraya ekleme yaparken sebebini yaz.
 */
const BEKLENEN_DISARIDAN = new Set([
  // tarayıcı
  'location', 'navigator', 'document', 'history', 'localStorage', 'sessionStorage',
  'innerWidth', 'innerHeight', 'scrollX', 'scrollY', 'pageYOffset', 'visualViewport',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'CustomEvent',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'getComputedStyle', 'matchMedia', 'scrollTo', 'open', 'print', 'focus',
  'alert', 'confirm', 'prompt', 'crypto', 'Notification', 'top', 'self', 'parent',
  'AudioContext', 'webkitAudioContext', 'URL', 'Blob', 'FormData', 'fetch',
  // üçüncü taraf
  'google',            // Google Sign-In betiği (index.html)
  // sunucudan gömülen, opsiyonel
  '__TWEAKS__',        // yoksa {} varsayılıyor — bilinçli
]);

function kaynakDosyalari(dir) {
  const out = [];
  for (const ad of fs.readdirSync(dir)) {
    const tam = path.join(dir, ad);
    const st = fs.statSync(tam);
    if (st.isDirectory()) out.push(...kaynakDosyalari(tam));
    else if (/\.(jsx?|tsx?)$/.test(ad)) out.push(tam);
  }
  return out;
}

test('okunan her window.* globali bir yerde atanmış olmalı', () => {
  const dosyalar = kaynakDosyalari(SRC);
  assert.ok(dosyalar.length > 0, 'istemci kaynak dosyası bulunamadı');

  const tumKaynak = dosyalar
    .map((f) => yorumsuzKaynak(fs.readFileSync(f, 'utf8')))
    .join('\n');

  const okunanlar = new Set(
    [...tumKaynak.matchAll(/window\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
  );

  const atanmayanlar = [];
  for (const ad of okunanlar) {
    if (BEKLENEN_DISARIDAN.has(ad)) continue;
    const atamaVar = new RegExp(`window\\.${ad}\\s*=[^=]`).test(tumKaynak);
    if (!atamaVar) atanmayanlar.push(ad);
  }

  assert.deepEqual(
    atanmayanlar.sort(), [],
    'Bu globaller okunuyor ama hiçbir yerde atanmıyor. Ya modülden içe aktarın, ' +
    'ya window\'a bağlayın, ya da gerçekten dışarıdan geliyorsa ' +
    'BEKLENEN_DISARIDAN listesine sebebiyle ekleyin. Sessizce undefined kalan ' +
    'bir global, kodun o dalını hiç çalışmadan atlatır.',
  );
});
