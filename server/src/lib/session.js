// Python karşılığı: auth.py'deki current_user() + login_required + session.permanent
//
// express-session req.session'ı zaten doldurur; bu modül onun üzerine
// Flask'ın session API'sine benzer küçük yardımcılar ekler.

import { prisma } from '../db.js';

/**
 * Aktif kullanıcının User kaydını döner; oturum yoksa null.
 */
export async function currentUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

/**
 * Login işlemi: session'a userId koy, "permanent" işaretle.
 * Flask'taki:
 *   session['user_id'] = user.id
 *   session.permanent = True
 */
export function login(req, userId) {
  req.session.userId = userId;
  // express-session cookie.maxAge config'ten geliyor — extra bir şey gerekmiyor
}

/**
 * Tüm oturumu temizle (logout).
 */
export function logout(req) {
  return new Promise((resolve) => {
    req.session.destroy(() => resolve());
  });
}

/**
 * Sadece giriş yapmış kullanıcılar geçebilsin (Flask'ın @login_required karşılığı).
 * Kullanım:  router.get('/me', requireAuth, async (req, res) => { ... })
 */
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'err_auth_required' });
  }
  next();
}
