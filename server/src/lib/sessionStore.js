// Oturum deposu ve oturum sonlandırma.
//
// Kendi modülünde duruyor çünkü hem app.js (middleware kurulumu) hem de
// auth/api uçları (parola değişince oturumları düşürme) buna ihtiyaç duyuyor;
// app.js'ten almak dairesel import yaratırdı.
//
// Varsayılan bellek deposu sunucu her yeniden başladığında bütün oturumları
// siliyordu. PostgreSQL deposu bunu kalıcılaştırıyor — ama kalıcılık, parola
// değiştiğinde eski oturumların da yaşamaya devam etmesi demek. Bu dosyadaki
// destroyUserSessions o boşluğu kapatıyor.

import crypto from 'node:crypto';
import pg from 'pg';

// pg v8+ DATABASE_URL'deki sslmode=require parametresini görünce uyarı atıyor
// ('verify-full alias' deprecation). SSL'i URL'den ayıklayıp config'le veriyoruz.
function buildSessionPoolUrl() {
  const raw = process.env.DATABASE_URL || '';
  try {
    const u = new URL(raw);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return raw;
  }
}

export const SESSION_TABLE = 'session';

export const sessionPool = new pg.Pool({
  connectionString: buildSessionPoolUrl(),
  ssl: { rejectUnauthorized: false },
});

/**
 * Bir kullanıcının açık oturumlarını sonlandır.
 *
 * Parola değiştiğinde çağrılır. Parola değiştirmenin asıl amacı "erişimi olan
 * herkesi dışarı atmak"tır; oturumlar veritabanında kalıcı olduğu için bu
 * kendiliğinden olmuyordu — eski parolayla açılmış bir oturum parola
 * değiştikten sonra da çalışmaya devam ediyordu.
 *
 * @param {number} userId
 * @param {string|null} exceptSid  İşlemi yapan kişinin kendi oturumu; verilirse
 *                                 o oturum korunur (kullanıcı kendi cihazından
 *                                 atılmasın diye). Sıfırlama akışında kişi zaten
 *                                 giriş yapmamış olduğu için null geçilir.
 * @returns {Promise<number>} sonlandırılan oturum sayısı
 */
export async function destroyUserSessions(userId, exceptSid = null) {
  if (!userId) return 0;
  try {
    const params = [String(userId)];
    let sql = `delete from "${SESSION_TABLE}" where sess::jsonb ->> 'userId' = $1`;
    if (exceptSid) {
      params.push(exceptSid);
      sql += ' and sid <> $2';
    }
    const result = await sessionPool.query(sql, params);
    return result.rowCount || 0;
  } catch (err) {
    // Oturum tablosu henüz oluşmamış olabilir (ilk açılış) ya da depo geçici
    // olarak erişilemez olabilir. Parola değişikliğinin kendisi başarılı;
    // burada patlamak kullanıcıyı yarım kalmış bir işlemle bırakırdı.
    console.warn('[session] oturumlar sonlandırılamadı:', err.message);
    return 0;
  }
}

/**
 * Bir kullanıcı adına kısa ömürlü bir oturum açar ve sid'sini döner.
 *
 * MCP katmanı için var. MCP araçları veritabanına değil uygulamanın kendi HTTP
 * API'sine yazıyor; o API oturum çerezine bakıyor (`requireAuth`), Claude
 * istemcisi ise çerez taşımıyor. Aradaki boşluk burada kapanıyor: istek
 * 127.0.0.1 üzerinden, gerçek bir oturumla yapılıyor.
 *
 * Neden ikinci bir kimlik yolu AÇILMADI: `requireAuth`a "iç istekse geç" gibi
 * bir kapı eklemek daha kısa olurdu ama /api altındaki her uca ikinci bir
 * giriş açardı. Bunun yerine mevcut mekanizmanın kendisi kullanılıyor —
 * uçlar hiçbir şeyin farkında değil, kapsamlama ve izin kontrolü olduğu gibi
 * çalışıyor.
 *
 * Oturum kısa ömürlü ve süreçten dışarı çıkmıyor: üretilen sid yalnızca
 * döngüsel isteğin Cookie başlığında yaşıyor, tarayıcıya hiç gönderilmiyor.
 * Süresi dolan satırları connect-pg-simple kendi budama döngüsünde siliyor.
 *
 * Ham SQL, `destroyUserSessions` ile aynı gerekçeyle: tabloyu Prisma
 * yönetmiyor, şema connect-pg-simple'a ait ve bu dosya zaten o şemayı biliyor.
 *
 * @param {number} userId
 * @param {number} ttlMs  Oturumun yaşam süresi
 * @returns {Promise<string>} sid
 */
export async function mintSession(userId, ttlMs) {
  if (!userId) throw new Error('mintSession: userId zorunlu');
  const sid = crypto.randomBytes(24).toString('base64url');
  const expire = new Date(Date.now() + ttlMs);
  const sess = {
    cookie: {
      originalMaxAge: ttlMs,
      expires: expire.toISOString(),
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      // Bilinçli false: bu oturum yalnızca 127.0.0.1 üzerinden, düz HTTP ile
      // kullanılıyor ve hiçbir zaman tarayıcıya gönderilmiyor.
      secure: false,
    },
    userId,
  };
  await sessionPool.query(
    `insert into "${SESSION_TABLE}" (sid, sess, expire) values ($1, $2, $3)`,
    [sid, JSON.stringify(sess), expire],
  );
  return sid;
}
