// Uygulamanın kendi HTTP API'sini, belirli bir kullanıcı adına çağırmak.
//
// ── Neden veritabanına doğrudan gitmiyoruz ────────────────────────────────
//
// Bu depoda bir görevi okumak bir satırı okumak değil. Kapsamlama dört farklı
// biçimde yapılıyor (`loadTaskWithAccess`, `loadProjectWithAccess`, aktif
// çalışma alanı, `userId: user.id`) ve dördü de doğru. MCP katmanı Prisma'ya
// inseydi bu mantığı yeniden yazmak zorunda kalırdı — yani ikinci bir izin
// modeli. İkinci izin modeli, er ya da geç birinciyle ayrışan izin modelidir.
//
// Bunun yerine istek gerçekten HTTP üzerinden, 127.0.0.1'e yapılıyor. Uçlar
// çağıranın MCP olduğunu bilmiyor; kapsamlama, izin kontrolü, bildirim, soket
// yayını ve denetim kaydı olduğu gibi çalışıyor. Maliyeti yerel ağ üzerinden
// bir gidiş-dönüş — ölçülebilir bir yük değil.
//
// ── Kimlik ────────────────────────────────────────────────────────────────
//
// `requireAuth` oturum çerezine bakıyor, Claude istemcisi çerez taşımıyor.
// Boşluk, kullanıcı adına kısa ömürlü gerçek bir oturum açılarak kapanıyor
// (`mintSession`). Alternatif — `requireAuth`a "iç istekse geç" kapısı
// eklemek — daha kısaydı ama /api altındaki her uca ikinci bir giriş açardı.
//
// Çerez imzası express-session'ın kullandığı biçimin aynısı:
//   s:<sid>.<base64(HMAC-SHA256(sid, secret))>   (sondaki '=' kırpılır)
// Bu biçim `cookie-signature` paketinin sign() işlevinden geliyor. Paketi
// doğrudan import etmek yerine burada üretiliyor, çünkü o paket express-session
// üzerinden gelen dolaylı bir bağımlılık; doğrudan ona yaslanmak, bir gün
// express-session onu bıraktığında sessizce kırılmak demek olurdu.

import crypto from 'node:crypto';

import { config } from '../config.js';
import { mintSession } from './sessionStore.js';

// Oturumun veritabanındaki ömrü ve bellekteki yeniden kullanım süresi.
// İkisi arasındaki fark bilinçli: önbellekten düşen oturum, veritabanında
// hâlâ birkaç dakika geçerli kalıyor, böylece tam sınırda başlayan bir istek
// yolda geçersizleşmiyor.
const OTURUM_TTL_MS = 10 * 60 * 1000;
const ONBELLEK_MS = 8 * 60 * 1000;

/** userId → { cookie, gecerliligi } */
const onbellek = new Map();

/** express-session biçiminde imzalı çerez değeri üretir. */
export function signSid(sid, secret) {
  const mac = crypto
    .createHmac('sha256', secret)
    .update(sid)
    .digest('base64')
    .replace(/=+$/, '');
  return `s:${sid}.${mac}`;
}

/** Kullanıcı için geçerli bir Cookie başlığı değeri döner (gerekirse üretir). */
async function cookieFor(userId) {
  const kayit = onbellek.get(userId);
  if (kayit && kayit.gecerliligi > Date.now()) return kayit.cookie;

  const sid = await mintSession(userId, OTURUM_TTL_MS);
  const deger = `${config.session.cookieName}=${encodeURIComponent(signSid(sid, config.secretKey))}`;
  onbellek.set(userId, { cookie: deger, gecerliligi: Date.now() + ONBELLEK_MS });
  return deger;
}

/**
 * Kendi API'mize istek atar.
 *
 * @param {object}  user    İstek kimin adına yapılacak (Prisma User kaydı)
 * @param {string}  yol     '/api/projects' gibi — baştaki eğik çizgiyle
 * @param {object}  [opts]
 * @param {string}  [opts.method='GET']
 * @param {object}  [opts.body]   JSON gövde
 * @param {string}  [opts.lang]   'tr' | 'en' — sunucu hata cümleleri için
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 *
 * Hata FIRLATMIYOR: 4xx bir çökme değil, aracın modele iletmesi gereken bir
 * cevap. "Bu projeye erişiminiz yok" bilgisi modele ulaşmalı ki yeniden
 * denemek yerine kullanıcıya söylesin.
 */
export async function callSelf(user, yol, opts = {}) {
  const { method = 'GET', body, lang = 'tr' } = opts;
  const cookie = await cookieFor(user.id);

  const res = await fetch(`http://127.0.0.1:${config.port}${yol}`, {
    method,
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'X-Stoa-Lang': lang,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  const tur = res.headers.get('content-type') || '';
  if (tur.includes('application/json')) {
    data = await res.json().catch((err) => {
      console.warn('[selfApi] JSON çözülemedi:', yol, err?.message || err);
      return null;
    });
  } else {
    // JSON beklerken HTML almak, yolun yanlış olduğunun işareti: /api ile
    // başlamayan istekler SPA yedeğine düşüp index.html döndürüyor.
    const metin = await res.text().catch(() => '');
    console.warn('[selfApi] JSON olmayan yanıt:', method, yol, res.status, tur);
    data = { error: 'err_mcp_unexpected_response', message: metin.slice(0, 200) };
  }

  return { ok: res.ok, status: res.status, data };
}

/** Test ve oturum sonlandırma sonrası için — bellekteki çerezleri düşürür. */
export function clearSelfApiCache() {
  onbellek.clear();
}
