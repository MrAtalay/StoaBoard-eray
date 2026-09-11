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
// normalizasyonu, kırpma, süzme, uyarı metni. Sebebi test — bu dosyanın
// hiçbir satırı veritabanı olmadan koşamıyor, orası koşuyor.
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

import { Router } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireMcpToken } from '../lib/mcpAuth.js';
import { currentMember, memberPermissions } from '../lib/workspace.js';
import { callSelf } from '../lib/selfApi.js';
import {
  metinKimlik,
  gorevOzeti,
  gorevDetayi,
  gorevSuz,
  listeUyarisi,
  notOzeti,
  uyeOzeti,
  aramaEslesir,
  kullanilmayanIzinler,
  araclarinDili,
  baslik,
} from '../lib/mcpShape.js';

export const mcpRouter = Router();

// Sunucu yüzeyinin kendi sürümü — uygulamanın sürümünden ayrı ilerliyor.
// İstemciler yetenek değişikliğini buradan görür.
// Dağıtımın indiğini anlamanın da tek yolu bu: uç anahtarsız isteğe her
// durumda 401 döndüğü için "yeni kod canlıda mı" sorusu dışarıdan
// cevaplanamıyor. Yüzeyi değiştiren her commit'te bump et; `initialize`
// yanıtındaki serverInfo.version dağıtım kanıtı olarak okunabilsin.
const MCP_VERSION = '0.3.0';

/**
 * Araçların fiilen kullandığı izinler.
 *
 * Bugün boş ve bu doğru: on aracın onu da salt okuma, hiçbiri
 * `manage_tasks` benzeri bir izin kapısından geçmiyor — okuma için üyelik
 * yetiyor. `whoami` bu kümeyi kullanıp "şu izinlerin MCP'de karşılığı yok"
 * diyor, çünkü izin listesini çıplak vermek modelde yapamayacağı işler için
 * beklenti yaratıyor (10 Eylül: istemci `manage_channels` görüp sohbeti
 * yönetebileceğini sandı).
 *
 * Yazma araçları geldiğinde buraya `manage_tasks` ve `manage_projects`
 * eklenecek; liste kendiliğinden küçülecek. Elle tutulan bir muafiyet listesi
 * bayatlardı.
 */
const ARACLARIN_KULLANDIGI_IZINLER = new Set();

// ─── Yardımcılar ───────────────────────────────────────────────────────────

/** Başarılı araç yanıtı. */
function sonuc(veri) {
  return { content: [{ type: 'text', text: JSON.stringify(veri, null, 2) }] };
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
        text: JSON.stringify({ status: yanit.status, ...(yanit.data || {}) }, null, 2),
      },
    ],
  };
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

