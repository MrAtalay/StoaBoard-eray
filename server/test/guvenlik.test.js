// Güvenlik regresyon testleri.
//
// Buradaki her test, gerçekten yaşanmış bir kusuru kilitliyor. Yeni bir test
// eklerken hangi kusuru koruduğunu yaz — testin değeri, koruduğu şeyin
// hatırlanmasında.
//
// Bilerek veritabanı gerektirmiyor: yetkilendirme ve çıktı üretimi saf
// modüllere ayrıldı, böylece testler her ortamda saniyeler içinde koşuyor.
//
//   çalıştır:  npm.cmd test        (Windows PowerShell)
//              npm test            (Git Bash / macOS / Linux)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { csvCell, toCsv, CSV_BOM } from '../src/lib/csv.js';
import {
  ALL_PERMISSIONS,
  memberPermissions,
  hasPermission,
  hasAnyPermission,
} from '../src/lib/permissions.js';
import { renderNotification } from '../src/lib/mailer.js';
import { parseMcpTokens, lookupSlug, MIN_TOKEN_LENGTH } from '../src/lib/mcpToken.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CSV formül enjeksiyonu ────────────────────────────────────────────────
//
// Kusur (1 Eylül 2026, yüksek): rapor CSV'lerindeki görev başlıkları ve kişi
// adları kullanıcı girdisiydi. Excel '=' '+' '-' '@' ile başlayan hücreyi
// formül sayıp çalıştırıyor; tırnaklamak engellemiyor. Bir üye kart başlığını
// =HYPERLINK(...) yapıp raporu açan yöneticinin makinesinde veri sızdırabilirdi.

describe('csvCell — formül enjeksiyonu koruması', () => {
  for (const payload of [
    '=1+1',
    '=HYPERLINK("http://saldirgan.tld","tikla")',
    '+1+1',
    '-1+1',
    '@SUM(1+1)',
    '\tzararlı',
    '\rzararlı',
  ]) {
    test(`tehlikeli önek metne sabitlenir: ${JSON.stringify(payload)}`, () => {
      const out = csvCell(payload);
      const govde = out.startsWith('"') ? out.slice(1, -1) : out;
      assert.ok(govde.startsWith("'"), `beklenen tek tırnak öneki, gelen: ${out}`);
    });
  }

  test('zararsız metne dokunulmaz', () => {
    assert.equal(csvCell('Tasarım Projesi'), 'Tasarım Projesi');
    assert.equal(csvCell('Ali Veli'), 'Ali Veli');
  });

  test('sayılar bozulmaz — negatif değer metne dönmemeli', () => {
    assert.equal(csvCell(-5), '-5');
    assert.equal(csvCell(0), '0');
    assert.equal(csvCell(90), '90');
    assert.equal(csvCell(1.5), '1.5');
  });

  test('boş ve tanımsız değerler boş hücre olur', () => {
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
    assert.equal(csvCell(''), '');
  });
});

describe('csvCell — ayraç kaçışı', () => {
  test('noktalı virgül içeren değer tırnaklanır', () => {
    assert.equal(csvCell('a;b'), '"a;b"');
  });

  test('tırnak ikilenir', () => {
    assert.equal(csvCell('o "dedi"'), '"o ""dedi"""');
  });

  test('satır sonu tırnak içine alınır', () => {
    assert.equal(csvCell('bir\niki'), '"bir\niki"');
  });

  test('enjeksiyon ve ayraç birlikte gelirse ikisi de uygulanır', () => {
    // Hem formül öneki hem ayraç: önce metne sabitlenir, sonra tırnaklanır.
    assert.equal(csvCell('=a;b'), `"'=a;b"`);
  });
});

describe('toCsv', () => {
  test('BOM ile başlar — Excel Türkçe karakterleri doğru okusun', () => {
    const out = toCsv(['Başlık'], [['değer']]);
    assert.ok(out.startsWith(CSV_BOM), 'BOM eksik');
  });

  test('sep=; yönergesiyle başlar — Excel yerelden bağımsız ayracı tanısın', () => {
    const out = toCsv(['a', 'b'], [['1', '2']]);
    assert.equal(out, `${CSV_BOM}sep=;\r\na;b\r\n1;2`);
  });

  test('başlık satırı da korumadan geçer', () => {
    const out = toCsv(['=kotu'], []);
    assert.ok(out.includes("'=kotu"));
  });
});

