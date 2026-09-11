// MCP yüzeyinin saf testleri.
//
// ── Neden bu dosya var ────────────────────────────────────────────────────
//
// 9 Eylül'de TODO'ya "araçların saf birim testi yok" diye bilinen bir sınır
// yazılmıştı ve iki gün içinde tam da o boşluktan iki kusur çıktı:
//
//   1. Kimlik alanı metin dönerken araç şeması sayı istiyordu — belgelenen
//      yolun tamamı (proje → kolon → görev) çağrılamaz durumdaydı.
//   2. `weeklyDone` hep sıfırdı: `columnToDict` slug'ı `id` adıyla veriyor,
//      dashboard `.slug` okuyordu.
//
// İkisi de aynı sınıf: **kusur kodun içinde değil, iki sözleşmenin arasında.**
// Hiçbir birim testi göremiyordu çünkü test edilebilir bir yerde
// durmuyorlardı. Biçimlendirme `lib/mcpShape.js`e taşındı; burası onu
// veritabanı olmadan kilitliyor.
//
// Dosyanın sonundaki iki tarama testi ayrı bir iş yapıyor: kuralı belgede
// değil, doğrulayanda tutuyor (CLAUDE.md, zorlama merdiveni).
//
//   çalıştır:  npm.cmd test        (Windows PowerShell)
//              npm test            (Git Bash / macOS / Linux)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  metinKimlik,
  katla,
  gorevOzeti,
  gorevDetayi,
  gorevSuz,
  acikMi,
  listeUyarisi,
  notOzeti,
  uyeOzeti,
  aramaEslesir,
  kullanilmayanIzinler,
  araclarinDili,
  baslik,
  ARAC_BASLIKLARI,
  DESC_SINIRI,
} from '../src/lib/mcpShape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'src');

const BITIS = new Set(['done']);

/** Test görevi — API'nin döndürdüğü biçimde. */
function gorev(ek = {}) {
  return {
    id: 12, col: 'todo', title: 'Kart', desc: '', assignees: [],
    due: null, project_id: 3, completed_at: null, ...ek,
  };
}

// ─── Kimlik ────────────────────────────────────────────────────────────────
//
// Korunan kusur: `list_projects` "21" (metin) dönerken `list_notes` 21 (sayı)
// dönüyordu. Aynı yüzeyde iki tip, modelin hangi aracın ne istediğini
// bilememesi demek.

describe('metinKimlik — yüzeydeki bütün kimlikler metin', () => {
  test('sayı da metin de metne çevriliyor', () => {
    assert.equal(metinKimlik(21), '21');
    assert.equal(metinKimlik('21'), '21');
  });

  test('yokluk uydurulmuyor', () => {
    assert.equal(metinKimlik(null), null);
    assert.equal(metinKimlik(undefined), null);
  });

  test('sıfır kaybolmuyor', () => {
    // `deger || null` yazılsaydı 0 sessizce null olurdu.
    assert.equal(metinKimlik(0), '0');
  });
});

// ─── Harf katlama ve arama ─────────────────────────────────────────────────

describe('katla — Türkçe i/ı ayrımı aramada silinir', () => {
  test('dört i harfi de aynı yere düşüyor', () => {
    assert.equal(katla('İIıi'), 'iiii');
  });

  test('büyük/küçük fark etmiyor', () => {
    assert.equal(katla('RAPOR'), katla('rapor'));
  });

  test('boş girdi patlamıyor', () => {
    assert.equal(katla(null), '');
    assert.equal(katla(undefined), '');
  });
});

