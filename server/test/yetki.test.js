// Yetkilendirmenin UYGULANMASI — kuralın kendisi değil, çağrıldığının garantisi.
//
// `hasPermission` zaten guvenlik.test.js'te test ediliyor: sahip kısa devre
// yapıyor mu, bozuk izin listesi reddediliyor mu, bilinmeyen izin adı geçiyor
// mu. Yani KURAL doğrulanmış durumda.
//
// Doğrulanmamış olan şey kuralın UYGULANMASIYDI: bir route dosyasına yeni bir
// uç eklendiğinde `requireAuth` yazmayı unutmak hiçbir yerde yakalanmıyordu.
// Bu, 3 Eylül dil turunda görülen kusur sınıfının aynısı — orada da kural
// (iki sözlüğe de anahtar ekle) belgeliydi, biliniyordu, uygulanıyordu ve
// yine de 31 yerde sessizce atlanmıştı. Kuralı test etmek yetmiyor; kuralın
// her çağrı yerinde uygulandığını test etmek gerekiyor.
//
// Buradaki iki değişmez statik olarak doğrulanabilir olduğu için seçildi.
// Kapsam dışı bırakılanların gerekçesi dosyanın sonunda.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yorumsuzDosya } from './yardimcilar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'src');
const ROUTES = path.join(SRC, 'routes');
const SOCKETS = path.join(SRC, 'sockets');
const APP = path.join(SRC, 'app.js');
const INDEX = path.join(SRC, 'index.js');

// ─── 1. Kimlik doğrulaması olmayan uç ───────────────────────────────────────
//
// AÇIK UÇLAR — bilinçli olarak `requireAuth` taşımayanlar. Her biri niçin
// açık olduğu yazılarak listelenir; liste kendiliğinden büyüyemez.
//
// Bu listenin asıl işi engellemek değil, KARARI GÖRÜNÜR KILMAK. Yeni bir uç
// yanlışlıkla korumasız kalırsa test kırılır; bilerek açılıyorsa geliştirici
// onu buraya gerekçesiyle yazmak zorunda kalır ve karar gözden geçirmede
// görünür olur.
const ACIK_UCLAR = new Map([
  ['api.js GET /ping',              'sağlık kontrolü — Railway ayakta mı diye buraya bakıyor'],
  ['api.js GET /health',            'sağlık kontrolü — aynı gerekçe'],
  ['auth.js POST /login',           'giriş yapmamış kullanıcı çağırır; kimliğin kendisi burada kuruluyor'],
  ['auth.js POST /register',        'kayıt — henüz kullanıcı yok'],
  ['auth.js POST /logout',          'oturumu yıkar; oturumu olmayanın çağırması zararsız'],
  ['auth.js GET /me',               'oturum var mı diye sorar, yoksa 401 döner — istemci açılışta buna bakıyor'],
  ['auth.js POST /forgot-password', 'parola sıfırlama, tanımı gereği giriş yapmadan kullanılır'],
  ['auth.js POST /reset-password',  'aynı akışın ikinci adımı; kod ile doğrulanıyor'],
  ['auth.js POST /google',          'Google ile giriş — kimlik burada kuruluyor'],
  // app.js'teki uç, tarama oraya da bakmaya başlayınca görünür oldu. SPA kökü:
  // giriş yapmamış kullanıcı da giriş ekranını alabilmeli, yoksa uygulama hiç
  // açılmaz. Kararın kendisi yeni değil; yalnızca artık görünür.
  ['app.js GET /',                  'SPA kökü — index.html servis ediyor, oturum açmamış kullanıcı giriş ekranını almalı'],
]);

