// Python karşılığı: app/routes/chat.py + app/online_state.py
//
// Socket.IO event handler'ları. Session middleware paylaşıldığı için
// socket.request.session.userId üzerinden auth çözülür.
//
// Olaylar:
//   connect           presence: online + user_/ws_ room'larına katılım
//   disconnect        presence: offline + ws bildirimi
//   set_status        online | away | dnd değişimi
//   switch_workspace  aktif workspace değiştir
//   chat_message      gerçek zamanlı mesaj (DM veya kanal)
//   typing            DM typing indikatörü
//   dm_mark_read      DM okundu işareti

import { prisma } from '../db.js';
import * as onlineState from '../lib/onlineState.js';
import { chatMessageToDict, notificationToDict } from '../lib/serializers.js';
import { buildNotificationText } from '../lib/notifications.js';
import { sessionMiddleware } from '../app.js';
import { usersShareWorkspace } from '../lib/workspace.js';
import { userChannelRole } from '../lib/channels.js';

const MENTION_RE = /@([\w-]+)/g;

function userIdFromSocket(socket) {
  return socket.request?.session?.userId || null;
}

async function loadUser(socket) {
  const uid = userIdFromSocket(socket);
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

async function resolveActiveWorkspaceId(user) {
  if (!user) return null;
  if (user.currentWorkspaceId) {
    const m = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: user.currentWorkspaceId,
          userId: user.id,
        },
      },
    });
    if (m) return user.currentWorkspaceId;
  }
  const m = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (m) {
    await prisma.user.update({
      where: { id: user.id },
      data: { currentWorkspaceId: m.workspaceId },
    });
    return m.workspaceId;
  }
  return null;
}

async function getOnlineSlugsWithStatus() {
  const ids = onlineState.getOnlineIds();
  if (!ids.length) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  return users.map((u) => ({
    slug: u.slug,
    status: onlineState.getStatus(u.id),
  }));
}