describe('aramaEslesir', () => {
  test('başlıkta arıyor', () => {
    assert.equal(aramaEslesir(gorev({ title: 'Fatura ekranı' }), 'fatura'), true);
  });

  test('açıklamada da arıyor', () => {
    assert.equal(aramaEslesir(gorev({ desc: 'PDF çıktısı alınacak' }), 'pdf'), true);
  });

  test('Türkçe büyük İ ile yazılan arama küçük i ile eşleşiyor', () => {
    // Kullanıcı "İZİN" yazıp "izin" geçen kartı bulamazsa arama çalışmıyor
    // demektir. `toLowerCase()` tek başına bunu kaçırıyordu.
    assert.equal(aramaEslesir(gorev({ title: 'izin ekranı' }), 'İZİN'), true);
  });

  test('İngilizce I harfi Türkçe kuralına kurban gitmiyor', () => {
    // `toLocaleLowerCase('tr')` kullanılsaydı "IT" → "ıt" olur ve bu kart
    // bulunamazdı.
    assert.equal(aramaEslesir(gorev({ title: 'IT ekibi toplantısı' }), 'it'), true);
  });

  test('boş sorgu her şeyi eşleştirmiyor', () => {
    assert.equal(aramaEslesir(gorev({ title: 'Kart' }), '   '), false);
  });
});

// ─── Görev özeti ───────────────────────────────────────────────────────────

describe('gorevOzeti', () => {
  test('uzun açıklama kırpılıyor ve kırpıldığı söyleniyor', () => {
    const uzun = 'a'.repeat(DESC_SINIRI + 50);
    const d = gorevOzeti(gorev({ desc: uzun }), { bitisKolonlari: BITIS });
    assert.equal(d.desc.length, DESC_SINIRI);
    assert.equal(d.desc_truncated, true);
  });

  test('kısa açıklama olduğu gibi kalıyor, işaret konmuyor', () => {
    const d = gorevOzeti(gorev({ desc: 'kısa' }), { bitisKolonlari: BITIS });
    assert.equal(d.desc, 'kısa');
    assert.equal('desc_truncated' in d, false);
  });

  test('col_is_done kolondan okunuyor', () => {
    assert.equal(gorevOzeti(gorev({ col: 'done' }), { bitisKolonlari: BITIS }).col_is_done, true);
    assert.equal(gorevOzeti(gorev({ col: 'todo' }), { bitisKolonlari: BITIS }).col_is_done, false);
  });

  test('kolon bilgisi yoksa alan HİÇ konmuyor', () => {
    // Korunan kusur sınıfı: bilinmeyeni `false` diye yazmak. Model onu
    // "bitmemiş" diye okur ve sessizce yanlış cevap verir.
    const d = gorevOzeti(gorev({ col: 'done' }));
    assert.equal('col_is_done' in d, false);
  });

  test('kimlikler metne çekiliyor', () => {
    const d = gorevOzeti(gorev({ id: 12, project_id: 3 }), { bitisKolonlari: BITIS });
    assert.equal(d.id, '12');
    assert.equal(d.project_id, '3');
  });
});

describe('gorevDetayi — detayda açıklama kırpılmaz', () => {
  test('uzun açıklama tam geliyor', () => {
    const uzun = 'a'.repeat(DESC_SINIRI + 50);
    const d = gorevDetayi(gorev({ desc: uzun }), { bitisKolonlari: BITIS });
    assert.equal(d.desc.length, uzun.length);
    assert.equal('desc_truncated' in d, false);
  });
});

// ─── Süzgeç ────────────────────────────────────────────────────────────────