// ─── Yetkilendirme ─────────────────────────────────────────────────────────
//
// Kapalı başarısızlık kuralı: üye yoksa ya da izin bilinmiyorsa daima red.

describe('hasPermission', () => {
  const uye = (perms) => ({ role: 'member', workspaceRole: { permissions: perms } });

  test('üye yoksa daima false — kapalı başarısızlık', () => {
    assert.equal(hasPermission(null, 'manage_tasks'), false);
    assert.equal(hasPermission(undefined, 'manage_tasks'), false);
  });

  test('sahip her izne sahiptir', () => {
    const sahip = { role: 'owner' };
    for (const p of ALL_PERMISSIONS) {
      assert.equal(hasPermission(sahip, p), true, `sahip ${p} iznini alamadı`);
    }
  });

  test('izni olan geçer, olmayan geçemez', () => {
    const m = uye(['manage_tasks']);
    assert.equal(hasPermission(m, 'manage_tasks'), true);
    assert.equal(hasPermission(m, 'manage_members'), false);
    assert.equal(hasPermission(m, 'view_reports'), false);
  });

  test('rolü olmayan üyenin hiçbir izni yoktur', () => {
    assert.equal(hasPermission({ role: 'member' }, 'manage_tasks'), false);
  });

  test('izin listesi bozuk gelirse red — dizi değilse yok sayılır', () => {
    assert.equal(hasPermission(uye(null), 'manage_tasks'), false);
    assert.equal(hasPermission(uye('manage_tasks'), 'manage_tasks'), false);
    assert.equal(hasPermission(uye({}), 'manage_tasks'), false);
  });

  test('bilinmeyen izin adı geçmez', () => {
    assert.equal(hasPermission(uye(['manage_tasks']), 'her_seyi_yap'), false);
  });

  test('hasAnyPermission en az biri yeterli', () => {
    const m = uye(['manage_labels']);
    assert.equal(hasAnyPermission(m, ['manage_projects', 'manage_labels']), true);
    assert.equal(hasAnyPermission(m, ['manage_projects', 'manage_members']), false);
    assert.equal(hasAnyPermission(null, ['manage_labels']), false);
  });
});

describe('memberPermissions', () => {
  // Kusur (1 Eylül 2026): sahip için sabit üç izinlik eski bir liste
  // dönüyordu. hasPermission sahibi kısa devre yaptığı için fark edilmiyordu,
  // ama bu fonksiyonu doğrudan çağıran yerler (lib/notes.js) sahibi yanlışlıkla
  // yetkisiz sayabilirdi.
  test('sahip için tüm izinler döner', () => {
    const p = memberPermissions({ role: 'owner' });
    for (const perm of ALL_PERMISSIONS) {
      assert.ok(p.includes(perm), `sahip listesinde ${perm} eksik`);
    }
  });

  test('üye yoksa boş liste', () => {
    assert.deepEqual(memberPermissions(null), []);
  });
});

// ─── İzin listesi eşleşmesi ────────────────────────────────────────────────
//
// Kusur (1 Eylül 2026): arayüz 'invite_members' iznini sunuyordu ama sunucu
// onu hiçbir yerde kontrol etmiyordu — yönetici verdiğini sandığı yetkiyi
// vermemiş oluyordu. Ters yönde 'manage_workspace' sunucuda uygulanıyor ama
// arayüzde listelenmediği için kimseye verilemiyordu.