export function registerChatHandlers(io) {
  // Express session middleware'ini Socket.IO için adapt et
  io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

  io.on('connection', async (socket) => {
    const user = await loadUser(socket);
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // ── connect ──
    onlineState.setOnline(user.id, socket.id);
    if (user.status === 'away' || user.status === 'dnd') {
      onlineState.setStatus(user.id, user.status);
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'online' },
      });
    }
    socket.join(`user_${user.id}`);

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      select: { workspaceId: true },
    });
    for (const m of memberships) {
      socket.join(`ws_${m.workspaceId}`);
      socket.to(`ws_${m.workspaceId}`).emit('user_online', {
        user: user.slug,
        status: onlineState.getStatus(user.id),
      });
    }

    socket.emit('online_users', { users: await getOnlineSlugsWithStatus() });

    // ── disconnect ──
    socket.on('disconnect', async () => {
      try {
        onlineState.setOffline(user.id);
        await prisma.user.update({
          where: { id: user.id },
          data: { status: 'offline' },
        });
        for (const m of memberships) {
          socket.to(`ws_${m.workspaceId}`).emit('user_offline', { user: user.slug });
        }
      } catch (err) {
        console.warn('[socket] disconnect cleanup failed:', err.message);
      }
    });

    // ── set_status ──
    socket.on('set_status', async (data) => {
      const status = (data || {}).status || 'online';
      if (!['online', 'away', 'dnd'].includes(status)) return;
      onlineState.setStatus(user.id, status);
      await prisma.user.update({
        where: { id: user.id },
        data: { status },
      });
      for (const m of memberships) {
        io.to(`ws_${m.workspaceId}`).emit('user_status', {
          user: user.slug,
          status,
        });
      }
    });

    // ── switch_workspace ──
    socket.on('switch_workspace', async (data) => {
      const wsId = (data || {}).workspace_id;
      if (!wsId) return;
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: wsId, userId: user.id } },
      });
      if (!membership) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { currentWorkspaceId: wsId },
      });
      socket.emit('workspace_switched', { workspace_id: wsId });
    });

    // ── chat_message ──
    socket.on('chat_message', async (data) => {
      try {
      const text = ((data || {}).text || '').trim();
      const toSlug = (data || {}).to;
      const fileUrl = (data || {}).file_url || null;
      if (!text && !fileUrl) return;

      const workspaceId = await resolveActiveWorkspaceId(user);
      let receiver = null;
      let channel = 'general';

      if (toSlug) {
        // DM — alıcı aynı workspace'te mi?
        receiver = await prisma.user.findUnique({ where: { slug: toSlug } });
        if (!receiver) return;
        if (!(await usersShareWorkspace(user.id, receiver.id, workspaceId))) return;
        channel = 'dm';
      } else {
        // Kanal mesajı — üyelik kontrolü
        channel = ((data.channel || 'general') + '').trim().toLowerCase().slice(0, 80) || 'general';
        if (channel !== 'general' && workspaceId) {
          const chRow = await prisma.channel.findFirst({
            where: { workspaceId, slug: channel },
            include: { members: true },
          });
          if (chRow) {
            const role = await userChannelRole(chRow, user.id);
            if (!role) return;
          }
        }
      }

      const msg = await prisma.chatMessage.create({
        data: {
          workspaceId,
          senderId: user.id,
          receiverId: receiver?.id || null,
          text: text || null,
          fileUrl,
          fileType: data.file_type || null,
          fileName: data.file_name || null,
          channel,
        },
        include: { sender: true, receiver: true },
      });

      // DM bildirimi
      if (receiver) {
        const notif = await prisma.notification.create({
          data: {
            userId: receiver.id,
            text: buildNotificationText('dm_received', {
              who: user.name,
              preview: (text || '').slice(0, 80),
            }),
            senderSlug: user.slug,
          },
        });
        io.to(`user_${receiver.id}`).emit('notification', notificationToDict(notif));
      }

      // @mention bildirimleri
      if (text) {
        const slugs = [...text.matchAll(MENTION_RE)].map((m) => m[1]);
        const notified = new Set();
        for (const slug of slugs) {
          if (notified.has(slug)) continue;
          notified.add(slug);
          const mentioned = await prisma.user.findUnique({ where: { slug } });
          if (mentioned && mentioned.id !== user.id) {
            const preview = text.slice(0, 80) + (text.length > 80 ? '…' : '');
            const mNotif = await prisma.notification.create({
              data: {
                userId: mentioned.id,
                text: buildNotificationText('mention', {
                  who: user.name,
                  preview,
                }),
                senderSlug: user.slug,
                workspaceId,
                chatChannel: receiver ? 'dm' : 'general',
                messageId: msg.id,
              },
            });
            io.to(`user_${mentioned.id}`).emit(
              'notification',
              notificationToDict(mNotif),
            );
          }
        }
      }

      const payload = chatMessageToDict(msg);
      if (receiver) {
        io.to(`user_${user.id}`).emit('chat_message', payload);
        io.to(`user_${receiver.id}`).emit('chat_message', payload);
      } else if (workspaceId) {
        if (channel !== 'general') {
          const chRow = await prisma.channel.findFirst({
            where: { workspaceId, slug: channel },
            include: { members: { select: { userId: true } } },
          });
          if (chRow?.type === 'private') {
            for (const cm of chRow.members) {
              io.to(`user_${cm.userId}`).emit('chat_message', payload);
            }
          } else {
            io.to(`ws_${workspaceId}`).emit('chat_message', payload);
          }
        } else {
          io.to(`ws_${workspaceId}`).emit('chat_message', payload);
        }
      }
      } catch (err) {
        console.warn('[socket] chat_message failed:', err.message);
      }
    });

    // ── typing ──
    socket.on('typing', async (data) => {
      try {
      const toSlug = (data || {}).to;
      const isTyping = Boolean((data || {}).typing);
      if (!toSlug) return;
      const r = await prisma.user.findUnique({ where: { slug: toSlug } });
      if (!r) return;
      const wsId = await resolveActiveWorkspaceId(user);
      if (!(await usersShareWorkspace(user.id, r.id, wsId))) return;
      socket.to(`user_${r.id}`).emit('typing', { user: user.slug, typing: isTyping });
      } catch (err) {
        console.warn('[socket] typing failed:', err.message);
      }
    });

    // ── dm_mark_read ──
    socket.on('dm_mark_read', async (data) => {
      const withSlug = ((data || {}).with || '').trim();
      if (!withSlug) return;
      const sender = await prisma.user.findUnique({ where: { slug: withSlug } });
      if (!sender) return;

      const unread = await prisma.chatMessage.findMany({
        where: { senderId: sender.id, receiverId: user.id, isRead: false },
        select: { id: true },
      });
      if (!unread.length) return;

      await prisma.chatMessage.updateMany({
        where: { senderId: sender.id, receiverId: user.id, isRead: false },
        data: { isRead: true },
      });
      socket.to(`user_${sender.id}`).emit('dm_read', {
        by: user.slug,
        msg_ids: unread.map((m) => m.id),
      });
    });
  });
}