describe('gorevSuz', () => {
  const bugun = '2026-09-11';
  const liste = [
    gorev({ id: 1, col: 'todo', assignees: ['eray'] }),
    gorev({ id: 2, col: 'doing', assignees: ['umut'] }),
    gorev({ id: 3, col: 'done', assignees: ['eray'] }),
    gorev({ id: 4, col: 'todo', due: '2026-09-01', assignees: ['eray'] }),
    gorev({ id: 5, col: 'done', due: '2026-09-01', assignees: ['umut'] }),
  ];
  const suz = (opt) => gorevSuz(liste, { bitisKolonlari: BITIS, bugun, ...opt })
    .map((t) => t.id);

  test('varsayılan: yalnızca açık kartlar', () => {
    assert.deepEqual(suz({}), [1, 2, 4]);
  });

  test('include_done bitmişleri de getiriyor', () => {
    assert.deepEqual(suz({ includeDone: true }), [1, 2, 3, 4, 5]);
  });

  test('kolon süzgeci', () => {
    assert.deepEqual(suz({ col: 'doing' }), [2]);
  });

  test('atanan süzgeci', () => {
    assert.deepEqual(suz({ assignee: 'umut' }), [2]);
  });

  test('süzgeçler birleşimli çalışıyor', () => {
    assert.deepEqual(suz({ col: 'todo', assignee: 'eray' }), [1, 4]);
  });

  test('gecikme: bitiş kolonundaki kart tarihi geçmiş olsa da sayılmıyor', () => {
    // 10 Eylül 2026'da ölçülen kusur: ölçüt `completed_at` damgasıydı ve
    // defter açılmadan önce taşınan 39 kartta damga yoktu. Bitmiş kolondaki
    // 5 numaralı kart gecikmiş görünüyordu.
    assert.deepEqual(suz({ overdue: true }), [4]);
  });

  test('gecikme, damga yokken de doğru: kolon gerçeğin kendisi', () => {
    const damgasiz = [gorev({ id: 9, col: 'done', due: '2026-09-01', completed_at: null })];
    const cikan = gorevSuz(damgasiz, {
      overdue: true, includeDone: true, bitisKolonlari: BITIS, bugun,
    });
    assert.deepEqual(cikan, []);
  });

  test('dizi olmayan girdi boş listeye düşüyor, patlamıyor', () => {
    assert.deepEqual(gorevSuz(null, { bitisKolonlari: BITIS, bugun }), []);
  });
});

describe('acikMi — tanım tek', () => {
  test('bitmiş kolondaki kart açık değil', () => {
    assert.equal(acikMi(gorev({ col: 'done' }), BITIS), false);
    assert.equal(acikMi(gorev({ col: 'todo' }), BITIS), true);
  });
});

// ─── Uyarı ─────────────────────────────────────────────────────────────────
//
// Korunan kusur: uyarı yalnızca `overdue=true` iken çıkıyordu. 10 Eylül
// sabahı bütün panolara `is_done` konunca bir daha hiç tetiklenemedi ve
// istemci alanı "ölü" sandı. Ölçüt artık "bitmiş bilgisine ihtiyaç duyduk mu,
// pano onu veriyor mu".

describe('listeUyarisi', () => {
  test('işaretsiz panoda açık görev süzerken uyarıyor', () => {
    assert.ok(listeUyarisi({ bitisKolonSayisi: 0, includeDone: false }));
  });

  test('işaretsiz panoda gecikme sorulunca uyarıyor', () => {
    assert.ok(listeUyarisi({ bitisKolonSayisi: 0, includeDone: true, overdue: true }));
  });

  test('işaretli panoda susuyor', () => {
    assert.equal(listeUyarisi({ bitisKolonSayisi: 2, includeDone: false }), null);
  });

  test('bitmiş bilgisi hiç gerekmiyorsa susuyor', () => {
    // include_done=true ve overdue yok: elemeye gerek yok, uyarının anlamı da.
    assert.equal(listeUyarisi({ bitisKolonSayisi: 0, includeDone: true }), null);
  });
});

// ─── Not ───────────────────────────────────────────────────────────────────

describe('notOzeti', () => {
  const not = {
    id: 7, title: 'Gereksinim', body: 'gövde', preview: 'gövde',
    updated_at: '2026-09-10T08:00:00.000Z',
    updated_ago: '2026-09-10T08:00:00.000Z',
  };

  test('updated_ago düşürülüyor — ad göreli süre vaat edip mutlak değer veriyordu', () => {
    assert.equal('updated_ago' in notOzeti(not), false);
  });

  test('updated_at duruyor', () => {
    assert.equal(notOzeti(not).updated_at, '2026-09-10T08:00:00.000Z');
  });

  test('kimlik metin', () => {
    assert.equal(notOzeti(not).id, '7');
  });

  test('gövde aktarılıyor — get_note bunu vermek için var', () => {
    assert.equal(notOzeti(not).body, 'gövde');
  });
});

// ─── Üye ───────────────────────────────────────────────────────────────────

