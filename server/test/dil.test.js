// Dil kapsamı — her yeni özellik Türkçe ve İngilizce ile birlikte gelmeli.
//
// Kusur (3 Eylül 2026): Raporlar ve süre kaydı ekranları tamamen hardcode
// Türkçe yazılmıştı. Dil İngilizce seçilince gezinme İngilizce oluyor ama
// ekran gövdesi Türkçe kalıyordu. Kimse fark etmedi çünkü hiçbir şey
// bozulmuyordu — sadece yanlış dilde duruyordu.
//
// Bu, GUVENLIK.md'deki "sessiz başarısızlık" ailesinden: kontrol yok, hata
// yok, yalnızca sessizce yanlış sonuç. O yüzden belgeye kural yazmak yetmez,
// testle kilitlenmesi gerekir.
//
// İki şeyi koruyoruz:
//   1. tr ve en sözlükleri birebir aynı anahtar kümesine sahip olmalı.
//      Eksik anahtar sessizce Türkçe'ye düşer (window.t'nin fallback'i), yani
//      İngilizce arayüzde Türkçe metin çıkar.
//   2. Görünüm dosyalarında JSX metni olarak çıplak Türkçe kalmamalı.
//      Çeviri yedekleri T('anahtar', 'Türkçe') içinde yaşar; etiket arasında
//      doğrudan yazılmış Türkçe, çevrilmemiş metin demektir.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(__dirname, '..', '..', 'client', 'src');

const dataSrc = fs.readFileSync(path.join(CLIENT, 'data.jsx'), 'utf8');

/** APP_I18N içindeki bir dil bloğunun anahtarlarını çıkarır. */
function sozlukAnahtarlari(lang) {
  const satirlar = dataSrc.split(/\r?\n/);
  const bas = satirlar.findIndex((l) => new RegExp(`^  ${lang}: \\{`).test(l));
  assert.ok(bas >= 0, `APP_I18N içinde '${lang}' bloğu bulunamadı`);
  // Blok, girintisi iki boşluk olan ilk '},' satırında biter.
  let son = bas + 1;
  while (son < satirlar.length && !/^ {2}\},/.test(satirlar[son])) son += 1;
  // Satır satır işliyoruz, çünkü iki tuzak var:
  //   1. Yorum satırlarında Türkçe kesme işareti geçiyor ("3 Eylül'e"). Tek
  //      tırnak, string sökücüyü yanıltıp araya giren gerçek anahtarları yutar.
  //      Bu yüzden yorum satırları önce tamamen atılıyor.
  //   2. Bir satırda birden fazla anahtar olabiliyor (`a:'x', b:'y',`) ve
  //      değerlerin içinde iki nokta geçebiliyor; değerler silinmezse ya ikinci
  //      anahtar kaçar ya da metnin içinden hayalet anahtar üretilir.
  const anahtarlar = new Set();
  // bas+1: blok başlığının kendisi ("tr: {") anahtar sayılmasın.
  for (const satir of satirlar.slice(bas + 1, son)) {
    if (satir.trim().startsWith('//')) continue;
    // Hem tek hem çift tırnak: içinde kesme işareti geçen Türkçe değerler
    // ("DM'ler her zaman gelir") çift tırnakla yazılmış. Yalnızca tek tırnağı
    // sökmek, değerin içindeki kesme işaretinin sahte string başlatıp sonraki
    // anahtarı yutmasına yol açıyordu.
    const temiz = satir.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
    for (const m of temiz.matchAll(/\b([a-z][a-z0-9_]*)\s*:/g)) anahtarlar.add(m[1]);
  }
  return anahtarlar;
}

