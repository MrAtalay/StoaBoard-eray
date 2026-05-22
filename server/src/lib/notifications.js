// Python karşılığı: api.py _nt + _push_notification
//
// Bildirim text'i her zaman frontend'in i18n için parse edebileceği JSON
// stringi — örn. '{"type":"join_request","who":"Ali"}'. Socket.IO'ya da
// kullanıcı bazlı room (user_<id>) üzerinden anlık iletilir.

import { prisma } from '../db.js';
import { notificationToDict } from './serializers.js';

/**
 * Structured notification text üret: '{"type":"join_request","who":"Ali"}'
 */
export function buildNotificationText(type, params = {}) {
  return JSON.stringify({ type, ...params });
}

/**
 * Bildirim yarat ve gerçek zamanlı kullanıcıya gönder.
 * io: Socket.IO Server instance (opsiyonel; null gelirse sadece DB'ye yazar)
 */
export async function createAndPush(io, data) {
  const notif = await prisma.notification.create({ data });
  if (io) {
    try {
      io.to(`user_${notif.userId}`).emit('notification', notificationToDict(notif));
    } catch (err) {
      console.warn('[notif] push failed:', err.message);
    }
  }
  return notif;
}
