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
import { _bearerToken } from '../src/lib/mcpAuth.js';
import {
  ALL_PERMISSIONS,
  memberPermissions,
  hasPermission,
  hasAnyPermission,
} from '../src/lib/permissions.js';
import { renderNotification } from '../src/lib/mailer.js';
import { parseMcpTokens, lookupSlug, MIN_TOKEN_LENGTH } from '../src/lib/mcpToken.js';
import { atananlariDenetle, atamaSluglari } from '../src/lib/assignees.js';
import { bahsedilenleriCoz, adKatla } from '../src/lib/mentions.js';

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
    const src = yorumsuzDosya(settingsPath);

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
  const wsSrc = yorumsuzDosya(path.resolve(__dirname, '..', 'src', 'routes', 'workspaces.js'));

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
  const wsSrc = yorumsuzDosya(path.resolve(__dirname, '..', 'src', 'routes', 'workspaces.js'));

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
import { yorumsuzKaynak, yorumsuzDosya, kaynakDosyalari } from './yardimcilar.js';
import { htmlKacir, htmlCoz, sablonDoldur, bildirimMetni, etkinlikMetni } from '../../client/src/bildirimMetni.js';

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

// ─── Sessiz yutulan hata — statik kilit ────────────────────────────────────
//
// Korunan kusur (9 Eylül 2026): sunucudaki on iki soket yayını
// `try { ... } catch {}` içindeydi. Ödünleşme doğruydu — gerçek zamanlı bir
// olayın gönderilememesi kullanıcının işlemini başarısız kılmamalı — ama
// uygulanışı yanlıştı: hata hiçbir yere yazılmıyordu. Yayın tamamen çalışmaz
// hâle gelse (io kurulmamış, payload serileştirilemiyor, oda adı bozuk)
// kayıtlarda tek satır iz kalmazdı. Belirti "gerçek zamanlı bazen çalışmıyor"
// olurdu; bu depoda bir toplantıyı yakan sınıf tam olarak bu.
//
// Kural CLAUDE.md'de zaten yazılıydı: koşulun yokluk hâli ya reddetmeli ya
// gürültü çıkarmalı. Yazılı olması yetmedi — dil kuralında olduğu gibi.
// O yüzden kural belgeden teste taşındı (merdivende bir basamak yukarı).
//
// Sınır bilinçli: yorumsuz `catch {}` yasak, açıklamalı olan serbest. Yorum
// yazmak kararı görünür kılıyor ve gözden geçirmede tartışılabilir hâle
// getiriyor; asıl tehlikeli olan hiç düşünülmeden bırakılmış boş bloktur.

describe('sessiz yutulan hata — sunucuda çıplak boş catch yok', () => {
  const SRC = path.resolve(__dirname, '..', 'src');

  function jsDosyalari(dizin) {
    const out = [];
    for (const ad of fs.readdirSync(dizin)) {
      const tam = path.join(dizin, ad);
      if (fs.statSync(tam).isDirectory()) out.push(...jsDosyalari(tam));
      else if (ad.endsWith('.js')) out.push(tam);
    }
    return out;
  }

  test('hiçbir sunucu dosyasında yorumsuz catch {} yok', () => {
    const bulgular = [];
    for (const tam of jsDosyalari(SRC)) {
      const ham = fs.readFileSync(tam, 'utf8').replace(/\r\n/g, '\n');
      const temizSatirlar = yorumsuzKaynak(ham).split('\n');
      ham.split('\n').forEach((satir, i) => {
        const kirpik = satir.trim();
        // İki kaynağa birden bakılıyor, çünkü yorumun burada İKİ ayrı rolü var:
        //   - Yorumun İÇİNDEKİ `catch {}` bulgu değildir (emit.js kusuru
        //     anlatırken kalıbı yazıyor). Boşaltılmış satırda `catch` kalmaz.
        //   - Bloğun İÇİNDEKİ yorum ise ihlali aklar: açıklamalı boş catch
        //     bilerek serbest. Bu ayrım yalnızca HAM satırda görülebilir;
        //     boşaltılmış satırda `catch { /* sebep */ }` gerçek bir boş
        //     catch'e dönüşür ve meşru kod bulgu sayılırdı.
        if (!temizSatirlar[i].includes('catch')) return;
        if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(satir)) {
          bulgular.push(`${path.relative(SRC, tam)}:${i + 1}  ${kirpik}`);
        }
      });
    }
    assert.deepEqual(
      bulgular, [],
      'Boş catch bloğu hatayı sessizce yutuyor. Ya hatayı yükselt, ya '
      + 'console.warn ile gürültü çıkar (soket yayınları için lib/emit.js\'teki '
      + 'emitSafely), ya da blok içine NEDEN yutulduğunu yazan bir yorum koy.',
    );
  });
});

