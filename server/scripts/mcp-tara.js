// MCP ucunun uçtan uca taraması — çalışan sunucu, gerçek veri.
//
//   npm run mcp:tara                                     yerel sunucu
//   MCP_URL=https://stoaboard.com/mcp npm run mcp:tara   canlı (anahtar oradaysa)
//
// ── Neden `npm test`in içinde değil ───────────────────────────────────────
//
// `npm test` saf: veritabanı istemiyor, ofis ağında da koşuyor ve push kancası
// ona yaslanıyor. Bu betik ise ÇALIŞAN bir sunucuya gerçek MCP istekleri
// atıyor; sunucu da veritabanı istiyor. İkisini karıştırmak kancayı ağa
// bağımlı yapardı.
//
// ── Neden var ─────────────────────────────────────────────────────────────
//
// 9 Eylül'deki 21/21 taraması oturumluktu ve kayboldu; her MCP turu onu
// yeniden yazdı, doğrulama da her seferinde kullanıcının üzerinden dolaştı
// (push → Railway → Cowork → rapor). Bu betik o döngünün yerel karşılığı:
// MCP'ye dokunan her değişiklikten sonra dakikalar içinde koşar. Cowork son
// onay olarak kalır.
//
// Birim testlerinin göremediği sınıfı hedefliyor: **aynı olgunun iki
// okuyucusu.** 9-11 Eylül'deki dört kusurun dördü de böyleydi (kolon slug'ı,
// `weeklyDone`, açık görev sayımı, owner izinleri) — her okuyucu kendi başına
// doğru, aralarındaki sözleşme kırık. Bu yüzden kontrollerin çoğu bir aracın
// cevabını ÖBÜR araçla karşılaştırıyor: `list_projects`in `open` sayısını
// `list_tasks`in uzunluğuyla, `list_members`in yükünü kartların kendisiyle,
// listedeki kırpılmış açıklamayı `get_task`teki tam metinle.
//
// ── Okurken nelere dikkat ─────────────────────────────────────────────────
//
// **Boş alanda yeşil tarama hiçbir şey kanıtlamaz** (DEVIR 0-A ve 0-E — iki
// kez yaşandı). Betik önce `whoami` ile aktif alanı basıyor. Başarı yolu veri
// yokluğundan koşamadıysa kontrol "atlandı" sayılıyor ve çıkış kodu 0 DEĞİL:
//
//   0  hepsi geçti     1  en az biri kaldı     2  kalan yok ama atlanan var
//
// **Salt okuma, ama iz bırakıyor.** Araçların hiçbiri veri değiştirmiyor.
// Yine de her araç çağrısı `mintSession` ile kısa ömürlü bir oturum satırı
// yazıyor, kapı kontrolündeki bilerek başarısız istekler de denetim kaydına
// düşüyor. Yerel `.env` production'ı gösteriyor; bu izler oraya gidiyor.
//
// **Alan dışı kontroller veritabanına bakıyor.** MCP yalnızca aktif alanı
// görüyor; başka alandaki bir kimliği bulmanın tek yolu Prisma. Kullanıcının
// üye olduğu öbür alanlardan kayıt seçiliyor — P0'ın tam senaryosu: API o
// kaydı açardı, MCP açmamalı. Veritabanına ulaşılamazsa bu bölüm atlanıyor.
// `MCP_URL` canlıyı gösterirken yerel `.env` başka bir veritabanını
// gösteriyorsa kimlikler anlamsızlaşır; betik hangi veritabanına baktığını
// başta basıyor.
//
// Ortam: MCP_URL (varsayılan http://localhost:PORT/mcp), MCP_TOKEN (ham
// anahtar; yoksa STOA_MCP_TOKENS'tan MCP_SLUG ile seçilen ya da ilk çift).
// Anahtar hiçbir koşulda ekrana basılmaz.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { ARAC_BASLIKLARI, DESC_SINIRI, kelimedeKes, katla } from '../src/lib/mcpShape.js';
import { ALL_PERMISSIONS } from '../src/lib/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Hedef ve anahtar ──────────────────────────────────────────────────────

const HEDEF = process.env.MCP_URL || `http://localhost:${config.port}/mcp`;

/**
 * Beklenen sürüm kaynaktan okunuyor, elle yazılmıyor: betik her sürüm
 * artışında güncellenmek zorunda kalmasın. Canlıya karşı koşarken bu, "yerel
 * kaynaktaki sürüm canlıya indi mi" sorusunun cevabı — dağıtımın indiğini
 * anlamanın tek yolu `serverInfo.version` (MCP-SURUMLER.md).
 */
const BEKLENEN_SURUM = (/const MCP_VERSION = '([^']+)'/.exec(
  fs.readFileSync(path.resolve(__dirname, '..', 'src', 'routes', 'mcp.js'), 'utf8'),
) || [])[1];

/** Olmayan kayıt kimliği: int4 sınırının hemen altı, ardışık kimliklerle ulaşılmaz. */
const OLMAYAN = 2147480000;

function anahtariSec() {
  if (process.env.MCP_TOKEN) {
    return { slug: process.env.MCP_SLUG?.toLowerCase() || null, token: process.env.MCP_TOKEN.trim() };
  }
  const ciftler = String(process.env.STOA_MCP_TOKENS || '')
    .split(/[,\n\r]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(':');
      return i < 0 ? null : { slug: p.slice(0, i).trim().toLowerCase(), token: p.slice(i + 1).trim() };
    })
    .filter(Boolean);
  const istenen = process.env.MCP_SLUG?.toLowerCase();
  return (istenen ? ciftler.find((c) => c.slug === istenen) : ciftler[0]) || null;
}

