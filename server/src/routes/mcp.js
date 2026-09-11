// MCP ucu — Claude'un panoyu sürdüğü yüzey.
//
//   POST   /mcp    Streamable HTTP (MCP protokolü)
//   GET    /mcp    405 — durum tutmayan kipte akış açılmıyor
//   DELETE /mcp    405 — aynı gerekçe
//
// ── Neden bu dosya iş mantığı taşımıyor ───────────────────────────────────
//
// Araçlar veritabanına değil, uygulamanın kendi HTTP API'sine gidiyor
// (`lib/selfApi.js`). Gerekçe: bu depoda bir görevi okumak bir satırı okumak
// değil. Kapsamlama dört ayrı biçimde yapılıyor — `loadTaskWithAccess`,
// `loadProjectWithAccess`, aktif çalışma alanı, `userId: user.id` — ve dördü
// de doğru. Prisma'ya inseydik bu mantığı yeniden yazardık; yani ikinci bir
// izin modeli, yani er ya da geç birinciyle ayrışan bir izin modeli.
//
// Yazma tarafında aynı karar daha da ağır basıyor: `POST /projects/:id/tasks`
// tek çağrıda izin kontrolünü, atama bildirimini, soket yayınını, aktivite
// kaydını ve `task_transitions` geçişini birlikte yapıyor.
//
// Tek istisna `whoami` ve aktif alan okuması: kullanıcının kendi kimliği bir
// iş kuralı taşımıyor, yan etkisi yok ve API'de birebir karşılığı olan bir uç
// da yok.
//
// Yanıtların BİÇİMİ ayrı bir dosyada (`lib/mcpShape.js`) ve saf: kimlik
// normalizasyonu, kırpma, süzme, uyarı metni, alan kapsamı kontrolü. Sebebi
// test — bu dosyanın hiçbir satırı veritabanı olmadan koşamıyor, orası
// koşuyor.
//
// ── Başlık kullanıcı metnidir, açıklama değildir ──────────────────────────
//
// Bu notun eski hâli "buradaki metinleri kullanıcı görmüyor, model okuyor"
// diyordu ve YANLIŞTI. Claude'un bağlayıcı ekranı araçları `title` alanıyla
// listeliyor (10 Eylül 2026, ekran görüntüsüyle doğrulandı); İngilizce arayüz
// kullanan biri o listeyi Türkçe görüyordu. Başlıklar artık iki dilli ve
// `lib/mcpShape.js` içindeki `ARAC_BASLIKLARI` tablosunda duruyor.
//
// `description` kural dışı kalmaya devam ediyor ve gerekçesi bu kez ölçülü:
// onu gerçekten model okuyor, modelin cevabı zaten kullanıcının dilinde
// çıkıyor. Yüzlerce satırlık yönlendirme metnini iki dilde sürdürmenin
// karşılığı yok.
//
// Hata alanları dil kuralına tabi ve `err_` kodu taşıyor — `dil.test.js` bu
// dosyayı da tarıyor.
//
// ── Araç listesi bağlantı başında bir kez okunur ──────────────────────────
//
// İstemci `tools/list`i bağlantı kurulurken çekip saklıyor. Sunucu "liste
// değişti" diyemiyor: durum tutmayan kipte sunucudan istemciye kanal yok ve
// `listChanged` yeteneği bildirilmiyor. 11 Eylül'de yaşandı — 0.3.0
// dağıtıldıktan sonra açık kalan sohbet yedi araç görmeye devam etti, yeni
// sohbet on araç gördü. Araç ÇAĞRILARI her zaman canlı sunucuya gidiyor;
// yalnızca LİSTE bayat kalıyor. Araç yüzeyini değiştiren her dağıtımdan
// sonra yeni sohbet açılmalı.

import { Router } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireMcpToken } from '../lib/mcpAuth.js';
import { currentMember, memberPermissions } from '../lib/workspace.js';
import { callSelf } from '../lib/selfApi.js';
import { recordAudit, AUDIT } from '../lib/audit.js';
import {
  metinKimlik,
  kimlikleriMetinle,
  gorevOzeti,
  gorevDetayi,
  gorevSuz,
  listeUyarisi,
  notOzeti,
  uyeOzeti,
  aramaEslesir,
  projeyiBul,
  notAlandaMi,
  kullanilmayanIzinler,
  araclarinDili,
  baslik,
  alanUyusuyor,
  atamaListesi,
} from '../lib/mcpShape.js';

export const mcpRouter = Router();

// Sunucu yüzeyinin kendi sürümü — uygulamanın sürümünden ayrı ilerliyor.
// İstemciler yetenek değişikliğini buradan görür.
// Dağıtımın indiğini anlamanın da tek yolu bu: uç anahtarsız isteğe her
// durumda 401 döndüğü için "yeni kod canlıda mı" sorusu dışarıdan
// cevaplanamıyor. Yüzeyi değiştiren her commit'te bump et; `initialize`
// yanıtındaki serverInfo.version dağıtım kanıtı olarak okunabilsin.
// Sürüm geçmişi ve kırıcı değişiklikler: MCP-SURUMLER.md.
const MCP_VERSION = '0.4.0';

/**
 * Araçların fiilen kullandığı izinler.
 *
 * Okuma araçları için üyelik yetiyor; 0.4.0'daki üç yazma aracı (görev
 * oluştur, düzenle, taşı) API'nin `manage_tasks` kapısından geçiyor. `whoami`
 * bu kümeyi kullanıp "şu izinlerin MCP'de karşılığı yok" diyor, çünkü izin
 * listesini çıplak vermek modelde yapamayacağı işler için beklenti yaratıyor
 * (10 Eylül: istemci `manage_channels` görüp sohbeti yönetebileceğini sandı).
 *
 * Kapı API'de, burada değil: araç izni kendisi denetlemiyor, çağırdığı uç
 * denetliyor ve 403'ü olduğu gibi modele iletiyor. Bu küme yalnızca `whoami`
 * cevabının dürüst olması için var. Proje yönetimi araçları gelirse buraya
 * `manage_projects` eklenecek.
 */
const ARACLARIN_KULLANDIGI_IZINLER = new Set(['manage_tasks']);

// ─── Yardımcılar ───────────────────────────────────────────────────────────

/**
 * Başarılı araç yanıtı — her yanıtın tek çıkış kapısı.
 *
 * İki iş yapıyor ve ikisi de burada olmak zorunda, çünkü kural ancak tek
 * noktada unutulamaz:
 *
 * **Kimlikler metne çekiliyor** (`kimlikleriMetinle`). 0.3.0'da alan alan
 * yapıldı ve `workspace.id` kaçtı.
 *
 * **JSON sıkışık basılıyor.** 0.3.0 `JSON.stringify(veri, null, 2)` ile
 * girintili basıyordu; 15 kartlık bir `list_tasks` yanıtında karakterlerin
 * %29'u saf boşluktu (11 Eylül'de ölçüldü: 11.143 → 7.924). Girinti insan
 * okuru içindir; bu yanıtı model okuyor ve her token istemcinin kotasından
 * düşüyor. Alanlara dokunmadan yapılabilen tek kazanç buydu.
 */