// ─── MCP anahtarının başlıktan çıkarılması ──────────────────────────────────
//
// 10 Eylül 2026'da ikinci bir başlık tanıtıldı. Sebep: Claude'un tarayıcı
// içindeki bağlayıcı ekranı asıl kimliği OAuth ile kuruyor ve ek başlıklar
// için kapalı bir ad listesi sunuyor; `Authorization` o listede yok,
// `x-auth-token` var. StoaBoard'da OAuth sunucusu olmadığı için bağlayıcı
// "couldn't register" ile düşüyordu.
//
// Bir kimlik kapısını genişletmek, gevşetmenin en kolay yoludur. Bu testler
// kapının hangi durumda AÇILMAYACAĞINI kilitliyor: yokluk hâli her dalda
// null dönmeli, "başlık varsa geç" gibi bir kısayol oluşmamalı.
describe('MCP anahtarı — başlık ayrıştırma', () => {
  const istek = (basliklar) => ({
    get: (ad) => basliklar[ad.toLowerCase()] ?? undefined,
  });

  test('Authorization: Bearer <anahtar> okunur', () => {
    assert.equal(_bearerToken(istek({ authorization: 'Bearer abc123' })), 'abc123');
  });

  test('Bearer öneki büyük/küçük harfe duyarsız', () => {
    assert.equal(_bearerToken(istek({ authorization: 'bearer abc123' })), 'abc123');
  });

  test('X-Auth-Token ham değerle okunur', () => {
    assert.equal(_bearerToken(istek({ 'x-auth-token': 'abc123' })), 'abc123');
  });

  test('X-Auth-Token içinde Bearer öneki hoş görülür', () => {
    assert.equal(_bearerToken(istek({ 'x-auth-token': 'Bearer abc123' })), 'abc123');
  });

  test('Authorization varsa X-Auth-Token\'a düşülmez', () => {
    const t = _bearerToken(istek({ authorization: 'Bearer birinci', 'x-auth-token': 'ikinci' }));
    assert.equal(t, 'birinci', 'iki başlık da varsa asıl biçim kazanmalı');
  });

  // Yokluk hâlleri — hepsi null dönmeli. Bir tanesi bile boş dize ya da
  // undefined dönerse lookupSlug'a çöp gider; orada da uzunluk kapısı var ama
  // iki kapının aynı anda doğru olmasına güvenmek yerine burada kesiliyor.
  for (const [ad, basliklar] of [
    ['hiç başlık yok', {}],
    ['Authorization boş', { authorization: '' }],
    ['Authorization yalnızca "Bearer"', { authorization: 'Bearer' }],
    ['Authorization şeması yanlış', { authorization: 'Basic abc123' }],
    ['Authorization anahtarsız boşluk', { authorization: 'Bearer    ' }],
    ['X-Auth-Token boş', { 'x-auth-token': '' }],
    ['X-Auth-Token yalnızca boşluk', { 'x-auth-token': '   ' }],
    ['X-Auth-Token yalnızca "Bearer"', { 'x-auth-token': 'Bearer' }],
  ]) {
    test(`reddedilir: ${ad}`, () => {
      assert.equal(
        _bearerToken(istek(basliklar)), null,
        `"${ad}" durumunda anahtar çıkarılmamalı — yokluk hâli sessizce `
        + 'geçerli sayılmamalı.',
      );
    });
  }

  test('Authorization içindeki fazladan sözcük anahtar sayılmaz', () => {
    // "Bearer abc def" -> tek bir anahtar değil; kabul edilirse hangi parçanın
    // sır olduğu belirsizleşir.
    assert.equal(_bearerToken(istek({ authorization: 'Bearer abc def' })), null);
  });
});

