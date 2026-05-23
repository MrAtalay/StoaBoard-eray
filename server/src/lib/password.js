// Python karşılığı: werkzeug.security.generate_password_hash + check_password_hash
//
// Werkzeug'un scrypt formatı:  "scrypt:N:r:p$salt$hexHash"
// Örnek:                       "scrypt:32768:8:1$abcd...$0a1b2c..."
//
// Bu modül mevcut DB'deki scrypt hash'lerini Node'un yerleşik crypto.scryptSync
// ile birebir doğrular (kullanıcılar tekrar parola girmek zorunda kalmaz),
// ve yeni hash'ler de aynı formatta üretir.

import crypto from 'node:crypto';

const DEFAULT_N = 32768; // 2^15
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const DEFAULT_SALT_LEN = 16;
const KEY_LEN = 64;
const SCRYPT_MAXMEM = 256 * 1024 * 1024; // 256 MB — N=32768 için yeterli

/**
 * Werkzeug-uyumlu scrypt hash üret.
 * Format: "scrypt:N:r:p$salt$hexHash"
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(DEFAULT_SALT_LEN).toString('hex').slice(0, DEFAULT_SALT_LEN);
  const derived = crypto.scryptSync(password, salt, KEY_LEN, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt:${DEFAULT_N}:${DEFAULT_R}:${DEFAULT_P}$${salt}$${derived.toString('hex')}`;
}

/**
 * Werkzeug formatındaki hash'i doğrula.
 * Destekleniyor: scrypt, pbkdf2:sha256 (gerekirse)
 * Constant-time karşılaştırma kullanır.
 */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;

  const firstDollar = stored.indexOf('$');
  if (firstDollar < 0) return false;
  const method = stored.slice(0, firstDollar);
  const rest = stored.slice(firstDollar + 1);
  const sep = rest.indexOf('$');
  if (sep < 0) return false;
  const salt = rest.slice(0, sep);
  const hashHex = rest.slice(sep + 1);

  let derived;
  try {
    if (method.startsWith('scrypt:')) {
      const [, nStr, rStr, pStr] = method.split(':');
      derived = crypto.scryptSync(password, salt, hashHex.length / 2, {
        N: parseInt(nStr, 10),
        r: parseInt(rStr, 10),
        p: parseInt(pStr, 10),
        maxmem: SCRYPT_MAXMEM,
      });
    } else if (method.startsWith('pbkdf2:')) {
      // pbkdf2:sha256:iterations veya pbkdf2:sha256
      const parts = method.split(':');
      const digest = parts[1] || 'sha256';
      const iter = parseInt(parts[2] || '600000', 10);
      derived = crypto.pbkdf2Sync(password, salt, iter, hashHex.length / 2, digest);
    } else {
      return false;
    }
  } catch {
    return false;
  }

  const stored_buf = Buffer.from(hashHex, 'hex');
  if (stored_buf.length !== derived.length) return false;
  return crypto.timingSafeEqual(stored_buf, derived);
}