describe('dil sözlüğü — tr ve en aynı anahtarları taşımalı', () => {
  test('en sözlüğünde eksik anahtar yok', () => {
    const tr = sozlukAnahtarlari('tr');
    const en = sozlukAnahtarlari('en');
    const eksik = [...tr].filter((k) => !en.has(k));
    assert.deepEqual(
      eksik, [],
      'Bu anahtarlar tr\'de var, en\'de yok. İngilizce arayüzde Türkçe metin görünür.',
    );
  });

  test('tr sözlüğünde eksik anahtar yok', () => {
    const tr = sozlukAnahtarlari('tr');
    const en = sozlukAnahtarlari('en');
    const eksik = [...en].filter((k) => !tr.has(k));
    assert.deepEqual(
      eksik, [],
      'Bu anahtarlar en\'de var, tr\'de yok. Türkçe arayüzde anahtarın kendisi görünür.',
    );
  });

  test('sözlük boş değil', () => {
    // Ayrıştırıcı bozulursa iki küme de boş çıkar ve üstteki iki test sessizce
    // geçerdi. Bu testin tek işi bunu engellemek.
    assert.ok(sozlukAnahtarlari('tr').size > 500, 'tr sözlüğü beklenenden küçük');
    assert.ok(sozlukAnahtarlari('en').size > 500, 'en sözlüğü beklenenden küçük');
  });
});

// ─── Çıplak Türkçe metin taraması ──────────────────────────────────────────
//
// Bu taramanın ilk hâli (3 Eylül) satır satır çalışıyor ve yalnızca aynı
// satırdaki `>metin<` kalıbını arıyordu. Üç sınıf metni kaçırıyordu ve
// "test geçiyorsa dil tamam" sanmaya yol açıyordu:
//   1. Süslü parantez içinde üretilen metin — {kosul ? 'kısıt yok' : …}
//   2. Açılış `>` ile kapanış `<` farklı satırlarda olan çok satırlı JSX metni
//   3. Öznitelik dışında kalan her türlü dize (toast mesajı, sabit tablo…)
// Bu yüzden ölçüt değişti: artık dosyanın tamamı taranıyor ve soru
// "metin nerede duruyor" değil, **"metnin bir sözlük anahtarı var mı"**.
//
// Türkçe metin dört meşru kalıpta bulunabiliyor ve dördünde de metnin hemen
// solunda ONA AİT bir sözlük anahtarı duruyor:
//     T('rep_kind_person', 'Kişi raporu')
//     window.t?.('cal_months') || 'Ocak,Şubat,…'
//     { k: 'rep_kind_person', fb: 'Kişi raporu' }      ← tablo kalıbı
//     ['rep_act_export', 'Rapor dışa aktarıldı']       ← çift kalıbı
// Anahtarın APP_I18N'de gerçekten var olduğu doğrulanıyor; uydurma bir anahtar
// kaçağı meşrulaştıramasın.

// Bilinçli istisnalar:
//   legal.jsx  — gizlilik ve hizmet şartları metni yalnızca Türkçe yayımlandı;
//                hukuki metnin çevirisi ürün kararı, çeviri boşluğu değil.
//   data.jsx   — APP_I18N sözlüğünün kendisi; Türkçe olması zaten amaç.
// auth.jsx artık istisna DEĞİL: kendi AUTH_I18N sözlüğü var (giriş ekranı,
// uygulama sözlüğü yüklenmeden çalışmak zorunda), o blok atlanıyor ama
// dışındaki metin taranıyor. Sözlüğün tr/en denkliği ayrıca kilitli.
const ISTISNA = new Set(['legal.jsx', 'data.jsx']);

// Dekoratif istisna: giriş ekranındaki Stoa mimari çizimi SVG <text> etiketleri
// taşıyor ("Arşitrav", "KESİT A-A — M 1:200"). Bunlar illüstrasyonun parçası,
// arayüz metni değil — teknik resim başka dile çevrilmez. Satır aralığı değil
// metnin kendisi listeleniyor: çizim düzenlenince aralık kayar, metin kalır.
const DEKORATIF = new Set([
  'Arşitrav', 'Sütun — İon. Düz.', 'KESİT A-A — M 1:200',
  '69.5 m — STOA CEPHESİ', '18.2 m — YÜKSEKLİK',
  // Dil adları kendi dillerinde yazılır (endonim): dil seçicide İngilizce
  // arayüzde de "Türkçe" görünmeli, "Turkish" değil. Çevrilmesi kusur olurdu.
  'Türkçe',
]);

const TURKCE = /[çğıöşüÇĞİÖŞÜ]/;