describe('izin listesi — sunucu ile arayüz aynı olmalı', () => {
  test('settings.jsx içindeki liste ALL_PERMISSIONS ile birebir eşleşir', () => {
    const settingsPath = path.resolve(
      __dirname, '..', '..', 'client', 'src', 'views', 'settings.jsx',
    );
    const src = fs.readFileSync(settingsPath, 'utf8');

    const blok = src.slice(
      src.indexOf('const PERM_LABELS_KEYS = {'),
      src.indexOf('const ALL_PERMS'),
    );
    assert.ok(blok.length > 0, 'settings.jsx içinde PERM_LABELS_KEYS bulunamadı');

    const arayuz = [...blok.matchAll(/^\s{2}([a-z_]+)\s*:/gm)].map((m) => m[1]);

    const eksikArayuzde = ALL_PERMISSIONS.filter((p) => !arayuz.includes(p));
    const fazlaArayuzde = arayuz.filter((p) => !ALL_PERMISSIONS.includes(p));

    assert.deepEqual(
      eksikArayuzde, [],
      'Sunucuda tanımlı ama arayüzde yok — bu izin hiçbir role verilemez',
    );
    assert.deepEqual(
      fazlaArayuzde, [],
      'Arayüzde var ama sunucuda yok — yönetici verdiğini sandığı yetkiyi vermez',
    );
  });
});

// ─── Bildirim gövdesi ──────────────────────────────────────────────────────

describe('renderNotification', () => {
  test('bahsetme bildirimindeki HTML etiketleri temizlenir', () => {
    const r = renderNotification('<strong>Ali</strong> seni bahsetti: <img src=x>');
    assert.equal(r.type, 'mention');
    assert.ok(!r.body.includes('<'), `etiket kalmış: ${r.body}`);
    assert.ok(r.body.includes('Ali'));
  });

  test('bilinen tür okunabilir gövdeye çevrilir', () => {
    const r = renderNotification(
      JSON.stringify({ type: 'task_assigned', task: 'Rapor', who: 'Ayşe' }),
    );
    assert.equal(r.type, 'task_assigned');
    assert.ok(r.body.includes('Rapor'));
    assert.ok(r.body.includes('Ayşe'));
  });

  test('bozuk girdi çökmez', () => {
    assert.doesNotThrow(() => renderNotification(''));
    assert.doesNotThrow(() => renderNotification(null));
    assert.doesNotThrow(() => renderNotification('{bozuk json'));
  });
});

// ─── Toplu kalıcı silme yetki kapısı ────────────────────────────────────────
//
// Kusur (2 Eylül 2026): `DELETE /workspaces/me/trash` yalnızca üyelik kontrol
// ediyordu, hiçbir izin istemiyordu. Oysa tekil `DELETE /tasks/:id/permanent`
// `manage_tasks` istiyor. Yani işlemin geri dönüşsüz, çalışma alanını tümüyle
// kapsayan toplu hâli, tekil hâlinden daha az korunuyordu: sıradan (ya da ele
// geçirilmiş) bir üye herkesin çöp kutusunu kalıcı silebiliyordu.
//
// Veritabanı gerektirmeden, uç işleyicisinin kaynağında yetki kapısının
// bulunduğunu doğruluyoruz — kapı kaldırılırsa bu test düşer.

