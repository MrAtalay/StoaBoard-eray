// MCP ucunun kimlik kapısı.
//
// Oturum çerezi taşımayan tek korumalı yüzey burasıdır: istek bir tarayıcıdan
// değil, kullanıcının Claude istemcisinden geliyor ve çerez taşıyamıyor.
// Bu yüzden `requireAuth` yerine bearer anahtar kullanılıyor.
//
// Bu, "uç açık" demek DEĞİL — farklı korunuyor demek. Ayrım önemli: uç
// `yetki.test.js`teki ACIK_UCLAR muafiyet listesine yazılmadı, testin kendisi
// `requireMcpToken`ı denk koruma sayacak biçimde genişletildi ve her MCP
// ucunda onu şart koşuyor. Muafiyet bayatlar, kapı bayatlamaz (CLAUDE.md,
// "kuralı belgeye değil, doğrulayana yaz").

import { prisma } from '../db.js';
import { config } from '../config.js';
import { lookupSlug } from './mcpToken.js';
import { recordAudit, AUDIT } from './audit.js';

/** `Authorization: Bearer <anahtar>` başlığından anahtarı çıkarır. */
function bearerToken(req) {
  const header = req.get?.('authorization') || '';
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return m ? m[1] : null;
}

/**
 * MCP anahtarını doğrular ve isteği kullanıcıya bağlar.
 *
 * Başarıda `req.mcpUser` dolar. Başarısızlıkta 401 — hiçbir koşulda "anahtar
 * yoksa geç" yok.
 *
 * Anahtarın yokluğu ile yanlışlığı aynı kodu döndürüyor: ayırmak, geçerli
 * anahtar biçimini deneyerek arayan birine geri bildirim vermek olurdu.
 * "Anahtar geçerli ama kullanıcı yok" ise ayrı kod taşıyor; oraya ulaşmak
 * zaten geçerli bir anahtar gerektiriyor ve bu bir yapılandırma hatasıdır —
 * ayırt edilebilmesi gerekiyor.
 */
export async function requireMcpToken(req, res, next) {
  try {
    const token = bearerToken(req);
    const slug = lookupSlug(config.mcp.tokens, token);

    if (!slug) {
      recordAudit(req, {
        action: AUDIT.MCP_AUTH_FAILED,
        detail: { reason: token ? 'bilinmeyen anahtar' : 'anahtar sunulmadı' },
      });
      return res.status(401).json({
        error: 'err_mcp_token_invalid',
        message: 'MCP anahtarı geçersiz',
      });
    }

    const user = await prisma.user.findUnique({ where: { slug } });
    if (!user) {
      // Anahtar geçerli ama işaret ettiği kullanıcı silinmiş. Kapalı
      // başarısızlık: "kullanıcıyı yeniden oluştur" ya da "sahipsiz çalıştır"
      // gibi bir kurtarma yolu bilinçli olarak yok.
      recordAudit(req, {
        action: AUDIT.MCP_AUTH_FAILED,
        detail: { reason: 'anahtarın kullanıcısı bulunamadı', slug },
      });
      return res.status(401).json({
        error: 'err_mcp_user_unknown',
        message: 'MCP anahtarının kullanıcısı bulunamadı',
      });
    }

    req.mcpUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
}