// Yorumları boşlukla değiştirir; satır numaraları korunur, dize içerikleri
// olduğu gibi kalır. Yorumlardaki Türkçe açıklama bulgu sayılmasın diye.
function yorumSil(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i += 1; }
    } else if (c === '/' && c2 === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '; i += 1;
      }
      out += '  '; i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      out += c; i += 1;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { out += src[i]; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
        out += src[i]; i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
    } else { out += c; i += 1; }
  }
  return out;
}

// Dile göre bölünmüş veri tabloları — meşru, atlanır.
//
// Takvim tatilleri dile göre AYRI KÜME kullanıyor: getHoliday() içinde
// lang==='de' ise DE_*, lang!=='tr' ise EN_*, değilse TR_* okunuyor. Yani
// TR_FIXED_HOL içindeki "Cumhuriyet Bayramı" yalnızca Türkçe arayüzde
// görünür — çevrilmemiş metin değil, o dile ait veri.
//
// Ölçüt isim değil eşleşme: `const TR_X` yalnızca aynı dosyada `const EN_X`
// varsa muaf. Böylece "TR_" öneki tek başına kaçağı aklayamaz; İngilizce
// karşılığı yazılmamışsa test yine kırılır.
function dilVerisiSatirlari(ham) {
  const satirlar = ham.split(/\r?\n/);
  const atla = new Set();
  const adlar = [...ham.matchAll(/^const (TR|EN|DE)_([A-Z0-9_]+)\s*=/gm)].map((m) => ({ dil: m[1], ad: m[2] }));
  const enVar = new Set(adlar.filter((a) => a.dil === 'EN').map((a) => a.ad));
  for (let i = 0; i < satirlar.length; i += 1) {
    const m = /^const (TR|EN|DE)_([A-Z0-9_]+)\s*=/.exec(satirlar[i]);
    if (!m || !enVar.has(m[2])) continue;
    // Bildirimin sonuna kadar: girintisiz `};` ya da `];`
    let son = i;
    while (son < satirlar.length && !/^[}\]];/.test(satirlar[son])) son += 1;
    for (let j = i; j <= son; j += 1) atla.add(j + 1);
  }
  return atla;
}

// auth.jsx'in kendi sözlük bloğu — meşru, atlanır.
function authSozlukSatirlari(ham) {
  const satirlar = ham.split(/\r?\n/);
  const bas = satirlar.findIndex((l) => /^const AUTH_I18N = \{/.test(l));
  if (bas < 0) return new Set();
  let son = bas;
  while (son < satirlar.length && !/^\};/.test(satirlar[son])) son += 1;
  const s = new Set();
  for (let i = bas; i <= son; i += 1) s.add(i + 1);
  return s;
}

function jsxDosyalari(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsxDosyalari(p);
    return e.isFile() && e.name.endsWith('.jsx') ? [p] : [];
  });
}