// ─── Görev ataması alan üyeliği ister ──────────────────────────────────────
//
// Kusur (11 Eylül 2026): görev oluşturma ve atama değişikliği atanacak kişiyi
// yalnızca slug'ıyla arıyordu; alan üyeliğine bakılmıyordu. `manage_tasks`
// izni olan bir üye platformdaki herhangi bir kullanıcıyı atayabiliyor ve ona
// görev başlığını taşıyan bildirim gidiyordu — başka bir şirketin kullanıcısına
// bildirim atmak ve başlığı sızdırmak mümkündü. MCP yazma araçları bu kapı
// kapanmadan açılamazdı. Kural ve iki istisnası lib/assignees.js'in başında.

describe('atananlariDenetle — görev ataması alan üyeliği ister', () => {
  const eray = { id: 1, slug: 'eray' };
  const umut = { id: 2, slug: 'umut' };
  const yabanci = { id: 9, slug: 'baska-sirket' };
  const kullanicilar = [eray, umut, yabanci];
  const uyeIdleri = new Set([1, 2]);

  test('alan üyesi yeni atanan geçer', () => {
    const r = atananlariDenetle({ istenen: ['umut'], kullanicilar, uyeIdleri });
    assert.deepEqual(r, { gecerli: [umut], reddedilen: [] });
  });

  test('üye olmayan yeni atanan reddedilir — kusurun kendisi', () => {
    const r = atananlariDenetle({ istenen: ['eray', 'baska-sirket'], kullanicilar, uyeIdleri });
    assert.deepEqual(r.reddedilen, ['baska-sirket']);
    assert.deepEqual(r.gecerli, [eray]);
  });

  test('platformda olmayan slug da aynı dalda reddedilir — var/yok kahini yok', () => {
    const yok = atananlariDenetle({ istenen: ['hayalet'], kullanicilar, uyeIdleri });
    const uyeDegil = atananlariDenetle({ istenen: ['baska-sirket'], kullanicilar, uyeIdleri });
    assert.deepEqual(yok, { gecerli: [], reddedilen: ['hayalet'] });
    assert.deepEqual(uyeDegil, { gecerli: [], reddedilen: ['baska-sirket'] });
  });

  test('kartta zaten atanmış kişi korunur, alandan çıkarılmış olsa bile', () => {
    // f789c37: çıkarılan kişinin adı kartlarda kalır. Arayüz atama listesinin
    // tamamını geri gönderdiği için bu kişi reddedilseydi kart düzenlenemezdi.
    const r = atananlariDenetle({
      istenen: ['eray', 'baska-sirket'], kullanicilar, uyeIdleri, mevcutIdler: new Set([9]),
    });
    assert.deepEqual(r, { gecerli: [eray, yabanci], reddedilen: [] });
  });

  test('aynı slug iki kez gelirse tek atanır', () => {
    const r = atananlariDenetle({ istenen: ['umut', 'umut'], kullanicilar, uyeIdleri });
    assert.deepEqual(r.gecerli, [umut]);
  });

  test('üye kümesi boşsa hiçbir yeni atanan geçmez — kapalı başarısızlık', () => {
    const r = atananlariDenetle({ istenen: ['umut'], kullanicilar, uyeIdleri: new Set() });
    assert.deepEqual(r.reddedilen, ['umut']);
  });
});

describe('atamaSluglari — girdi biçimi', () => {
  test('dizi olmayan girdi atama sayılmaz — metin harf harf dolaşılmaz', () => {
    assert.deepEqual(atamaSluglari('eray'), []);
    assert.deepEqual(atamaSluglari(undefined), []);
    assert.deepEqual(atamaSluglari({ 0: 'eray' }), []);
  });

  test('tekrarlar elenir, değerler metne çevrilir', () => {
    assert.deepEqual(atamaSluglari(['eray', 'eray', 5]), ['eray', '5']);
  });
});

// İki uç da kapıdan geçmeli. Veritabanı olmadan uç kaynağında doğrulanıyor;
// yorumlar önce siliniyor, çünkü kuralı anlatan yorum ihlali örtebiliyor
// (CLAUDE.md, 11 Eylül). Bu testler mutasyonla sınandı.

