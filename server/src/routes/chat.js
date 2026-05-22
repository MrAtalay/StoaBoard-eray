// Python karşılığı: api.py'deki chat message endpoint'leri
//
//   POST   /api/chat/messages              create (text/file, DM or channel, reply)
//   GET    /api/chat/messages              fetch history (DM or channel)
//   DELETE /api/chat/messages/:msgId       delete (self or all, perm-aware)
//   POST   /api/chat/messages/:msgId/pin   toggle pin
//   GET    /api/chat/pinned                pinned messages (channel/DM)
//   GET    /api/chat/media                 media-only messages (channel or DM)

import { Router } from 'express';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import {
  resolveWorkspaceId,
  memberForWorkspace,
  usersShareWorkspace,
} from '../lib/workspace.js';
import { chatMessageToDict } from '../lib/serializers.js';
import { userChannelRole, parseHiddenFor } from '../lib/channels.js';
import { buildNotificationText, createAndPush } from '../lib/notifications.js';

export const chatRouter = Router();

const MSG_INCLUDE = { sender: true, receiver: true };
const MENTION_RE = /@([\w-]+)/g;

async function loadUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

// ─── POST /chat/messages ──────────────────────────────────────────────────

chatRouter.post(
  '/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const data = req.body || {};
    const text = (data.text || '').trim();
    const toSlug = data.to || null;
    const fileUrl = data.file_url || null;
    const fileType = data.file_type || null;
    const fileName = data.file_name || null;
    const replyData =
      data.reply_to && typeof data.reply_to === 'object' ? data.reply_to : null;
    let channel = ((data.channel || 'general') + '').trim().toLowerCase().slice(0, 80) || 'general';

    if (!text && !fileUrl) {
      return res.status(400).json({ error: 'Mesaj boş olamaz' });
    }

    let receiver = null;
    let workspaceId = null;

    if (toSlug) {
      receiver = await prisma.user.findUnique({ where: { slug: toSlug } });
      if (!receiver) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      if (receiver.id === user.id) {
        return res.status(400).json({ error: 'Kendinize mesaj gönderemezsiniz' });
      }
      workspaceId = await resolveWorkspaceId(user);
      if (!(await usersShareWorkspace(user.id, receiver.id, workspaceId))) {
        return res.status(403).json({ error: 'Bu kullanıcı aktif takımınızda değil' });
      }
      channel = 'dm';
    } else {
      workspaceId = await resolveWorkspaceId(user);
      if (workspaceId && channel !== 'general') {
        const chRow = await prisma.channel.findFirst({
          where: { workspaceId, slug: channel },
          include: { members: true },
        });
        if (chRow) {
          const role = await userChannelRole(chRow, user.id);
          if (!role) {
            return res
              .status(403)
              .json({ error: 'Bu kanala mesaj gönderme yetkiniz yok' });
          }
        }
      }
    }

    const replyToId = replyData?.id != null ? parseInt(replyData.id, 10) : null;

    const msg = await prisma.chatMessage.create({
      data: {
        workspaceId,
        senderId: user.id,
        receiverId: receiver?.id || null,
        text: text || null,
        fileUrl,
        fileType,
        fileName,
        channel,
        replyToId: Number.isFinite(replyToId) ? replyToId : null,
        replyToSender: replyData ? (replyData.sender || '').slice(0, 120) : null,
        replyToText: replyData ? (replyData.text || '').slice(0, 280) : null,
      },
      include: MSG_INCLUDE,
    });

    const io = req.app.get('io');

    // DM bildirimi
    if (receiver) {
      await createAndPush(io, {
        userId: receiver.id,
        text: buildNotificationText('dm_received', {
          who: user.name,
          preview: (text || '').slice(0, 80),
        }),
        senderSlug: user.slug,
        workspaceId,
      });
    }

    // @mention bildirimleri
    if (text) {
      const slugs = [...text.matchAll(MENTION_RE)].map((m) => m[1]);
      const notified = new Set();
      if (receiver) notified.add(receiver.slug);
      for (const slug of slugs) {
        if (notified.has(slug)) continue;
        notified.add(slug);
        const m = await prisma.user.findUnique({ where: { slug } });
        if (!m || m.id === user.id) continue;
        const preview = text.slice(0, 80) + (text.length > 80 ? '…' : '');
        await createAndPush(io, {
          userId: m.id,
          text: buildNotificationText('mention', { who: user.name, preview }),
          workspaceId,
        });
      }
    }

    const payload = chatMessageToDict(msg);

    // Broadcast
    try {
      if (receiver) {
        io?.to(`user_${user.id}`).emit('chat_message', payload);
        io?.to(`user_${receiver.id}`).emit('chat_message', payload);
      } else if (workspaceId) {
        const chRow = await prisma.channel.findFirst({
          where: { workspaceId, slug: channel },
          include: { members: true },
        });
        if (chRow?.type === 'private') {
          for (const cm of chRow.members) {
            io?.to(`user_${cm.userId}`).emit('chat_message', payload);
          }
        } else {
          io?.to(`ws_${workspaceId}`).emit('chat_message', payload);
        }
      }
    } catch (err) {
      console.warn('[chat] emit failed:', err.message);
    }

    res.status(201).json(payload);
  }),
);

