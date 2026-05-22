// Python karşılığı: api.py içindeki notification endpoint'leri
//
//   GET    /api/notifications              user'ın son 50 bildirimi
//   POST   /api/notifications/:id/read     tek bildirimi okundu yap
//   POST   /api/notifications/read-all     hepsini okundu yap
//   DELETE /api/notifications/:id          sil
//   POST   /api/notifications              manuel bildirim oluştur (kendine veya başkasına)

import { Router } from 'express';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import { notificationToDict } from '../lib/serializers.js';
import { createAndPush } from '../lib/notifications.js';

export const notificationsRouter = Router();

async function loadUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const notifs = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifs.map(notificationToDict));
  }),
);

notificationsRouter.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/:notifId/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const notifId = parseInt(req.params.notifId, 10);
    const n = await prisma.notification.findFirst({
      where: { id: notifId, userId: user.id },
    });
    if (!n) return res.status(404).json({ error: 'Bildirim bulunamadı' });
    await prisma.notification.update({
      where: { id: notifId },
      data: { read: true },
    });
    res.json({ ok: true });
  }),
);

notificationsRouter.delete(
  '/:notifId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const notifId = parseInt(req.params.notifId, 10);
    const n = await prisma.notification.findFirst({
      where: { id: notifId, userId: user.id },
    });
    if (!n) return res.status(404).json({ error: 'Bildirim bulunamadı' });
    await prisma.notification.delete({ where: { id: notifId } });
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const data = req.body || {};
    const text = (data.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Bildirim metni gerekli' });

    const targetId = data.user_id || user.id;
    if (targetId !== user.id) {
      const target = await prisma.user.findUnique({ where: { id: targetId } });
      if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const io = req.app.get('io');
    const notif = await createAndPush(io, {
      userId: targetId,
      text,
      workspaceId: user.currentWorkspaceId,
    });
    res.status(201).json(notificationToDict(notif));
  }),
);
