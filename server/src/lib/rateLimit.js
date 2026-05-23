// Python karşılığı: auth.py içindeki _rate_limited (in-process limiter)
//
// Endpoint başına özelleştirilebilir, key'e (örn. IP) göre kayıt tutar.
// Express'in genel /api/auth limiter'ı (app.js) zaten var; bu modül
// auth.py'deki gibi her endpoint için ayrı limit ister.

const store = new Map(); // key → number[] (timestamps in ms)

/**
 * Bu anahtar son `windowMs` ms içinde `max` kez aşıldıysa true döner.
 * Aşılmadıysa kaydı ekler ve false döner.
 */
export function rateLimited(key, max = 5, windowMs = 5 * 60 * 1000) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const history = (store.get(key) || []).filter((t) => t > cutoff);
  if (history.length >= max) {
    store.set(key, history);
    return true;
  }
  history.push(now);
  store.set(key, history);
  return false;
}

/**
 * Express request'inden istemci IP'sini çıkar (Flask request.remote_addr karşılığı).
 */
export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