const ANAHTAR = anahtariSec();

// ─── HTTP ve JSON-RPC ──────────────────────────────────────────────────────

let istekSayisi = 0;
let sinirdaKalan = null;
let rpcNo = 0;

async function istek({ yontem = 'POST', govde, token, basliklar = {}, sorgu = {} } = {}) {
  const adres = new URL(HEDEF);
  for (const [k, v] of Object.entries(sorgu)) adres.searchParams.set(k, v);
  const h = { Accept: 'application/json, text/event-stream', ...basliklar };
  if (govde !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;

  istekSayisi += 1;
  const res = await fetch(adres, {
    method: yontem,
    headers: h,
    body: govde === undefined ? undefined : JSON.stringify(govde),
  });
  sinirdaKalan = res.headers.get('ratelimit-remaining') ?? sinirdaKalan;
  const metin = await res.text();
  let json = null;
  try { json = JSON.parse(metin); } catch { /* JSON değilse metin yeter */ }
  return { status: res.status, basliklar: res.headers, metin, json };
}

function initialize() {
  return {
    jsonrpc: '2.0',
    id: ++rpcNo,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'mcp-tara', version: BEKLENEN_SURUM },
    },
  };
}

function rpc(method, params, secenek = {}) {
  return istek({
    govde: { jsonrpc: '2.0', id: ++rpcNo, method, params },
    token: ANAHTAR.token,
    ...secenek,
  });
}

/** Her başarılı araç yanıtı — sondaki genel biçim kontrolleri bunların üstünde koşuyor. */
const yanitlar = [];

async function arac(ad, args = {}) {
  const r = await rpc('tools/call', { name: ad, arguments: args });
  if (r.status !== 200 || !r.json) {
    throw new Error(`${ad}: HTTP ${r.status} — ${r.metin.slice(0, 160)}`);
  }
  if (r.json.error) {
    return { hata: true, metin: JSON.stringify(r.json.error), veri: null };
  }
  const { result } = r.json;
  const metin = result?.content?.[0]?.text ?? '';
  let veri = null;
  try { veri = JSON.parse(metin); } catch { /* genel biçim kontrolü yakalar */ }
  if (!result?.isError) yanitlar.push({ ad, metin, veri });
  return { hata: Boolean(result?.isError), metin, veri };
}

// ─── Kayıt ─────────────────────────────────────────────────────────────────

const kayit = { gecti: 0, kaldi: [], atlandi: [] };
let bolumAdi = '';

function kontrol(ad, kosul, ayrinti = '') {
  if (kosul) {
    kayit.gecti += 1;
    console.log(`  ✔ ${ad}`);
  } else {
    kayit.kaldi.push(`${bolumAdi} › ${ad}${ayrinti ? ` — ${ayrinti}` : ''}`);
    console.log(`  ✘ ${ad}${ayrinti ? `  (${ayrinti})` : ''}`);
  }
  return kosul;
}

/** Adlandırılmış koşullar — kaldığında hangisinin düştüğü satırda görünsün. */
function hepsiTutmali(ad, kosullar) {
  const tutmayan = Object.entries(kosullar).filter(([, v]) => !v).map(([k]) => k);
  return kontrol(ad, tutmayan.length === 0, tutmayan.length ? `tutmayan: ${tutmayan.join(', ')}` : '');
}

/** Atlanan kontrol geçmiş sayılmaz — sessiz atlama bu deponun tekrar eden kusuru. */
function atla(ad, sebep) {
  kayit.atlandi.push(`${bolumAdi} › ${ad} — ${sebep}`);
  console.log(`  – ${ad}  (atlandı: ${sebep})`);
}

function bilgi(metin) {
  console.log(`    · ${metin}`);
}

async function bolum(ad, fn) {
  bolumAdi = ad;
  console.log(`\n${ad}`);
  try {
    await fn();
  } catch (err) {
    kayit.kaldi.push(`${ad} › bölüm yarıda kaldı — ${err.message}`);
    console.log(`  ✘ bölüm yarıda kaldı: ${err.message}`);
  }
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────

function ayniKume(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
}

function enCok(degerler) {
  const say = new Map();
  for (const d of degerler) say.set(d, (say.get(d) || 0) + 1);
  return [...say].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Açık kart başlıklarında en çok kartta geçen iki harf — kesme ve süzme denemeleri için. */
function enSikIkili(gorevler) {
  const say = new Map();
  for (const g of gorevler) {
    const k = katla(g.title);
    const gorulen = new Set();
    for (let i = 0; i < k.length - 1; i += 1) {
      const ikili = k.slice(i, i + 2);
      if (/^\p{L}{2}$/u.test(ikili)) gorulen.add(ikili);
    }
    for (const x of gorulen) say.set(x, (say.get(x) || 0) + 1);
  }
  return [...say].sort((a, b) => b[1] - a[1])[0]?.[0] || 'ar';
}

/** Değeri sayı olan bütün `id` / `*_id` alanlarının yolu — kural `sonuc()`te. */
function sayiKimlikler(deger, yol = '$', bulunan = []) {
  if (Array.isArray(deger)) {
    deger.forEach((v, i) => sayiKimlikler(v, `${yol}[${i}]`, bulunan));
  } else if (deger && typeof deger === 'object') {
    for (const [k, v] of Object.entries(deger)) {
      if ((k === 'id' || k.endsWith('_id')) && typeof v === 'number') bulunan.push(`${yol}.${k}`);
      else sayiKimlikler(v, `${yol}.${k}`, bulunan);
    }
  }
  return bulunan;
}

function basliklarDogru(araclar, dil) {
  const beklenen = Object.keys(ARAC_BASLIKLARI);
  return araclar.length === beklenen.length
    && araclar.every((a) => a.title === ARAC_BASLIKLARI[a.name]?.[dil]);
}

const bugun = () => new Date().toISOString().slice(0, 10);

function veritabaniHostu() {
  return (/@([^/:?]+)/.exec(process.env.DATABASE_URL || '') || [])[1] || 'tanımsız';
}

let dbDurumu;
async function veritabaniHazir() {
  if (dbDurumu === undefined) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbDurumu = { ok: true };
    } catch (err) {
      dbDurumu = { ok: false, sebep: String(err.message).trim().split('\n').pop() };
    }
  }
  return dbDurumu;
}

