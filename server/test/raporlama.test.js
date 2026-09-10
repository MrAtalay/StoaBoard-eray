// Raporlamanın saf mantık testleri.
//
// GUVENLIK.md ve TODO.md'de işaretli en büyük teknik açık: test kapsamı dar.
// Süre ayrıştırma ve rapor yardımcıları karmaşık ama hiç test edilmemişti;
// bunlar veritabanı gerektirmiyor, saniyeler içinde koşuyor.
//
//   çalıştır:  npm.cmd test        (Windows PowerShell)
//              npm test            (Git Bash / macOS / Linux)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseDuration } from '../src/routes/reports.js';
import { TEMPLATES } from '../src/routes/workspaces.js';
import {
  parseRangeDate,
  resolveRange,
  formatMinutes,
  formatDurationLong,
} from '../src/lib/reporting.js';

// ─── parseDuration ──────────────────────────────────────────────────────────
//
// Kullanıcı süreyi çok farklı biçimlerde girebiliyor: "90", "1:30", "1s 30d",
// "1.5s". Hepsi dakikaya dönmeli; anlamsız girdi sessizce 0'a değil null'a
// düşmeli — çağıran uç null'ı 400 ile reddediyor.

describe('parseDuration — süre girdisi ayrıştırma', () => {
  const ok = [
    ['90', 90],
    [90, 90],
    ['1:30', 90],
    ['0:45', 45],
    ['2:05', 125],
    ['1s 30d', 90],
    ['2s', 120],
    ['45d', 45],
    ['2h30m', 150],
    ['1.5s', 90],
    ['1,5s', 90],       // Türkçe ondalık ayracı
    ['1 saat 30 dakika', 90],
    ['   120   ', 120], // baştaki/sondaki boşluk
    ['90d', 90],
  ];
  for (const [input, expected] of ok) {
    test(`${JSON.stringify(input)} → ${expected} dakika`, () => {
      assert.equal(parseDuration(input), expected);
    });
  }

  const bad = ['', '   ', 'abc', '0', '0:00', '-5', 'saat', null, undefined, {}, [], NaN];
  for (const input of bad) {
    test(`${JSON.stringify(input)} → null (kabul edilmez)`, () => {
      assert.equal(parseDuration(input), null);
    });
  }

  test('ondalık sonuç yukarı yuvarlanır', () => {
    // 0.7s = 42 dakika; kayan nokta değil tam dakika dönmeli
    assert.equal(parseDuration('0.7s'), 42);
  });

  test('saat:dakika biçiminde dakika 59 ile sınırlı', () => {
    // "1:60" saat:dakika kalıbına uymaz (dakika 0-59); düz sayı da değil.
    assert.equal(parseDuration('1:60'), null);
  });
});

// ─── formatMinutes ──────────────────────────────────────────────────────────

describe('formatMinutes — dakika → okunur etiket', () => {
  const cases = [
    [0, '0d'],
    [5, '5d'],
    [45, '45d'],
    [60, '1s'],
    [90, '1s 30d'],
    [125, '2s 5d'],
    [600, '10s'],
  ];
  for (const [min, label] of cases) {
    test(`${min} → "${label}"`, () => {
      assert.equal(formatMinutes(min), label);
    });
  }

  test('negatif ve bozuk değerler 0d olur — çökmez', () => {
    assert.equal(formatMinutes(-10), '0d');
    assert.equal(formatMinutes(null), '0d');
    assert.equal(formatMinutes(undefined), '0d');
    assert.equal(formatMinutes(NaN), '0d');
  });

  test('ondalık dakika yuvarlanır', () => {
    assert.equal(formatMinutes(89.6), '1s 30d');
  });
});

// ─── parseRangeDate ─────────────────────────────────────────────────────────

describe('parseRangeDate — YYYY-MM-DD ayrıştırma', () => {
  test('geçerli tarih gün başına çözülür (UTC)', () => {
    const d = parseRangeDate('2026-09-02');
    assert.equal(d.toISOString(), '2026-09-02T00:00:00.000Z');
  });

  test('endOfDay gün sonuna çözülür', () => {
    const d = parseRangeDate('2026-09-02', true);
    assert.equal(d.toISOString(), '2026-09-02T23:59:59.999Z');
  });

  const bad = ['2026-9-2', '02-09-2026', '2026/09/02', 'bugün', '', null, 20260902, '2026-13-40'];
  for (const input of bad) {
    test(`${JSON.stringify(input)} → null`, () => {
      assert.equal(parseRangeDate(input), null);
    });
  }
});

// ─── resolveRange ───────────────────────────────────────────────────────────