// ─── GET /chat/messages ────────────────────────────────────────────────────

chatRouter.get(
  '/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const withSlug = req.query.with;
    const channel = ((req.query.channel || 'general') + '')
      .trim()
      .toLowerCase()
      .slice(0, 80) || 'general';
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    let messages;
    if (withSlug) {
      const other = await prisma.user.findUnique({ where: { slug: withSlug } });
      if (!other || other.id === user.id) return res.json([]);
      const wsId = await resolveWorkspaceId(user);
      if (!(await usersShareWorkspace(user.id, other.id, wsId))) {
        return res.json([]);
      }
      messages = await prisma.chatMessage.findMany({
        where: {
          OR: [
            { senderId: user.id, receiverId: other.id },
            { senderId: other.id, receiverId: user.id },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: MSG_INCLUDE,
      });
    } else {
      const wsId = await resolveWorkspaceId(user);
      if (!wsId) return res.json([]);
      if (channel !== 'general') {
        const chRow = await prisma.channel.findFirst({
          where: { workspaceId: wsId, slug: channel },
          include: { members: true },
        });
        if (chRow && !(await userChannelRole(chRow, user.id))) {
          return res.status(403).json({ error: 'Bu kanala erişim yetkiniz yok' });
        }
      }
      const channelFilter =
        channel === 'general'
          ? { OR: [{ channel: 'general' }, { channel: null }] }
          : { channel };
      messages = await prisma.chatMessage.findMany({
        where: { workspaceId: wsId, receiverId: null, ...channelFilter },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: MSG_INCLUDE,
      });
    }

    const out = [];
    for (const m of messages) {
      const hidden = parseHiddenFor(m.hiddenFor);
      if (hidden.includes(user.id)) continue;
      out.push(chatMessageToDict(m));
    }
    res.json(out);
  }),
);

// ─── DELETE /chat/messages/:msgId ──────────────────────────────────────────

chatRouter.delete(
  '/messages/:msgId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const msgId = parseInt(req.params.msgId, 10);
    const scope = (req.body?.scope || 'self').toString();

    const msg = await prisma.chatMessage.findUnique({ where: { id: msgId } });
    if (!msg) return res.status(404).json({ error: 'Mesaj bulunamadı' });

    const isSender = msg.senderId === user.id;
    const isReceiver = msg.receiverId === user.id;
    let wsCanDelete = false;
    if (msg.workspaceId) {
      const wm = await memberForWorkspace(user.id, msg.workspaceId);
      wsCanDelete =
        wm &&
        (wm.role === 'owner' ||
          (wm.workspaceRole &&
            (wm.workspaceRole.permissions || []).includes('delete_messages')));
    }
    if (!isSender && !isReceiver && msg.receiverId !== null && !wsCanDelete) {
      return res.status(403).json({ error: 'Yetkiniz yok' });
    }
    if (!isSender && msg.receiverId === null && !wsCanDelete) {
      return res.status(403).json({ error: 'Yetkiniz yok' });
    }

    const io = req.app.get('io');
    if (scope === 'all') {
      if (!isSender && !wsCanDelete) {
        return res.status(403).json({
          error: 'Sadece gönderen veya yetkili yönetici herkesten silebilir',
        });
      }
      await prisma.chatMessage.update({
        where: { id: msgId },
        data: { isDeleted: true },
      });
      try {
        if (msg.receiverId) {
          io?.to(`user_${msg.senderId}`).emit('message_deleted', { id: msgId, scope: 'all' });
          io?.to(`user_${msg.receiverId}`).emit('message_deleted', { id: msgId, scope: 'all' });
        } else if (msg.workspaceId) {
          io?.to(`ws_${msg.workspaceId}`).emit('message_deleted', { id: msgId, scope: 'all' });
        }
      } catch {}
    } else {
      const hidden = parseHiddenFor(msg.hiddenFor);
      if (!hidden.includes(user.id)) {
        hidden.push(user.id);
        await prisma.chatMessage.update({
          where: { id: msgId },
          data: { hiddenFor: hidden },
        });
      }
    }
    res.json({ ok: true });
  }),
);

