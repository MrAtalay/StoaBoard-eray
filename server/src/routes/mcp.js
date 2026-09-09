// MCP ucu — Claude'un panoyu sürdüğü yüzey.
//
//   POST   /mcp    Streamable HTTP (MCP protokolü)
//   GET    /mcp    405 — durum tutmayan kipte akış açılmıyor
//   DELETE /mcp    405 — aynı gerekçe
//
// ── Neden bu dosya iş mantığı taşımıyor ───────────────────────────────────
//
// Araçlar veritabanına değil, uygulamanın kendi HTTP API'sine yazar. Gerekçe:
// bu depoda görev oluşturmak satır yazmak değil. `POST /projects/:id/tasks`
// tek çağrıda izin kontrolünü, atama bildirimini, soket yayınını, aktivite
// kaydını ve `task_transitions` geçişini birlikte yapıyor. Doğrudan Prisma'ya
// yazmak bunların hepsini atlardı: kartlar bildirimsiz kalır, raporlarda
// görünmez, izin kapısından hiç geçmezdi. Kolon geçiş kuralları (`allowedNext`)
// da API üzerinden bedava geliyor — yasak bir geçişte Claude 409 alıp sebebini
// okuyor.
//
// Bu ilkenin tek istisnası `whoami`: kullanıcının kendi kimliğini okuması bir
// iş kuralı taşımıyor, yan etkisi yok. Yazma araçları (2. ve 3. adım) API
// çağrısı yapacak.
//
// ── Araç açıklamaları neden çevrilmiyor ───────────────────────────────────
//
// Dil kuralı (CLAUDE.md) kullanıcının GÖRDÜĞÜ metni bağlıyor. Buradaki
// açıklamaları kullanıcı görmüyor, model okuyor; model de cevabını zaten
// kullanıcının diliyle veriyor. Hata alanları ise kurala tabi ve `err_` kodu
// taşıyor — `dil.test.js` bu dosyayı da tarıyor.

import { Router } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireMcpToken } from '../lib/mcpAuth.js';
import { currentMember, memberPermissions } from '../lib/workspace.js';

export const mcpRouter = Router();

// Sunucu yüzeyinin kendi sürümü — uygulamanın sürümünden ayrı ilerliyor.
// İstemciler yetenek değişikliğini buradan görür.
const MCP_VERSION = '0.1.0';

/**
 * İsteği yapan kullanıcıya bağlı bir MCP sunucusu kurar.
 *
 * Her istek için yeniden kuruluyor. Durum tutmayan (stateless) kip bilinçli:
 * Railway süreci yeniden başlattığında ya da ikinci bir örnek açtığında
 * yarıda kalan oturum diye bir şey olmuyor. Bedeli, istek başına birkaç
 * nesne — ölçülebilir bir maliyet değil.
 */
function buildMcpServer(user) {
  const server = new McpServer(
    { name: 'stoaboard', version: MCP_VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'whoami',
    {
      title: 'Kimlik',
      description:
        'Bağlantının hangi StoaBoard kullanıcısı adına açıldığını, aktif çalışma '
        + 'alanını ve o alandaki izinleri döner. Bir işe başlamadan önce kimin '
        + 'adına hareket ettiğini doğrulamak için kullan.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const member = await currentMember(user);
      // currentMember yalnızca rolü include ediyor; çalışma alanının adı ayrı
      // okunuyor. Üyelik yoksa (yeni kullanıcı) alan null kalır — uydurulmuş
      // bir ad döndürmek modelin yanlış panoya yazmasına yol açardı.
      const workspace = member?.workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: member.workspaceId },
            select: { id: true, name: true },
          })
        : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                user: { slug: user.slug, name: user.name },
                workspace: workspace || null,
                role: member?.role || null,
                permissions: memberPermissions(member),
              },
              null,
              2,
            ),
          },
        ],
      };
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
