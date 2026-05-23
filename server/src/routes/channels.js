// Python karşılığı: api.py'deki kanal endpoint'leri
//
//   GET    /api/channels                                 list accessible
//   POST   /api/channels                                 create
//   GET    /api/channels/:id                             detail
//   PATCH  /api/channels/:id                             update
//   DELETE /api/channels/:id                             delete (+ messages)
//   POST   /api/channels/:id/members                     add members
//   DELETE /api/channels/:id/members/:userSlug           remove (self-leave + management)
//   PATCH  /api/channels/:id/members/:userSlug           change role

import { Router } from 'express';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import { resolveWorkspaceId, memberForWorkspace } from '../lib/workspace.js';
import {
  channelToDict,
  listAccessibleChannels,
  userCanCreateChannel,
  slugifyChannel,
  userChannelRole,
  canManageChannel,
  deleteChannelTree,
} from '../lib/channels.js';
import { buildNotificationText, createAndPush } from '../lib/notifications.js';

export const channelsRouter = Router();

async function loadUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

const CHANNEL_INCLUDE = { members: { include: { user: true } } };

function emitToUsers(io, event, payload, userIds) {
  if (!io) return;
  try {
    for (const uid of userIds) io.to(`user_${uid}`).emit(event, payload);
  } catch {}
}

const ICON_RE = /^[A-Za-z][A-Za-z0-9]*$/;
function normalizeIcon(value, fallback = 'hash') {
  const icon = (value || '').trim();
  return ICON_RE.test(icon) ? icon.slice(0, 50) : fallback;
}

// ─── GET /channels ─────────────────────────────────────────────────────────

channelsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const channels = await listAccessibleChannels(user);
    res.json(channels.map((c) => channelToDict(c, { currentUserId: user.id })));
  }),
);

// ─── POST /channels ────────────────────────────────────────────────────────

channelsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const data = req.body || {};
    const name = (data.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Kanal adı boş olamaz' });
    const slug = slugifyChannel(name);
    if (!slug) return res.status(400).json({ error: 'Geçerli bir kanal adı girin' });

    const wsId = await resolveWorkspaceId(user);
    if (!wsId) return res.status(400).json({ error: 'Aktif çalışma alanı bulunamadı' });
    if (!(await userCanCreateChannel(user, wsId))) {
      return res.status(403).json({
        error: 'Kanal oluşturma yetkin yok. Workspace sahibiyle iletişime geç.',
      });
    }

    const exists = await prisma.channel.findFirst({
      where: { workspaceId: wsId, slug },
    });
    if (exists) return res.status(409).json({ error: 'Bu isimde bir kanal zaten var' });

    let chType = data.type || 'public';
    if (!['public', 'private'].includes(chType)) chType = 'public';
    const description = (data.description || '').trim() || null;
    const icon = normalizeIcon(
      data.icon,
      chType === 'private' ? 'lock' : 'hash',
    );
    const memberSlugs = Array.isArray(data.member_slugs) ? data.member_slugs : [];

    const created = await prisma.$transaction(async (tx) => {
      const channel = await tx.channel.create({
        data: {
          workspaceId: wsId,
          slug,
          name: name.slice(0, 120),
          description,
          type: chType,
          icon,
          createdBy: user.id,
          isDefault: false,
        },
      });

      // Yaratıcı her zaman owner
      await tx.channelMember.create({
        data: { channelId: channel.id, userId: user.id, role: 'owner' },
      });

      const addedIds = new Set([user.id]);

      if (chType === 'private') {
        if (memberSlugs.length) {
          const invited = await tx.user.findMany({
            where: { slug: { in: memberSlugs } },
          });
          for (const u of invited) {
            if (u.id === user.id || addedIds.has(u.id)) continue;
            const wm = await tx.workspaceMember.findUnique({
              where: { workspaceId_userId: { workspaceId: wsId, userId: u.id } },
            });
            if (!wm) continue;
            await tx.channelMember.create({
              data: { channelId: channel.id, userId: u.id, role: 'member' },
            });
            addedIds.add(u.id);
          }
        }
      } else {
        // Public: tüm workspace üyelerini auto-ekle
        const wsMembers = await tx.workspaceMember.findMany({
          where: { workspaceId: wsId },
        });
        for (const wm of wsMembers) {
          if (addedIds.has(wm.userId)) continue;
          await tx.channelMember.create({
            data: { channelId: channel.id, userId: wm.userId, role: 'member' },
          });
          addedIds.add(wm.userId);
        }
      }
      return { channelId: channel.id, addedIds: [...addedIds] };
    });

    const io = req.app.get('io');
    const full = await prisma.channel.findUnique({
      where: { id: created.channelId },
      include: CHANNEL_INCLUDE,
    });
    const payload = channelToDict(full, { includeMembers: true });
    emitToUsers(io, 'channel_created', payload, created.addedIds);

    // Private kanalda davet edilenlere bildirim
    if (chType === 'private') {
      for (const uid of created.addedIds) {
        if (uid === user.id) continue;
        await createAndPush(io, {
          userId: uid,
          text: buildNotificationText('channel_added', {
            who: user.name,
            channel: full.name,
          }),
          senderSlug: user.slug,
          workspaceId: wsId,
          chatChannel: full.slug,
        });
      }
    }

    res
      .status(201)
      .json(channelToDict(full, { includeMembers: true, currentUserId: user.id }));
  }),
);