// ─── POST /chat/messages/:msgId/pin ────────────────────────────────────────

chatRouter.post(
  '/messages/:msgId/pin',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const msgId = parseInt(req.params.msgId, 10);
    const msg = await prisma.chatMessage.findUnique({
      where: { id: msgId },
      include: MSG_INCLUDE,
    });
    if (!msg) return res.status(404).json({ error: 'Mesaj bulunamadı' });

    // Yetki: katılımcı olmak gerekiyor
    if (msg.receiverId !== null) {
      if (![msg.senderId, msg.receiverId].includes(user.id)) {
        return res.status(403).json({ error: 'Yetkiniz yok' });
      }
    } else {
      const wm = await memberForWorkspace(user.id, msg.workspaceId);
      if (!wm) return res.status(403).json({ error: 'Yetkiniz yok' });
    }

    const updated = await prisma.chatMessage.update({
      where: { id: msgId },
      data: { pinned: !msg.pinned },
    });
    const payload = {
      id: updated.id,
      pinned: Boolean(updated.pinned),
      channel: updated.channel || 'general',
      workspace_id: updated.workspaceId,
      from: msg.sender?.slug || null,
      to: msg.receiver?.slug || null,
    };
    const io = req.app.get('io');
    try {
      if (msg.receiverId) {
        io?.to(`user_${msg.senderId}`).emit('message_pinned', payload);
        io?.to(`user_${msg.receiverId}`).emit('message_pinned', payload);
      } else if (msg.workspaceId) {
        io?.to(`ws_${msg.workspaceId}`).emit('message_pinned', payload);
      }
    } catch {}
    res.json({ ok: true, pinned: Boolean(updated.pinned) });
  }),
);

// ─── GET /chat/pinned ──────────────────────────────────────────────────────

chatRouter.get(
  '/pinned',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const withSlug = req.query.with;
    const scope = ((req.query.scope || '') + '').trim().toLowerCase();
    const channel = ((req.query.channel || 'general') + '')
      .trim()
      .toLowerCase()
      .slice(0, 80) || 'general';

    let where;
    if (withSlug) {
      const other = await prisma.user.findUnique({ where: { slug: withSlug } });
      if (!other || other.id === user.id) return res.json([]);
      where = {
        pinned: true,
        OR: [
          { senderId: user.id, receiverId: other.id },
          { senderId: other.id, receiverId: user.id },
        ],
      };
    } else {
      const wsId = await resolveWorkspaceId(user);
      if (!wsId) return res.json([]);
      where = {
        pinned: true,
        workspaceId: wsId,
        receiverId: null,
      };
      if (scope === 'all') {
        const live = await prisma.channel.findMany({
          where: { workspaceId: wsId },
          select: { slug: true },
        });
        const slugs = ['general', ...live.map((c) => c.slug)];
        where.OR = [{ channel: null }, { channel: { in: slugs } }];
      } else if (channel === 'general') {
        where.OR = [{ channel: 'general' }, { channel: null }];
      } else {
        where.channel = channel;
      }
    }

    const limit = scope === 'all' ? 100 : 20;
    const msgs = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: MSG_INCLUDE,
    });
    res.json(msgs.map(chatMessageToDict));
  }),
);

// ─── GET /chat/media ───────────────────────────────────────────────────────

chatRouter.get(
  '/media',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const msgType = (req.query.type || 'general') + '';
    const wsId = await resolveWorkspaceId(user);
    if (!wsId) return res.json([]);

    let messages;
    if (msgType === 'dm') {
      messages = await prisma.chatMessage.findMany({
        where: {
          fileUrl: { not: null },
          receiverId: { not: null },
          OR: [{ senderId: user.id }, { receiverId: user.id }],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: MSG_INCLUDE,
      });
    } else {
      messages = await prisma.chatMessage.findMany({
        where: {
          workspaceId: wsId,
          receiverId: null,
          fileUrl: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: MSG_INCLUDE,
      });
    }
    res.json(messages.map(chatMessageToDict));
  }),
);
