// Python karşılığı: app/routes/api.py'deki workspace-ilgili tüm endpoint'ler
//
//   POST   /api/workspaces                              create_workspace
//   PATCH  /api/workspaces/:wsId                         update_workspace
//   GET    /api/workspaces/validate-code?code=...        validate_workspace_code
//   POST   /api/workspaces/join                          join_workspace
//   GET    /api/workspaces/me/join-requests              list_join_requests
//   POST   /api/workspaces/join-requests/:reqId/approve  approve_join_request
//   POST   /api/workspaces/join-requests/:reqId/reject   reject_join_request
//   GET    /api/workspaces/mine                          my_workspaces
//   POST   /api/workspaces/:wsId/switch                  switch_workspace
//   POST   /api/workspaces/me/transfer-ownership         transfer_ownership
//   POST   /api/workspaces/me/regen-code                 regen_invite_code
//   DELETE /api/workspaces/me/invite-code                delete_invite_code
//   GET    /api/workspaces/me/roles                      get_roles
//   POST   /api/workspaces/me/roles                      create_role
//   PATCH  /api/workspaces/roles/:roleId                  update_role
//   DELETE /api/workspaces/roles/:roleId                  delete_role
//   PATCH  /api/workspaces/members/:slug                  update_member
//   DELETE /api/workspaces/members/:slug                  remove_member
//   GET    /api/workspaces/:wsId/members                  get_workspace_members
//   POST   /api/workspaces/:wsId/logo                     upload_workspace_logo
//   DELETE /api/workspaces/:wsId/logo                     delete_workspace_logo

import { Router } from 'express';
import crypto from 'node:crypto';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import {
  currentMember,
  memberForWorkspace,
  memberToDict,
  hasPermission,
} from '../lib/workspace.js';
import { workspaceRoleToDict } from '../lib/serializers.js';
import { buildNotificationText, createAndPush } from '../lib/notifications.js';
import { upload, storeFile } from '../lib/uploads.js';

export const workspacesRouter = Router();

// ── Yardımcılar ───────────────────────────────────────────────────────────

async function loadUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

function inviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function uniqueWorkspaceSlug(baseInput) {
  const base = (baseInput || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'ws';
  let slug = base;
  let counter = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${base}-${counter}`;
    counter += 1;
    if (counter > 1000) break;
  }
  return slug;
}

async function uniqueInviteCode() {
  let code = inviteCode();
  while (await prisma.workspace.findUnique({ where: { inviteCode: code } })) {
    code = inviteCode();
  }
  return code;
}

// ── Workspace template'ları (create_workspace) ────────────────────────────

const TEMPLATES = {
  software: {
    project: 'Ana Proje',
    color: 'oklch(52% 0.15 270)',
    cols: [
      ['backlog', 'Backlog', 'Backlog', 'oklch(55% 0.02 250)', 0],
      ['todo', 'To Do', 'Yapılacak', 'oklch(55% 0.09 230)', 1],
      ['doing', 'In Progress', 'Devam Ediyor', 'oklch(65% 0.11 70)', 2],
      ['review', 'In Review', 'İncelemede', 'oklch(58% 0.13 10)', 3],
      ['done', 'Done', 'Tamamlandı', 'oklch(55% 0.09 150)', 4],
    ],
    labels: [
      ['bug', 'Bug', 'Bug', 'rose'],
      ['feature', 'Feature', 'Özellik', 'blue'],
      ['tech-debt', 'Tech Debt', 'Teknik Borç', 'amber'],
      ['sprint', 'Sprint', 'Sprint', 'green'],
    ],
  },
  design: {
    project: 'Tasarım Projesi',
    color: 'oklch(50% 0.14 300)',
    cols: [
      ['brief', 'Brief', 'Brief', 'oklch(55% 0.02 250)', 0],
      ['draft', 'Draft', 'Taslak', 'oklch(55% 0.09 230)', 1],
      ['design', 'Design', 'Tasarım', 'oklch(52% 0.15 270)', 2],
      ['revision', 'Revision', 'Revizyon', 'oklch(58% 0.13 10)', 3],
      ['delivery', 'Delivered', 'Teslim', 'oklch(55% 0.09 150)', 4],
    ],
    labels: [
      ['ui', 'UI', 'UI', 'purple'],
      ['ux', 'UX', 'UX', 'blue'],
      ['revision', 'Revision', 'Revizyon', 'amber'],
      ['approved', 'Approved', 'Onaylı', 'green'],
    ],
  },
  personal: {
    project: 'Kişisel Projeler',
    color: 'oklch(55% 0.09 150)',
    cols: [
      ['ideas', 'Ideas', 'Fikirler', 'oklch(55% 0.02 250)', 0],
      ['thisweek', 'This Week', 'Bu Hafta', 'oklch(65% 0.11 70)', 1],
      ['doing', 'Doing', 'Yapıyor', 'oklch(58% 0.13 10)', 2],
      ['done', 'Done', 'Tamamlandı', 'oklch(55% 0.09 150)', 3],
    ],
    labels: [
      ['goal', 'Goal', 'Hedef', 'blue'],
      ['habit', 'Habit', 'Alışkanlık', 'green'],
      ['project', 'Project', 'Proje', 'amber'],
      ['personal', 'Personal', 'Kişisel', 'rose'],
    ],
  },
};

const DEFAULT_ROLES = [
  ['Yönetici', 'oklch(52% 0.15 270)', ['manage_tasks', 'manage_projects', 'manage_members'], false],
  ['Düzenleyici', 'oklch(55% 0.09 150)', ['manage_tasks'], true],
  ['Görüntüleyici', 'oklch(55% 0.02 250)', [], false],
];

// ── POST /workspaces ──────────────────────────────────────────────────────

workspacesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const data = req.body || {};
    const name = (data.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Çalışma alanı adı zorunludur' });

    const slug = await uniqueWorkspaceSlug(name);
    const code = await uniqueInviteCode();
    const template = data.template || 'software';
    const tmpl = TEMPLATES[template] || TEMPLATES.software;

    const result = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: { name, slug, ownerId: user.id, inviteCode: code },
      });

      // Default roller
      for (const [rName, rColor, rPerms, isDef] of DEFAULT_ROLES) {
        await tx.workspaceRole.create({
          data: {
            workspaceId: ws.id,
            name: rName,
            color: rColor,
            permissions: rPerms,
            isDefault: isDef,
          },
        });
      }

      // Owner üyelik
      await tx.workspaceMember.create({
        data: { workspaceId: ws.id, userId: user.id, role: 'owner' },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { currentWorkspaceId: ws.id },
      });

      // Template projesi + kolonlar + etiketler
      const project = await tx.project.create({
        data: { workspaceId: ws.id, name: tmpl.project, color: tmpl.color },
      });
      for (const [colSlug, title, titleTr, color, pos] of tmpl.cols) {
        await tx.boardColumn.create({
          data: {
            projectId: project.id,
            slug: colSlug,
            title,
            titleTr,
            color,
            position: pos,
          },
        });
      }
      for (const [lSlug, nameEn, nameTr, tone] of tmpl.labels) {
        await tx.label.create({
          data: {
            projectId: project.id,
            slug: lSlug,
            nameEn,
            nameTr,
            colorTone: tone,
          },
        });
      }

      // 'general' kanalı — Python seed'i app boot'unda yapıyordu; biz workspace create'te yapalım
      const channel = await tx.channel.create({
        data: {
          workspaceId: ws.id,
          slug: 'general',
          name: 'genel',
          description: 'Tüm proje üyeleri için varsayılan kanal',
          type: 'public',
          icon: 'hash',
          createdBy: user.id,
          isDefault: true,
        },
      });
      await tx.channelMember.create({
        data: { channelId: channel.id, userId: user.id, role: 'owner' },
      });

      return ws;
    });

    res.status(201).json({
      ok: true,
      invite_code: result.inviteCode,
      workspace_id: result.id,
    });
  }),
);

// ── PATCH /workspaces/:wsId ───────────────────────────────────────────────

workspacesRouter.patch(
  '/:wsId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = parseInt(req.params.wsId, 10);
    const member = await memberForWorkspace(user.id, wsId);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }
    const ws = await prisma.workspace.findUnique({ where: { id: wsId } });
    if (!ws) return res.status(404).json({ error: 'Workspace bulunamadı' });

    const data = req.body || {};
    const updates = {};
    if (typeof data.name === 'string' && data.name.trim()) {
      updates.name = data.name.trim();
    }
    const updated = Object.keys(updates).length
      ? await prisma.workspace.update({ where: { id: wsId }, data: updates })
      : ws;
    res.json({ ok: true, name: updated.name });
  }),
);

// ── GET /workspaces/validate-code ─────────────────────────────────────────

workspacesRouter.get(
  '/validate-code',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const code = (req.query.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'invite_code_required' });

    const ws = await prisma.workspace.findUnique({ where: { inviteCode: code } });
    if (!ws) return res.status(404).json({ error: 'invalid_invite_code' });

    const [existing, pending, memberCount] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } },
      }),
      prisma.workspaceJoinRequest.findFirst({
        where: { workspaceId: ws.id, userId: user.id, status: 'pending' },
      }),
      prisma.workspaceMember.count({ where: { workspaceId: ws.id } }),
    ]);

    res.json({
      ok: true,
      workspace: {
        id: ws.id,
        name: ws.name,
        logo_url: ws.logoUrl,
        member_count: memberCount,
        is_member: Boolean(existing),
        pending: Boolean(pending),
      },
    });
  }),
);

// ── POST /workspaces/join ─────────────────────────────────────────────────

workspacesRouter.post(
  '/join',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const code = ((req.body || {}).code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'invite_code_required' });

    const ws = await prisma.workspace.findUnique({ where: { inviteCode: code } });
    if (!ws) return res.status(404).json({ error: 'invalid_invite_code' });

    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: user.id },
        data: { currentWorkspaceId: ws.id },
      });
      return res.json({ ok: true, workspace_id: ws.id });
    }

    const pending = await prisma.workspaceJoinRequest.findFirst({
      where: { workspaceId: ws.id, userId: user.id, status: 'pending' },
    });
    if (pending) {
      return res.json({ ok: true, pending: true, message: 'join_request_pending' });
    }

    const joinReq = await prisma.workspaceJoinRequest.create({
      data: { workspaceId: ws.id, userId: user.id, status: 'pending' },
      include: { user: true, workspace: true },
    });

    const io = req.app.get('io');
    if (ws.ownerId) {
      await createAndPush(io, {
        userId: ws.ownerId,
        text: buildNotificationText('join_request', { who: user.name }),
        senderSlug: user.slug,
        workspaceId: ws.id,
      });
    }
    try {
      io?.to(`ws_${ws.id}`).emit('join_request_new', {
        id: joinReq.id,
        user: {
          id: joinReq.user.slug,
          name: joinReq.user.name,
        },
        status: joinReq.status,
        time: joinReq.createdAt?.toISOString() || '',
      });
    } catch {}

    res.json({ ok: true, pending: true, message: 'join_request_pending' });
  }),
);

// ── GET /workspaces/me/join-requests ──────────────────────────────────────

workspacesRouter.get(
  '/me/join-requests',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Yetki gerekli' });
    }
    const reqs = await prisma.workspaceJoinRequest.findMany({
      where: { workspaceId: member.workspaceId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
    res.json(
      reqs.map((r) => ({
        id: r.id,
        user: r.user
          ? {
              id: r.user.slug,
              name: r.user.name,
              role: r.user.roleTitle || '',
              initials: r.user.avatarInitials || '',
              color: r.user.avatarColor || 'oklch(58% 0.13 25)',
              avatar_photo_url: r.user.avatarPhotoUrl || null,
              status: r.user.status || 'offline',
              away_timeout: r.user.awayTimeout ?? 15,
            }
          : null,
        status: r.status,
        time: r.createdAt?.toISOString() || '',
      })),
    );
  }),
);

// ── POST /workspaces/join-requests/:reqId/approve ─────────────────────────

workspacesRouter.post(
  '/join-requests/:reqId/approve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Yetki gerekli' });
    }

    const reqId = parseInt(req.params.reqId, 10);
    const joinReq = await prisma.workspaceJoinRequest.findFirst({
      where: { id: reqId, workspaceId: member.workspaceId },
      include: { workspace: true, user: true },
    });
    if (!joinReq) return res.status(404).json({ error: 'İstek bulunamadı' });
    if (joinReq.status !== 'pending') {
      return res.status(400).json({ error: 'Bu istek zaten işlendi' });
    }

    const defaultRole = await prisma.workspaceRole.findFirst({
      where: { workspaceId: joinReq.workspaceId, isDefault: true },
    });

    const newMember = await prisma.$transaction(async (tx) => {
      await tx.workspaceJoinRequest.update({
        where: { id: joinReq.id },
        data: { status: 'approved' },
      });
      const wm = await tx.workspaceMember.create({
        data: {
          workspaceId: joinReq.workspaceId,
          userId: joinReq.userId,
          role: 'member',
          roleId: defaultRole?.id || null,
        },
        include: { user: true, workspaceRole: true },
      });
      await tx.user.update({
        where: { id: joinReq.userId },
        data: { currentWorkspaceId: joinReq.workspaceId },
      });
      // 'general' kanalına üye ekle
      const general = await tx.channel.findFirst({
        where: { workspaceId: joinReq.workspaceId, slug: 'general' },
      });
      if (general) {
        await tx.channelMember.upsert({
          where: {
            channelId_userId: { channelId: general.id, userId: joinReq.userId },
          },
          create: {
            channelId: general.id,
            userId: joinReq.userId,
            role: 'member',
          },
          update: {},
        });
      }
      return wm;
    });

    const io = req.app.get('io');
    await createAndPush(io, {
      userId: joinReq.userId,
      text: buildNotificationText('join_approved', {
        workspace: joinReq.workspace?.name || '',
      }),
      workspaceId: joinReq.workspaceId,
    });
    try {
      io?.to(`user_${joinReq.userId}`).emit('join_request_approved', {
        workspace_id: joinReq.workspaceId,
      });
      io?.to(`ws_${joinReq.workspaceId}`).emit('member_joined', {
        member: memberToDict(newMember),
      });
    } catch {}

    res.json({ ok: true });
  }),
);

// ── POST /workspaces/join-requests/:reqId/reject ──────────────────────────

workspacesRouter.post(
  '/join-requests/:reqId/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Yetki gerekli' });
    }

    const reqId = parseInt(req.params.reqId, 10);
    const joinReq = await prisma.workspaceJoinRequest.findFirst({
      where: { id: reqId, workspaceId: member.workspaceId },
      include: { workspace: true },
    });
    if (!joinReq) return res.status(404).json({ error: 'İstek bulunamadı' });
    if (joinReq.status !== 'pending') {
      return res.status(400).json({ error: 'Bu istek zaten işlendi' });
    }

    await prisma.workspaceJoinRequest.update({
      where: { id: joinReq.id },
      data: { status: 'rejected' },
    });

    const io = req.app.get('io');
    await createAndPush(io, {
      userId: joinReq.userId,
      text: buildNotificationText('join_rejected', {
        workspace: joinReq.workspace?.name || '',
      }),
      workspaceId: joinReq.workspaceId,
    });
    try {
      io?.to(`user_${joinReq.userId}`).emit('join_request_rejected', {
        workspace_id: joinReq.workspaceId,
      });
    } catch {}

    res.json({ ok: true });
  }),
);

// ── GET /workspaces/mine ──────────────────────────────────────────────────

workspacesRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });
    res.json(
      memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        owner_id: m.workspace.ownerId,
        logo_url: m.workspace.logoUrl,
        is_current: m.workspaceId === user.currentWorkspaceId,
        is_owner: m.role === 'owner',
      })),
    );
  }),
);

// ── POST /workspaces/:wsId/switch ─────────────────────────────────────────

workspacesRouter.post(
  '/:wsId/switch',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = parseInt(req.params.wsId, 10);
    const member = await memberForWorkspace(user.id, wsId);
    if (!member) {
      return res.status(403).json({ error: 'Bu çalışma alanına üye değilsiniz' });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { currentWorkspaceId: wsId },
    });
    res.json({ ok: true, workspace_id: wsId });
  }),
);

// ── POST /workspaces/me/transfer-ownership ────────────────────────────────

workspacesRouter.post(
  '/me/transfer-ownership',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Bu işlem için sahip yetkisi gereklidir' });
    }

    const targetSlug = ((req.body || {}).to_slug || '').trim();
    if (!targetSlug) return res.status(400).json({ error: 'Hedef üye belirtilmedi' });

    const targetUser = await prisma.user.findUnique({ where: { slug: targetSlug } });
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (targetUser.id === user.id) {
      return res.status(400).json({ error: 'Kendinize sahiplik aktaramazsınız' });
    }
    const targetMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: member.workspaceId, userId: targetUser.id },
      },
    });
    if (!targetMember) {
      return res.status(400).json({ error: 'Bu kullanıcı çalışma alanının üyesi değil' });
    }

    const [newOwnerMember, oldOwnerMember] = await prisma.$transaction([
      prisma.workspace.update({
        where: { id: member.workspaceId },
        data: { ownerId: targetUser.id },
      }),
      prisma.workspaceMember.update({
        where: {
          workspaceId_userId: { workspaceId: member.workspaceId, userId: targetUser.id },
        },
        data: { role: 'owner', roleId: null },
        include: { user: true, workspaceRole: true },
      }),
      prisma.workspaceMember.update({
        where: {
          workspaceId_userId: { workspaceId: member.workspaceId, userId: user.id },
        },
        data: { role: 'member' },
        include: { user: true, workspaceRole: true },
      }),
    ]).then((r) => [r[1], r[2]]);

    const io = req.app.get('io');
    try {
      io?.to(`ws_${member.workspaceId}`).emit('member_role_changed', memberToDict(newOwnerMember));
      io?.to(`ws_${member.workspaceId}`).emit('member_role_changed', memberToDict(oldOwnerMember));
    } catch {}

    res.json({ ok: true });
  }),
);

// ── POST /workspaces/me/regen-code ────────────────────────────────────────

workspacesRouter.post(
  '/me/regen-code',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Yetkisiz işlem' });
    }
    const newCode = await uniqueInviteCode();
    const ws = await prisma.workspace.update({
      where: { id: member.workspaceId },
      data: { inviteCode: newCode },
    });
    res.json({ invite_code: ws.inviteCode });
  }),
);

// ── DELETE /workspaces/me/invite-code ─────────────────────────────────────

workspacesRouter.delete(
  '/me/invite-code',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Yetkisiz işlem' });
    }
    await prisma.workspace.update({
      where: { id: member.workspaceId },
      data: { inviteCode: null },
    });
    res.json({ ok: true });
  }),
);

// ── GET /workspaces/me/roles ──────────────────────────────────────────────

workspacesRouter.get(
  '/me/roles',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member) return res.json([]);
    const roles = await prisma.workspaceRole.findMany({
      where: { workspaceId: member.workspaceId },
    });
    res.json(roles.map(workspaceRoleToDict));
  }),
);

// ── POST /workspaces/me/roles ─────────────────────────────────────────────

workspacesRouter.post(
  '/me/roles',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Yetkisiz işlem' });
    }
    const data = req.body || {};
    const name = (data.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Rol adı zorunludur' });

    if (data.is_default) {
      await prisma.workspaceRole.updateMany({
        where: { workspaceId: member.workspaceId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const role = await prisma.workspaceRole.create({
      data: {
        workspaceId: member.workspaceId,
        name,
        color: data.color || 'oklch(55% 0.09 230)',
        permissions: data.permissions || [],
        isDefault: Boolean(data.is_default),
      },
    });
    res.status(201).json(workspaceRoleToDict(role));
  }),
);

// ── PATCH /workspaces/roles/:roleId ───────────────────────────────────────

workspacesRouter.patch(
  '/roles/:roleId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Yetkisiz işlem' });
    }
    const roleId = parseInt(req.params.roleId, 10);
    const role = await prisma.workspaceRole.findFirst({
      where: { id: roleId, workspaceId: member.workspaceId },
    });
    if (!role) return res.status(404).json({ error: 'Rol bulunamadı' });

    const data = req.body || {};
    const updates = {};
    if ('name' in data) updates.name = data.name;
    if ('color' in data) updates.color = data.color;
    if ('permissions' in data) updates.permissions = data.permissions;
    if ('is_default' in data) {
      if (data.is_default) {
        await prisma.workspaceRole.updateMany({
          where: { workspaceId: member.workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      }
      updates.isDefault = Boolean(data.is_default);
    }

    const updated = await prisma.workspaceRole.update({
      where: { id: roleId },
      data: updates,
    });
    res.json(workspaceRoleToDict(updated));
  }),
);

// ── DELETE /workspaces/roles/:roleId ──────────────────────────────────────

workspacesRouter.delete(
  '/roles/:roleId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Yetkisiz işlem' });
    }
    const roleId = parseInt(req.params.roleId, 10);
    const role = await prisma.workspaceRole.findFirst({
      where: { id: roleId, workspaceId: member.workspaceId },
    });
    if (!role) return res.status(404).json({ error: 'Rol bulunamadı' });

    await prisma.$transaction([
      prisma.workspaceMember.updateMany({
        where: { roleId },
        data: { roleId: null },
      }),
      prisma.workspaceRole.delete({ where: { id: roleId } }),
    ]);
    res.json({ ok: true });
  }),
);

// ── PATCH /workspaces/members/:slug ───────────────────────────────────────

workspacesRouter.patch(
  '/members/:slug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const actor = await currentMember(user);
    if (!hasPermission(actor, 'manage_members')) {
      return res.status(403).json({ error: 'Üye yönetme yetkiniz yok' });
    }

    const slug = req.params.slug;
    const targetUser = await prisma.user.findUnique({ where: { slug } });
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const target = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: actor.workspaceId, userId: targetUser.id },
      },
      include: { user: true, workspaceRole: true },
    });
    if (!target) return res.status(404).json({ error: 'Üye bulunamadı' });

    if (target.role === 'owner') {
      return res.status(403).json({ error: 'Sahip rolü değiştirilemez' });
    }
    if (actor.role !== 'owner' && target.userId === actor.userId) {
      return res.status(403).json({ error: 'Kendi rolünüzü değiştiremezsiniz' });
    }

    const data = req.body || {};
    const updates = {};
    if ('role_id' in data) {
      const roleId = data.role_id;
      if (roleId) {
        const role = await prisma.workspaceRole.findFirst({
          where: { id: roleId, workspaceId: actor.workspaceId },
        });
        if (!role) return res.status(404).json({ error: 'Rol bulunamadı' });
        updates.roleId = role.id;
      } else {
        updates.roleId = null;
      }
    }

    const updated = await prisma.workspaceMember.update({
      where: {
        workspaceId_userId: { workspaceId: actor.workspaceId, userId: targetUser.id },
      },
      data: updates,
      include: { user: true, workspaceRole: true },
    });
    const result = memberToDict(updated);

    const io = req.app.get('io');
    try {
      io?.to(`ws_${actor.workspaceId}`).emit('member_role_changed', result);
    } catch {}

    res.json(result);
  }),
);

// ── DELETE /workspaces/members/:slug ──────────────────────────────────────

workspacesRouter.delete(
  '/members/:slug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const actor = await currentMember(user);
    if (!hasPermission(actor, 'manage_members')) {
      return res.status(403).json({ error: 'Üye yönetme yetkiniz yok' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { slug: req.params.slug },
    });
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (targetUser.id === user.id) {
      return res.status(400).json({ error: 'Kendinizi çıkaramazsınız' });
    }

    const target = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: actor.workspaceId, userId: targetUser.id },
      },
    });
    if (!target) return res.status(404).json({ error: 'Üye bulunamadı' });
    if (target.role === 'owner') {
      return res.status(403).json({ error: 'Sahip takımdan çıkarılamaz' });
    }

    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: { workspaceId: actor.workspaceId, userId: targetUser.id },
      },
    });
    res.json({ ok: true });
  }),
);

// ── GET /workspaces/:wsId/members ─────────────────────────────────────────

workspacesRouter.get(
  '/:wsId/members',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = parseInt(req.params.wsId, 10);
    const member = await memberForWorkspace(user.id, wsId);
    if (!member) {
      return res.status(403).json({ error: 'Bu çalışma alanına erişiminiz yok' });
    }
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: wsId },
      include: { user: true, workspaceRole: true },
    });
    res.json(members.filter((m) => m.user).map(memberToDict));
  }),
);

// ── POST /workspaces/:wsId/logo ───────────────────────────────────────────

workspacesRouter.post(
  '/:wsId/logo',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = parseInt(req.params.wsId, 10);

    const ws = await prisma.workspace.findUnique({ where: { id: wsId } });
    if (!ws) return res.status(404).json({ error: 'Workspace bulunamadı' });
    if (ws.ownerId !== user.id) {
      const m = await memberForWorkspace(user.id, wsId);
      if (!m) return res.status(403).json({ error: 'Yetkisiz' });
    }

    if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi' });

    const name = req.file.originalname || '';
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return res.status(400).json({ error: 'Sadece resim dosyaları yüklenebilir' });
    }
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Logo 5 MB'dan büyük olamaz" });
    }

    const stored = await storeFile(req.file, 'logo');
    const url = `/api/media/${stored.id}`;
    await prisma.workspace.update({ where: { id: wsId }, data: { logoUrl: url } });
    res.json({ logo_url: url });
  }),
);

// ── DELETE /workspaces/:wsId/logo ─────────────────────────────────────────

workspacesRouter.delete(
  '/:wsId/logo',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = parseInt(req.params.wsId, 10);
    const ws = await prisma.workspace.findUnique({ where: { id: wsId } });
    if (!ws) return res.status(404).json({ error: 'Workspace bulunamadı' });
    if (ws.ownerId !== user.id) {
      return res.status(403).json({ error: 'Yetkisiz' });
    }
    await prisma.workspace.update({ where: { id: wsId }, data: { logoUrl: null } });
    res.json({ logo_url: null });
  }),
);