describe('görünüm dosyaları — çıplak Türkçe metin kalmamalı', () => {
  test('sözlük anahtarı olmayan Türkçe metin yok', () => {
    const sozluk = sozlukAnahtarlari('tr');
    const bulgular = [];

    for (const dosya of jsxDosyalari(CLIENT)) {
      const ad = path.basename(dosya);
      if (ISTISNA.has(ad)) continue;
      const ham = fs.readFileSync(dosya, 'utf8');
      const src = yorumSil(ham);
      const atlanacak = new Set([...authSozlukSatirlari(ham), ...dilVerisiSatirlari(ham)]);
      const satirlar = src.split(/\r?\n/);
      const satirNo = (idx) => src.slice(0, idx).split(/\r?\n/).length;

      const ekle = (idx, metin) => {
        const no = satirNo(idx);
        if (atlanacak.has(no)) return;
        if (DEKORATIF.has(metin.trim())) return;
        // lang === 'en' ? [...İngilizce...] : [...Türkçe...] — paralel dizi
        // kalıbı. İki dil de yazılmış, çeviri var; anahtar aranmaz.
        const pencere = satirlar.slice(Math.max(0, no - 4), no + 1).join('\n');
        if (/===\s*'en'|===\s*"en"|'en'\s*\?/.test(pencere)) return;
        bulgular.push(`${ad}:${no}  ${metin.trim().replace(/\s+/g, ' ').slice(0, 70)}`);
      };

      // 1. JSX metin düğümleri — çok satırlı olanlar dahil.
      //
      // İki ayrı kalıp gerekiyor. `>metin<` açılış etiketinden sonra geleni
      // yakalar; ama `{t.label} Odası` gibi ifadeyle metnin karıştığı
      // düğümlerde metin `}` ile `<` arasında kalıyor ve ilk kalıba düşmüyor.
      // Bu boşluktan "Odası" kaçmıştı (3 Eylül).
      for (const re of [/>([^<>{}]+)</g, /\}([^<>{}]+)</g]) {
        for (const m of src.matchAll(re)) {
          if (!TURKCE.test(m[1])) continue;
          if (!/[a-zçğıöşü]/i.test(m[1])) continue;
          // `}…<` kalıbı iki `}` ile `<` arasındaki her şeye uyuyor; bu
          // aralık bazen JSX metni değil koddur (`}); const x = a ? (b` gibi,
          // sonrasında bir `<` gelirse). Noktalı virgül, eşittir ve parantez
          // metinde geçmez — geçiyorsa bu kod, bulgu değil.
          if (/[;=()]/.test(m[1])) continue;
          ekle(m.index, m[1]);
        }
      }

      // 2. Sözlük anahtarıyla eşleşmeyen Türkçe dizeler.
      //
      // Dosyadaki tüm dizeler ÖNCE bir kez ayrıştırılıyor, sonra komşuluğa
      // bakılıyor. İlk hâli her metin için 160 karakterlik bir dilim alıp
      // içindeki tırnakları yeniden eşleştiriyordu; dilim bir dizenin
      // ortasından başlayınca eşleşme kayıyor ve doğru yazılmış kodu
      // ("shell_status_offline" anahtarı tam solundayken) kaçak sanıyordu.
      // Tek geçişte ayrıştırmak bu sınıfı tamamen ortadan kaldırıyor.
      const dizeler = [...src.matchAll(/(['"])((?:[^\\\n]|\\.)*?)\1/g)];
      for (let di = 0; di < dizeler.length; di += 1) {
        const m = dizeler[di];
        const metin = m[2];
        if (!TURKCE.test(metin)) continue;
        // Tek karakterlik değerler ayraç/işaret olabiliyor.
        //
        // Eşik önce 4'tü ve "Üye" (3 harf) bu yüzden hiç görülmüyordu:
        // settings.jsx üye listesindeki çıplak `'Üye'` iki ayrı elekten
        // birden kaçmıştı. Eşik düşürüldü, çünkü yukarıdaki TURKCE kontrolü
        // zaten kod olma ihtimalini eliyor: css sınıfı, id ve anahtar adları
        // Türkçe'ye özgü harf (ç ğ ı ö ş ü) taşımaz. Kısa olmak, arayüz
        // metni olmamak anlamına gelmiyor.
        if (metin.length < 2) continue;
        // Anahtar metnin solunda olabilir (T('k','Türkçe'), { k:'x', fb:'…' })
        // ya da sağında: _DOC_I18N_MAP gibi metinden anahtara giden eşleme
        // tabloları 'Açıklama': 'drawer_description' biçiminde yazılıyor.
        // Çift kalıbı iki yönde de meşru.
        // BİR ANAHTAR YALNIZCA BİR METNİ AKLAR.
        //
        // İlk hâli "solda 160 karakter içinde herhangi bir sözlük anahtarı
        // varsa meşru" diyordu ve gerçek bir kaçağı kaçırdı:
        //     m.ws_role === 'owner' ? _t('set_mem_owner','Sahip') : (m.role_name || 'Üye')
        // Buradaki `set_mem_owner` zaten 'Sahip'e ait; ama 'Üye'nin de
        // solunda kaldığı için onu da aklıyordu. `'Üye'` sözlükte yok,
        // İngilizce arayüzde Türkçe çıkıyordu (settings.jsx üye listesi).
        //
        // Ölçüt artık yakınlık değil BİTİŞİKLİK: metinden hemen önceki
        // tırnaklı belirteç sözlük anahtarı olmalı. Dört meşru kalıpta da
        // anahtar zaten hemen soldadır:
        //     T('k', 'tr')  ·  t?.('k') || 'tr'  ·  { k:'x', fb:'tr' }  ·  ['k','tr']
        // Araya başka bir metin girdiyse o anahtar tüketilmiş demektir.
        // Komşu dize: bir öncekiler ve bir sonraki. Mesafe sınırı var, yoksa
        // dosyanın başka bir yerindeki alakasız anahtar metni aklayabilir.
        const yakin = (k) => k && Math.abs(k.index - m.index) < 160 ? k[2] : null;
        const aday = [yakin(dizeler[di - 1]), yakin(dizeler[di + 1])].filter(Boolean);
        if (aday.some((a) => sozluk.has(a))) continue;

        // Kardeş alan kalıbı: `label:'Klasör', label_en:'Folder'`. Metin bir
        // nesne alanının değeriyse ve aynı nesnede `<alan>_en` varsa çeviri
        // yazılmış demektir — sözlük yerine yan yana duran iki dil.
        // PROJECT_ICONS (50 tooltip) ve TEMPLATE_META (şablon önizlemesi)
        // bunu kullanıyor; ikisi de sözlüğe taşınsa gereksiz yere şişerdi.
        const alanOnce = src.slice(Math.max(0, m.index - 160), m.index);
        const alanEsl = [...alanOnce.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].pop();
        if (alanEsl) {
          const alan = alanEsl[1];
          if (!alan.endsWith('_en')) {
            const kardesPencere = src.slice(m.index, m.index + 600);
            if (new RegExp(`\\b${alan}_en\\s*:`).test(kardesPencere)) continue;
          }
        }
        ekle(m.index, metin);
      }
    }

    assert.deepEqual(
      bulgular, [],
      'Sözlük anahtarı olmayan Türkçe metin. T(\'anahtar\', \'Türkçe\') kullan '
      + 've anahtarı data.jsx içindeki hem tr hem en sözlüğüne ekle.',
    );
  });

  // Giriş ekranı uygulama sözlüğünden önce çalıştığı için kendi AUTH_I18N
  // sözlüğünü taşıyor. Ayrı mekanizma ama aynı kural geçerli: iki dil de
  // eksiksiz olmalı, yoksa authT sessizce Türkçe'ye düşer.
  test('AUTH_I18N tr ve en aynı anahtarları taşımalı', () => {
    const src = fs.readFileSync(path.join(CLIENT, 'views', 'auth.jsx'), 'utf8');
    const satirlar = src.split(/\r?\n/);
    const blok = (lang) => {
      const bas = satirlar.findIndex((l) => new RegExp(`^  ${lang}: \\{`).test(l));
      assert.ok(bas >= 0, `AUTH_I18N içinde '${lang}' bloğu bulunamadı`);
      let son = bas + 1;
      while (son < satirlar.length && !/^ {2}\},?$/.test(satirlar[son])) son += 1;
      const set = new Set();
      for (const s of satirlar.slice(bas + 1, son)) {
        if (s.trim().startsWith('//')) continue;
        const t = s.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
        for (const m of t.matchAll(/\b([a-z][a-z0-9_]*)\s*:/g)) set.add(m[1]);
      }
      return set;
    };
    const tr = blok('tr');
    const en = blok('en');
    assert.ok(tr.size > 20, 'AUTH_I18N tr bloğu beklenenden küçük');
    assert.deepEqual([...tr].filter((k) => !en.has(k)), [], 'AUTH_I18N en\'de eksik anahtar');
    assert.deepEqual([...en].filter((k) => !tr.has(k)), [], 'AUTH_I18N tr\'de eksik anahtar');
  });

  // Kullanıcının gördüğü metin yalnızca etiketler arasında olmuyor: title,
  // placeholder ve aria-label da okunuyor — sonuncusunu ekran okuyucu
  // kullananlar duyuyor. Bunlar JSX metni taramasına düşmediği için ayrı.
  test('title/placeholder/aria-label içinde çevrilmemiş Türkçe yok', () => {
    const bulgular = [];
    const attrRe = /\b(title|placeholder|aria-label|ariaLabel)=["']([^"']*)["']/g;
    for (const dosya of jsxDosyalari(CLIENT)) {
      const ad = path.basename(dosya);
      if (ISTISNA.has(ad)) continue;
      const satirlar = fs.readFileSync(dosya, 'utf8').split(/\r?\n/);
      satirlar.forEach((satir, i) => {
        const kirpik = satir.trim();
        if (kirpik.startsWith('//') || kirpik.startsWith('*')) return;
        for (const m of satir.matchAll(attrRe)) {
          if (TURKCE.test(m[2])) bulgular.push(`${ad}:${i + 1}  ${m[1]}="${m[2]}"`);
        }
      });
    }
    assert.deepEqual(
      bulgular, [],
      'Öznitelik metni çevrilmemiş. Değeri {window.t?.(\'anahtar\') || \'Türkçe\'} '
      + 'biçimine çevir ve anahtarı iki sözlüğe de ekle.',
    );
  });
});

// ─── Sunucu hata mesajları ─────────────────────────────────────────────────
//
// Sunucudan dönen hata metni de kullanıcıya gösteriliyor; Raporlar ekranındaki
// "Başka kullanıcının raporunu görme yetkiniz yok" İngilizce arayüzde Türkçe
// çıkıyordu (3 Eylül). Sözleşme: { error: 'kod', message: 'Türkçe' }. İstemci
// kodu çevirir, sözlükte yoksa message'a düşer.
//
// Çeviri tek noktada, apiFetch içinde yapılıyor: gelen kod sözlükten geçiriliyor,
// karşılığı yoksa sunucunun message'ına düşüyor. Bu yüzden yüzden fazla çağrı
// noktasının hiçbirine dokunmak gerekmedi.
//
// Yeni bir route dosyası eklenirse listeye yazılmalı.
const HATA_DOSYALARI = [
  'api.js', 'attachments.js', 'channels.js', 'chat.js', 'mcp.js', 'notes.js',
  'notifications.js', 'projects.js', 'reports.js', 'tasks.js', 'workspaces.js',
];

describe('sunucu hata mesajları — koda bağlı ve çevrili olmalı', () => {
  test('error alanı düz Türkçe metin değil, kod taşıyor', () => {
    const bulgular = [];
    for (const ad of HATA_DOSYALARI) {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', 'src', 'routes', ad), 'utf8',
      );
      for (const m of src.matchAll(/\berror:\s*'([^']+)'/g)) {
        if (TURKCE.test(m[1]) || /\s/.test(m[1])) bulgular.push(`${ad}  error: '${m[1]}'`);
      }
    }
    assert.deepEqual(
      bulgular, [],
      'Hata metni doğrudan error alanına yazılmış. { error: \'err_kod\', '
      + 'message: \'Türkçe\' } biçimine çevir.',
    );
  });

  // Mesajı dinamik olan kodlar sözlükten muaf: metnin içine sunucuda oluşan
  // değerler gömülüyor (kolon adları gibi), o yüzden sabit bir karşılığı
  // olamaz. Bunlarda cümle sunucuda, isteğin dilinde kuruluyor ve apiFetch
  // sözlükte karşılık bulamayınca o message'a düşüyor.
  const DINAMIK_MESAJLI = new Set(['err_transition_not_allowed']);

  test('her hata kodunun iki sözlükte de karşılığı var', () => {
    const tr = sozlukAnahtarlari('tr');
    const en = sozlukAnahtarlari('en');
    const eksik = [];
    for (const ad of HATA_DOSYALARI) {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', 'src', 'routes', ad), 'utf8',
      );
      for (const m of src.matchAll(/\berror:\s*'(err_[a-z0-9_]+)'/g)) {
        if (DINAMIK_MESAJLI.has(m[1])) continue;
        if (!tr.has(m[1])) eksik.push(`${m[1]} (tr)`);
        if (!en.has(m[1])) eksik.push(`${m[1]} (en)`);
      }
    }
    assert.deepEqual(
      eksik, [],
      'Sunucu bu kodu döndürüyor ama sözlükte karşılığı yok; kullanıcı ham kodu '
      + 'ya da sunucunun Türkçe metnini görür.',
    );
  });
});