function sonuc(veri) {
  return { content: [{ type: 'text', text: JSON.stringify(kimlikleriMetinle(veri)) }] };
}

/**
 * Kimlik argümanı şeması — metin de sayı da kabul eder.
 *
 * Düz `z.number()` buradaki zinciri kırıyordu ve uçtan uca denemede yakalandı:
 * `projectToDict` ve `taskToDict` kimliği bilerek METİN döndürüyor
 * (`id: String(p.id)`, Python aslından taşınan sözleşme; ön yüz buna yaslanıyor).
 * Yani `list_projects` `"21"` veriyor, araç açıklaması "diğer araçların istediği
 * project_id buradan alınır" diyor, ve `list_columns` o değeri
 * `-32602 expected number, received string` ile geri çeviriyordu. Belgelenen
 * yolun tamamı — projeden kolona, kolondan göreve — kullanılamaz durumdaydı.
 *
 * Düzeltme API'de değil burada: `String(id)` sözleşmesini değiştirmek ön yüzü
 * kırar. Dönüşüm MCP katmanında yapılıyor, çünkü uyumsuzluk da burada doğuyor.
 * `coerce` yalnızca sayıya çevrilebilen metni geçirir; "abc" NaN'a düşüp
 * `int()` kapısında elenir.
 */
const kimlik = (aciklama) => z.coerce.number().int().positive().describe(aciklama);

/**
 * Gün biçimi. API tarihi `parseDate` ile okuyor; biçim burada kilitleniyor ki
 * model yanlış biçimi sessiz bir boş tarih olarak değil, hata olarak görsün.
 */
const TARIH = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD biçiminde olmalı');

/**
 * Başarısız araç yanıtı.
 *
 * `isError` ile dönüyor ki model bunu bir cevap değil bir engel olarak okusun.
 * Gövde olduğu gibi aktarılıyor: "bu projeye erişiminiz yok" bilgisi modele
 * ulaşmalı ki yeniden denemek yerine kullanıcıya söylesin.
 */
function hata(yanit) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ status: yanit.status, ...(yanit.data || {}) }),
      },
    ],
  };
}

/**
 * "Bulunamadı" — alan dışı ile hiç var olmayanı AYIRT ETMEDEN.
 *
 * Aktif alanda olmayan bir kayıt için dönen yanıt, var olmayan kayıtla
 * birebir aynı. Aksi hâlde yanıt bir kahin olurdu: "21 numaralı proje var
 * ama senin alanında değil" bilgisi, kimliğin tahmin edilebilir olduğu bir
 * sistemde (ardışık tamsayılar) başka alanların içini yoklamaya yarar.
 * API'nin kendisinde bu kahin duruyor — üye olmadığın alanın projesi 403,
 * olmayan proje 404 (GUVENLIK.md soru 8) — MCP onu devralmıyor.
 *
 * Hata kodu API'ninkiyle aynı, mesaja yalnızca yönlendirme eklendi: modelin
 * aynı kimliği yeniden denemek yerine doğru aracı çağırması için.
 */
const BULUNAMADI = {
  proje: {
    error: 'err_project_not_found',
    message: 'Proje bulunamadı — geçerli kimlikler için list_projects kullan',
  },
  gorev: {
    error: 'err_task_not_found',
    message: 'Görev bulunamadı — geçerli kimlikler için list_tasks ya da search_tasks kullan',
  },
  not: {
    error: 'err_note_not_found',
    message: 'Not bulunamadı — geçerli kimlikler için list_notes kullan',
  },
};

function bulunamadi(tur) {
  return { ok: false, status: 404, data: { ...BULUNAMADI[tur] } };
}

/**
 * API'nin "göremezsin" ve "yok" yanıtları MCP'de tek bir "bulunamadı"ya iner.
 * Başka her hata (500, 429…) olduğu gibi geçer — onları gizlemek sessiz
 * başarısızlık olurdu.
 */
function erisimYoksaBulunamadi(yanit, tur) {
  return yanit.status === 403 || yanit.status === 404 ? bulunamadi(tur) : yanit;
}

/**
 * Kullanıcının aktif çalışma alanı.
 *
 * Her yanıta ekleniyor. Sebebi kolaylık değil, güvenlik: MCP kullanıcının
 * AKTİF alanını takip ediyor ve o alan tarayıcıdan bir tıkla değişebiliyor.
 * Yanıtın içinde alan adı yazmazsa "Claude kartı yanlış panoya açmış" durumu
 * ancak iş işten geçtikten sonra fark edilir. Adı her yanıta koymak, modelin
 * yanlış yerde olduğunu kendisinin görmesini sağlıyor.
 *
 * 11 Eylül'de kapsam genişledi: önce yalnızca `whoami` ve `list_projects`
 * taşıyordu, `list_tasks` / `get_task` / `list_notes` taşımıyordu — yani
 * modelin en çok baktığı yanıtlar sessizdi.
 */
async function aktifAlan(user) {
  const member = await currentMember(user);
  if (!member?.workspaceId) return { member: null, workspace: null };
  const workspace = await prisma.workspace.findUnique({
    where: { id: member.workspaceId },
    select: { id: true, name: true },
  });
  return { member, workspace: workspace || null };
}

/**
 * Bağlamı (çalışma alanı) her yanıtın başına koyan sarmal. Çağıran alanı
 * zaten okuduysa ikinci kez okunmuyor.
 */
async function baglamli(user, veri, workspace) {
  const alan = workspace === undefined ? (await aktifAlan(user)).workspace : workspace;
  return sonuc({ workspace: alan, ...veri });
}

/**
 * Proje kimliğini AKTİF alana göre çözer — proje alan her aracın tek kapısı.
 *
 * Aktif alanın projeleri `GET /api/projects`ten geliyor; kimlik o listede
 * yoksa, başka alanda da olsa hiç var olmasa da, aynı "bulunamadı" dönüyor.
 * Gerekçenin tamamı `lib/mcpShape.js`teki "Aktif alan kapsamı" notunda.
 * `mcp.test.js`, `project_id` alan her aracın bu kapıdan geçtiğini tarıyor.
 *
 * Yan kazanç: proje adı da buradan geliyor, yani `list_tasks` kartları
 * `search_tasks` kartlarıyla aynı şekli (`project_name` dahil) taşıyabiliyor.
 */
async function aktifProje(user, projectId) {
  const yanit = await callSelf(user, '/api/projects');
  if (!yanit.ok) return { ok: false, yanit };
  const projeler = Array.isArray(yanit.data) ? yanit.data : [];
  const proje = projeyiBul(projeler, projectId);
  if (!proje) return { ok: false, yanit: bulunamadi('proje') };
  return { ok: true, proje, projeler };
}

