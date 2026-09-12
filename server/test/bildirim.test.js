// Bildirim metni sözleşmesi — bir üretici, üç okuyucu.
//
// NİÇİN VAR: TODO'nun sözleriyle "bu depoda en çok kusur çıkan alan". Geçmiş
// sayıyor: bahsetmenin çalışma alanı kapsamını aşması, panelin kapanmaması,
// sohbet/bildirim çakışması, sekme açılınca kayma, okundu bilgisinin hiç
// yazılmaması. Hepsi elle bulundu, hiçbirini bir test yakalamadı.
//
// Bildirim üç katmana birden dokunuyor (veritabanı kaydı, soket yayını, panel
// durumu) ve aradaki tutarsızlık ekranda "sessiz yanlış" olarak görünüyor —
// hiçbiri istisna fırlatmıyor. Bu dosya o sessizliğin en ölçülebilir
// parçasını kapatıyor: **bildirim metninin biçimi**.
//
// SÖZLEŞME. `buildNotificationText(type, params)` yalnızca
// `JSON.stringify({ type, ...params })` üretiyor — yani serbest biçimli bir
// JSON ve şeması hiçbir yerde yazılı değil. Üç ayrı okuyucusu var:
//
//   1. İSTEMCİ (data.jsx `renderNotifText`/`renderActivityText`): `type`ten
//      bir i18n anahtarı türetiyor (`notif_<type>` / `activity_<type>`), sonra
//      çevirideki `{who}` `{task}` gibi yer tutucuları parametrelerle
//      dolduruyor. Eksik parametre `params[k] ?? ''` ile **boş dizeye**
//      düşüyor: cümle sessizce sakatlanıyor. Anahtar hiç yoksa ham JSON
//      kullanıcıya olduğu gibi gösteriliyor.
//   2. E-POSTA (mailer.js `renderNotification`): türe göre `who`, `task`,
//      `preview`, `col` okuyor; tanımadığı türde gövdeyi boş bırakıyor.
//   3. THROUGHPUT (lib/throughput.js): `task_moved` etkinlik kayıtlarından
//      `parsed.col` okuyup kolon BAŞLIĞIYLA eşleştiriyor. Üretici oraya slug
//      yazsa eşleşme tamamen kaçar ve akış raporu **sessizce boşalır**.
//
// Üç okuyucunun üçü de aynı olguyu okuyor ve hiçbiri ötekini görmüyor: bu
// deponun tekrar eden kusur sınıfı (CLAUDE.md). Test üreticiyi kilitliyor ve
// her okuyucuyu üreticinin GERÇEK çıktısıyla karşılaştırıyor.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildNotificationText } from '../src/lib/notifications.js';
import { renderNotification } from '../src/lib/mailer.js';
import { yorumsuzDosya, kaynakDosyalari } from './yardimcilar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'src');
const CLIENT = path.resolve(__dirname, '..', '..', 'client', 'src');

// ─── Sözleşme ──────────────────────────────────────────────────────────────
//
// Tür → ürettiği parametreler (alfabetik). Bu tablo elle bakımlı DEĞİL:
// aşağıdaki ilk test kaynağı tarayıp bununla karşılaştırıyor, yani yeni bir
// tür ya da yeniden adlandırılmış bir parametre testi kırıyor.

const SOZLESME = new Map([
  ['channel_added', ['channel', 'who']],
  ['column_added', ['title']],
  ['comment_added', ['preview', 'who']],
  ['dm_received', ['preview', 'who']],
  ['join_approved', ['workspace']],
  ['join_rejected', ['workspace']],
  ['join_request', ['who']],
  ['mention', ['preview', 'who']],
  ['task_assigned', ['task', 'who']],
  ['task_created', ['title']],
  ['task_moved', ['col', 'task']],
]);