/** Bağlamı (çalışma alanı) her yanıtın başına koyan sarmal. */
async function baglamli(user, veri) {
  const { workspace } = await aktifAlan(user);
  return sonuc({ workspace, ...veri });
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
 */
function buildMcpServer(user, dil) {
  const server = new McpServer(
    { name: 'stoaboard', version: MCP_VERSION },
    { capabilities: { tools: {} } },
  );

  const salt = { readOnlyHint: true };
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
        + 'kullanıcıyı tarayıcıya yönlendir, deneme.',
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
        server: { version: MCP_VERSION, writable: false, title_language: dil },
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
        + 'Diğer araçların istediği project_id buradan alınır. '
        + 'Yanıttaki workspace alanı hangi panoda olduğunu söyler — beklediğin '
        + 'alan değilse kullanıcıya sor, devam etme; list_workspaces öteki '
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
        + 'kimliğidir, araçlarda kullanma. "Tamamlandı" anlamına gelen kolon '
        + 'is_done ile işaretlidir; hiçbir kolonda işaretli değilse bu pano '
        + '"bitti" kavramını tanımlamamış demektir, kullanıcıya söyle. '
        + 'allowed_next doluysa o kolondan yalnızca listedeki kolonlara '
        + 'geçilebilir; bütün panolarda boşsa hiçbir kısıt tanımlanmamış '
        + 'demektir, alanı yok sayma — pano sahibi yarın tanımlayabilir.',
      inputSchema: { project_id: kimlik('list_projects içindeki id') },
      annotations: salt,
    },
    async ({ project_id }) => {
      const yanit = await callSelf(user, `/api/projects/${project_id}/columns`);
      if (!yanit.ok) return hata(yanit);
      return baglamli(user, { project_id: metinKimlik(project_id), columns: yanit.data });
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
        + 'Her kartta col_is_done alanı var; kartın bitip bitmediğini anlamak '
        + 'için ayrıca list_columns çağırma. '
        + 'Açıklamalar bu listede kırpılıyor (desc_truncated=true ise tamamı '
        + 'için get_task kullan). '
        + 'Yanıtta warning alanı varsa onu kullanıcıya aktar: panonun bitiş '
        + 'kolonu tanımlı değil demektir, yani liste olduğundan uzun.',
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
      }).map((g) => gorevOzeti(g, { bitisKolonlari: kolonlar.kume }));

      const uyari = listeUyarisi({
        bitisKolonSayisi: kolonlar.kume.size,
        includeDone: include_done,
        overdue,
      });

      return baglamli(user, {
        project_id: metinKimlik(project_id),
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
        + 'Yanıtta truncated=true varsa eşleşmelerin tamamı dönmedi — '
        + 'aramayı daralt, listeyi tam sanma.',
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
        const [gorevYanit, kolonlar] = await Promise.all([
          callSelf(user, `/api/projects/${project_id}/tasks`),
          bitisKolonlariniGetir(user, project_id),
        ]);
        if (!gorevYanit.ok) return hata(gorevYanit);
        if (!kolonlar.ok) return hata(kolonlar.yanit);
        // Proje adı bilinmiyor: tek proje aranırken proje listesi çekilmiyor.
        // `name: null` yazmak "adı yok" diye okunurdu; alan hiç konmuyor.
        taranan = [{
          proje: { id: metinKimlik(project_id) },
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
            ...(proje.name ? { project_name: proje.name } : {}),
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
        + 'list_tasks yalnızca özet veriyor ve açıklamayı kırpıyor.',
      inputSchema: { task_id: kimlik('list_tasks içindeki id') },
      annotations: salt,
    },
    async ({ task_id }) => {
      const yanit = await callSelf(user, `/api/tasks/${task_id}`);
      if (!yanit.ok) return hata(yanit);

      // Kartın bitmiş kolonda olup olmadığı detayda da bulunsun. Proje
      // kimliği yanıtın içinde geldiği için ikinci bir arama gerekmiyor.
      const projeId = yanit.data?.project_id;
      let bitisKolonlari;
      if (projeId) {
        const kolonlar = await bitisKolonlariniGetir(user, projeId);
        if (kolonlar.ok) bitisKolonlari = kolonlar.kume;
      }

      return baglamli(user, { task: gorevDetayi(yanit.data, { bitisKolonlari }) });
    },
  );

  // ── list_notes ───────────────────────────────────────────────────────────

  server.registerTool(
    'list_notes',
    {
      title: B('list_notes'),
      description:
        'Aktif çalışma alanında görebildiğin notları listeler — gövde metni '
        + 'olmadan. preview alanı gövdenin ilk 240 karakteridir, tamamı değil; '
        + 'içeriği okumak için get_note kullan. Yalnızca çalışma alanı '
        + 'görünürlüğündeki notlar ve senin yazarı ya da ortak yazarı olduğun '
        + 'özel notlar döner.',
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
        + 'bağlıdır ve get_task yanıtındaki bağlı notlardan buraya gelinir.',
      inputSchema: { note_id: kimlik('list_notes içindeki id') },
      annotations: salt,
    },
    async ({ note_id }) => {
      const yanit = await callSelf(user, `/api/notes/${note_id}`);
      if (!yanit.ok) return hata(yanit);
      return baglamli(user, { note: notOzeti(yanit.data) });
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

    const server = buildMcpServer(req.mcpUser, dil);
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