/**
 * Bir projenin "bitmiş" sayılan kolonlarının slug kümesi.
 *
 * Hem açık/kapalı süzgeci hem `col_is_done` alanı buna dayanıyor. Ayrı bir
 * çağrı gibi görünüyor ama bedava değil — bu yüzden yalnızca gerçekten
 * gerektiğinde çağrılıyor ve sonucu çağıran içinde bir kez kullanılıyor.
 */
async function bitisKolonlariniGetir(user, projectId) {
  const yanit = await callSelf(user, `/api/projects/${projectId}/columns`);
  if (!yanit.ok) return { ok: false, yanit };
  const kolonlar = Array.isArray(yanit.data) ? yanit.data : [];
  return {
    ok: true,
    kume: new Set(kolonlar.filter((c) => c.is_done).map((c) => c.id)),
    kolonlar,
  };
}

/**
 * Aktif alandaki bütün projeleri, görevleriyle ve bitiş kolonlarıyla tarar.
 *
 * `list_members`in yük sayımı ve `search_tasks` bunu paylaşıyor. Maliyet
 * proje başına iki yerel istek ve bu bilinçli bir ödün: tek bir "bütün
 * çalışma alanını ver" ucu yok, olsaydı da bu iki aracın ihtiyacından çok
 * fazlasını (kanallar, bildirimler, sohbet) taşıyan `/bootstrap` olurdu.
 * İstekler 127.0.0.1'e gidiyor; üç-beş projede ölçülebilir bir yük değil.
 * Proje sayısı büyürse doğru çözüm burada değil, sunucuda toplu bir uçta.
 */
async function panoyuTara(user) {
  const projeYanit = await callSelf(user, '/api/projects');
  if (!projeYanit.ok) return { ok: false, yanit: projeYanit };

  const projeler = Array.isArray(projeYanit.data) ? projeYanit.data : [];
  const sonuclar = [];
  for (const proje of projeler) {
    const [gorevYanit, kolonlar] = await Promise.all([
      callSelf(user, `/api/projects/${proje.id}/tasks`),
      bitisKolonlariniGetir(user, proje.id),
    ]);
    if (!gorevYanit.ok) return { ok: false, yanit: gorevYanit };
    if (!kolonlar.ok) return { ok: false, yanit: kolonlar.yanit };
    sonuclar.push({
      proje,
      gorevler: Array.isArray(gorevYanit.data) ? gorevYanit.data : [],
      bitisKolonlari: kolonlar.kume,
    });
  }
  return { ok: true, projeler: sonuclar };
}

/** Bugünün tarihi, ISO gün biçiminde — gecikme karşılaştırmaları için. */
function bugunISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Yazma yardımcıları ────────────────────────────────────────────────────
//
// 0.4.0'da yüzeye üç yazma aracı geldi. Hepsi üç kapıdan geçiyor, sırayla:
//
// 1. **Alan kapısı** (`yazmaKapisi`): `workspace_id` zorunlu ve aktif alanla
//    karşılaştırılıyor; uyuşmazlıkta 409, yazma yok.
// 2. **Kayıt kapısı** (`aktifProje` / `aktifGorev`): proje ya da görev aktif
//    alanda değilse hiç yokmuş gibi 404 — okuma araçlarıyla aynı kapı.
// 3. **API'nin kendi kapıları**: `manage_tasks`, atananın alan üyeliği
//    (`lib/assignees.js`), kolon geçiş kuralı (`allowed_next`, 409). MCP
//    bunları yeniden yazmıyor, cevabı olduğu gibi modele iletiyor.
//
// Başarılı her yazma denetim kaydına düşüyor (`mcp.task_*`), ki panodan
// yapılanla Claude'un yaptığı ayrışsın. `mcp.test.js` her yazma aracında bu
// kapıların ve kaydın bulunduğunu, alan kapısının yazmadan önce geldiğini
// tarıyor.

/**
 * Yazma aracının alan kapısı. Uyuşmazlıkta yanıt aktif alanı söylüyor —
 * modelin kullanıcıya "tarayıcıda şu alana geç" diyebilmesi için; bilgi zaten
 * kullanıcının kendisinin.
 */
async function yazmaKapisi(user, workspaceId) {
  const { member, workspace } = await aktifAlan(user);
  if (!member?.workspaceId || !workspace) {
    return {
      ok: false,
      yanit: { status: 404, data: { error: 'err_mcp_no_workspace', message: 'Aktif çalışma alanı yok' } },
    };
  }
  if (!alanUyusuyor(workspaceId, workspace)) {
    return {
      ok: false,
      yanit: {
        status: 409,
        data: {
          error: 'err_mcp_workspace_mismatch',
          message: 'İstenen alan aktif alan değil; hiçbir şey yazılmadı. Kullanıcıdan '
            + 'tarayıcıda alanı değiştirmesini iste ya da aktif alanda çalış.',
          active_workspace: { id: metinKimlik(workspace.id), name: workspace.name },
        },
      },
    };
  }
  return { ok: true, workspace };
}

/**
 * Görev kimliğini AKTİF alana göre çözer — görev alan yazma araçlarının
 * kapısı. `get_task`teki mantığın aynısı: API "üyesi olduğun alandaki görev"
 * diye soruyor, MCP "aktif alandaki görev" diye. Başka alandaki görev, hiç
 * var olmayanla aynı 404'ü alıyor.
 */
async function aktifGorev(user, taskId) {
  const yanit = await callSelf(user, `/api/tasks/${taskId}`);
  if (!yanit.ok) return { ok: false, yanit: erisimYoksaBulunamadi(yanit, 'gorev') };
  const projeler = await callSelf(user, '/api/projects');
  if (!projeler.ok) return { ok: false, yanit: projeler };
  const proje = projeyiBul(projeler.data, yanit.data?.project_id);
  if (!proje) return { ok: false, yanit: bulunamadi('gorev') };
  return { ok: true, gorev: yanit.data, proje };
}

/**
 * Olmayan kolon. API bilinmeyen slug'ı sessizce yok sayıyor — oluşturmada
 * kartı ilk kolona açıyor, taşımada hiçbir şey yapmadan 200 dönüyor; model
 * kartı taşıdığını sanırdı. MCP slug'ı önceden doğruluyor ve geçerlileri
 * listeliyor.
 */
function kolonYok(kolonlar, istenen) {
  return {
    status: 400,
    data: {
      error: 'err_mcp_column_not_found',
      message: `"${istenen}" diye bir kolon yok — geçerli slug'lar valid_columns'ta`,
      valid_columns: kolonlar.map((c) => c.id),
    },
  };
}

// ─── MCP sunucusu ──────────────────────────────────────────────────────────