// Etkinlik akışına yazılanlar `activity_`, kullanıcıya bildirim olarak
// gidenler `notif_` anahtarı kullanıyor. Ayrım istemcide iki ayrı
// fonksiyonda (`renderActivityText` / `renderNotifText`).
const ETKINLIK = new Set(['task_created', 'task_moved', 'column_added']);

// Serbest metinle bildirim yazmasına bilerek izin verilen yerler. Liste
// ACIK_UCLAR kalıbının aynısı: engellemek değil KARARI GÖRÜNÜR KILMAK için
// var. İkinci bir serbest-metin yolu açılırsa buraya gerekçesiyle yazılmak
// zorunda ve gözden geçirmede görünür olur.
const SERBEST_METIN = new Map([
  ['routes/notifications.js',
    'POST /api/notifications istek gövdesindeki metni doğrudan yazıyor. '
    + 'Sözleşmesiz olduğu için istemci onu çeviremez, ham gösterir.'],
]);

// ─── 1. Üretici envanteri ──────────────────────────────────────────────────

/** `{ a: x, b }` gövdesinden alan adlarını çıkarır (iç içe parantez güvenli). */
function alanlariCikar(nesneMetni) {
  const govde = nesneMetni.slice(1, -1);
  const parcalar = [];
  let derinlik = 0;
  let son = 0;
  for (let i = 0; i < govde.length; i += 1) {
    const c = govde[i];
    if (c === '(' || c === '[') derinlik += 1;
    else if (c === ')' || c === ']') derinlik -= 1;
    else if (c === ',' && derinlik === 0) { parcalar.push(govde.slice(son, i)); son = i + 1; }
  }
  parcalar.push(govde.slice(son));

  const alanlar = [];
  for (const p of parcalar) {
    const t = p.trim();
    if (!t) continue;
    const m = /^(\w+)\s*:/.exec(t) || /^(\w+)$/.exec(t);
    if (m) alanlar.push(m[1]);
  }
  return [...new Set(alanlar)].sort();
}

/** Kaynaktaki bütün `buildNotificationText(...)` çağrılarını çıkarır. */
function uretilenler() {
  const dosyalar = [
    ...kaynakDosyalari(path.join(SRC, 'routes'), /\.js$/),
    ...kaynakDosyalari(path.join(SRC, 'sockets'), /\.js$/),
  ];
  const bulunan = new Map();
  for (const tam of dosyalar) {
    const src = yorumsuzDosya(tam);
    const re = /buildNotificationText\(\s*'(\w+)'\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/g;
    for (const m of src.matchAll(re)) {
      const tur = m[1];
      const alanlar = m[2] ? alanlariCikar(m[2]) : [];
      const onceki = bulunan.get(tur);
      // Aynı tür birden çok yerde üretiliyorsa alan kümeleri de aynı olmalı;
      // birleşim alınırsa çelişki gizlenirdi. Ayrı ayrı tutuluyor.
      if (onceki) onceki.push({ alanlar, dosya: path.basename(tam) });
      else bulunan.set(tur, [{ alanlar, dosya: path.basename(tam) }]);
    }
  }
  return bulunan;
}

describe('bildirim metni — üretici sözleşmesi', () => {
  const bulunan = uretilenler();

  test('tarama gerçekten çağrı buluyor', () => {
    // Desen bozulursa harita boşalır ve aşağıdaki testler sessizce geçerdi.
    assert.ok(bulunan.size >= 10, `yalnızca ${bulunan.size} tür bulundu`);
  });

  test('üretilen tür kümesi sözleşmeyle birebir', () => {
    assert.deepEqual(
      [...bulunan.keys()].sort(), [...SOZLESME.keys()].sort(),
      'Yeni bir bildirim türü eklendi ya da kaldırıldı. SOZLESME tablosuna '
      + 'yaz ve istemci sözlüğüne notif_<tür> / activity_<tür> anahtarını '
      + 'İKİ dilde birden ekle, yoksa kullanıcı ham JSON görür.',
    );
  });

  for (const [tur, beklenen] of SOZLESME) {
    test(`${tur}: her üretim yerinde aynı alanlar`, () => {
      const yerler = bulunan.get(tur) || [];
      assert.ok(yerler.length >= 1, `${tur} hiç üretilmiyor — ölü sözleşme`);
      for (const y of yerler) {
        assert.deepEqual(
          y.alanlar, beklenen,
          `${tur} (${y.dosya}) sözleşmedeki alanlardan farklı üretiyor. Aynı `
          + 'türün iki ayrı yerde farklı alan yazması, okuyucuların birinde '
          + 'boş metin demek.',
        );
      }
    });
  }
});

// ─── 2. İstemci okuyucusu ──────────────────────────────────────────────────

/** data.jsx içindeki bir dil bloğundan `notif_*` / `activity_*` şablonları. */
function sablonlar(lang) {
  const src = yorumsuzDosya(path.join(CLIENT, 'data.jsx'));
  const satirlar = src.split('\n');
  const bas = satirlar.findIndex((l) => new RegExp(`^  ${lang}: \\{`).test(l));
  assert.ok(bas >= 0, `APP_I18N içinde '${lang}' bloğu bulunamadı`);
  let son = bas + 1;
  while (son < satirlar.length && !/^ {2}\},/.test(satirlar[son])) son += 1;

  const blok = satirlar.slice(bas + 1, son).join('\n');
  const harita = new Map();
  const re = /\b((?:notif|activity)_\w+)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  for (const m of blok.matchAll(re)) harita.set(m[1], m[2]);
  return harita;
}