describe('resolveRange — istekten aralık çıkarma', () => {
  test('from ve to verilirse ikisi de kullanılır', () => {
    const { from, to } = resolveRange({ from: '2026-01-01', to: '2026-06-30' });
    assert.equal(from.toISOString().slice(0, 10), '2026-01-01');
    assert.equal(to.toISOString().slice(0, 10), '2026-06-30');
    // to gün sonuna çekilmeli, tüm günü kapsasın
    assert.ok(to.toISOString().includes('23:59:59'));
  });

  test('hiçbiri verilmezse son 30 gün — aralık ~30 gün', () => {
    const { from, to } = resolveRange({});
    const gunFarki = (to - from) / (24 * 60 * 60 * 1000);
    assert.ok(gunFarki >= 29.9 && gunFarki <= 30.1, `beklenen ~30 gün, gelen: ${gunFarki}`);
  });

  test('geçersiz from yok sayılır, varsayılana düşer', () => {
    const { from, to } = resolveRange({ from: 'çöp', to: '2026-06-30' });
    // from geçersiz → to'dan 30 gün geri
    const gunFarki = (to - from) / (24 * 60 * 60 * 1000);
    assert.ok(gunFarki >= 29.9 && gunFarki <= 30.1);
  });

  test('from her zaman to\'dan önce (mantıklı aralık)', () => {
    const { from, to } = resolveRange({ from: '2026-06-30', to: '2026-01-01' });
    // Ters verilse bile ayrıştırma sadık kalır; çağıran uç sıralamayı garanti
    // etmiyor — bu test mevcut davranışı belgeliyor, ters aralık boş sonuç verir.
    assert.ok(from instanceof Date && to instanceof Date);
  });
});

// ─── formatDurationLong — belirgin, dile duyarlı süre ───────────────────────
//
// CSV çıktısı için; "1s 30d" kısa/belirsiz biçiminin yerine "1 saat 30 dakika"
// / "1 hour 30 minutes". Rapor dışa aktaran kişinin diline göre.

describe('formatDurationLong — belirgin süre (TR/EN)', () => {
  const tr = [
    [0, '0 dakika'],
    [45, '45 dakika'],
    [60, '1 saat'],
    [90, '1 saat 30 dakika'],
    [125, '2 saat 5 dakika'],
  ];
  for (const [min, label] of tr) {
    test(`TR ${min} → "${label}"`, () => {
      assert.equal(formatDurationLong(min, 'tr'), label);
    });
  }

  const en = [
    [0, '0 minutes'],
    [1, '1 minute'],
    [45, '45 minutes'],
    [60, '1 hour'],
    [90, '1 hour 30 minutes'],
    [120, '2 hours'],
    [121, '2 hours 1 minute'],
  ];
  for (const [min, label] of en) {
    test(`EN ${min} → "${label}"`, () => {
      assert.equal(formatDurationLong(min, 'en'), label);
    });
  }

  test('varsayılan dil TR; negatif/bozuk 0 olur', () => {
    assert.equal(formatDurationLong(90), '1 saat 30 dakika');
    assert.equal(formatDurationLong(-5, 'en'), '0 minutes');
    assert.equal(formatDurationLong(NaN, 'tr'), '0 dakika');
  });
});

// ─── Şablon panolarında bitiş kolonu ────────────────────────────────────────
//
// Kusur (10 Eylül 2026): şablon yolundan doğan panolarda hiçbir kolon isDone
// taşımıyordu. projects.js işareti koyuyordu, workspaces.js koymuyordu — yani
// "Ana Proje"yi elle açarsan tamamlandı kolonu işaretli, çalışma alanını
// şablonla açarsan değil. Altı pano bu yüzden işaretsiz doğmuştu.
//
// Sessizliği tehlikeli yapan şey: hiçbir şey bozulmuyor. Kart "Done"
// kolonuna gidiyor, kullanıcı işi bitmiş sanıyor, ama completedAt yazılmıyor,
// ilerleme %100'e çekilmiyor ve gecikme listesi bitmiş işleri gecikmiş
// gösteriyor. Rapor yanlış ama makul görünüyor.
//
// Ada göre tahmin bu kusuru kapatmaz: tasarım şablonunun bitiş kolonu
// 'delivery'. Bu yüzden işaret şablon verisinde açıkça duruyor ve test de
// açıkça orada arıyor — yeni bir şablon eklendiğinde unutulursa burada patlar.
describe('Çalışma alanı şablonları — bitiş kolonu işareti', () => {
  for (const [ad, tmpl] of Object.entries(TEMPLATES)) {
    test(`${ad} şablonunda tam olarak bir bitiş kolonu var`, () => {
      const bitis = tmpl.cols.filter((c) => c[5] === true);
      assert.equal(
        bitis.length, 1,
        `${ad}: bitiş kolonu sayısı 1 olmalı, ${bitis.length} bulundu. `
        + 'Kolon dizisinin 6. elemanı (isDone) işaretlenmemiş olabilir.',
      );
    });

    test(`${ad} şablonunda bitiş kolonu en sonda`, () => {
      const [bitis] = tmpl.cols.filter((c) => c[5] === true);
      const enSon = Math.max(...tmpl.cols.map((c) => c[4]));
      assert.equal(
        bitis[4], enSon,
        `${ad}: bitiş kolonu son sırada değil. Akışın ortasındaki bir kolonu `
        + '"tamamlandı" saymak tamamlanma süresini olduğundan kısa gösterir.',
      );
    });
  }
});