describe('çöp kutusu boşaltma — toplu kalıcı silme yetki ister', () => {
  // Satır sonundan bağımsız olsun diye CRLF → LF normalize edilir.
  const wsSrc = fs
    .readFileSync(path.resolve(__dirname, '..', 'src', 'routes', 'workspaces.js'), 'utf8')
    .replace(/\r\n/g, '\n');

  // DELETE /me/trash işleyicisini izole et: tanımından bir sonraki uca kadar.
  function trashDeleteHandler(src) {
    const marker = "workspacesRouter.delete(\n  '/me/trash'";
    const start = src.indexOf(marker);
    assert.ok(start !== -1, "DELETE /me/trash işleyicisi bulunamadı");
    const rest = src.slice(start + marker.length);
    const end = rest.indexOf('workspacesRouter.');
    return end === -1 ? rest : rest.slice(0, end);
  }

  test('silmeden önce manage_tasks izni kontrol ediliyor', () => {
    const handler = trashDeleteHandler(wsSrc);
    assert.ok(
      /hasPermission\(\s*member\s*,\s*'manage_tasks'\s*\)/.test(handler),
      'toplu kalıcı silme manage_tasks kapısı olmadan çalışıyor — regresyon',
    );
    // Kapı, silme çağrısından ÖNCE gelmeli (erken 403).
    const izinIdx = handler.search(/hasPermission\(\s*member\s*,\s*'manage_tasks'/);
    const silmeIdx = handler.indexOf('deleteMany');
    assert.ok(
      izinIdx !== -1 && (silmeIdx === -1 || izinIdx < silmeIdx),
      'yetki kontrolü silme işleminden sonra geliyor — kapalı başarısızlık ihlali',
    );
  });

  test('toplu kalıcı silme denetim kaydına yazılıyor', () => {
    const handler = trashDeleteHandler(wsSrc);
    assert.ok(
      /AUDIT\.WORKSPACE_TRASH_EMPTIED/.test(handler),
      'geri dönüşsüz toplu silme denetim kaydı bırakmıyor',
    );
  });
});

// ─── Denetim kaydı kapsamı — hassas yönetim eylemleri ───────────────────────
//
// GUVENLIK.md §5 açık madde: denetim kaydı yalnızca dışa aktarmayı yazıyordu.
// Üye çıkarma ve rol değişikliği — ele geçirilmiş bir yönetici hesabının
// yayılma araçları — de yazılmalı (Okta/Lapsus$ dersi). Eylem adları
// lib/audit.js içinde zaten tanımlıydı; bu test bunların uca bağlandığını
// kilitliyor.

describe('denetim kaydı — yönetim eylemleri bağlı', () => {
  // Satır sonundan bağımsız olsun diye CRLF → LF normalize edilir.
  const wsSrc = fs
    .readFileSync(path.resolve(__dirname, '..', 'src', 'routes', 'workspaces.js'), 'utf8')
    .replace(/\r\n/g, '\n');

  for (const action of ['MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'WORKSPACE_TRASH_EMPTIED']) {
    test(`${action} denetim kaydına yazılıyor`, () => {
      assert.ok(
        wsSrc.includes(`AUDIT.${action}`),
        `${action} hiçbir uca bağlanmamış — denetim kaydı kapsamı eksik`,
      );
    });
  }
});

// ─── Bahsetme bildirimi kapsamı ─────────────────────────────────────────────
//
// Kusur (2 Eylül 2026): chat_message'daki @mention bildirimleri bahsedilen
// kişiyi platform genelinde arıyor, hiçbir çalışma alanı/kanal üyeliği kontrol
// etmiyordu. Bir üye @slug yazarak rastgele birine mesaj önizlemesi (80 karakter)
// sızdırabiliyordu — özel kanalda kanal içeriği, DM'de üçüncü kişiye DM içeriği.
// person-report oracle'ıyla aynı sınıf. Karar mentionAllowed'a çıkarıldı.

import { mentionAllowed } from '../src/lib/channels.js';

describe('mentionAllowed — bahsetme bildirimi görünürlük kapısı', () => {
  test('DM: yalnızca karşı tarafa gider', () => {
    assert.equal(mentionAllowed({ isDm: true, mentionedIsReceiver: true }), true);
    assert.equal(mentionAllowed({ isDm: true, mentionedIsReceiver: false }), false);
  });

  test('DM: üçüncü kişi çalışma alanını paylaşsa bile alamaz', () => {
    // DM içeriği yalnızca iki taraf arasında; @üçüncü_kişi bildirim üretmemeli.
    assert.equal(
      mentionAllowed({ isDm: true, mentionedIsReceiver: false, sharesWorkspace: true }),
      false,
    );
  });

  test('genel/açık kanal: çalışma alanı üyeliği yeter', () => {
    assert.equal(mentionAllowed({ sharesWorkspace: true, isPrivateChannel: false }), true);
  });

  test('çalışma alanını paylaşmayan hiçbir kanalda alamaz', () => {
    assert.equal(mentionAllowed({ sharesWorkspace: false, isPrivateChannel: false }), false);
    assert.equal(mentionAllowed({ sharesWorkspace: false, isPrivateChannel: true, hasChannelRole: true }), false);
  });

  test('özel kanal: çalışma alanı üyeliği yetmez, kanal üyeliği de şart', () => {
    assert.equal(
      mentionAllowed({ sharesWorkspace: true, isPrivateChannel: true, hasChannelRole: false }),
      false,
    );
    assert.equal(
      mentionAllowed({ sharesWorkspace: true, isPrivateChannel: true, hasChannelRole: true }),
      true,
    );
  });

  test('boş çağrı — kapalı başarısızlık (varsayılan red)', () => {
    assert.equal(mentionAllowed(), false);
    assert.equal(mentionAllowed({}), false);
  });
});

// ─── MCP anahtarlarının çözümlenmesi ───────────────────────────────────────
//
// Korunan kusur sınıfı: "yapılandırılmamışsa serbest bırak". Bu depodaki üç
// kusurun kök sebebi sessiz atlamaydı (`if (!window.io) return`,
// `window.showToast?.()`, `if (satır && !yetki)`); MCP ucunda aynı refleks,
// anahtar tanımlanmadığında panoyu internete açmak anlamına gelirdi.
//
// İkinci koruduğu şey: kimliği belirsiz bırakan yapılandırma. Aynı anahtarın
// iki kişiye verilmesi "muhtemelen ilki kastedilmiştir" diye yorumlanmaz —
// denetim kaydında yanlış isim, yanlış kişiye giden bildirim demek olurdu.

describe('parseMcpTokens — yapılandırma çözümlemesi', () => {
  const GECERLI = 'a'.repeat(MIN_TOKEN_LENGTH);
  const GECERLI2 = 'b'.repeat(MIN_TOKEN_LENGTH);

  test('tanımsız/boş değer: harita boş — özellik kapalı, açık değil', () => {
    for (const ham of [undefined, null, '', '   ', '\n']) {
      const { tokens } = parseMcpTokens(ham);
      assert.equal(tokens.size, 0);
      assert.equal(lookupSlug(tokens, GECERLI), null);
    }
  });

  test('geçerli çift çözümleniyor, yanlış anahtar reddediliyor', () => {
    const { tokens, warnings } = parseMcpTokens(`eray:${GECERLI}`);
    assert.deepEqual(warnings, []);
    assert.equal(lookupSlug(tokens, GECERLI), 'eray');
    assert.equal(lookupSlug(tokens, GECERLI2), null);
    assert.equal(lookupSlug(tokens, ''), null);
    assert.equal(lookupSlug(tokens, undefined), null);
  });

  test('ham anahtar bellekte tutulmuyor — harita yalnızca özet taşıyor', () => {
    const { tokens } = parseMcpTokens(`eray:${GECERLI}`);
    assert.equal([...tokens.keys()].includes(GECERLI), false);
    assert.match([...tokens.keys()][0], /^[0-9a-f]{64}$/);
  });

  test('kısa anahtar atılıyor ve gürültü çıkarıyor', () => {
    const kisa = 'a'.repeat(MIN_TOKEN_LENGTH - 1);
    const { tokens, warnings } = parseMcpTokens(`eray:${kisa}`);
    assert.equal(tokens.size, 0);
    assert.equal(warnings.length, 1);
    assert.equal(lookupSlug(tokens, kisa), null);
  });

  test('aynı anahtar iki kişide: ikisi de düşüyor', () => {
    const { tokens, warnings } = parseMcpTokens(`eray:${GECERLI},ahmet:${GECERLI}`);
    assert.equal(lookupSlug(tokens, GECERLI), null);
    assert.equal(tokens.size, 0);
    assert.equal(warnings.length, 1);
  });

  test('bozuk girdi diğerlerini götürmüyor', () => {
    const { tokens, warnings } = parseMcpTokens(
      `bozuk-satir,eray:${GECERLI},:${GECERLI2},ahmet:${GECERLI2}`,
    );
    assert.equal(lookupSlug(tokens, GECERLI), 'eray');
    assert.equal(lookupSlug(tokens, GECERLI2), 'ahmet');
    assert.equal(warnings.length, 2);
  });

  test('satır sonu da ayraç — çok satırlı ortam değişkeni çalışıyor', () => {
    const { tokens } = parseMcpTokens(`eray:${GECERLI}\nahmet:${GECERLI2}`);
    assert.equal(lookupSlug(tokens, GECERLI), 'eray');
    assert.equal(lookupSlug(tokens, GECERLI2), 'ahmet');
  });

  test('slug küçük harfe indiriliyor — kullanıcı slug\'ları küçük harf', () => {
    const { tokens } = parseMcpTokens(`ERAY:${GECERLI}`);
    assert.equal(lookupSlug(tokens, GECERLI), 'eray');
  });
});
