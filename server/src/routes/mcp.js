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
// ── Araç açıklamaları neden çevrilmiyor ───────────────────────────────────
//
// Dil kuralı (CLAUDE.md) kullanıcının GÖRDÜĞÜ metni bağlıyor. Buradaki
// açıklamaları kullanıcı görmüyor, model okuyor; model de cevabını zaten
// kullanıcının diliyle veriyor. Hata alanları ise kurala tabi ve `err_` kodu
// taşıyor — `dil.test.js` bu dosyayı da tarıyor.

import { Router } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireMcpToken } from '../lib/mcpAuth.js';
import { currentMember, memberPermissions } from '../lib/workspace.js';
import { callSelf } from '../lib/selfApi.js';

export const mcpRouter = Router();

// Sunucu yüzeyinin kendi sürümü — uygulamanın sürümünden ayrı ilerliyor.
// İstemciler yetenek değişikliğini buradan görür.
// Dağıtımın indiğini anlamanın da tek yolu bu: uç anahtarsız isteğe her
// durumda 401 döndüğü için "yeni kod canlıda mı" sorusu dışarıdan
// cevaplanamıyor. Yüzeyi değiştiren her commit'te bump et; `initialize`
// yanıtındaki serverInfo.version dağıtım kanıtı olarak okunabilsin.
const MCP_VERSION = '0.2.3';

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
 * Her listeleme yanıtına ekleniyor. Sebebi kolaylık değil, güvenlik: MCP
 * kullanıcının AKTİF alanını takip ediyor ve o alan tarayıcıdan bir tıkla
 * değişebiliyor. Yanıtın içinde alan adı yazmazsa "Claude kartı yanlış panoya
 * açmış" durumu ancak iş işten geçtikten sonra fark edilir. Adı her yanıta
 * koymak, modelin yanlış yerde olduğunu kendisinin görmesini sağlıyor.
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

// ─── MCP sunucusu ──────────────────────────────────────────────────────────

/**
 * İsteği yapan kullanıcıya bağlı bir MCP sunucusu kurar.
 *
 * Her istek için yeniden kuruluyor. Durum tutmayan (stateless) kip bilinçli:
 * Railway süreci yeniden başlattığında ya da ikinci bir örnek açtığında
 * yarıda kalan oturum diye bir şey olmuyor.
 */