/**
 * İsteği yapan kullanıcıya bağlı bir MCP sunucusu kurar.
 *
 * Her istek için yeniden kuruluyor. Durum tutmayan (stateless) kip bilinçli:
 * Railway süreci yeniden başlattığında ya da ikinci bir örnek açtığında
 * yarıda kalan oturum diye bir şey olmuyor.
 *
 * `dil` yalnızca araç BAŞLIKLARINI etkiliyor; açıklamalar Türkçe ve modele
 * yazılmış (dosya başındaki nota bak).
 *
 * `req` yalnızca denetim kaydı için: yazma araçları IP ve istemci bilgisini
 * oradan okuyor (`recordAudit`).
 */
function buildMcpServer(user, dil, req) {
  const server = new McpServer(
    { name: 'stoaboard', version: MCP_VERSION },
    { capabilities: { tools: {} } },
  );

  const salt = { readOnlyHint: true };
  // Yazma araçlarının ipuçları; yıkıcılık ve tekrarlanabilirlik araç başına
  // ayarlanıyor. `openWorldHint: false` — araçlar yalnızca bu panoya dokunuyor.
  const yazma = {
    readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false,
  };
  const B = (arac) => baslik(arac, dil);

  // ── whoami ───────────────────────────────────────────────────────────────

  server.registerTool(
    'whoami',
    {
      title: B('whoami'),
      description:
        'Bağlantının hangi StoaBoard kullanıcısı adına açıldığını, aktif çalışma '
        + 'alanını ve o alandaki izinleri döner. Bir işe başlamadan önce kimin '
        + 'adına hareket ettiğini doğrulamak için kullan. '
        + 'permissions_without_tools alanı, kullanıcının sahip olduğu ama '
        + 'MCP üzerinden kullanılamayan izinleri sayar — o işler için '
        + 'kullanıcıyı tarayıcıya yönlendir, deneme. '
        + 'server.title_language yalnızca araç başlıklarının dilidir; veri '
        + 'alanlarının (kolon adı, kart başlığı) dilini belirlemez.',
      annotations: salt,
    },
    async () => {
      const { member, workspace } = await aktifAlan(user);
      const izinler = memberPermissions(member);
      return sonuc({
        user: { slug: user.slug, name: user.name },
        workspace,
        role: member?.role || null,
        permissions: izinler,
        permissions_without_tools: kullanilmayanIzinler(
          izinler, ARACLARIN_KULLANDIGI_IZINLER,
        ),
        server: { version: MCP_VERSION, writable: true, title_language: dil },
      });
    },
  );

  // ── list_workspaces ──────────────────────────────────────────────────────

  server.registerTool(
    'list_workspaces',
    {
      title: B('list_workspaces'),
      description:
        'Kullanıcının üye olduğu bütün çalışma alanlarını listeler. '
        + 'is_current=true olan, bütün diğer araçların baktığı alandır — '
        + 'MCP yalnızca aktif alanı görür. Aradığın proje ya da kart '
        + 'bulunamıyorsa önce buraya bak: büyük ihtimalle başka bir alandadır. '
        + 'Kullanıcı belirli bir alan adı verdiyse ve is_current olan alan o '
        + 'değilse dur ve kullanıcıya söyle; öteki alanın verilerine bu '
        + 'bağlantıdan ulaşılamaz. '
        + 'Alanı DEĞİŞTİREMEZSİN; bu yalnızca tarayıcıdan yapılıyor. '
        + 'Kullanıcıdan alanı değiştirmesini iste, sonra yeniden dene.',
      annotations: salt,
    },
    async () => {
      const yanit = await callSelf(user, '/api/workspaces/mine');
      if (!yanit.ok) return hata(yanit);
      const alanlar = (Array.isArray(yanit.data) ? yanit.data : []).map((w) => ({
        id: metinKimlik(w.id),
        name: w.name,
        slug: w.slug,
        is_current: Boolean(w.is_current),
        is_owner: Boolean(w.is_owner),
      }));
      return sonuc({ count: alanlar.length, workspaces: alanlar });
    },
  );

  // ── list_members ─────────────────────────────────────────────────────────

  server.registerTool(
    'list_members',
    {
      title: B('list_members'),
      description:
        'Aktif çalışma alanının ekibini listeler: slug, ad, rol ve izinler. '
        + 'Atama ve süzgeç alanlarına giren değer slug\'dır. '
        + '"Ekipte kim var", "kimin üzerinde kaç iş var", "X neye bakıyor" '
        + 'sorularının doğru başlangıcı burasıdır — kartların üzerindeki '
        + 'slug\'lardan dolaylı çıkarım yapma, listeyi buradan al. '
        + 'Sahip (ws_role: owner) her zaman bütün izinlere sahiptir ve '
        + 'permissions bunu gösterir; role_name onda boş olabilir. '
        + 'with_task_counts=true (varsayılan) her üyenin açık iş sayısını da '
        + 'getirir; bunun için bütün projeler taranır, pano büyükse yavaştır. '
        + 'Sayı gerekmiyorsa false ver.',
      inputSchema: {
        with_task_counts: z.boolean().optional()
          .describe('varsayılan true — açık iş sayısını da hesaplar, maliyetlidir'),
      },
      annotations: salt,
    },
    async ({ with_task_counts = true }) => {
      const { member, workspace } = await aktifAlan(user);
      if (!member?.workspaceId) {
        return hata({
          status: 404,
          data: {
            error: 'err_mcp_no_workspace',
            message: 'Aktif çalışma alanı yok',
          },
        });
      }

      const yanit = await callSelf(user, `/api/workspaces/${member.workspaceId}/members`);
      if (!yanit.ok) return hata(yanit);
      const uyeler = Array.isArray(yanit.data) ? yanit.data : [];

      if (!with_task_counts) {
        return sonuc({
          workspace,
          count: uyeler.length,
          members: uyeler.map((u) => uyeOzeti(u)),
        });
      }

      const tarama = await panoyuTara(user);
      if (!tarama.ok) return hata(tarama.yanit);

      // Açık iş = bitmiş kolonda olmayan kart. Tanım `list_projects`in `open`
      // sayısıyla aynı; iki ayrı tanım modelde "proje 6 diyor, kişiler 9
      // diyor" tutarsızlığı üretirdi.
      const yuk = new Map();
      for (const { gorevler, bitisKolonlari } of tarama.projeler) {
        for (const g of gorevler) {
          if (bitisKolonlari.has(g.col)) continue;
          for (const slug of g.assignees || []) {
            yuk.set(slug, (yuk.get(slug) || 0) + 1);
          }
        }
      }

      return sonuc({
        workspace,
        count: uyeler.length,
        members: uyeler.map((u) => uyeOzeti(u, { acikGorev: yuk.get(u.id) || 0 })),
      });
    },
  );

  // ── list_projects ────────────────────────────────────────────────────────

  server.registerTool(
    'list_projects',
    {
      title: B('list_projects'),
      description:
        'Aktif çalışma alanındaki projeleri, açık görev sayılarıyla birlikte '
        + 'listeler. "Açık" = bitmiş olarak işaretli kolonda olmayan kart; '
        + 'list_tasks varsayılan olarak aynı kümeyi döndürür. '
        + 'Diğer araçların istediği project_id buradan alınır; burada olmayan '
        + 'bir kimlik diğer araçlarda "bulunamadı" döner. '
        + 'Yanıttaki workspace alanı hangi panoda olduğunu söyler — beklediğin '
        + 'alan değilse kullanıcıya sor, devam etme. Kullanıcı belirli bir alan '
        + 'ya da proje adı verdiyse ve workspace.name ya da proje listesi onunla '
        + 'uyuşmuyorsa dur ve kullanıcıya söyle; list_workspaces öteki '
        + 'alanları gösterir.',
      annotations: salt,
    },
    async () => {
      const yanit = await callSelf(user, '/api/projects');
      if (!yanit.ok) return hata(yanit);
      const projeler = (Array.isArray(yanit.data) ? yanit.data : []).map((p) => ({
        ...p, id: metinKimlik(p.id),
      }));
      return baglamli(user, { count: projeler.length, projects: projeler });
    },
  );

  // ── list_columns ─────────────────────────────────────────────────────────

  server.registerTool(
    'list_columns',
    {
      title: B('list_columns'),
      description:
        'Bir projenin kolonlarını sırasıyla döner. Yanıttaki id alanı kolonun '
        + 'slug\'ıdır ("todo", "doing", …) — list_tasks\'in col süzgecine ve '
        + 'görevlerin col alanına giren değer budur; db_id sayısal satır '
        + 'kimliğidir, araçlarda kullanma. Kolon ADI iki alanda durur: title '
        + 'İngilizce, title_tr Türkçe addır — kullanıcıya onun dilindekini '
        + 'göster. "Tamamlandı" anlamına gelen kolon '
        + 'is_done ile işaretlidir; hiçbir kolonda işaretli değilse bu pano '
        + '"bitti" kavramını tanımlamamış demektir, kullanıcıya söyle. '
        + 'allowed_next doluysa o kolondan yalnızca listedeki kolonlara '
        + 'geçilebilir; bütün panolarda boşsa hiçbir kısıt tanımlanmamış '
        + 'demektir, alanı yok sayma — pano sahibi yarın tanımlayabilir. '
        + 'Proje aktif alanda değilse "bulunamadı" döner.',
      inputSchema: { project_id: kimlik('list_projects içindeki id') },
      annotations: salt,
    },
    async ({ project_id }) => {
      const proje = await aktifProje(user, project_id);
      if (!proje.ok) return hata(proje.yanit);

      const yanit = await callSelf(user, `/api/projects/${project_id}/columns`);
      if (!yanit.ok) return hata(yanit);
      return baglamli(user, {
        project_id: metinKimlik(project_id),
        project_name: proje.proje.name,
        columns: yanit.data,
      });
    },
  );

  // ── list_tasks ───────────────────────────────────────────────────────────

  server.registerTool(
    'list_tasks',
    {
      title: B('list_tasks'),
      description:
        'Bir projenin görevlerini listeler. VARSAYILAN OLARAK YALNIZCA AÇIK '
        + 'GÖREVLER döner — açık = bitmiş olarak işaretli kolonda olmayan kart. '
        + 'Bitmişleri de istiyorsan include_done=true ver. '
        + 'Süzgeçler birleşimli çalışır: col kolon slug\'ı, assignee kullanıcı '
        + 'slug\'ı (list_members\'tan al), overdue=true ise yalnızca tarihi '
        + 'geçmiş ve bitmemiş kartlar. '
        + 'Her kartta col_is_done ve project_name var; kartın bitip bitmediğini '
        + 'anlamak için ayrıca list_columns çağırma. '
        + 'Açıklamalar bu listede kelime sınırında kırpılıyor. İsteğe bağlı '
        + 'alanlar yalnızca doluyken gelir: desc_truncated yoksa açıklama '
        + 'tamdır (varsa tamamı için get_task kullan); subtasks yoksa alt görev '
        + 'yoktur, varsa "tamamlanan/toplam" biçimindedir. '
        + 'Yanıtta warning alanı varsa onu kullanıcıya aktar: panonun bitiş '
        + 'kolonu tanımlı değil demektir, yani liste olduğundan uzun. '
        + 'Proje aktif alanda değilse "bulunamadı" döner.',
      inputSchema: {
        project_id: kimlik('list_projects içindeki id'),
        col: z.string().optional().describe('kolon slug\'ı — list_columns yanıtındaki id, örn. "todo"'),
        assignee: z.string().optional().describe('kullanıcı slug\'ı, örn. "eray-atalay"'),
        overdue: z.boolean().optional().describe('yalnızca tarihi geçmiş ve bitmemiş kartlar'),
        include_done: z.boolean().optional()
          .describe('varsayılan false — bitmiş kolondaki kartları da getirir'),
      },
      annotations: salt,
    },
    async ({ project_id, col, assignee, overdue = false, include_done = false }) => {
      const proje = await aktifProje(user, project_id);
      if (!proje.ok) return hata(proje.yanit);

      const yanit = await callSelf(user, `/api/projects/${project_id}/tasks`);
      if (!yanit.ok) return hata(yanit);

      // Kolonlar her durumda gerekiyor: hem süzgeç hem her kartın
      // `col_is_done` alanı buna dayanıyor. Önce yalnızca `overdue` iken
      // çekiliyordu ve "bitmiş mi" sorusunun cevabı listede hiç yoktu.
      const kolonlar = await bitisKolonlariniGetir(user, project_id);
      if (!kolonlar.ok) return hata(kolonlar.yanit);

      const gorevler = gorevSuz(yanit.data, {
        col, assignee, overdue,
        includeDone: include_done,
        bitisKolonlari: kolonlar.kume,
        bugun: bugunISO(),
      }).map((g) => ({
        ...gorevOzeti(g, { bitisKolonlari: kolonlar.kume }),
        project_name: proje.proje.name,
      }));

      const uyari = listeUyarisi({
        bitisKolonSayisi: kolonlar.kume.size,
        includeDone: include_done,
        overdue,
      });

      return baglamli(user, {
        project_id: metinKimlik(project_id),
        project_name: proje.proje.name,
        count: gorevler.length,
        include_done,
        ...(uyari ? { warning: uyari } : {}),
        tasks: gorevler,
      });
    },
  );

  // ── search_tasks ─────────────────────────────────────────────────────────

  server.registerTool(
    'search_tasks',
    {
      title: B('search_tasks'),
      description:
        'Aktif çalışma alanındaki kartlarda metin arar — başlık ve açıklama '
        + 'içinde, büyük/küçük harf ve Türkçe i/ı ayrımı gözetmeden. '
        + 'Belirli bir projeyle sınırlamak için project_id ver; vermezsen '
        + 'bütün projeler taranır. Varsayılan olarak yalnızca açık kartlar '
        + 'aranır (include_done=true ile bitmişler de girer). '
        + 'Kartlar list_tasks ile aynı şekildedir. İsteğe bağlı alanlar '
        + 'yalnızca doluyken gelir: truncated yoksa bütün eşleşmeler döndü '
        + 'demektir; varsa dönmedi — aramayı daralt, listeyi tam sanma. '
        + 'desc_truncated yoksa açıklama tamdır.',
      inputSchema: {
        q: z.string().min(2).describe('aranacak metin, en az 2 karakter'),
        project_id: kimlik('yalnızca bu projede ara — list_projects içindeki id').optional(),
        assignee: z.string().optional().describe('kullanıcı slug\'ı ile daralt'),
        include_done: z.boolean().optional()
          .describe('varsayılan false — bitmiş kolondaki kartları da arar'),
        limit: z.coerce.number().int().positive().max(100).optional()
          .describe('en fazla kaç sonuç, varsayılan 20'),
      },
      annotations: salt,
    },
    async ({ q, project_id, assignee, include_done = false, limit = 20 }) => {
      let taranan;
      if (project_id) {
        const proje = await aktifProje(user, project_id);
        if (!proje.ok) return hata(proje.yanit);

        const [gorevYanit, kolonlar] = await Promise.all([
          callSelf(user, `/api/projects/${project_id}/tasks`),
          bitisKolonlariniGetir(user, project_id),
        ]);
        if (!gorevYanit.ok) return hata(gorevYanit);
        if (!kolonlar.ok) return hata(kolonlar.yanit);
        taranan = [{
          proje: proje.proje,
          gorevler: Array.isArray(gorevYanit.data) ? gorevYanit.data : [],
          bitisKolonlari: kolonlar.kume,
        }];
      } else {
        const tarama = await panoyuTara(user);
        if (!tarama.ok) return hata(tarama.yanit);
        taranan = tarama.projeler;
      }

      const bulunan = [];
      for (const { proje, gorevler, bitisKolonlari } of taranan) {
        const eslesen = gorevSuz(gorevler, {
          assignee,
          includeDone: include_done,
          bitisKolonlari,
          bugun: bugunISO(),
        }).filter((g) => aramaEslesir(g, q));

        for (const g of eslesen) {
          bulunan.push({
            ...gorevOzeti(g, { bitisKolonlari }),
            project_name: proje.name,
          });
        }
      }

      // Kesme yanıtın içinde söyleniyor. Sessizce kısaltmak, modelin
      // "bu kelime panoda yalnızca 20 yerde geçiyor" diye yanlış bir sonuç
      // bildirmesi demek olurdu.
      const kesildi = bulunan.length > limit;
      return baglamli(user, {
        query: q,
        count: kesildi ? limit : bulunan.length,
        total_matches: bulunan.length,
        ...(kesildi ? { truncated: true } : {}),
        tasks: bulunan.slice(0, limit),
      });
    },
  );

  // ── get_task ─────────────────────────────────────────────────────────────

  server.registerTool(
    'get_task',
    {
      title: B('get_task'),
      description:
        'Tek bir görevin tamamını döner: açıklama, alt görevler, yorumlar, '
        + 'etiketler, atananlar ve tarihler. Bir işi anlamadan önce buraya bak; '
        + 'list_tasks yalnızca özet veriyor ve açıklamayı kırpıyor. '
        + 'col_is_done yalnızca kolonlar okunabildiyse gelir; yoksa bilinmiyor '
        + 'demektir, "bitmemiş" diye okuma. '
        + 'Görev aktif alanda değilse "bulunamadı" döner.',
      inputSchema: { task_id: kimlik('list_tasks içindeki id') },
      annotations: salt,
    },
    async ({ task_id }) => {
      const yanit = await callSelf(user, `/api/tasks/${task_id}`);
      if (!yanit.ok) return hata(erisimYoksaBulunamadi(yanit, 'gorev'));

      // API "üyesi olduğun alandaki görev" diye soruyor, MCP "aktif alandaki
      // görev" diye. Görevin projesi aktif alanın proje listesinde yoksa
      // yanıt, hiç var olmayan görevle aynı.
      const projeler = await callSelf(user, '/api/projects');
      if (!projeler.ok) return hata(projeler);
      const proje = projeyiBul(projeler.data, yanit.data?.project_id);
      if (!proje) return hata(bulunamadi('gorev'));

      const kolonlar = await bitisKolonlariniGetir(user, proje.id);
      const bitisKolonlari = kolonlar.ok ? kolonlar.kume : undefined;

      return baglamli(user, {
        task: {
          ...gorevDetayi(yanit.data, { bitisKolonlari }),
          project_name: proje.name,
        },
      });
    },
  );

  // ── list_notes ───────────────────────────────────────────────────────────

  server.registerTool(
    'list_notes',
    {
      title: B('list_notes'),
      description:
        'Aktif çalışma alanında görebildiğin notları listeler — gövde metni '
        + 'olmadan. preview gövdenin tamamı DEĞİLDİR: markdown işaretleri '
        + 'temizlendikten sonraki ilk 240 karakterdir ve kelime ortasında '
        + 'kesilebilir; içeriği okumak için get_note kullan. Yalnızca çalışma '
        + 'alanı görünürlüğündeki notlar ve senin yazarı ya da ortak yazarı '
        + 'olduğun özel notlar döner.',
      inputSchema: {
        archived: z.boolean().optional().describe('true ise arşivlenmiş notlar da gelir'),
      },
      annotations: salt,
    },
    async ({ archived }) => {
      const yanit = await callSelf(user, `/api/notes${archived ? '?archived=1' : ''}`);
      if (!yanit.ok) return hata(yanit);
      const notlar = (Array.isArray(yanit.data) ? yanit.data : []).map(notOzeti);
      return baglamli(user, { count: notlar.length, notes: notlar });
    },
  );

  // ── get_note ─────────────────────────────────────────────────────────────

  server.registerTool(
    'get_note',
    {
      title: B('get_note'),
      description:
        'Tek bir notun gövdesini ve bağlı olduğu görevleri döner. Bir kartın '
        + 'neden var olduğunu anlamak için: gereksinim notu genellikle görevlere '
        + 'bağlıdır ve get_task yanıtındaki bağlı notlardan buraya gelinir. '
        + 'Not aktif alanda değilse "bulunamadı" döner.',
      inputSchema: { note_id: kimlik('list_notes içindeki id') },
      annotations: salt,
    },
    async ({ note_id }) => {
      const yanit = await callSelf(user, `/api/notes/${note_id}`);
      if (!yanit.ok) return hata(erisimYoksaBulunamadi(yanit, 'not'));

      // `canViewNote` başka alandaki notu o alanın SAHİBİNE gösteriyor —
      // tarayıcı için doğru, MCP için değil. Alan eşleşmiyorsa yok say.
      const { workspace } = await aktifAlan(user);
      if (!notAlandaMi(yanit.data, workspace?.id)) return hata(bulunamadi('not'));

      return baglamli(user, { note: notOzeti(yanit.data) }, workspace);
    },
  );

  // ── create_task ──────────────────────────────────────────────────────────

  server.registerTool(
    'create_task',
    {
      title: B('create_task'),
      description:
        'Aktif çalışma alanındaki bir projede yeni görev (kart) açar ve kartı '
        + 'döner. Kullanıcı açıkça istemediyse kart açma. '
        + 'workspace_id zorunludur ve AKTİF alanın kimliği olmalıdır (whoami '
        + 'yanıtındaki workspace.id); değilse 409 döner ve hiçbir şey yazılmaz '
        + '— kullanıcıdan tarayıcıda alanı değiştirmesini iste. project_id '
        + 'list_projects\'ten alınır. col kolon slug\'ıdır (list_columns id); '
        + 'verilmezse "todo" kolonuna, pano onu tanımlamıyorsa ilk kolona '
        + 'açılır; olmayan bir slug hata döner. assignees kullanıcı slug\'larıdır '
        + '(list_members); yalnızca alan üyeleri atanabilir ve atanan kişiye '
        + 'bildirim gider. due ve start YYYY-MM-DD biçimindedir. Kart '
        + 'kullanıcının adına açılır ve denetim kaydına MCP üzerinden '
        + 'yapıldığı yazılır.',
      inputSchema: {
        workspace_id: kimlik('aktif alanın kimliği — whoami yanıtındaki workspace.id'),
        project_id: kimlik('list_projects içindeki id'),
        title: z.string().trim().min(1).max(500).describe('kart başlığı'),
        desc: z.string().max(10000).optional().describe('açıklama, düz metin'),
        col: z.string().optional().describe('kolon slug\'ı — list_columns id, örn. "todo"'),
        priority: z.enum(['high', 'mid', 'low']).optional().describe('öncelik; varsayılan mid'),
        due: TARIH.optional().describe('bitiş tarihi, YYYY-MM-DD'),
        start: TARIH.optional().describe('başlangıç tarihi, YYYY-MM-DD'),
        assignees: z.array(z.string()).max(20).optional()
          .describe('atanacak kullanıcı slug\'ları — list_members'),
      },
      annotations: yazma,
    },
    async ({ workspace_id, project_id, title, desc, col, priority, due, start, assignees }) => {
      const kapi = await yazmaKapisi(user, workspace_id);
      if (!kapi.ok) return hata(kapi.yanit);

      const proje = await aktifProje(user, project_id);
      if (!proje.ok) return hata(proje.yanit);

      const kolonlar = await bitisKolonlariniGetir(user, project_id);
      if (!kolonlar.ok) return hata(kolonlar.yanit);
      if (col !== undefined && !kolonlar.kolonlar.some((c) => c.id === col)) {
        return hata(kolonYok(kolonlar.kolonlar, col));
      }

      const yanit = await callSelf(user, `/api/projects/${project_id}/tasks`, {
        method: 'POST',
        body: { title, desc, col, priority, due, start, assignees },
      });
      if (!yanit.ok) return hata(yanit);

      recordAudit(req, {
        workspaceId: kapi.workspace.id,
        user,
        action: AUDIT.MCP_TASK_CREATED,
        detail: { task_id: metinKimlik(yanit.data?.id), project_id: metinKimlik(project_id) },
      });
      return baglamli(user, {
        created: true,
        task: {
          ...gorevDetayi(yanit.data, { bitisKolonlari: kolonlar.kume }),
          project_name: proje.proje.name,
        },
      }, kapi.workspace);
    },
  );

  // ── update_task ──────────────────────────────────────────────────────────

  server.registerTool(
    'update_task',
    {
      title: B('update_task'),
      description:
        'Var olan bir görevin alanlarını değiştirir: başlık, açıklama, öncelik, '
        + 'tarihler, atananlar. Yalnızca verilen alanlar değişir; kartı başka '
        + 'kolona almak için move_task kullan. Kullanıcı açıkça istemediyse '
        + 'değiştirme. workspace_id zorunludur ve AKTİF alanın kimliği '
        + 'olmalıdır; değilse 409 döner, hiçbir şey yazılmaz. Atananlar tam '
        + 'liste olarak DEĞİL, add_assignees / remove_assignees ile verilir — '
        + 'öbür atananlar korunur. Yalnızca alan üyeleri eklenebilir; yeni '
        + 'eklenen kişiye bildirim gider. desc verilirse eski açıklamanın '
        + 'yerine geçer. due ya da start için null tarihi siler. Görev aktif '
        + 'alanda değilse "bulunamadı" döner.',
      inputSchema: {
        workspace_id: kimlik('aktif alanın kimliği — whoami yanıtındaki workspace.id'),
        task_id: kimlik('list_tasks içindeki id'),
        title: z.string().trim().min(1).max(500).optional().describe('yeni başlık'),
        desc: z.string().max(10000).optional().describe('yeni açıklama, düz metin — eskisinin yerine geçer'),
        priority: z.enum(['high', 'mid', 'low']).optional().describe('yeni öncelik'),
        due: TARIH.nullable().optional().describe('YYYY-MM-DD; null tarihi siler'),
        start: TARIH.nullable().optional().describe('YYYY-MM-DD; null tarihi siler'),
        add_assignees: z.array(z.string()).max(20).optional()
          .describe('eklenecek kullanıcı slug\'ları — list_members'),
        remove_assignees: z.array(z.string()).max(20).optional()
          .describe('çıkarılacak kullanıcı slug\'ları'),
      },
      annotations: { ...yazma, destructiveHint: true, idempotentHint: true },
    },
    async ({ workspace_id, task_id, title, desc, priority, due, start, add_assignees, remove_assignees }) => {
      const kapi = await yazmaKapisi(user, workspace_id);
      if (!kapi.ok) return hata(kapi.yanit);

      const g = await aktifGorev(user, task_id);
      if (!g.ok) return hata(g.yanit);

      const govde = {};
      if (title !== undefined) govde.title = title;
      if (desc !== undefined) govde.desc = desc;
      if (priority !== undefined) govde.priority = priority;
      if (due !== undefined) govde.due = due;
      if (start !== undefined) govde.start = start;

      const ekle = add_assignees || [];
      const cikar = remove_assignees || [];
      if (ekle.length || cikar.length) {
        const { liste, celiski } = atamaListesi(g.gorev.assignees, { ekle, cikar });
        if (celiski.length) {
          return hata({
            status: 400,
            data: {
              error: 'err_mcp_assignee_conflict',
              message: 'Aynı kişi hem eklenip hem çıkarılamaz',
              conflicting: celiski,
            },
          });
        }
        govde.assignees = liste;
      }

      const alanlar = Object.keys(govde);
      if (!alanlar.length) {
        return hata({
          status: 400,
          data: { error: 'err_mcp_nothing_to_update', message: 'Değiştirilecek alan verilmedi' },
        });
      }

      const yanit = await callSelf(user, `/api/tasks/${task_id}`, { method: 'PATCH', body: govde });
      if (!yanit.ok) return hata(yanit);

      recordAudit(req, {
        workspaceId: kapi.workspace.id,
        user,
        action: AUDIT.MCP_TASK_UPDATED,
        detail: {
          task_id: metinKimlik(task_id),
          fields: alanlar,
          ...(ekle.length ? { assignees_added: ekle } : {}),
          ...(cikar.length ? { assignees_removed: cikar } : {}),
        },
      });
      const kolonlar = await bitisKolonlariniGetir(user, g.proje.id);
      return baglamli(user, {
        updated: alanlar,
        task: {
          ...gorevDetayi(yanit.data, { bitisKolonlari: kolonlar.ok ? kolonlar.kume : undefined }),
          project_name: g.proje.name,
        },
      }, kapi.workspace);
    },
  );

  // ── move_task ────────────────────────────────────────────────────────────

  server.registerTool(
    'move_task',
    {
      title: B('move_task'),
      description:
        'Bir görevi aynı projede başka bir kolona taşır ("yapılıyor"a al, '
        + '"tamamlandı"ya çek gibi). col hedef kolonun slug\'ıdır (list_columns '
        + 'id). Kullanıcı açıkça istemediyse taşıma. workspace_id zorunludur ve '
        + 'AKTİF alanın kimliği olmalıdır; değilse 409 döner. Pano bir kolondan '
        + 'yalnızca belirli kolonlara geçişe izin veriyorsa (allowed_next) ve '
        + 'hedef listede yoksa 409 döner — sebebi kullanıcıya aktar, başka yol '
        + 'deneme. "Tamamlandı" işaretli kolona taşınan kartın ilerlemesi 100 '
        + 'olur. Kart zaten o kolondaysa hiçbir şey yazılmaz ve moved=false döner.',
      inputSchema: {
        workspace_id: kimlik('aktif alanın kimliği — whoami yanıtındaki workspace.id'),
        task_id: kimlik('list_tasks içindeki id'),
        col: z.string().min(1).describe('hedef kolon slug\'ı — list_columns id'),
      },
      annotations: { ...yazma, idempotentHint: true },
    },
    async ({ workspace_id, task_id, col }) => {
      const kapi = await yazmaKapisi(user, workspace_id);
      if (!kapi.ok) return hata(kapi.yanit);

      const g = await aktifGorev(user, task_id);
      if (!g.ok) return hata(g.yanit);

      const kolonlar = await bitisKolonlariniGetir(user, g.proje.id);
      if (!kolonlar.ok) return hata(kolonlar.yanit);
      if (!kolonlar.kolonlar.some((c) => c.id === col)) return hata(kolonYok(kolonlar.kolonlar, col));

      const once = g.gorev.col;
      if (once === col) {
        return baglamli(user, {
          moved: false,
          task: { ...gorevDetayi(g.gorev, { bitisKolonlari: kolonlar.kume }), project_name: g.proje.name },
        }, kapi.workspace);
      }

      const yanit = await callSelf(user, `/api/tasks/${task_id}`, { method: 'PATCH', body: { col } });
      if (!yanit.ok) return hata(yanit);

      recordAudit(req, {
        workspaceId: kapi.workspace.id,
        user,
        action: AUDIT.MCP_TASK_MOVED,
        detail: { task_id: metinKimlik(task_id), from: once, to: col },
      });
      return baglamli(user, {
        moved: true,
        from: once,
        task: { ...gorevDetayi(yanit.data, { bitisKolonlari: kolonlar.kume }), project_name: g.proje.name },
      }, kapi.workspace);
    },
  );

  return server;
}