/** routes/ altındaki ve app.js içindeki tüm uç kayıtlarını çıkarır. */
function ucKayitlari() {
  const kayitlar = [];
  // app.js ayrıca taranıyor, çünkü uç ORADA da tanımlanabiliyor: `app.get('/')`
  // bugün gerçekten var ve yalnızca router deseni arandığı sürece yapısal
  // olarak görünmezdi — korumasız kalsa test yeşil kalırdı.
  const kaynaklar = fs.readdirSync(ROUTES).sort()
    .filter((ad) => ad.endsWith('.js'))
    .map((ad) => [ad, path.join(ROUTES, ad)]);
  kaynaklar.push(['app.js', APP]);
  for (const [ad, dosyaYolu] of kaynaklar) {
    // Yorumlar boşaltılarak okunuyor: yorum satırına alınmış bir uç kaydı
    // gerçek uç sayılırsa, var olmayan bir uç için "korumasız" denir ya da
    // ACIK_UCLAR listesi hayalet kayıtla şişer.
    const src = yorumsuzDosya(dosyaYolu);
    // tasksRouter.patch( · notesRouter.post( · router.get( · app.get(
    const eslesmeler = [...src.matchAll(/(\w*[Rr]outer|app)\.(get|post|patch|put|delete)\(/g)];
    for (let i = 0; i < eslesmeler.length; i += 1) {
      const m = eslesmeler[i];
      // Kayıt çok satırlı yazılıyor:
      //     tasksRouter.patch(
      //       '/:taskId',
      //       requireAuth,
      // Bu yüzden ara yazılım listesi için bir pencereye bakıyoruz. 400
      // karakter, en uzun kayıtta bile ara yazılımları kapsıyor; handler
      // gövdesine taşacak kadar da uzun değil.
      //
      // Pencere BİR SONRAKİ KAYITTA da kesiliyor. Sabit 400 karakter tek
      // başına yanlış bir güvence veriyordu: kayıtlar tek satıra sığdığında
      // (mcp.js böyle) pencere sonraki kaydın içine taşıyor ve korumasız bir
      // uç, komşusunun ara yazılımını görüp aklanıyordu. 9 Eylül'de MCP
      // kapısını doğrulamak için bilerek korumasız bir uç bırakıldığında test
      // yeşil kaldı — kusur buydu. Aynı sınıf dil testinde de görülmüştü
      // (f3c5907: "bir anahtar iki metni birden aklıyordu"): komşuluk, testin
      // ölçtüğü şeyi sessizce genişletiyor.
      const sinir = i + 1 < eslesmeler.length
        ? Math.min(m.index + 400, eslesmeler[i + 1].index)
        : m.index + 400;
      const pencere = src.slice(m.index, sinir);
      const yolEsl = /['"`]([^'"`]*)['"`]/.exec(pencere);
      const ucYolu = yolEsl ? yolEsl[1] : '?';
      // `app.get('io')` Express'in AYAR okuması, uç kaydı değil — uç yolları
      // her zaman '/' ile başlar. Bu ayrım olmasaydı ayar okumaları hayalet
      // uç olarak listeye girer ve ACIK_UCLAR'ı gereksizce şişirirdi.
      if (m[1] === 'app' && !ucYolu.startsWith('/')) continue;
      kayitlar.push({
        dosya: ad,
        metot: m[2].toUpperCase(),
        yol: ucYolu,
        satir: src.slice(0, m.index).split(/\r?\n/).length,
        // İki denk kapı var. `requireAuth` oturum çerezine bakar; `requireMcpToken`
        // bearer anahtara. İkincisi MCP ucunda kullanılıyor, çünkü istek
        // kullanıcının Claude istemcisinden geliyor ve çerez taşıyamıyor.
        // MCP ucunu ACIK_UCLAR muafiyet listesine yazmak kolay olurdu ama
        // yanlış olurdu: uç açık değil, farklı korunuyor. Muafiyet listesi
        // bayatlar (bir uç silinip korumasız geri gelebilir); kapı bayatlamaz.
        auth: /requireAuth|requireMcpToken/.test(pencere),
        mcpAuth: /requireMcpToken/.test(pencere),
      });
    }
  }
  return kayitlar;
}

const anahtar = (k) => `${k.dosya} ${k.metot} ${k.yol}`;

describe('yetkilendirme — her uç kimlik doğrulamasından geçmeli', () => {
  test('listede olmayan hiçbir uç requireAuth\'suz değil', () => {
    const korumasiz = ucKayitlari()
      .filter((k) => !k.auth && !ACIK_UCLAR.has(anahtar(k)))
      .map((k) => `${k.dosya}:${k.satir}  ${k.metot} ${k.yol}`);

    assert.deepEqual(
      korumasiz, [],
      'Bu uçlar requireAuth taşımıyor. Ara yazılımı ekle; uç gerçekten herkese '
      + 'açık olacaksa yetki.test.js\'teki ACIK_UCLAR listesine GEREKÇESİYLE yaz.',
    );
  });

  test('açık uç listesi bayatlamıyor — silinen uç listede kalmaz', () => {
    // Bayat muafiyet, muafiyetin kendisinden tehlikeli: bir uç silinip aynı
    // adla korumasız yeniden eklendiğinde liste onu sessizce aklardı.
    const mevcut = new Set(ucKayitlari().map(anahtar));
    const hayalet = [...ACIK_UCLAR.keys()].filter((k) => !mevcut.has(k));
    assert.deepEqual(
      hayalet, [],
      'ACIK_UCLAR listesinde artık var olmayan uçlar var. Listeden çıkar.',
    );
  });

  test('tarayıcı gerçekten uç buluyor', () => {
    // Ayrıştırıcı bozulursa üstteki iki test boş kümeyle sessizce geçerdi.
    const kayitlar = ucKayitlari();
    assert.ok(kayitlar.length > 90, `Beklenenden az uç bulundu: ${kayitlar.length}`);
    assert.ok(
      kayitlar.filter((k) => k.auth).length > 90,
      'requireAuth taşıyan uç sayısı beklenenden az — ara yazılım adı değişmiş olabilir',
    );
  });
});

// ─── 1b. MCP ucu kendi kapısını taşımalı ────────────────────────────────────
//
// Yukarıdaki test "bir kapı var mı" diye soruyor; iki kapıyı da denk sayıyor.
// Bu, tek başına bir boşluk bırakırdı: MCP ucuna yanlışlıkla `requireAuth`
// yazmak testi geçerdi ama uç pratikte kullanılamaz olurdu — Claude istemcisi
// oturum çerezi taşımıyor, her istek 401 alırdı. Ters yönü daha kötü: oturumlu
// bir tarayıcı isteği MCP ucuna ulaşabilir hale gelirdi.
//
// Bu yüzden ikinci bir değişmez: mcp.js'teki HER uç `requireMcpToken` taşır.

describe('MCP ucu — kendi kimlik kapısından geçmeli', () => {
  test('mcp.js içindeki her uç requireMcpToken taşıyor', () => {
    const eksik = ucKayitlari()
      .filter((k) => k.dosya === 'mcp.js' && !k.mcpAuth)
      .map((k) => `${k.dosya}:${k.satir}  ${k.metot} ${k.yol}`);

    assert.deepEqual(
      eksik, [],
      'MCP uçları requireMcpToken taşımak zorunda. requireAuth burada işe '
      + 'yaramaz: istek Claude istemcisinden geliyor ve oturum çerezi taşımıyor.',
    );
  });

  test('tarayıcı MCP uçlarını gerçekten görüyor', () => {
    // Dosya adı değişir ya da router adlandırması ayrıştırıcıya uymazsa
    // üstteki test boş kümeyle sessizce geçerdi.
    const mcp = ucKayitlari().filter((k) => k.dosya === 'mcp.js');
    assert.ok(mcp.length >= 3, `mcp.js'te beklenenden az uç bulundu: ${mcp.length}`);
  });
});

// ─── 1c. Tarama kapsamı — kapsam listesi elle bakımlı olmasın ───────────────
//
// Kusur sınıfı: tarama `routes/` ve `sockets/` dizinlerini ELLE biliyordu.
// Yeni bir dizine uç eklenir ya da bir router başka yere taşınırsa tarama onu
// görmez ve üstteki testler SESSİZCE geçer — koruma kalktığı hâlde yeşil
// kalırlar. Bu, deponun tekrar eden kusuru: doğrulayanın kapsamı, doğruladığı
// şeyden bağımsız daralabiliyor.
//
// Kapsam artık kaynaktan türetiliyor: `app.js` neyi mount ediyorsa tarama onu
// görmek zorunda. Liste bayatlayamaz, çünkü liste yok.

describe('tarama kapsamı — mount edilen her şey taranıyor', () => {
  const appSrc = yorumsuzDosya(APP);
  const indexSrc = yorumsuzDosya(INDEX);

  test('router taşıyan her import routes/ altından geliyor', () => {
    const disarida = [];
    for (const m of appSrc.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      if (!/[Rr]outer\b/.test(m[1])) continue;
      if (!m[2].startsWith('./routes/')) {
        disarida.push(`${m[1].trim().replace(/\s+/g, ' ')} ← ${m[2]}`);
      }
    }
    assert.deepEqual(
      disarida, [],
      'Bu router routes/ dışından geliyor ve yetki taraması onu görmüyor. '
      + 'Ya routes/ altına taşı ya da ROUTES kümesini genişlet — aksi hâlde o '
      + 'dosyadaki korumasız bir uç bu testlerden sessizce geçer.',
    );
  });

  test('soket işleyicisi taşıyan her import sockets/ altından geliyor', () => {
    const disarida = [];
    for (const m of indexSrc.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      if (!/register\w*Handlers/.test(m[1])) continue;
      if (!m[2].startsWith('./sockets/')) {
        disarida.push(`${m[1].trim().replace(/\s+/g, ' ')} ← ${m[2]}`);
      }
    }
    assert.deepEqual(
      disarida, [],
      'Soket işleyicisi sockets/ dışından kaydediliyor; kimlik taraması onu '
      + 'görmüyor. SOCKETS kümesini genişlet ya da dosyayı sockets/ altına al.',
    );
  });

  test('mount edilen her routes dosyasında tarama en az bir uç buluyor', () => {
    const mountlanan = [...appSrc.matchAll(/from\s*'\.\/routes\/([\w.-]+)'/g)].map((m) => m[1]);
    assert.ok(
      mountlanan.length >= 10,
      `app.js'te beklenenden az router dosyası görüldü: ${mountlanan.length}`,
    );
    const gorulen = new Set(ucKayitlari().map((k) => k.dosya));
    const korler = [...new Set(mountlanan)].filter((ad) => !gorulen.has(ad)).sort();
    assert.deepEqual(
      korler, [],
      'Bu dosyalar mount ediliyor ama tarama içlerinde tek bir uç bulamadı. '
      + 'Router adlandırması desene uymuyor olabilir; o dosyadaki uçların '
      + 'hiçbiri korunuyor mu diye denetlenmiyor demektir.',
    );
  });

  test('app.js içindeki uçlar gerçekten taranıyor', () => {
    // `app.get('/')` router deseniyle görünmezdi. Tarama onu görmezse
    // ACIK_UCLAR'daki girdisi de hayalete döner ve "liste bayatlamıyor"
    // testi bunu yakalar; bu test ise doğrudan söylüyor.
    const appUclari = ucKayitlari().filter((k) => k.dosya === 'app.js');
    assert.ok(appUclari.length >= 1, 'app.js taranmıyor — oradaki uçlar denetim dışı');
  });
});

// ─── 2. Soket kimliği yalnızca oturumdan okunur ─────────────────────────────
//
// Soket olaylarının HTTP uçlarından farklı ve daha sinsi bir riski var:
// olayın gövdesi tamamen istemciden geliyor. `data.user_id` gibi bir alana
// güvenen tek bir işleyici, herkesin herkes adına mesaj göndermesine yeter.
//
// Şu an doğru yapılıyor: kimlik `socket.request.session.userId` üzerinden bir
// kez çözülüyor (sockets/chat.js) ve işleyiciler bağlantıdaki `user` nesnesini
// kapatarak kullanıyor. Bu testin işi o kararı kilitlemek.
const KIMLIK_SIZINTISI = /\b(?:data|payload|msg|body)\s*(?:\?\.)?\.\s*(user_id|userId|sender|sender_id|senderId|as_user|impersonate)\b/g;

describe('soket — kimlik olay gövdesinden okunamaz', () => {
  test('hiçbir işleyici istemcinin gönderdiği kullanıcı kimliğine güvenmiyor', () => {
    const bulgular = [];
    for (const ad of fs.readdirSync(SOCKETS).sort()) {
      if (!ad.endsWith('.js')) continue;
      const src = yorumsuzDosya(path.join(SOCKETS, ad));
      src.split(/\r?\n/).forEach((satir, i) => {
        for (const m of satir.matchAll(KIMLIK_SIZINTISI)) {
          bulgular.push(`${ad}:${i + 1}  ${m[0]}`);
        }
      });
    }
    assert.deepEqual(
      bulgular, [],
      'Soket işleyicisi kullanıcı kimliğini olay gövdesinden okuyor. Kimlik '
      + 'yalnızca socket.request.session.userId üzerinden çözülmeli — gövde '
      + 'tamamen istemci denetiminde.',
    );
  });

  test('kimlik çözümü oturuma bağlı', () => {
    const src = yorumsuzDosya(path.join(SOCKETS, 'chat.js'));
    assert.match(
      src, /socket\.request\??\.\s*session\??\.\s*userId/,
      'sockets/chat.js kimliği oturumdan çözmüyor — auth modeli değişmiş olabilir.',
    );
  });
});

// ─── Bilinçli olarak kapsam dışı ────────────────────────────────────────────
//
// "Her mutasyon ucu bir izin kapısından geçmeli" diye bir test YAZILMADI ve
// bu bilinçli bir karar. Denendi: 70 mutasyon ucunun 46'sı işaretlendi ve
// hepsi yanlış pozitifti. Sebep, kapsamlamanın tek biçimde yapılmaması:
//
//   POST /notifications/read-all  → izin yok, `userId: user.id` ile kapsanıyor
//   POST /notes                   → izin yok, aktif çalışma alanıyla kapsanıyor
//   PATCH /tasks/:taskId          → loadTaskWithAccess(permission:'manage_tasks')
//   DELETE /workspaces/me/trash   → requireWorkspacePermission
//
// Dördü de doğru; hiçbiri aynı imzayı taşımıyor. Kapsamlamanın DOĞRU olup
// olmadığını statik olarak anlamak mümkün değil — bunun için isteğin gerçekten
// çalıştırılması gerekiyor (supertest benzeri bir koşum, sahte oturum ve
// veritabanı). Asıl engel de bu; TODO.md'de "uç testleri" maddesi altında.
//
// Yanlış pozitif üreten test, testsizlikten kötüdür: 46 kez kurt masalı
// okuyan bir teste kimse bakmaz ve gerçek bulgu araya karışır. Bu yüzden
// burada yalnızca kesin doğrulanabilen iki değişmez kilitlendi.