// ─── GET /channels/:id ─────────────────────────────────────────────────────

channelsRouter.get(
  '/:channelId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const channelId = parseInt(req.params.channelId, 10);
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });
    const role = await userChannelRole(channel, user.id);
    if (!role) return res.status(403).json({ error: 'Bu kanala erişim yetkiniz yok' });
    res.json(channelToDict(channel, { includeMembers: true, currentUserId: user.id }));
  }),
);

// ─── PATCH /channels/:id ───────────────────────────────────────────────────

channelsRouter.patch(
  '/:channelId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const channelId = parseInt(req.params.channelId, 10);
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });
    const role = await userChannelRole(channel, user.id);
    if (!canManageChannel(role)) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }
    const data = req.body || {};
    if (channel.isDefault && 'type' in data) {
      return res.status(400).json({ error: 'Varsayılan kanalın tipi değiştirilemez' });
    }

    const updates = {};
    if ('name' in data) {
      const n = (data.name || '').trim();
      if (!n) return res.status(400).json({ error: 'Kanal adı boş olamaz' });
      updates.name = n.slice(0, 120);
    }
    if ('description' in data) {
      updates.description = (data.description || '').trim() || null;
    }
    if ('icon' in data) updates.icon = normalizeIcon(data.icon);

    let upgradedFromPrivate = false;
    if ('type' in data && !channel.isDefault) {
      const newType = data.type;
      if (!['public', 'private'].includes(newType)) {
        return res.status(400).json({ error: 'Geçersiz kanal tipi' });
      }
      if (role !== 'owner') {
        return res.status(403).json({ error: 'Kanal tipini sadece sahip değiştirebilir' });
      }
      updates.type = newType;
      upgradedFromPrivate = channel.type === 'private' && newType === 'public';
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updates).length) {
        await tx.channel.update({ where: { id: channelId }, data: updates });
      }
      if (upgradedFromPrivate) {
        const existingIds = new Set(channel.members.map((m) => m.userId));
        const wsMembers = await tx.workspaceMember.findMany({
          where: { workspaceId: channel.workspaceId },
        });
        for (const wm of wsMembers) {
          if (existingIds.has(wm.userId)) continue;
          await tx.channelMember.create({
            data: { channelId, userId: wm.userId, role: 'member' },
          });
        }
      }
    });

    const updated = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    const payload = channelToDict(updated, { includeMembers: true });
    emitToUsers(req.app.get('io'), 'channel_updated', payload, updated.members.map((m) => m.userId));
    res.json(
      channelToDict(updated, { includeMembers: true, currentUserId: user.id }),
    );
  }),
);