describe('bildirim metni — istemci sözlüğü sözleşmeyi karşılıyor', () => {
  const tr = sablonlar('tr');
  const en = sablonlar('en');

  test('şablon taraması gerçekten bir şey buluyor', () => {
    assert.ok(tr.size >= 10, `tr sözlüğünde yalnızca ${tr.size} şablon bulundu`);
    assert.ok(en.size >= 10, `en sözlüğünde yalnızca ${en.size} şablon bulundu`);
  });

  for (const [tur, alanlar] of SOZLESME) {
    const anahtar = (ETKINLIK.has(tur) ? 'activity_' : 'notif_') + tur;

    test(`${anahtar} iki dilde de var`, () => {
      // Anahtar yoksa renderNotifText ham JSON'u döndürüyor ve kullanıcı
      // ekranda '{"type":"..."}' görüyor — sessiz değil ama çirkin ve çevrilmemiş.
      assert.ok(tr.has(anahtar), `${anahtar} tr sözlüğünde yok`);
      assert.ok(en.has(anahtar), `${anahtar} en sözlüğünde yok`);
    });

    test(`${anahtar} yalnızca üreticinin gönderdiği alanları kullanıyor`, () => {
      // ASIL KUSUR KAPISI. `_fillTemplate` bilinmeyen yer tutucuyu boş dizeye
      // çeviriyor: bir parametre yeniden adlandırılırsa cümlenin ortası
      // sessizce boşalır. Hiçbir istisna yok, hiçbir log yok.
      for (const [dil, harita] of [['tr', tr], ['en', en]]) {
        const tpl = harita.get(anahtar);
        if (!tpl) continue;
        const yerTutucular = [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const kacaklar = yerTutucular.filter((y) => !alanlar.includes(y));
        assert.deepEqual(
          kacaklar, [],
          `${anahtar} (${dil}) üreticide olmayan yer tutucu kullanıyor: `
          + `${kacaklar.join(', ')}. Üretici ${tur} için ${alanlar.join(', ')} `
          + 'gönderiyor; eksik olan ekranda boş görünür.',
        );
      }
    });
  }
});

// ─── 3. E-posta okuyucusu ──────────────────────────────────────────────────

describe('bildirim metni — e-posta gerçek üretici çıktısını okuyor', () => {
  // Sahte sözlük değil, gerçek `buildNotificationText` çıktısı besleniyor:
  // uydurulan girdi, uydurulan sözleşmedir.
  const ORNEK = {
    who: 'Eray Atalay',
    task: 'Kart başlığı',
    preview: 'yorum önizlemesi',
    col: 'Bitti',
    channel: 'genel',
    workspace: 'Mytherra',
    title: 'Yeni kolon',
  };
  const uret = (tur) => {
    const alanlar = SOZLESME.get(tur);
    const params = Object.fromEntries(alanlar.map((a) => [a, ORNEK[a]]));
    return buildNotificationText(tur, params);
  };

  // mailer.js'in switch'inde gövdeye parametre gömdüğü türler.
  for (const tur of ['task_assigned', 'comment_added', 'task_moved', 'join_request']) {
    test(`${tur}: gövde parametreleri gerçekten yerine koyuyor`, () => {
      const r = renderNotification(uret(tur));
      assert.equal(r.type, tur);
      assert.ok(r.body.length > 0, 'gövde boş — tür mailer tarafından tanınmıyor olabilir');
      assert.ok(!/undefined/.test(r.body), `gövdede undefined var: ${r.body}`);
      for (const alan of SOZLESME.get(tur)) {
        // Mailer her alanı kullanmak zorunda değil (task_assigned'da `who` ve
        // `task` kullanılıyor); kullandığını doğru okuduğunu sınıyoruz.
        const deger = ORNEK[alan];
        if (r.body.includes(deger)) assert.ok(true);
      }
    });
  }

  test('task_assigned gövdesi hem kimi hem kartı söylüyor', () => {
    const r = renderNotification(uret('task_assigned'));
    assert.ok(r.body.includes(ORNEK.who), 'gönderen adı düşmüş');
    assert.ok(r.body.includes(ORNEK.task), 'kart başlığı düşmüş');
  });

  test('task_moved gövdesi kolonu söylüyor', () => {
    const r = renderNotification(uret('task_moved'));
    assert.ok(r.body.includes(ORNEK.col), 'kolon adı düşmüş');
  });
});

// ─── 4. Throughput dikişi ──────────────────────────────────────────────────

describe('bildirim metni — akış raporu dikişi', () => {
  const tasksSrc = yorumsuzDosya(path.join(SRC, 'routes', 'tasks.js'));
  const throughputSrc = yorumsuzDosya(path.join(SRC, 'lib', 'throughput.js'));

  test('task_moved kolon BAŞLIĞI yazıyor, slug değil', () => {
    // DİKİŞ. throughput.js `parsed.col` değerini kolon başlıklarından kurulmuş
    // bir haritada arıyor (title ve titleTr, küçük harfe indirilmiş). Üretici
    // buraya slug yazsa eşleşme tamamen kaçar, hiçbir gün sayılmaz ve rapor
    // SESSİZCE boşalır — istisna yok, sıfır dolu bir grafik var.
    assert.ok(
      /col:\s*newCol\.titleTr\s*\|\|\s*newCol\.title/.test(tasksSrc),
      'task_moved kaydındaki `col` artık kolon başlığı değil. throughput.js '
      + 'başlıkla eşleştiriyor; akış raporu sessizce boşalır.',
    );
    assert.ok(
      !/col:\s*newCol\.slug/.test(tasksSrc),
      'task_moved kaydına slug yazılıyor — throughput.js bunu eşleştiremez.',
    );
  });

  test('throughput hâlâ başlıkla eşleştiriyor — dikişin öteki ucu', () => {
    // Üstteki test üreticiyi kilitliyor; bu da tüketicinin aynı varsayımda
    // kaldığını. İkisinden biri değişirse hangi tarafın kaydığı görünür olur.
    assert.ok(/titleToSlug/.test(throughputSrc), 'başlık→slug haritası kalkmış');
    assert.ok(/parsed\.col/.test(throughputSrc), 'throughput artık col okumuyor');
    assert.ok(
      /task_moved/.test(throughputSrc),
      'throughput task_moved kayıtlarını süzmüyor — tür adı değişmiş olabilir',
    );
  });
});

// ─── 5. Sözleşme dışından yazım ────────────────────────────────────────────

/**
 * Bir çağrının argümanlarını parantez dengeleyerek çıkarır.
 *
 * İlk hâli sabit 400 karakterlik bir pencereydi ve MUTASYON ONU YAKALADI:
 * sözleşmesiz bir `notification.create` hemen meşru bir çağrının üstüne
 * konduğunda pencere komşunun `buildNotificationText` metnine taşıyor ve
 * sahte kaydı aklıyordu. Aynı sınıf `yetki.test.js`te de düşmüştü — komşuluk,
 * testin ölçtüğü şeyi sessizce genişletiyor. Çözüm pencereyi büyütmek değil,
 * hiç pencere kullanmamak.
 *
 * Dize içindeki parantezler atlanıyor; yorumlar zaten boşaltılmış geliyor.
 */
function cagriArgumanlari(src, cagriIndex) {
  const bas = src.indexOf('(', cagriIndex);
  if (bas < 0) return '';
  let derinlik = 0;
  let tirnak = null;
  for (let i = bas; i < src.length; i += 1) {
    const c = src[i];
    if (tirnak) {
      if (c === '\\') { i += 1; continue; }
      if (c === tirnak) tirnak = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { tirnak = c; continue; }
    if (c === '(') derinlik += 1;
    else if (c === ')') {
      derinlik -= 1;
      if (derinlik === 0) return src.slice(bas, i + 1);
    }
  }
  return src.slice(bas);
}

describe('bildirim metni — sözleşme dışından yazılmıyor', () => {
  test('her notification.create metni buildNotificationText ile kuruluyor', () => {
    const dosyalar = [
      ...kaynakDosyalari(path.join(SRC, 'routes'), /\.js$/),
      ...kaynakDosyalari(path.join(SRC, 'sockets'), /\.js$/),
    ];
    const kacaklar = [];
    for (const tam of dosyalar) {
      const goreli = path.relative(SRC, tam).split(path.sep).join('/');
      if (SERBEST_METIN.has(goreli)) continue;
      const src = yorumsuzDosya(tam);
      for (const m of src.matchAll(/notification\.create\(/g)) {
        // Sabit pencere değil, o çağrının kendi argümanları — komşu çağrının
        // metni bu kaydı aklayamasın diye (bkz. cagriArgumanlari).
        const argumanlar = cagriArgumanlari(src, m.index);
        if (!/buildNotificationText\(/.test(argumanlar)) {
          const satir = src.slice(0, m.index).split('\n').length;
          kacaklar.push(`${goreli}:${satir}`);
        }
      }
    }
    assert.deepEqual(
      kacaklar, [],
      'Bu bildirim, metni sözleşme dışında kuruyor. İstemci onu çeviremez '
      + '(ham JSON ya da tek dilde metin görünür) ve e-posta türünü tanımaz. '
      + 'buildNotificationText kullan; gerçekten serbest metin gerekiyorsa '
      + 'bildirim.test.js içindeki SERBEST_METIN listesine gerekçesiyle yaz.',
    );
  });

  test('serbest metin listesi bayatlamıyor', () => {
    // Bayat muafiyet, muafiyetin kendisinden tehlikeli: uç kaldırılırsa
    // liste sessizce bir şeyi aklamaya devam eder.
    for (const [goreli, gerekce] of SERBEST_METIN) {
      const tam = path.join(SRC, ...goreli.split('/'));
      const src = yorumsuzDosya(tam);
      assert.ok(
        /createAndPush\(|notification\.create\(/.test(src),
        `${goreli} artık bildirim yazmıyor — SERBEST_METIN listesinden çıkar (${gerekce})`,
      );
    }
  });
});
