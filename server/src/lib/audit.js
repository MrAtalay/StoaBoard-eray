// Güvenlik denetim kaydı.
//
// ActivityLog'dan ayrıdır: o, takıma "ne oldu" anlatan ürün içi bir akış;
// bu, güvenlik sorusuna cevap verir — özellikle "bu veriyi kim dışarı
// çıkardı". İçeriden sızıntıya karşı pratikte işe yarayan kontrol engelleme
// değil izlenebilirliktir: veriyi görmesi meşru olan biri onu kopyalamayı da
// her zaman başarabilir, ama kaydın tutulduğunu bilmek caydırır ve olay
// sonrası kimin ne aldığını söyleyebilmek şarttır.
//
// Kural: buraya asla gizli veri yazılmaz. Hangi rapor, hangi aralık, kaç
// satır — evet. Satırların içeriği, e-posta, parola, oturum kimliği — hayır.

import { prisma } from '../db.js';

/** Eylem adları tek yerde dursun; yazım hatası sessiz veri kaybı demek. */
export const AUDIT = {
  REPORT_EXPORT: 'report.export',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  INVITE_CODE_VIEWED: 'invite.code_viewed',
  WORKSPACE_TRASH_EMPTIED: 'workspace.trash_emptied',
  // MCP ucuna geçersiz anahtarla yapılan deneme. Kullanıcı yok, workspace yok:
  // kayıt yalnızca IP ve tarayıcı bilgisiyle "birisi kapıyı denedi" diyor.
  MCP_AUTH_FAILED: 'mcp.auth_failed',
  // Claude'un MCP üzerinden yaptığı yazmalar — panodan yapılanla ayrışsın diye
  // ayrı eylem adları. Ayrıntıda yalnızca kimlikler, alan adları ve atanan
  // slug'ları var; başlık, açıklama gibi içerik yazılmıyor (dosyanın başı).
  MCP_TASK_CREATED: 'mcp.task_created',
  MCP_TASK_UPDATED: 'mcp.task_updated',
  MCP_TASK_MOVED: 'mcp.task_moved',
  MCP_COMMENT_ADDED: 'mcp.comment_added',
  // 0.5.0. Silme ÇÖPE taşımadır; kalıcı silme MCP yüzeyinde yok.
  MCP_TASK_DELETED: 'mcp.task_deleted',
  MCP_TASK_RESTORED: 'mcp.task_restored',
  MCP_SUBTASK_ADDED: 'mcp.subtask_added',
  MCP_SUBTASK_UPDATED: 'mcp.subtask_updated',
  MCP_SUBTASK_DELETED: 'mcp.subtask_deleted',
  // Aktif alan tarayıcı oturumuyla ortak: bu kayıt "kullanıcının ekranındaki
  // alanı Claude değiştirdi" sorusunun tek cevabı.
  MCP_WORKSPACE_SWITCHED: 'mcp.workspace_switched',
};

function clientIp(req) {
  // app.set('trust proxy', 1) ayarlı olduğu için req.ip Railway arkasında da
  // gerçek istemciyi gösterir.
  const ip = req?.ip || req?.socket?.remoteAddress || '';
  return ip ? String(ip).slice(0, 60) : null;
}

/**
 * Denetim kaydı yaz. Hiçbir koşulda hata fırlatmaz ve isteği bekletmez.
 *
 * Bilinçli bir ödünleşme: kaydın yazılamaması yüzünden kullanıcının işlemi
 * başarısız olmamalı. Bunun bedeli, veritabanı sorunlarında kayıt kaybı
 * olabilmesi — o yüzden başarısızlık sunucu günlüğüne yüksek sesle yazılıyor.
 */
export function recordAudit(req, { workspaceId = null, user = null, action, detail = null }) {
  if (!action) return;
  void (async () => {
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId: user?.id ?? null,
          userName: user?.name ? String(user.name).slice(0, 200) : null,
          action: String(action).slice(0, 60),
          detail,
          ip: clientIp(req),
          userAgent: (req?.get?.('user-agent') || '').slice(0, 300) || null,
        },
      });
    } catch (err) {
      console.warn('[audit] kayıt yazılamadı:', action, err.message);
    }
  })();
}

export function auditToDict(row) {
  return {
    id: String(row.id),
    action: row.action,
    user_id: row.userId,
    user_name: row.userName || 'Bilinmeyen',
    detail: row.detail || null,
    ip: row.ip || null,
    user_agent: row.userAgent || null,
    at: row.at ? row.at.toISOString() : null,
  };
}