// ─── DELETE /channels/:id ──────────────────────────────────────────────────

channelsRouter.delete(
  '/:channelId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const channelId = parseInt(req.params.channelId, 10);
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });
    if (channel.isDefault) {
      return res.status(400).json({ error: 'Varsayılan kanal silinemez' });
    }
    const role = await userChannelRole(channel, user.id);
    const wm = await memberForWorkspace(user.id, channel.workspaceId);
    const wsCanManage =
      wm &&
      (wm.role === 'owner' ||
        (wm.workspaceRole &&
          (wm.workspaceRole.permissions || []).includes('manage_channels')));
    if (role !== 'owner' && !wsCanManage) {
      return res
        .status(403)
        .json({ error: 'Kanalı sadece kanal sahibi veya yönetici silebilir' });
    }

    const memberIds = channel.members.map((m) => m.userId);
    const slug = channel.slug;
    const wsId = channel.workspaceId;

    await prisma.$transaction(async (tx) => {
      await deleteChannelTree(tx, channel);
    });

    emitToUsers(
      req.app.get('io'),
      'channel_deleted',
      { channel_id: channelId, slug, workspace_id: wsId },
      memberIds,
    );
    res.json({ ok: true });
  }),
);

// ─── POST /channels/:id/members ────────────────────────────────────────────

channelsRouter.post(
  '/:channelId/members',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const channelId = parseInt(req.params.channelId, 10);
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });
    const role = await userChannelRole(channel, user.id);
    if (!canManageChannel(role)) {
      return res.status(403).json({ error: 'Üye ekleme yetkiniz yok' });
    }

    const data = req.body || {};
    const slugs = data.member_slugs || data.user_slugs || [];
    if (!Array.isArray(slugs) || slugs.length === 0) {
      return res.status(400).json({ error: 'En az bir üye seçmelisiniz' });
    }

    const candidates = await prisma.user.findMany({
      where: { slug: { in: slugs } },
    });
    const existingIds = new Set(channel.members.map((m) => m.userId));
    const added = [];

    await prisma.$transaction(async (tx) => {
      for (const u of candidates) {
        if (existingIds.has(u.id)) continue;
        const wm = await tx.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: channel.workspaceId,
              userId: u.id,
            },
          },
        });
        if (!wm) continue;
        await tx.channelMember.create({
          data: { channelId, userId: u.id, role: 'member' },
        });
        existingIds.add(u.id);
        added.push(u);
      }
    });

    const io = req.app.get('io');
    for (const u of added) {
      await createAndPush(io, {
        userId: u.id,
        text: buildNotificationText('channel_added', {
          who: user.name,
          channel: channel.name,
        }),
        senderSlug: user.slug,
        workspaceId: channel.workspaceId,
        chatChannel: channel.slug,
      });
    }

    const updated = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    const payload = channelToDict(updated, { includeMembers: true });
    emitToUsers(
      io,
      'channel_member_added',
      payload,
      updated.members.map((m) => m.userId),
    );
    res.json({
      channel: channelToDict(updated, {
        includeMembers: true,
        currentUserId: user.id,
      }),
      added: added.map((u) => u.slug),
    });
  }),
);

// ─── DELETE /channels/:id/members/:userSlug ────────────────────────────────