describe('uyeOzeti', () => {
  const uye = {
    id: 'eray-atalay', name: 'Eray Atalay', role: 'Kurucu',
    initials: 'EA', color: 'oklch(55% 0.13 25)', avatar_photo_url: null,
    status: 'offline', away_timeout: 15,
    ws_role: 'owner', role_name: 'Yönetici', role_permissions: ['manage_tasks'],
  };

  test('slug açıkça adlandırılıyor', () => {
    // `userToDict` slug'ı `id` alanında taşıyor; diğer araçlarda `id` sayısal
    // kimlik demek. Aynı adı iki anlamda kullanmak modelin kaçıracağı bir tuzak.
    assert.equal(uyeOzeti(uye).slug, 'eray-atalay');
  });

  test('arayüz gürültüsü yüzeye çıkmıyor', () => {
    const d = uyeOzeti(uye);
    for (const alan of ['initials', 'color', 'avatar_photo_url', 'away_timeout', 'status']) {
      assert.equal(alan in d, false, `${alan} modele hiçbir şey söylemiyor`);
    }
  });

  test('iş sayısı istenmediyse alan hiç konmuyor', () => {
    assert.equal('open_tasks' in uyeOzeti(uye), false);
  });

  test('iş sayısı sıfırsa yine de görünüyor', () => {
    // `acikGorev || null` yazılsaydı "üzerinde iş yok" bilgisi kaybolurdu.
    assert.equal(uyeOzeti(uye, { acikGorev: 0 }).open_tasks, 0);
  });
});

// ─── İzinler ───────────────────────────────────────────────────────────────

describe('kullanilmayanIzinler', () => {
  test('araç karşılığı olmayan izinler işaretleniyor', () => {
    const kalan = kullanilmayanIzinler(
      ['manage_tasks', 'manage_channels'], new Set(['manage_tasks']),
    );
    assert.deepEqual(kalan, ['manage_channels']);
  });

  test('izin listesi yoksa boş dönüyor', () => {
    assert.deepEqual(kullanilmayanIzinler(null, new Set()), []);
  });
});

// ─── Başlık dili ───────────────────────────────────────────────────────────

describe('araclarinDili', () => {
  test('adresteki ?lang açıkça kazanıyor', () => {
    assert.equal(araclarinDili({ sorgu: 'en', acceptLanguage: 'tr-TR' }), 'en');
    assert.equal(araclarinDili({ sorgu: 'tr', acceptLanguage: 'en-US' }), 'tr');
  });

  test('?lang yoksa Accept-Language okunuyor', () => {
    assert.equal(araclarinDili({ acceptLanguage: 'en-US,en;q=0.9' }), 'en');
  });

  test('hiç sinyal yoksa Türkçe — deponun her yerindeki yedek', () => {
    assert.equal(araclarinDili({}), 'tr');
    assert.equal(araclarinDili(), 'tr');
  });

  test('tanınmayan dil Türkçe\'ye düşüyor', () => {
    assert.equal(araclarinDili({ sorgu: 'de' }), 'tr');
  });
});

describe('baslik', () => {
  test('dile göre seçiyor', () => {
    assert.equal(baslik('list_tasks', 'en'), 'Tasks');
    assert.equal(baslik('list_tasks', 'tr'), 'Görevler');
  });

  test('bilinmeyen araçta patlamıyor, adını dönüyor', () => {
    assert.equal(baslik('yok_boyle_bir_arac', 'en'), 'yok_boyle_bir_arac');
  });
});

// ─── Tarama testleri ───────────────────────────────────────────────────────
//
// Buradan aşağısı kaynağı okuyor. Sebebi CLAUDE.md'deki merdiven: bir kuralı
// belgeye yazmak onu korumuyor — dil kuralı net yazılıydı ve 31 yerde ihlal
// edildi. Aşağıdaki ikisi, ihlali mümkün olduğunca imkânsız kılıyor.

