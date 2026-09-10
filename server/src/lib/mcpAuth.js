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

/**
 * Anahtarı istekten çıkarır. İki başlık kabul edilir.
 *
 * `Authorization: Bearer <anahtar>` asıl biçim ve komut satırı istemcileri
 * (`claude mcp add --header`) bunu kullanıyor.
 *
 * `X-Auth-Token: <anahtar>` ise Claude'un tarayıcı içindeki bağlayıcı ekranı
 * için var (10 Eylül 2026). O ekran asıl kimliği OAuth ile kuruyor ve ek
 * başlıklar için kapalı bir ad listesi sunuyor — `Authorization` o listede
 * yok, `x-auth-token` var. StoaBoard'da OAuth yetkilendirme sunucusu
 * bulunmadığı için bağlayıcı "couldn't register" ile düşüyordu; ikinci başlık
 * o ekranı OAuth yazmadan çalışır hâle getiriyor.
 *
 * Güvenlik açısından bir gevşeme değil: taşınan sır aynı sır, yalnızca
 * geldiği başlık farklı. Doğrulama tek yerde (`lookupSlug`, özet
 * karşılaştırması) ve iki yol da oradan geçiyor. "Anahtar yoksa geç" hâli
 * hiçbir dalda yok.
 *
 * `Bearer ` öneki X-Auth-Token'da da hoş görülüyor: kullanıcı alışkanlıkla
 * yazarsa sessizce başarısız olmasın — sessiz başarısızlık bu deponun
 * tekrar eden kusuru.
 */
function bearerToken(req) {
  const auth = (req.get?.('authorization') || '').trim();
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (m) return m[1];

  const alt = (req.get?.('x-auth-token') || '').trim();
  if (!alt) return null;
  const am = /^(?:Bearer\s+)?(\S+)$/i.exec(alt);
  if (!am) return null;
  // Yalnızca "Bearer" yazılmışsa ardında anahtar yok demektir; desen onu
  // anahtar sanıyordu. Testte yakalandı (guvenlik.test.js).
  return /^Bearer$/i.test(am[1]) ? null : am[1];
}

// Saf mantık; testten çağrılabilsin diye dışa açık. Kapının kendisi
// `requireMcpToken`, bu yalnızca başlık ayrıştırma.
export { bearerToken as _bearerToken };

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