// ─── Tarama ────────────────────────────────────────────────────────────────

const durum = {
  alan: null, // whoami.workspace — bütün bağlam damgaları buna karşı
  kullanici: null,
  izinler: [],
  projeler: [],
  bitis: new Map(), // proje id → bitiş kolonu slug kümesi
  acik: new Map(), // proje id → list_tasks varsayılanı
  hepsi: new Map(), // proje id → include_done
  notSayisi: 0,
  ref: null, // olmayan kayıtların 404 gövdeleri — alan dışı bunlarla kıyaslanıyor
};

const tumAcik = () => [...durum.acik.values()].flat();
const tumKartlar = () => [...durum.hepsi.values()].flat();

function ozet() {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(
    `Kapsam: alan "${durum.alan?.name ?? '?'}", ${durum.projeler.length} proje, `
    + `${tumAcik().length} açık / ${tumKartlar().length} toplam kart, ${durum.notSayisi} not`,
  );
  console.log(
    `${kayit.gecti} geçti, ${kayit.kaldi.length} kaldı, ${kayit.atlandi.length} atlandı — `
    + `${istekSayisi} MCP isteği, hız sınırında kalan ${sinirdaKalan ?? '?'} (600 / 15 dk)`,
  );
  if (kayit.kaldi.length) {
    console.log('\nKalanlar:');
    for (const k of kayit.kaldi) console.log(`  ✘ ${k}`);
  }
  if (kayit.atlandi.length) {
    console.log('\nAtlananlar — geçmiş SAYILMAZ:');
    for (const k of kayit.atlandi) console.log(`  – ${k}`);
  }
  if (kayit.kaldi.length) return 1;
  return kayit.atlandi.length ? 2 : 0;
}

/**
 * Taramanın kendisi — çıkış kodunu döndürür, süreci kendisi bitirmez.
 *
 * Önceden erken dönüşler `$disconnect`in hemen ardından `process.exit`
 * çağırıyordu. Windows'ta bu, libuv'yi bir iddia hatasıyla düşürdü
 * (`UV_HANDLE_CLOSING`, async.c): canlıya karşı ilk koşuda 401 yolu 1 yerine
 * 127 ile çıktı (11 Eylül). Kod artık `process.exitCode`a yazılıyor ve süreç
 * bağlantılar kapanınca kendiliğinden bitiyor — 0/1/2 sözleşmesi betiği
 * çağıranın elinde kalsın.
 */