/**
 * Kaynağı yorumsuz okur.
 *
 * Bu satır bir mutasyon denemesinden doğdu. Aşağıdaki sayım testinin ilk
 * hâli mutasyonu KAÇIRDI: `deletedAt: null` sorgudan çıkarıldığı hâlde test
 * geçti, çünkü kuralı ANLATAN yorum hemen üstündeydi ve pencere o metni kod
 * sandı. Kaynağı tarayan her test bu tuzağı taşıyor ve tuzağın ironisi
 * kayda değer: kuralı açıklayan yorum, kuralın ihlalini örtüyor.
 */
const yorumsuz = (yol) =>
  fs.readFileSync(path.join(SRC, ...yol.split('/')), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');

describe('araç başlıkları — kullanıcı metni, iki dilde', () => {
  const mcpSrc = yorumsuz('routes/mcp.js');
  const kayitli = [...mcpSrc.matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((m) => m[1]);

  test('en az yedi araç kayıtlı — tarama gerçekten bir şey buluyor', () => {
    // Desen bozulursa liste boşalır ve aşağıdaki testler sessizce geçerdi.
    assert.ok(kayitli.length >= 7, `yalnızca ${kayitli.length} araç bulundu`);
  });

  test('her aracın başlığı tabloda ve iki dilde', () => {
    const eksik = [];
    for (const arac of kayitli) {
      const kayit = ARAC_BASLIKLARI[arac];
      if (!kayit) { eksik.push(`${arac} (tabloda yok)`); continue; }
      if (!kayit.tr) eksik.push(`${arac} (tr)`);
      if (!kayit.en) eksik.push(`${arac} (en)`);
    }
    assert.deepEqual(
      eksik, [],
      'Araç başlığı bağlayıcı ekranında kullanıcıya görünüyor (10 Eylül 2026, '
      + 'ekran görüntüsüyle doğrulandı). Türkçe bırakılan başlık İngilizce '
      + 'arayüzde Türkçe çıkar.',
    );
  });

  test('tabloda kayıtsız araç kalmıyor', () => {
    // Ters yön: araç silinince başlığı da gitsin, tablo bayatlamasın.
    const fazla = Object.keys(ARAC_BASLIKLARI).filter((a) => !kayitli.includes(a));
    assert.deepEqual(fazla, [], 'Bu araçlar artık kayıtlı değil, başlıkları da silinmeli');
  });

  test('başlık alanı doğrudan metin taşımıyor', () => {
    // `title: 'Görevler'` yazmak kuralı sessizce delerdi; tek geçerli biçim
    // tablodan okuyan B(...) çağrısı.
    const duz = [...mcpSrc.matchAll(/\btitle:\s*'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(
      duz, [],
      'Araç başlığı tabloya yazılmalı: title: B(\'arac_adi\')',
    );
  });
});

describe('açık görev tanımı — üç yerde de aynı olmalı', () => {
  // Korunan kusur (11 Eylül 2026): `projectWithOpenCount` ve bootstrap'taki
  // toplu sayım çöp kutusundaki kartları da "açık" sayıyordu; oysa
  // `GET /projects/:id/tasks` onları hiç döndürmüyor. Kenar çubuğu 9 derken
  // pano 6 kart gösteriyordu ve silinen kart 30 gün çöpte durduğu için fark
  // haftalarca yaşıyordu. MCP aynı sayıyı modele aktardığı için yalan
  // büyüyordu.
  const parcalar = [
    ['routes/projects.js', 'prisma.task.count('],
    ['routes/api.js', 'prisma.task.groupBy('],
  ];

  for (const [dosya, cagri] of parcalar) {
    test(`${dosya} açık sayımı çöp kutusunu dışarıda bırakıyor`, () => {
      const src = yorumsuz(dosya);
      const bas = src.indexOf(cagri);
      assert.ok(bas > 0, `${cagri} bulunamadı — sayım taşınmışsa test güncellenmeli`);
      const blok = src.slice(bas, bas + 400);
      assert.ok(
        /deletedAt:\s*null/.test(blok),
        'Açık görev sayımı silinmiş kartları da sayıyor; liste onları vermiyor.',
      );
      assert.ok(
        /isDone|doneColIds|doneIds/.test(blok),
        'Açık görev sayımı bitiş kolonunu dışarıda bırakmalı.',
      );
    });
  }
});