channelsRouter.delete(
  '/:channelId/members/:userSlug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const channelId = parseInt(req.params.channelId, 10);
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });

    const target = await prisma.user.findUnique({
      where: { slug: req.params.userSlug },
    });
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const role = await userChannelRole(channel, user.id);
    const isSelf = target.id === user.id;

    if (isSelf) {
      if (channel.isDefault) {
        return res.status(400).json({ error: 'Varsayılan kanaldan ayrılamazsınız' });
      }
      if (role === 'owner') {
        const otherOwners = channel.members.filter(
          (m) => m.role === 'owner' && m.userId !== user.id,
        );
        if (otherOwners.length === 0) {
          const admins = channel.members.filter((m) => m.role === 'admin');
          const others = channel.members.filter((m) => m.userId !== user.id);
          if (admins.length) {
            await prisma.channelMember.update({
              where: {
                channelId_userId: { channelId, userId: admins[0].userId },
              },
              data: { role: 'owner' },
            });
          } else if (others.length) {
            await prisma.channelMember.update({
              where: {
                channelId_userId: { channelId, userId: others[0].userId },
              },
              data: { role: 'owner' },
            });
          } else {
            // Tek üye ben — kanalı sil
            const memberIds = channel.members.map((m) => m.userId);
            await prisma.$transaction(async (tx) => {
              await deleteChannelTree(tx, channel);
            });
            emitToUsers(
              req.app.get('io'),
              'channel_deleted',
              {
                channel_id: channelId,
                slug: channel.slug,
                workspace_id: channel.workspaceId,
              },
              memberIds,
            );
            return res.json({ ok: true, deleted: true });
          }
        }
      }
    } else {
      if (!canManageChannel(role)) {
        return res.status(403).json({ error: 'Üye çıkarma yetkiniz yok' });
      }
      const targetMember = channel.members.find((m) => m.userId === target.id);
      if (targetMember?.role === 'owner') {
        return res.status(400).json({ error: 'Kanal sahibini çıkaramazsınız' });
      }
      if (channel.isDefault) {
        return res.status(400).json({ error: 'Varsayılan kanaldan üye çıkarılamaz' });
      }
    }

    const cm = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: target.id } },
    });
    if (!cm) return res.status(404).json({ error: 'Bu kullanıcı kanal üyesi değil' });
    await prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId: target.id } },
    });

    const updated = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    const payload = channelToDict(updated, { includeMembers: true });
    const affected = [
      ...updated.members.map((m) => m.userId),
      target.id,
    ];
    emitToUsers(
      req.app.get('io'),
      'channel_member_removed',
      { ...payload, removed_user_slug: target.slug },
      affected,
    );
    res.json({ ok: true });
  }),
);

// ─── PATCH /channels/:id/members/:userSlug ─────────────────────────────────

channelsRouter.patch(
  '/:channelId/members/:userSlug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const channelId = parseInt(req.params.channelId, 10);
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });
    const role = await userChannelRole(channel, user.id);
    if (role !== 'owner') {
      return res
        .status(403)
        .json({ error: 'Rol atamayı sadece kanal sahibi yapabilir' });
    }
    const target = await prisma.user.findUnique({
      where: { slug: req.params.userSlug },
    });
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    const newRole = (req.body || {}).role;
    if (!['owner', 'admin', 'member'].includes(newRole)) {
      return res.status(400).json({ error: 'Geçersiz rol' });
    }
    const cm = channel.members.find((m) => m.userId === target.id);
    if (!cm) return res.status(404).json({ error: 'Bu kullanıcı kanal üyesi değil' });

    await prisma.$transaction(async (tx) => {
      if (newRole === 'owner') {
        // Şu anki owner'ı admin'e indir (tek-owner model)
        await tx.channelMember.update({
          where: { channelId_userId: { channelId, userId: user.id } },
          data: { role: 'admin' },
        });
      }
      await tx.channelMember.update({
        where: { channelId_userId: { channelId, userId: target.id } },
        data: { role: newRole },
      });
    });

    const updated = await prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });
    const payload = channelToDict(updated, { includeMembers: true });
    emitToUsers(
      req.app.get('io'),
      'channel_updated',
      payload,
      updated.members.map((m) => m.userId),
    );
    res.json(
      channelToDict(updated, { includeMembers: true, currentUserId: user.id }),
    );
  }),
);