// ─── POST /mcp ─────────────────────────────────────────────────────────────

mcpRouter.post(
  '/',
  requireMcpToken,
  asyncHandler(async (req, res) => {
    // Başlık dili istekten okunuyor: MCP `initialize` bir dil alanı
    // taşımıyor, elde yalnızca HTTP sinyalleri var. Ayrıntı ve gerekçe
    // `lib/mcpShape.js` içindeki `araclarinDili` notunda.
    const dil = araclarinDili({
      sorgu: req.query?.lang,
      acceptLanguage: req.get?.('accept-language'),
    });

    const server = buildMcpServer(req.mcpUser, dil, req);
    const transport = new StreamableHTTPServerTransport({
      // undefined = durum tutmayan kip. Oturum kimliği üretilmiyor, doğrulama
      // yapılmıyor; her istek kendi başına tam.
      //
      // Bu kipin çalışabilmesi SDK'nın bir davranışına dayanıyor: sunucu,
      // `initialize` görmemiş bir isteği reddetmiyor. Aksi hâlde her istekte
      // yeni sunucu kurulduğu için istemcinin ikinci çağrısı ("tools/list")
      // "not initialized" alırdı. Doğrulandı (SDK 1.30.0); sürüm yükseltmesinde
      // yeniden bakılmalı — bozulursa çare durum tutan kipe geçmek.
      sessionIdGenerator: undefined,

      // Yanıt SSE akışı yerine düz JSON. Araçlarımız istek/yanıt biçiminde,
      // ara ilerleme bildirimi göndermiyorlar; akışa ihtiyaç yok. Railway'in
      // önündeki ters vekil uzun ömürlü bağlantıyı boşta kalma zaman aşımıyla
      // düşürebildiği için tek atışlık JSON hem daha basit hem daha dayanıklı.
      enableJsonResponse: true,
    });

    // Bağlantı kapandığında ikisi de kapanmalı, yoksa her istek bir dinleyici
    // bırakır ve süreç yavaşça şişer.
    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }),
);

// ─── GET / DELETE /mcp ─────────────────────────────────────────────────────
//
// Durum tutmayan kipte sunucudan istemciye açılan bir akış yok. Bu metotlar
// yine de kayıtlı: kayıtsız kalsalardı istek 404 yakalayıcısına düşer ve
// `/api` ile başlamadığı için istemciye SPA'nın index.html'i dönerdi — bir
// MCP istemcisinin çözemeyeceği en kafa karıştırıcı cevap.
//
// Kimlik kapısı burada da var: MCP ucunun yapılandırılmış olup olmadığı
// anahtarı olmayana söylenmiyor.

function methodNotAllowed(_req, res) {
  res.set('Allow', 'POST');
  res.status(405).json({
    error: 'err_mcp_method_not_allowed',
    message: 'MCP ucu yalnızca POST kabul eder',
  });
}

mcpRouter.get('/', requireMcpToken, methodNotAllowed);
mcpRouter.delete('/', requireMcpToken, methodNotAllowed);