function buildMcpServer(user) {
  const server = new McpServer(
    { name: 'stoaboard', version: MCP_VERSION },
    { capabilities: { tools: {} } },
  );

  const salt = { readOnlyHint: true };

  // ── whoami ───────────────────────────────────────────────────────────────

  server.registerTool(
    'whoami',
    {
      title: 'Kimlik',
      description:
        'Bağlantının hangi StoaBoard kullanıcısı adına açıldığını, aktif çalışma '
        + 'alanını ve o alandaki izinleri döner. Bir işe başlamadan önce kimin '
        + 'adına hareket ettiğini doğrulamak için kullan.',
      annotations: salt,
    },
    async () => {
      const { member, workspace } = await aktifAlan(user);
      return sonuc({
        user: { slug: user.slug, name: user.name },
        workspace,
        role: member?.role || null,
        permissions: memberPermissions(member),
      });
    },
  );

  // ── list_projects ────────────────────────────────────────────────────────

  server.registerTool(
    'list_projects',
    {
      title: 'Projeler',
      description:
        'Aktif çalışma alanındaki projeleri, açık görev sayılarıyla birlikte '
        + 'listeler. Diğer araçların istediği project_id buradan alınır. '
        + 'Yanıttaki workspace alanı hangi panoda olduğunu söyler — beklediğin '
        + 'alan değilse kullanıcıya sor, devam etme.',
      annotations: salt,
    },
    async () => {
      const yanit = await callSelf(user, '/api/projects');
      if (!yanit.ok) return hata(yanit);
      const { workspace } = await aktifAlan(user);
      return sonuc({ workspace, projects: yanit.data });
    },
  );

  // ── list_columns ─────────────────────────────────────────────────────────

  server.registerTool(
    'list_columns',
    {
      title: 'Kolonlar',
      description:
        'Bir projenin kolonlarını sırasıyla döner. Yanıttaki id alanı kolonun '
        + 'slug\'ıdır ("todo", "doing", …) — list_tasks\'in col süzgecine ve '
        + 'görevlerin col alanına giren değer budur; db_id sayısal satır '
        + 'kimliğidir, araçlarda kullanma. "Tamamlandı" anlamına gelen kolon '
        + 'is_done ile işaretlidir; hiçbir kolonda işaretli değilse bu pano '
        + '"bitti" kavramını tanımlamamış demektir, kullanıcıya söyle. '
        + 'allowed_next doluysa o kolondan yalnızca listedeki kolonlara geçilebilir.',
      inputSchema: { project_id: kimlik('list_projects içindeki id') },
      annotations: salt,
    },
    async ({ project_id }) => {
      const yanit = await callSelf(user, `/api/projects/${project_id}/columns`);
      return yanit.ok ? sonuc(yanit.data) : hata(yanit);
    },
  );

  // ── list_tasks ───────────────────────────────────────────────────────────

  server.registerTool(
    'list_tasks',
    {
      title: 'Görevler',
      description:
        'Bir projenin görevlerini listeler. Süzgeçler birleşimli çalışır: col '
        + 'kolon slug\'ı, assignee kullanıcı slug\'ı, overdue=true ise yalnızca '
        + 'tarihi geçmiş ve bitiş kolonunda olmayanlar döner. Süzgeç vermezsen '
        + 'projedeki bütün açık görevler gelir. Yanıtta warning alanı varsa '
        + 'onu kullanıcıya aktar: sayının güvenilirliğiyle ilgilidir.',
      inputSchema: {
        project_id: kimlik('list_projects içindeki id'),
        col: z.string().optional().describe('kolon slug\'ı — list_columns yanıtındaki id, örn. "todo"'),
        assignee: z.string().optional().describe('kullanıcı slug\'ı, örn. "eray-atalay"'),
        overdue: z.boolean().optional(),
      },
      annotations: salt,
    },
    async ({ project_id, col, assignee, overdue }) => {
      const yanit = await callSelf(user, `/api/projects/${project_id}/tasks`);
      if (!yanit.ok) return hata(yanit);

      // Gecikme ölçütü kolona bakar, damgaya değil.
      //
      // `completed_at` türetilmiş bir kopyadır: kart bitiş kolonuna girince
      // yazılıyor, çıkınca siliniyor (tasks.js). Kolonun kendisi gerçektir.
      // Kopyaya güvenmek 10 Eylül 2026'da ölçüldü ve yanlış çıktı: geçiş
      // defteri 2 Eylül'de açıldığı için ondan önce bitiş kolonuna taşınan
      // 39 kartta damga hiç yazılmamıştı. "Ana Proje"de gecikmiş sayısı 14
      // görünüyordu, oysa 9 kart panoda bitmiş kolonda duruyordu.
      //
      // Damgayı geriye dönük uydurmak yerine soru doğru yere soruluyor:
      // kart bitiş kolonundaysa gecikmiş değildir, damgası olmasa bile.
      let bitisKolonlari = null;
      if (overdue) {
        const kolonlar = await callSelf(user, `/api/projects/${project_id}/columns`);
        if (!kolonlar.ok) return hata(kolonlar);
        bitisKolonlari = new Set(
          (Array.isArray(kolonlar.data) ? kolonlar.data : [])
            .filter((c) => c.is_done)
            .map((c) => c.id),
        );
      }

      const bugun = new Date().toISOString().slice(0, 10);
      const gorevler = (Array.isArray(yanit.data) ? yanit.data : []).filter((t) => {
        if (col && t.col !== col) return false;
        if (assignee && !(t.assignees || []).includes(assignee)) return false;
        if (overdue) {
          if (!(t.due && t.due < bugun)) return false;
          if (t.completed_at) return false;
          if (bitisKolonlari.has(t.col)) return false;
        }
        return true;
      });

      // İşaretsiz panoda listeyi sessizce doğruymuş gibi vermek, bu deponun
      // tekrar tekrar yandığı sessiz başarısızlık kalıbı. Kolon tanımlı
      // değilse "bitmiş" diye eleyebileceğimiz hiçbir kart yok; sayı
      // olduğundan büyük çıkar ve bunu yalnızca yanıt söyleyebilir.
      const uyari = overdue && bitisKolonlari.size === 0
        ? 'Bu panoda "tamamlandı" olarak işaretli kolon yok. Bitmiş kartlar '
          + 'ayırt edilemediği için gecikme listesi olduğundan uzun. '
          + 'Kullanıcıya bunu söyle.'
        : null;

      return sonuc({
        project_id,
        count: gorevler.length,
        ...(uyari ? { warning: uyari } : {}),
        tasks: gorevler,
      });
    },
  );

  // ── get_task ─────────────────────────────────────────────────────────────

  server.registerTool(
    'get_task',
    {
      title: 'Görev detayı',
      description:
        'Tek bir görevin tamamını döner: açıklama, alt görevler, yorumlar, '
        + 'etiketler, atananlar ve tarihler. Bir işi anlamadan önce buraya bak; '
        + 'list_tasks yalnızca özet veriyor.',
      inputSchema: { task_id: kimlik('list_tasks içindeki id') },
      annotations: salt,
    },
    async ({ task_id }) => {
      const yanit = await callSelf(user, `/api/tasks/${task_id}`);
      return yanit.ok ? sonuc(yanit.data) : hata(yanit);
    },
  );

  // ── list_notes ───────────────────────────────────────────────────────────

  server.registerTool(
    'list_notes',
    {
      title: 'Notlar',
      description:
        'Aktif çalışma alanında görebildiğin notları listeler — gövde metni '
        + 'olmadan. İçeriği okumak için get_note kullan. Yalnızca çalışma alanı '
        + 'görünürlüğündeki notlar ve senin yazarı ya da ortak yazarı olduğun '
        + 'özel notlar döner.',
      inputSchema: {
        archived: z.boolean().optional().describe('true ise arşivlenmiş notlar da gelir'),
      },
      annotations: salt,
    },
    async ({ archived }) => {
      const yanit = await callSelf(user, `/api/notes${archived ? '?archived=1' : ''}`);
      return yanit.ok ? sonuc(yanit.data) : hata(yanit);
    },
  );

  // ── get_note ─────────────────────────────────────────────────────────────

  server.registerTool(
    'get_note',
    {
      title: 'Not detayı',
      description:
        'Tek bir notun gövdesini ve bağlı olduğu görevleri döner. Bir kartın '
        + 'neden var olduğunu anlamak için: gereksinim notu genellikle görevlere '
        + 'bağlıdır ve get_task yanıtındaki bağlı notlardan buraya gelinir.',
      inputSchema: { note_id: kimlik('list_notes içindeki id') },
      annotations: salt,
    },
    async ({ note_id }) => {
      const yanit = await callSelf(user, `/api/notes/${note_id}`);
      return yanit.ok ? sonuc(yanit.data) : hata(yanit);
    },
  );

  return server;
}

// ─── POST /mcp ─────────────────────────────────────────────────────────────

mcpRouter.post(
  '/',
  requireMcpToken,
  asyncHandler(async (req, res) => {
    const server = buildMcpServer(req.mcpUser);
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