async function tara() {
  if (!ANAHTAR?.token) {
    console.error('Anahtar yok: STOA_MCP_TOKENS (.env) ya da MCP_TOKEN tanımlı olmalı.');
    return 1;
  }

  console.log(`MCP taraması → ${HEDEF}`);
  console.log(
    `anahtar: ${ANAHTAR.slug || '(MCP_TOKEN)'} · kaynaktaki sürüm ${BEKLENEN_SURUM} · `
    + `veritabanı ${veritabaniHostu()}`,
  );

  let elSikisma;
  try {
    elSikisma = await istek({ govde: initialize(), token: ANAHTAR.token });
  } catch (err) {
    console.error(`\nSunucuya ulaşılamadı: ${HEDEF} (${err.cause?.code || err.message}).`);
    console.error('Yerel tarama için önce sunucuyu aç: npm start');
    return 1;
  }
  if (elSikisma.status === 401) {
    console.error(`\nAnahtar bu sunucuda geçersiz (${elSikisma.json?.error}). Canlı için MCP_TOKEN ile ver.`);
    return 1;
  }

  await bolum('Kapı', async () => {
    const anahtarsiz = await istek({ govde: initialize() });
    kontrol(
      'anahtarsız istek 401',
      anahtarsiz.status === 401 && anahtarsiz.json?.error === 'err_mcp_token_invalid',
      `HTTP ${anahtarsiz.status}`,
    );
    const yanlis = await istek({ govde: initialize(), token: crypto.randomBytes(24).toString('hex') });
    kontrol(
      'yanlış anahtar 401 — anahtarsızla aynı gövde',
      yanlis.status === 401 && yanlis.metin === anahtarsiz.metin,
      `HTTP ${yanlis.status}`,
    );
    const get = await istek({ yontem: 'GET', token: ANAHTAR.token });
    kontrol('GET 405, Allow: POST', get.status === 405 && get.basliklar.get('allow') === 'POST', `HTTP ${get.status}`);
    const del = await istek({ yontem: 'DELETE', token: ANAHTAR.token });
    kontrol('DELETE 405', del.status === 405, `HTTP ${del.status}`);
  });

  await bolum('El sıkışma', async () => {
    const bilgiNesnesi = elSikisma.json?.result?.serverInfo;
    kontrol(
      `initialize → ${bilgiNesnesi?.name} ${bilgiNesnesi?.version}`,
      elSikisma.status === 200 && bilgiNesnesi?.name === 'stoaboard' && bilgiNesnesi?.version === BEKLENEN_SURUM,
      `kaynakta ${BEKLENEN_SURUM}; canlıya karşıysa dağıtım inmemiş olabilir`,
    );
    kontrol('durum tutmayan kip — oturum kimliği dönmüyor', !elSikisma.basliklar.get('mcp-session-id'));

    const beklenen = Object.keys(ARAC_BASLIKLARI);
    const araclar = (await rpc('tools/list', {})).json?.result?.tools || [];
    kontrol(
      `araç listesi: ${araclar.length}`,
      araclar.length === beklenen.length && ayniKume(araclar.map((a) => a.name), beklenen),
      `beklenen: ${beklenen.join(', ')}`,
    );
    kontrol('hepsi salt okuma (readOnlyHint)', araclar.length > 0 && araclar.every((a) => a.annotations?.readOnlyHint === true));
    kontrol('başlıklar Türkçe (varsayılan)', basliklarDogru(araclar, 'tr'));

    const en = (await rpc('tools/list', {}, { sorgu: { lang: 'en' } })).json?.result?.tools || [];
    kontrol('?lang=en → başlıklar İngilizce', basliklarDogru(en, 'en'));
    const al = (await rpc('tools/list', {}, { basliklar: { 'Accept-Language': 'en-US,en;q=0.9' } })).json?.result?.tools || [];
    kontrol('Accept-Language: en → başlıklar İngilizce', basliklarDogru(al, 'en'));
    bilgi('Claude bağlayıcısının Accept-Language gönderip göndermediği buradan görünmez');
  });

  await bolum('Kimlik — whoami', async () => {
    const v = (await arac('whoami')).veri || {};
    durum.alan = v.workspace || null;
    durum.kullanici = v.user || null;
    durum.izinler = v.permissions || [];
    hepsiTutmali('whoami', {
      'user.slug': ANAHTAR.slug ? v.user?.slug === ANAHTAR.slug : Boolean(v.user?.slug),
      'workspace.id metin': typeof v.workspace?.id === 'string',
      'server.version': v.server?.version === BEKLENEN_SURUM,
      'writable false': v.server?.writable === false,
      'title_language tr': v.server?.title_language === 'tr',
      'permissions_without_tools ⊆ permissions':
        (v.permissions_without_tools || []).every((p) => durum.izinler.includes(p)),
    });
    if (durum.alan) {
      bilgi(`aktif alan: "${durum.alan.name}" (id ${durum.alan.id}), rol ${v.role}, ${durum.izinler.length} izin`);
    }
  });

  if (!durum.alan) {
    console.log('\nAktif çalışma alanı okunamadı — bundan sonraki her kontrol anlamsız olurdu.');
    return ozet() || 1;
  }

  await bolum('Çalışma alanları', async () => {
    const { veri } = await arac('list_workspaces');
    const alanlar = veri?.workspaces || [];
    const aktifler = alanlar.filter((a) => a.is_current);
    hepsiTutmali(`list_workspaces: ${alanlar.length} alan`, {
      'count = uzunluk': veri?.count === alanlar.length,
      'tek is_current': aktifler.length === 1,
      'is_current = whoami alanı': aktifler[0]?.id === durum.alan.id,
    });
    const digerleri = alanlar.filter((a) => !a.is_current).map((a) => a.name);
    if (digerleri.length) bilgi(`öbür alanlar: ${digerleri.join(', ')}`);
  });

  await bolum('Projeler ve kolonlar', async () => {
    const { veri } = await arac('list_projects');
    durum.projeler = veri?.projects || [];
    kontrol(
      `list_projects: ${durum.projeler.length} proje`,
      veri?.count === durum.projeler.length && durum.projeler.every((p) => typeof p.id === 'string'),
    );
    if (!durum.projeler.length) {
      atla('kolonlar', 'aktif alanda proje yok');
      return;
    }
    for (const p of durum.projeler) {
      const { veri: k, hata } = await arac('list_columns', { project_id: p.id });
      const kolonlar = k?.columns || [];
      hepsiTutmali(`#${p.id} "${p.name}": ${kolonlar.length} kolon`, {
        'hata değil': !hata,
        project_id: k?.project_id === p.id,
        project_name: k?.project_name === p.name,
        'kolon var': kolonlar.length > 0,
        'id (slug) metin': kolonlar.every((c) => typeof c.id === 'string'),
        'db_id metin': kolonlar.every((c) => typeof c.db_id === 'string'),
        'title + title_tr': kolonlar.every((c) => typeof c.title === 'string' && 'title_tr' in c),
        'is_done boolean': kolonlar.every((c) => typeof c.is_done === 'boolean'),
      });
      durum.bitis.set(p.id, new Set(kolonlar.filter((c) => c.is_done).map((c) => c.id)));
    }
  });

  await bolum('Görevler — list_tasks', async () => {
    for (const p of durum.projeler) {
      const bitis = durum.bitis.get(p.id) || new Set();
      const a = (await arac('list_tasks', { project_id: p.id })).veri || {};
      const h = (await arac('list_tasks', { project_id: p.id, include_done: true })).veri || {};
      const acik = a.tasks || [];
      const hepsi = h.tasks || [];
      durum.acik.set(p.id, acik);
      durum.hepsi.set(p.id, hepsi);
      const kartlar = [...acik, ...hepsi];
      const hepsiIds = new Set(hepsi.map((t) => t.id));

      hepsiTutmali(`#${p.id} "${p.name}": ${acik.length} açık / ${hepsi.length} toplam`, {
        'count = uzunluk': a.count === acik.length && h.count === hepsi.length,
        'include_done yankısı': a.include_done === false && h.include_done === true,
        'açıklar include_done içinde': acik.every((t) => hepsiIds.has(t.id)),
        'açıkların hiçbiri bitmiş değil': acik.every((t) => t.col_is_done === false),
        "col_is_done = kolonun is_done'u": hepsi.every((t) => t.col_is_done === bitis.has(t.col)),
        'bitmiş sayısı = fark': hepsi.filter((t) => t.col_is_done).length === hepsi.length - acik.length,
        'id / project_id metin': kartlar.every((t) => typeof t.id === 'string' && t.project_id === p.id),
        'project_name her kartta ve kökte':
          a.project_name === p.name && kartlar.every((t) => t.project_name === p.name),
        'desc ≤ sınır+1, kırpılan … ile biter': kartlar.every((t) => String(t.desc).length <= DESC_SINIRI + 1
          && (!t.desc_truncated || String(t.desc).endsWith('…'))),
        'warning yalnızca bitiş kolonu yoksa': Boolean(a.warning) === (bitis.size === 0),
      });
      kontrol(`list_projects open (${p.open}) = açık kart (${acik.length})`, p.open === acik.length);
    }

    if (!tumAcik().length) {
      atla('süzgeçler (col, assignee, overdue)', 'aktif alanda açık kart yok');
      return;
    }
    const [pid, acik] = [...durum.acik].sort((x, y) => y[1].length - x[1].length)[0];

    const col = enCok(acik.map((t) => t.col));
    const r1 = (await arac('list_tasks', { project_id: pid, col })).veri?.tasks || [];
    kontrol(
      `süzgeç col="${col}" (#${pid}): ${r1.length} kart`,
      r1.length === acik.filter((t) => t.col === col).length && r1.every((t) => t.col === col),
    );

    const atanan = enCok(acik.flatMap((t) => t.assignees || []));
    if (atanan) {
      const r2 = (await arac('list_tasks', { project_id: pid, assignee: atanan })).veri?.tasks || [];
      kontrol(
        `süzgeç assignee="${atanan}": ${r2.length} kart`,
        r2.length === acik.filter((t) => (t.assignees || []).includes(atanan)).length
          && r2.every((t) => (t.assignees || []).includes(atanan)),
      );
    } else {
      atla('süzgeç assignee', 'açık kartların hiçbirinde atanan yok');
    }

    const gun = bugun();
    const gecikmis = acik.filter((t) => t.due && t.due < gun);
    const r3 = (await arac('list_tasks', { project_id: pid, overdue: true })).veri?.tasks || [];
    kontrol(
      `süzgeç overdue: ${r3.length} kart`,
      r3.length === gecikmis.length && r3.every((t) => t.due && t.due < gun && t.col_is_done === false),
    );
    if (!gecikmis.length) bilgi('gecikmiş kart yok — overdue yalnızca boş cevabın doğruluğunu gösterdi');
  });

  await bolum('Görev detayı — get_task', async () => {
    const ornek = [...durum.hepsi].flatMap(([pid, ts]) => ts.map((t) => ({ pid, t }))).slice(0, 25);
    if (!ornek.length) {
      atla('get_task başarı yolu', 'aktif alanda kart yok');
      return;
    }
    const tutmayan = [];
    let kirpilan = 0;
    let yorumlu = 0;
    let altGorevli = 0;
    for (const { pid, t } of ornek) {
      const { veri, hata } = await arac('get_task', { task_id: t.id });
      const d = veri?.task || {};
      const proje = durum.projeler.find((p) => p.id === pid);
      if (t.desc_truncated) kirpilan += 1;
      if ((d.comments_list || []).length) yorumlu += 1;
      if ((d.subtasks_detail || []).length) altGorevli += 1;
      const kosullar = {
        'hata değil': !hata,
        id: d.id === t.id,
        project_name: d.project_name === proje?.name,
        col_is_done: d.col_is_done === durum.bitis.get(pid)?.has(d.col),
        'liste özeti = detayın kırpılmışı':
          t.desc === (t.desc_truncated ? kelimedeKes(d.desc, DESC_SINIRI) : d.desc),
      };
      const dusen = Object.entries(kosullar).filter(([, v]) => !v).map(([k]) => k);
      if (dusen.length) tutmayan.push(`#${t.id}: ${dusen.join(', ')}`);
    }
    kontrol(`${ornek.length} kart listeyle karşılaştırıldı`, tutmayan.length === 0, tutmayan.slice(0, 4).join(' | '));
    bilgi(`kırpılmış açıklama ${kirpilan}, yorumlu ${yorumlu}, alt görevli ${altGorevli} kart`);
    if (!kirpilan) atla('kelime sınırında kırpma', `hiçbir kartın açıklaması ${DESC_SINIRI} karakteri geçmiyor`);
    if (!yorumlu && !altGorevli) {
      atla('comments_list / subtasks_detail kimlikleri', 'örnekte yorumlu ya da alt görevli kart yok');
    }
  });

  await bolum('Arama — search_tasks', async () => {
    const acik = tumAcik();
    if (!acik.length) {
      atla('arama', 'aktif alanda açık kart yok');
      return;
    }
    const kelimeler = acik.flatMap((t) => String(t.title)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4)
      .map((w) => ({ w, t })));
    const secim = kelimeler.find((k) => /[iıİI]/.test(k.w)) || kelimeler[0];
    if (!secim) {
      atla('arama', 'açık kart başlıklarında dört harfli kelime yok');
      return;
    }

    const temel = (await arac('search_tasks', { q: secim.w })).veri || {};
    const temelIds = (temel.tasks || []).map((t) => t.id);
    hepsiTutmali(`"${secim.w}" → ${temel.count} sonuç`, {
      'kaynak kart bulundu': temelIds.includes(secim.t.id) || temel.truncated === true,
      'count = uzunluk': temel.count === temelIds.length,
      'total_matches ≥ count': temel.total_matches >= temel.count,
      'project_name her kartta': (temel.tasks || []).every((t) => typeof t.project_name === 'string' && t.project_name),
    });

    const turkce = /[iıİI]/.test(secim.w);
    const varyantlar = [...new Set([
      secim.w.toLocaleUpperCase('tr'),
      secim.w.toUpperCase(),
      ...(turkce ? [secim.w.replace(/[iıİI]/g, 'ı'), secim.w.replace(/[iıİI]/g, 'İ')] : []),
    ])].filter((v) => v !== secim.w);
    const farkli = [];
    for (const v of varyantlar) {
      const ids = ((await arac('search_tasks', { q: v })).veri?.tasks || []).map((t) => t.id);
      if (!ayniKume(ids, temelIds)) farkli.push(v);
    }
    kontrol(`harf katlama: ${varyantlar.join(', ')}`, farkli.length === 0, `farklı sonuç: ${farkli.join(', ')}`);
    if (!turkce) atla('Türkçe i/ı katlaması', 'açık kart başlıklarında i/ı/İ/I geçen kelime yok');

    const ikili = enSikIkili(acik);
    const kesik = (await arac('search_tasks', { q: ikili, limit: 1 })).veri || {};
    if (kesik.total_matches >= 2) {
      hepsiTutmali(`limit 1, "${ikili}" (${kesik.total_matches} eşleşme)`, {
        'truncated true': kesik.truncated === true,
        'tek kart': kesik.count === 1 && (kesik.tasks || []).length === 1,
      });
    } else {
      atla('kesme (truncated)', `"${ikili}" yalnızca ${kesik.total_matches ?? 0} kartta`);
    }

    const p = durum.projeler.find((x) => (durum.acik.get(x.id) || []).length);
    const sinirli = (await arac('search_tasks', { q: ikili, project_id: p.id, limit: 100 })).veri || {};
    kontrol(
      `project_id ile sınır (#${p.id}): ${sinirli.count} kart`,
      (sinirli.tasks || []).every((t) => t.project_id === p.id && t.project_name === p.name),
    );
    const genis = (await arac('search_tasks', { q: ikili, include_done: true, limit: 100 })).veri || {};
    kontrol(
      `include_done genişletiyor (${kesik.total_matches} → ${genis.total_matches})`,
      genis.total_matches >= kesik.total_matches,
    );
    kontrol('tek harflik sorgu reddediliyor', (await arac('search_tasks', { q: 'a' })).hata);
  });

  await bolum('Ekip — list_members', async () => {
    let t0 = Date.now();
    const yalin = (await arac('list_members', { with_task_counts: false })).veri || {};
    const sureYalin = Date.now() - t0;
    const uyeler = yalin.members || [];
    hepsiTutmali(`${uyeler.length} üye (sayımsız)`, {
      'count = uzunluk': yalin.count === uyeler.length,
      'open_tasks yok': uyeler.every((u) => !('open_tasks' in u)),
      'slug + permissions': uyeler.every((u) => typeof u.slug === 'string' && Array.isArray(u.permissions)),
    });

    const sahipler = uyeler.filter((u) => u.ws_role === 'owner');
    if (sahipler.length) {
      kontrol(
        `owner (${sahipler.map((s) => s.slug).join(', ')}) tam izin listesi`,
        sahipler.every((u) => ayniKume(u.permissions, ALL_PERMISSIONS)),
      );
    } else {
      atla('owner izinleri', 'alanda owner görünmüyor');
    }
    const ben = uyeler.find((u) => u.slug === durum.kullanici?.slug);
    kontrol(
      'kendi izinlerim = whoami izinleri',
      Boolean(ben) && ayniKume(ben.permissions, durum.izinler),
      ben ? '' : 'kullanıcı üye listesinde yok',
    );

    t0 = Date.now();
    const sayimli = (await arac('list_members')).veri || {};
    const sureSayimli = Date.now() - t0;
    const acik = tumAcik();
    const yanlis = (sayimli.members || [])
      .filter((u) => u.open_tasks !== acik.filter((t) => (t.assignees || []).includes(u.slug)).length)
      .map((u) => `${u.slug}: ${u.open_tasks}`);
    kontrol(
      'open_tasks = kartlardan sayılan',
      (sayimli.members || []).length === uyeler.length && yanlis.length === 0,
      yanlis.join(', '),
    );
    bilgi(`süre: sayımsız ${sureYalin} ms, sayımlı ${sureSayimli} ms (${durum.projeler.length} proje)`);

    const uyeSluglari = new Set(uyeler.map((u) => u.slug));
    const yabanci = [...new Set(tumKartlar().flatMap((t) => t.assignees || []))].filter((s) => !uyeSluglari.has(s));
    if (yabanci.length) {
      bilgi(`alan üyesi olmayan atananlar: ${yabanci.join(', ')} — TODO'daki atama açığının izi olabilir`);
    }
  });

  await bolum('Notlar', async () => {
    const l = (await arac('list_notes')).veri || {};
    const notlar = l.notes || [];
    durum.notSayisi = notlar.length;
    hepsiTutmali(`list_notes: ${notlar.length} not`, {
      'count = uzunluk': l.count === notlar.length,
      'gövde sızmıyor': notlar.every((n) => !('body' in n)),
      'updated_ago yok': notlar.every((n) => !('updated_ago' in n)),
      'preview ≤ 240': notlar.every((n) => String(n.preview ?? '').length <= 240),
      'workspace_id = aktif alan': notlar.every((n) => n.workspace_id === durum.alan.id),
    });
    if (!notlar.length) {
      atla('get_note başarı yolu', 'aktif alanda görünen not yok');
      return;
    }
    const dusen = [];
    for (const n of notlar.slice(0, 10)) {
      const { veri, hata } = await arac('get_note', { note_id: n.id });
      const d = veri?.note || {};
      if (hata || d.id !== n.id || typeof d.body !== 'string' || 'updated_ago' in d
        || d.workspace_id !== durum.alan.id) {
        dusen.push(`#${n.id}`);
      }
    }
    kontrol(`get_note: ${Math.min(notlar.length, 10)} not`, dusen.length === 0, dusen.join(', '));
  });

  await bolum('Hata yolları', async () => {
    const oku = (x) => { try { return JSON.parse(x.metin); } catch { return {}; } };
    const p = await arac('list_tasks', { project_id: OLMAYAN });
    const g = await arac('get_task', { task_id: OLMAYAN });
    const n = await arac('get_note', { note_id: OLMAYAN });
    hepsiTutmali('olmayan kayıt → isError, 404, yönlendiren mesaj', {
      proje: p.hata && oku(p).status === 404 && oku(p).error === 'err_project_not_found'
        && /list_projects/.test(oku(p).message),
      görev: g.hata && oku(g).status === 404 && oku(g).error === 'err_task_not_found'
        && /list_tasks/.test(oku(g).message),
      not: n.hata && oku(n).status === 404 && oku(n).error === 'err_note_not_found'
        && /list_notes/.test(oku(n).message),
    });
    durum.ref = { proje: p.metin, gorev: g.metin, not: n.metin };

    const pk = await arac('list_columns', { project_id: OLMAYAN });
    const sk = await arac('search_tasks', { q: 'xx', project_id: OLMAYAN });
    kontrol('proje alan üç araç aynı 404 gövdesi', pk.metin === p.metin && sk.metin === p.metin);
    kontrol('bilinmeyen araç reddediliyor', (await arac('yok_boyle_bir_arac')).hata);
    kontrol('yanlış tipte kimlik reddediliyor', (await arac('get_task', { task_id: 'abc' })).hata);
  });

  await bolum('Alan dışı kimlikler — P0 kapısı', async () => {
    const db = await veritabaniHazir();
    if (!db.ok) {
      atla('alan dışı kontrolleri', `veritabanına ulaşılamadı — ${db.sebep}`);
      return;
    }
    if (!durum.ref) {
      atla('alan dışı kontrolleri', 'referans 404 gövdeleri alınamadı');
      return;
    }

    const kullanici = await prisma.user.findUnique({
      where: { slug: durum.kullanici.slug },
      select: { id: true },
    });
    const uyelik = await prisma.workspaceMember.findMany({
      where: { userId: kullanici.id },
      select: { workspaceId: true, role: true },
    });
    const uyeAlanlar = uyelik.map((m) => m.workspaceId);
    // Sahibi olunan alan önce: P0 tam olarak orada doğdu — API sahibe alanın
    // her kaydını açıyor, yani kapı yoksa sızıntı en kesin orada görünür.
    const digerAlanlar = uyelik
      // İki taraf da metne: whoami kimliği sayıya gerilerse aktif alan "başka
      // alan" sanılıp kendi kaydıyla denenmesin (mutasyonla bulundu).
      .filter((m) => String(m.workspaceId) !== String(durum.alan.id))
      .sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'));

    async function ilkBulunan(bul) {
      for (const m of digerAlanlar) {
        const k = await bul(m);
        if (k) return { id: k.id, etiket: `alan ${m.workspaceId}, ${m.role}` };
      }
      return null;
    }
    const proje = await ilkBulunan((m) => prisma.project.findFirst({
      where: { workspaceId: m.workspaceId },
      select: { id: true },
    }));
    const gorev = await ilkBulunan((m) => prisma.task.findFirst({
      where: { deletedAt: null, project: { is: { workspaceId: m.workspaceId } } },
      select: { id: true },
    }));
    const not = await ilkBulunan((m) => prisma.note.findFirst({
      where: {
        workspaceId: m.workspaceId,
        deletedAt: null,
        ...(m.role === 'owner' ? {} : { OR: [{ visibility: 'workspace' }, { authorId: kullanici.id }] }),
      },
      select: { id: true },
    }));

    if (proje) {
      const cevaplar = [
        await arac('list_columns', { project_id: proje.id }),
        await arac('list_tasks', { project_id: proje.id }),
        await arac('search_tasks', { q: 'xx', project_id: proje.id }),
      ];
      kontrol(
        `proje #${proje.id} (${proje.etiket}) → olmayanla birebir aynı 404`,
        cevaplar.every((c) => c.hata && c.metin === durum.ref.proje),
        cevaplar.find((c) => c.metin !== durum.ref.proje)?.metin.slice(0, 120),
      );
    } else {
      atla('başka alandaki proje', 'kullanıcının öbür alanlarında proje yok');
    }
    if (gorev) {
      const c = await arac('get_task', { task_id: gorev.id });
      kontrol(
        `görev #${gorev.id} (${gorev.etiket}) → olmayanla birebir aynı 404`,
        c.hata && c.metin === durum.ref.gorev,
        c.metin.slice(0, 120),
      );
    } else {
      atla('başka alandaki görev', 'kullanıcının öbür alanlarında kart yok');
    }
    if (not) {
      const c = await arac('get_note', { note_id: not.id });
      kontrol(
        `not #${not.id} (${not.etiket}) → olmayanla birebir aynı 404`,
        c.hata && c.metin === durum.ref.not,
        c.metin.slice(0, 120),
      );
    } else {
      atla('başka alandaki not', 'kullanıcının öbür alanlarında görebileceği not yok');
    }

    // Üye olunmayan alan: API burada 403 veriyor, "var ama senin değil" kahini.
    // MCP onu devralmamalı — gövde yine olmayanınkiyle aynı olmalı.
    const yabanciProje = await prisma.project.findFirst({
      where: { workspaceId: { notIn: uyeAlanlar } },
      select: { id: true },
    });
    const yabanciGorev = await prisma.task.findFirst({
      where: { deletedAt: null, project: { is: { workspaceId: { notIn: uyeAlanlar } } } },
      select: { id: true },
    });
    if (yabanciProje) {
      const c = await arac('list_tasks', { project_id: yabanciProje.id });
      kontrol(`üye olunmayan alanın projesi #${yabanciProje.id} → aynı 404`, c.hata && c.metin === durum.ref.proje);
    } else {
      atla('üye olunmayan alanın projesi', 'veritabanında öyle bir proje yok');
    }
    if (yabanciGorev) {
      const c = await arac('get_task', { task_id: yabanciGorev.id });
      kontrol(`üye olunmayan alanın görevi #${yabanciGorev.id} → aynı 404`, c.hata && c.metin === durum.ref.gorev);
    } else {
      atla('üye olunmayan alanın görevi', 'veritabanında öyle bir kart yok');
    }
  });

  await bolum('Veritabanıyla çapraz sayım', async () => {
    const db = await veritabaniHazir();
    if (!db.ok) {
      atla('çapraz sayım', `veritabanına ulaşılamadı — ${db.sebep}`);
      return;
    }
    const projeIdleri = durum.projeler.map((p) => Number(p.id));
    const dbProje = await prisma.project.count({ where: { workspaceId: Number(durum.alan.id) } });
    kontrol(`aktif alanın projeleri: veritabanı ${dbProje}, MCP ${projeIdleri.length}`, dbProje === projeIdleri.length);
    const dbKart = await prisma.task.count({ where: { deletedAt: null, projectId: { in: projeIdleri } } });
    const mcpKart = tumKartlar().length;
    kontrol(`çöpte olmayan kartlar: veritabanı ${dbKart}, MCP include_done ${mcpKart}`, dbKart === mcpKart);

    // Açık sayımın çöp kutusu kusuru (11 Eylül) ancak çöpte bitmemiş kart
    // varken görünür: çöp boşsa `deletedAt` süzgeci olsa da olmasa da sayı aynı
    // çıkar. Mutasyonla doğrulandı — veri bunu sınayamıyorsa söylensin.
    const coptaAcik = await prisma.task.count({
      where: {
        deletedAt: { not: null },
        projectId: { in: projeIdleri },
        NOT: { column: { is: { isDone: true } } },
      },
    });
    if (coptaAcik) {
      bilgi(`çöpte ${coptaAcik} bitmemiş kart — "open = açık kart" kontrolü çöp kutusu kusurunu da kapsıyor`);
    } else {
      atla('açık sayımın çöp kutusu kusuru', 'aktif alanın çöpünde bitmemiş kart yok — bu veriyle görünmez');
    }
  });

  await bolum('Bütün yanıtlar', async () => {
    const sikisik = yanitlar.filter((y) => y.veri === null || y.metin !== JSON.stringify(y.veri));
    kontrol(`${yanitlar.length} yanıt sıkışık JSON`, sikisik.length === 0, [...new Set(sikisik.map((y) => y.ad))].join(', '));

    const sayiKimlik = yanitlar.flatMap((y) => sayiKimlikler(y.veri).map((yol) => `${y.ad} ${yol}`));
    kontrol('hiçbir id / *_id sayı değil', sayiKimlik.length === 0, sayiKimlik.slice(0, 5).join(', '));

    const damgali = yanitlar.filter((y) => y.ad !== 'list_workspaces');
    const damgasiz = [...new Set(damgali.filter((y) => !y.veri?.workspace).map((y) => y.ad))];
    kontrol('her yanıtta workspace bağlamı', damgasiz.length === 0, damgasiz.join(', '));
    const kayan = damgali.filter((y) => y.veri?.workspace
      && (y.veri.workspace.id !== durum.alan.id || y.veri.workspace.name !== durum.alan.name));
    kontrol(
      'bağlam tarama boyunca aynı alan',
      kayan.length === 0,
      `${kayan.length} yanıt başka alan diyor — tarayıcıda alan değişti mi?`,
    );
  });

  return ozet();
}

process.exitCode = await tara();
await prisma.$disconnect().catch(() => {});