describe('görev atama uçları — üyelik kapısından geçiyor', () => {
  const src = yorumsuzDosya(path.resolve(__dirname, '..', 'src', 'routes', 'tasks.js'));

  function isleyici(baslangic) {
    const i = src.indexOf(baslangic);
    assert.ok(i !== -1, `işleyici bulunamadı: ${JSON.stringify(baslangic)}`);
    const kalan = src.slice(i + baslangic.length);
    const son = kalan.search(/\n(projectTasksRouter|tasksRouter|subtasksRouter|commentsRouter)\./);
    return son === -1 ? kalan : kalan.slice(0, son);
  }

  for (const [ad, baslangic] of [
    ['POST /projects/:projectId/tasks', "projectTasksRouter.post(\n  '/',"],
    ['PATCH /tasks/:taskId', "tasksRouter.patch(\n  '/:taskId',"],
  ]) {
    test(`${ad}: atananlar işlemden önce denetleniyor, reddedilen erken dönüyor`, () => {
      const h = isleyici(baslangic);
      const coz = h.indexOf('atamalariCoz(');
      const red = h.search(/if\s*\(\s*atama\.reddedilen\.length\s*\)\s*return\s+atamaReddi\(/);
      const islem = h.indexOf('$transaction');
      assert.ok(coz !== -1, 'uç atananları denetlemeden yazıyor — regresyon');
      assert.ok(red !== -1, 'reddedilen atanan için erken dönüş yok — sessiz geçiş');
      assert.ok(islem !== -1 && coz < islem && red < islem,
        'denetim işlemden sonra geliyor — kart yarım yazılabilir');
    });
  }

  test('tasks.js slug ile kullanıcı çözmüyor — kapıyı atlayan ikinci yol yok', () => {
    assert.ok(
      !/user\.findUnique\(\s*\{\s*where:\s*\{\s*slug/.test(src),
      'slug → kullanıcı çözümü kapının dışında; atama bu yoldan üyelik denetimsiz yazılabilir',
    );
  });
});

// ─── OAuth keşif uçları — yokluk 404 ile söyleniyor ────────────────────────
//
// Kusur (12 Eylül 2026): `/.well-known/oauth-authorization-server` ve
// kardeşleri SPA yedeğine düşüp 200 + HTML döndürüyordu. Claude'un bağlayıcı
// ekranı bunu "OAuth var" diye okudu (ekranda "Detected"), "Sign in now"u
// seçti ve kayıt "couldn't register" ile düştü — bağlayıcı kurulamaz hâle
// geldi. StoaBoard'da OAuth sunucusu yok; kimlik x-auth-token başlığıyla
// kuruluyor. Yokluk sessiz kalmamalı.
//
// Veritabanı gerektirmeden kaynakta doğrulanıyor; yorumlar önce siliniyor.

describe('OAuth keşif uçları — SPA yedeğine düşmüyor', () => {
  const src = yorumsuzDosya(path.resolve(__dirname, '..', 'src', 'app.js'));

  const KESIF = "app.use('/.well-known'";
  const YEDEK = 'app.use((req, res) => {';

  test('/.well-known SPA yedeğinden ÖNCE ele alınıyor', () => {
    const kesif = src.indexOf(KESIF);
    const yedek = src.indexOf(YEDEK);
    assert.ok(kesif !== -1, '/.well-known ele alınmıyor — SPA yedeği 200 + HTML döndürür');
    assert.ok(yedek !== -1, 'SPA yedeği bulunamadı — tarama deseni bozulmuş olabilir');
    assert.ok(kesif < yedek, '/.well-known SPA yedeğinden sonra geliyor, yani hiç çalışmıyor');
  });

  test('404 dönüyor', () => {
    const blok = src.slice(src.indexOf(KESIF), src.indexOf(YEDEK));
    assert.ok(/status\(404\)/.test(blok), '/.well-known 404 dışında bir şey dönüyor');
  });
});

// ─── Kart yorumundaki @bahsetme yalnızca alan üyelerine gider ──────────────
//
// Kusur (12 Eylül 2026): `POST /tasks/:id/comments` bahsedilen kişiyi
// `user.findFirst({ name: { startsWith, insensitive } })` ile BÜTÜN platformda
// arıyordu ve ilk eşleşene bildirim gönderiyordu. "@Ali" yazan bir üye, başka
// bir şirketteki adı Ali ile başlayan birine yorumun ilk 80 karakterini
// sızdırabiliyordu. Sohbetteki bahsetme 2 Eylül'de `mentionAllowed` ile
// kapatılmıştı; kart yorumu o turun dışında kalmıştı.

describe('bahsedilenleriCoz — bahsetme alan üyeleriyle sınırlı', () => {
  const efe = { id: 1, name: 'Efe Kapan' };
  const eray = { id: 2, name: 'Eray Atalay' };
  const ilker = { id: 3, name: 'İlker Demir' };
  const uyeler = [efe, eray, ilker];

  test('alan üyesi tek eşleşmede bildirim alıyor', () => {
    const r = bahsedilenleriCoz(['Eray'], uyeler);
    assert.deepEqual(r.eslesen, [eray]);
    assert.deepEqual(r.belirsiz, []);
    assert.deepEqual(r.bulunamayan, []);
  });

  test('üye olmayan hiçbir koşulda eşleşmiyor — kusurun kendisi', () => {
    // Platformda "Ali Veli" olsa bile bu alanın üyesi değilse havuza girmiyor.
    const r = bahsedilenleriCoz(['Ali'], uyeler);
    assert.deepEqual(r.eslesen, []);
    assert.deepEqual(r.bulunamayan, ['Ali']);
  });

  test('boş üye listesi: kimseye bildirim yok — kapalı başarısızlık', () => {
    const r = bahsedilenleriCoz(['Eray'], []);
    assert.deepEqual(r.eslesen, []);
    assert.deepEqual(r.bulunamayan, ['Eray']);
  });

  test('belirsiz önek kimseye gitmiyor, adaylar bildiriliyor', () => {
    const ikinciEfe = { id: 4, name: 'Efe Yıldız' };
    const r = bahsedilenleriCoz(['Efe'], [...uyeler, ikinciEfe]);
    assert.deepEqual(r.eslesen, []);
    assert.equal(r.belirsiz.length, 1);
    assert.deepEqual(r.belirsiz[0].adaylar.sort(), ['Efe Kapan', 'Efe Yıldız']);
  });

  test('belirsizlikte tam ad yazılmışsa o kişi seçiliyor', () => {
    const efeY = { id: 4, name: 'Efe' };
    const r = bahsedilenleriCoz(['Efe'], [efe, efeY]);
    assert.deepEqual(r.eslesen, [efeY]);
    assert.deepEqual(r.belirsiz, []);
  });

  test('Türkçe harf katlaması: @ilker İlker ile eşleşiyor', () => {
    assert.deepEqual(bahsedilenleriCoz(['ilker'], uyeler).eslesen, [ilker]);
    assert.deepEqual(bahsedilenleriCoz(['İLKER'], uyeler).eslesen, [ilker]);
  });

  test('aynı kişi iki kez bahsedilse bir kez bildirim alıyor', () => {
    const r = bahsedilenleriCoz(['Eray', 'eray'], uyeler);
    assert.deepEqual(r.eslesen, [eray]);
  });

  test('farklı önekler aynı kişiye çıkıyorsa yine tek bildirim', () => {
    // Ad tekrarı elemesi bunu göremiyor: "Eray" ile "Era" iki ayrı anahtar
    // ama aynı kişiye çıkıyor. Kimlik elemesini koruyan tek test bu; ilk
    // hâlinde yoktu ve mutasyon (kimlik elemesini sil) KAÇMIŞTI.
    const r = bahsedilenleriCoz(['Eray', 'Era'], uyeler);
    assert.deepEqual(r.eslesen, [eray]);
  });
});

describe('adKatla — I/ı/İ/i aynı yere düşüyor', () => {
  test('dört i harfi de aynı', () => {
    const hedef = adKatla('ilker');
    for (const v of ['İlker', 'ILKER', 'ılker']) assert.equal(adKatla(v), hedef);
  });

  test('boş girdi patlamıyor', () => {
    assert.equal(adKatla(null), '');
    assert.equal(adKatla(undefined), '');
  });
});

// Uç gerçekten bu kapıdan geçiyor mu — kaynakta doğrulanıyor, yorumlar
// silinerek (CLAUDE.md: kuralı anlatan yorum ihlali örtebiliyor).

describe('yorum ucu — bahsetme kapısından geçiyor', () => {
  const src = yorumsuzDosya(path.resolve(__dirname, '..', 'src', 'routes', 'tasks.js'));

  function yorumIsleyicisi() {
    const bas = "tasksRouter.post(\n  '/:taskId/comments',";
    const i = src.indexOf(bas);
    assert.ok(i !== -1, 'yorum ucu bulunamadı — tarama deseni bozulmuş olabilir');
    const kalan = src.slice(i + bas.length);
    const son = kalan.search(/\n(tasksRouter|commentsRouter|subtasksRouter|projectTasksRouter)\./);
    return son === -1 ? kalan : kalan.slice(0, son);
  }

  test('bahsedilenler alan üyeleriyle çözülüyor', () => {
    const h = yorumIsleyicisi();
    assert.ok(h.includes('bahsedilenleriCoz('), 'bahsetme kapısı yok — regresyon');
    assert.ok(/workspaceMember\.findMany/.test(h), 'üye havuzu alandan çekilmiyor');
  });

  test('platform geneli ad araması geri gelmedi', () => {
    const h = yorumIsleyicisi();
    assert.ok(
      !/user\.findFirst/.test(h),
      'yorum ucu yine bütün platformda kullanıcı arıyor — bahsetme sızıntısı geri geldi',
    );
  });
});

// ─── Bildirim metni — saklı XSS ─────────────────────────────────────────────
//
// KUSUR (12 Eylül 2026): bildirim ve etkinlik metinleri istemcide
// `dangerouslySetInnerHTML` ile basılıyor (`notifications.jsx:270`,
// `views/dashboard.jsx:340`) ve şablon değerleri KAÇIŞSIZ yerleştiriliyordu:
//
//     tpl.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '')
//
// Değerlerin hepsi kullanıcı girdisi. `preview` doğrudan sohbet mesajından
// geliyor, `title` kart başlığından. Yani bir DM'e ya da kart başlığına
// yazılan `<img src=x onerror=…>` alıcının tarayıcısında çalışıyordu.
// `POST /api/notifications` ucu serbest metin kabul ettiği ve çevrilemeyen
// gövde HAM basıldığı için saldırgan hedefi de seçebiliyordu.
//
// Kaçış istemciye, HTML'in üretildiği yere konuldu (`client/src/bildirimMetni.js`).
// Sunucuda temizlemek yanlış olurdu: metin depoda duruyor ve başka tüketicileri
// var — e-posta kendi düz-metin temizliğini zaten yapıyor.
//
// GUVENLIK.md §4/10: kapatılan her kusur için buraya bir regresyon testi.

describe('bildirim metni — değerler kaçışlanıyor (saklı XSS)', () => {
  const ZARARLI = '<img src=x onerror=alert(1)>';

  test('şablon değeri kaçışlanıyor, şablonun kendi etiketi korunuyor', () => {
    const cikti = sablonDoldur('<strong>{who}</strong>: {preview}', {
      who: 'Eray', preview: ZARARLI,
    });
    assert.ok(!cikti.includes('<img'), `ham etiket geçti: ${cikti}`);
    assert.ok(cikti.includes('&lt;img'), 'değer kaçışlanmamış');
    assert.ok(cikti.includes('<strong>Eray</strong>'), 'şablonun kendi etiketi bozulmuş');
  });

  test('DM önizlemesi: sohbet mesajı betik taşıyamaz', () => {
    // Gerçek akış: chat.js `preview: text.slice(0, 80)` yazıyor.
    const ceviri = (k) => (k === 'notif_dm_received'
      ? '<strong>{who}</strong> sana mesaj gönderdi: {preview}' : null);
    const cikti = bildirimMetni(
      JSON.stringify({ type: 'dm_received', who: 'Eray', preview: ZARARLI }), ceviri,
    );
    // Ölçüt `onerror=` dizgisinin yokluğu DEĞİL: o dizgi kaçışlanmış metinde
    // de düz metin olarak duruyor ve zararsızdır — `<` etkisizleştikten sonra
    // etiket hiç oluşamaz. Doğru ölçüt açılı parantezin kaçışlanmış olması.
    assert.ok(!/<img/i.test(cikti), `ham etiket geçti: ${cikti}`);
    assert.ok(cikti.includes('&lt;img'), `değer kaçışlanmamış: ${cikti}`);
  });

  test('etkinlik akışı: kart başlığı betik taşıyamaz', () => {
    // Gerçek akış: tasks.js `buildNotificationText('task_created', { title })`.
    const ceviri = (k) => (k === 'activity_task_created' ? 'yeni kart: <em>{title}</em>' : null);
    const cikti = etkinlikMetni(
      JSON.stringify({ type: 'task_created', title: ZARARLI }), ceviri,
    );
    // Ölçüt `onerror=` dizgisinin yokluğu DEĞİL: o dizgi kaçışlanmış metinde
    // de düz metin olarak duruyor ve zararsızdır — `<` etkisizleştikten sonra
    // etiket hiç oluşamaz. Doğru ölçüt açılı parantezin kaçışlanmış olması.
    assert.ok(!/<img/i.test(cikti), `ham etiket geçti: ${cikti}`);
    assert.ok(cikti.includes('&lt;img'), `değer kaçışlanmamış: ${cikti}`);
  });

  test('çevrilemeyen gövde de kaçışlanıyor — serbest metin ucunun düştüğü dal', () => {
    const cikti = bildirimMetni('<script>alert(1)</script>', () => null);
    assert.ok(!/<script/.test(cikti), `ham HTML geçti: ${cikti}`);
    assert.ok(cikti.includes('&lt;script&gt;'), 'kaçış uygulanmamış');
  });

  test('sözlükte karşılığı olmayan tür de ham basılmıyor', () => {
    const cikti = bildirimMetni(JSON.stringify({ type: 'bilinmeyen', x: ZARARLI }), () => null);
    assert.ok(!/<img/.test(cikti), `ham HTML geçti: ${cikti}`);
  });

  test('tırnak ve & karakterleri de kaçışlanıyor — öznitelik bağlamı', () => {
    assert.equal(htmlKacir('"&\''), '&quot;&amp;&#39;');
  });

  test('htmlCoz düz metne geri çeviriyor — toast varlık kodu göstermez', () => {
    assert.equal(htmlCoz(htmlKacir('a<b>&c')), 'a<b>&c');
  });

  test('boş ve tanımsız girdi çökmüyor', () => {
    assert.doesNotThrow(() => bildirimMetni(null, () => null));
    assert.doesNotThrow(() => etkinlikMetni(undefined, () => null));
    assert.equal(htmlKacir(null), '');
  });
});

// Kaçış tek yerde yapılıyor; bu tarama onu KALICI kılıyor. Yeni bir
// `dangerouslySetInnerHTML` eklenirse ya kaçışlı bir üreticiden beslenmeli ya
// da buraya gerekçesiyle yazılmalı. Aksi hâlde aynı kusur başka bir ekranda
// sessizce geri döner.
describe('dangerouslySetInnerHTML — her sink kaçıştan geçiyor', () => {
  const ISTISNA = new Map([
    ['views/legal.jsx', 'sabit <style> blokları — kullanıcı girdisi taşımıyor'],
  ]);
  const GUVENLI = /__html:\s*(renderNotifText|renderActivityText)\(/;

  test('kullanıcı girdisi basan her sink kaçışlı üreticiden besleniyor', () => {
    const kok = path.resolve(__dirname, '..', '..', 'client', 'src');
    const bulgular = [];
    for (const tam of kaynakDosyalari(kok, /\.jsx?$/)) {
      const goreli = path.relative(kok, tam).split(path.sep).join('/');
      const src = yorumsuzDosya(tam);
      src.split('\n').forEach((satir, i) => {
        if (!satir.includes('dangerouslySetInnerHTML')) return;
        if (ISTISNA.has(goreli)) return;
        if (GUVENLI.test(satir)) return;
        bulgular.push(`${goreli}:${i + 1}  ${satir.trim().slice(0, 70)}`);
      });
    }
    assert.deepEqual(
      bulgular, [],
      'Bu satır HTML enjeksiyonu açıyor. Değeri kaçışlayan bir üreticiden '
      + 'besle (bildirimMetni.js) ya da gerçekten sabit içerikse bu testteki '
      + 'ISTISNA listesine gerekçesiyle yaz.',
    );
  });

  test('tarama gerçekten sink buluyor', () => {
    // Desen bozulursa üstteki test boş kümeyle sessizce geçerdi.
    const kok = path.resolve(__dirname, '..', '..', 'client', 'src');
    let sayi = 0;
    for (const tam of kaynakDosyalari(kok, /\.jsx?$/)) {
      sayi += (yorumsuzDosya(tam).match(/dangerouslySetInnerHTML/g) || []).length;
    }
    assert.ok(sayi >= 3, `beklenenden az sink bulundu: ${sayi}`);
  });
});
