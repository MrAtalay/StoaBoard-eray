// Python karşılığı: app/routes/api.py
//
// Bu dosya kademeli olarak doluyor. Şu an A grubu hazır:
//   - /bootstrap            (frontend tüm state'i tek atışta buradan alır)
//   - /users/me             GET / PUT / DELETE
//   - /users/me/avatar      POST / DELETE
//   - /me/preferences       PATCH
//   - /media/:fileId        public file serve (Range destekli)
//
// Sonraki gruplar: workspaces, projects, tasks, notifications, notes, chat.

import { Router } from 'express';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import { hashPassword } from '../lib/password.js';
import { userToDict, initialsFromName } from '../lib/user.js';
import * as onlineState from '../lib/onlineState.js';
import {
  currentMember,
  memberForWorkspace,
  memberToDict,
  userPrivateDict,
} from '../lib/workspace.js';
import {
  workspaceToDict,
  workspaceRoleToDict,
  projectToDict,
  columnToDict,
  labelToDictValue,
  taskToDict,
  notificationToDict,
  activityToDict,
} from '../lib/serializers.js';
import {
  channelToDict,
  listAccessibleChannels,
  userCanCreateChannel,
} from '../lib/channels.js';
import { countVisibleNotes } from '../lib/notes.js';
import { throughputForProject } from '../lib/throughput.js';
import { avatarUpload, storeFile } from '../lib/uploads.js';

export const apiRouter = Router();

// ─── /api/ping & /api/health (zaten vardı) ─────────────────────────────────

apiRouter.get('/ping', (_req, res) => {
  res.json({ ok: true, scope: 'api' });
});

apiRouter.get('/health', asyncHandler(async (_req, res) => {
  const userCount = await prisma.user.count();
  res.json({ ok: true, users: userCount });
}));

// ─── Yardımcı: oturum sahibi user + last_seen güncelle ─────────────────────
//
// Python _current_user her çağrıda last_seen'i tazeliyordu. Aynı davranış.

async function loadCurrentUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (user) {
    // Best-effort; başarısız olursa request akışını bozmasın
    prisma.user
      .update({ where: { id: user.id }, data: { lastSeen: new Date() } })
      .catch(() => {});
  }
  return user;
}

// ─── GET /api/bootstrap ────────────────────────────────────────────────────
//
// Frontend açılışta tek bir istekle bütün state'i çeker.

apiRouter.get(
  '/bootstrap',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'err_auth_required' });

    const projectIdParam = parseInt(req.query.project, 10);
    const projectFilter = Number.isFinite(projectIdParam) ? projectIdParam : null;

    // Aktif workspace üyeliğini çöz
    let member = null;
    if (user.currentWorkspaceId) {
      member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: user.currentWorkspaceId,
            userId: user.id,
          },
        },
        include: { workspaceRole: true },
      });
    }
    if (!member) {
      member = await prisma.workspaceMember.findFirst({
        where: { userId: user.id },
        include: { workspaceRole: true },
      });
      if (member) {
        await prisma.user.update({
          where: { id: user.id },
          data: { currentWorkspaceId: member.workspaceId },
        });
        user.currentWorkspaceId = member.workspaceId;
      }
    }

    if (!member) {
      return res.json({
        needs_workspace: true,
        user: userPrivateDict(user),
      });
    }

    // ── Workspace-level paralel sorgular ──────────────────────────────────
    // Bunların tümü user + workspace id'sini biliyor, birbirinden bağımsız.
    const onlineIds = onlineState.getOnlineIds();
    const [
      allMemberships,
      ws,
      wsMembers,
      onlineUserRows,
      projects,
      accessibleChannels,
      canCreateChannel,
      notesVisibleCount,
    ] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { userId: user.id },
        include: { workspace: true },
      }),
      prisma.workspace.findUnique({
        where: { id: member.workspaceId },
        include: { roles: true },
      }),
      prisma.workspaceMember.findMany({
        where: { workspaceId: member.workspaceId },
        include: { user: true, workspaceRole: true },
      }),
      onlineIds.length
        ? prisma.user.findMany({
            where: { id: { in: onlineIds } },
            select: { id: true, slug: true },
          })
        : Promise.resolve([]),
      prisma.project.findMany({ where: { workspaceId: member.workspaceId } }),
      listAccessibleChannels(user),
      userCanCreateChannel(user, member.workspaceId),
      countVisibleNotes(user, member.workspaceId),
    ]);

    const workspacesList = allMemberships.map((wm) => {
      const wd = workspaceToDict(wm.workspace);
      wd.is_current = wm.workspaceId === user.currentWorkspaceId;
      wd.is_owner = wm.role === 'owner';
      return wd;
    });

    const isOwner = member.role === 'owner';
    const wsDict = workspaceToDict(ws);
    wsDict.is_owner = isOwner;
    wsDict.roles = (ws.roles || []).map(workspaceRoleToDict);
    if (isOwner) wsDict.invite_code = ws.inviteCode;
    wsDict.can_create_channel = canCreateChannel;

    const members = wsMembers
      .filter((wm) => wm.user)
      .map((wm) => memberToDict(wm));

    const onlineUsers = onlineUserRows.map((u) => ({
      slug: u.slug,
      status: onlineState.getStatus(u.id),
    }));

    // Project open-count batch sorgusu (projects geldikten sonra)
    let openCounts = new Map();
    if (projects.length) {
      const projectIds = projects.map((p) => p.id);
      const doneCols = await prisma.boardColumn.findMany({
        where: { projectId: { in: projectIds }, isDone: true },
        select: { id: true },
      });
      const doneColIds = doneCols.map((c) => c.id);
      const grouped = await prisma.task.groupBy({
        by: ['projectId'],
        where: {
          projectId: { in: projectIds },
          ...(doneColIds.length ? { NOT: { columnId: { in: doneColIds } } } : {}),
        },
        _count: { _all: true },
      });
      openCounts = new Map(grouped.map((g) => [g.projectId, g._count._all]));
    }

    const sidebarProjects = projects.map((p) =>
      projectToDict(p, { openCount: openCounts.get(p.id) || 0 }),
    );

    const channelsPayload = accessibleChannels.map((c) =>
      channelToDict(c, { currentUserId: user.id }),
    );

    const basePayload = {
      user: userPrivateDict(user, member),
      workspace: wsDict,
      workspaces: workspacesList,
      members,
      online_users: onlineUsers,
      channels: channelsPayload,
      notes_count: notesVisibleCount,
    };

    if (projects.length === 0) {
      return res.json({
        ...basePayload,
        projects: [],
        current_project: null,
        columns: [],
        labels: {},
        tasks: [],
        notifications: [],
        activity: [],
        throughput: [],
      });
    }

    // Aktif proje seçimi
    let project = null;
    if (projectFilter) {
      project = await prisma.project.findFirst({
        where: { id: projectFilter, workspaceId: ws.id },
      });
    }
    if (!project) project = projects[0];

    // Projeye ait sorgular — hepsi paralel (throughput dahil)
    const [columns, labels, tasks, notifs, activity, throughput] = await Promise.all([
      prisma.boardColumn.findMany({
        where: { projectId: project.id },
        orderBy: { position: 'asc' },
      }),
      prisma.label.findMany({ where: { projectId: project.id } }),
      prisma.task.findMany({
        where: { projectId: project.id, deletedAt: null },
        include: {
          column: true,
          creator: true,
          assignees: { include: { user: true } },
          labelLinks: { include: { label: true } },
          subtasks: true,
          comments: { select: { id: true } },
        },
      }),
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.activityLog.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: 'desc' },
        include: { user: true },
        take: 10,
      }),
      throughputForProject(project.id),
    ]);

    const labelsMap = {};
    for (const l of labels) labelsMap[l.slug] = labelToDictValue(l);

    // Auto-cleanup: permanently delete tasks soft-deleted > 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expiredIds = (await prisma.task.findMany({
      where: { projectId: project.id, deletedAt: { lt: thirtyDaysAgo } },
      select: { id: true },
    })).map(t => t.id);
    if (expiredIds.length > 0) {
      await prisma.$transaction([
        prisma.taskAttachment.deleteMany({ where: { taskId: { in: expiredIds } } }),
        prisma.taskAssignee.deleteMany({ where: { taskId: { in: expiredIds } } }),
        prisma.taskLabel.deleteMany({ where: { taskId: { in: expiredIds } } }),
        prisma.subtask.deleteMany({ where: { taskId: { in: expiredIds } } }),
        prisma.comment.deleteMany({ where: { taskId: { in: expiredIds } } }),
        prisma.noteLinkedTask.deleteMany({ where: { taskId: { in: expiredIds } } }),
        prisma.notification.updateMany({ where: { taskId: { in: expiredIds } }, data: { taskId: null } }),
        prisma.task.deleteMany({ where: { id: { in: expiredIds } } }),
      ]);
    }

    return res.json({
      ...basePayload,
      projects: sidebarProjects,
      current_project: String(project.id),
      columns: columns.map(columnToDict),
      labels: labelsMap,
      tasks: tasks.map(taskToDict),
      notifications: notifs.map(notificationToDict),
      activity: activity.map(activityToDict),
      throughput,
    });
  }),
);

// ─── GET /api/users/me ─────────────────────────────────────────────────────

apiRouter.get(
  '/users/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'err_auth_required' });
    res.json(userPrivateDict(user));
  }),
);

// ─── PUT /api/users/me ─────────────────────────────────────────────────────

apiRouter.put(
  '/users/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'err_auth_required' });
    const data = req.body || {};

    const updates = {};
    if (typeof data.name === 'string') {
      const trimmed = data.name.trim();
      if (trimmed) {
        updates.name = trimmed;
        updates.avatarInitials = initialsFromName(trimmed);
      }
    }
    if (typeof data.email === 'string') {
      const newEmail = data.email.trim().toLowerCase();
      if (newEmail && newEmail !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email: newEmail } });
        if (existing) {
          return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı' });
        }
        updates.email = newEmail;
      }
    }
    if (typeof data.password === 'string' && data.password) {
      if (data.password.length < 6) {
        return res.status(400).json({ error: 'Parola en az 6 karakter olmalıdır' });
      }
      updates.passwordHash = hashPassword(data.password);
    }

    // role_title workspace-specific: membership varsa orada saklanır
    let wmUpdate = null;
    if (typeof data.role_title === 'string' && user.currentWorkspaceId) {
      const wm = await memberForWorkspace(user.id, user.currentWorkspaceId);
      if (wm) {
        wmUpdate = await prisma.workspaceMember.update({
          where: {
            workspaceId_userId: {
              workspaceId: user.currentWorkspaceId,
              userId: user.id,
            },
          },
          data: { roleTitle: data.role_title },
          include: { workspaceRole: true },
        });
      } else {
        updates.roleTitle = data.role_title;
      }
    }

    const updated = Object.keys(updates).length
      ? await prisma.user.update({ where: { id: user.id }, data: updates })
      : user;

    const wmCurrent =
      wmUpdate || (await currentMember(updated));

    res.json(userPrivateDict(updated, wmCurrent));
  }),
);

// ─── DELETE /api/users/me ──────────────────────────────────────────────────
//
// Hesabı silmek için e-posta confirmation gerekli.
// Workspace owner ise: ya başka üyeye devret, ya da workspace'i komple sil.
//
// NOTE: Workspace ağacını topluca silmek karmaşık — şimdilik basit "transfer
// veya boş workspace tree delete" yaklaşımıyla yetiniyoruz. Workspace grubu
// geldiğinde `_delete_workspace_tree` helper'ını ortak modüle çekeceğiz.

apiRouter.delete(
  '/users/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'err_auth_required' });

    const data = req.body || {};
    const confirmEmail = (data.email || data.confirm_email || '').trim().toLowerCase();
    if (confirmEmail !== (user.email || '').toLowerCase()) {
      return res.status(400).json({
        error: 'Hesabı silmek için e-posta adresinizi doğru yazın',
      });
    }

    const ownedWorkspaces = await prisma.workspace.findMany({
      where: { ownerId: user.id },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const ws of ownedWorkspaces) {
        const replacement = await tx.workspaceMember.findFirst({
          where: { workspaceId: ws.id, NOT: { userId: user.id } },
        });
        if (replacement) {
          await tx.workspace.update({
            where: { id: ws.id },
            data: { ownerId: replacement.userId },
          });
          await tx.workspaceMember.update({
            where: {
              workspaceId_userId: {
                workspaceId: ws.id,
                userId: replacement.userId,
              },
            },
            data: { role: 'owner', roleId: null },
          });
        } else {
          // Boş workspace — bağımlı kayıtları kaldır (helper'a taşınacak)
          await tx.notification.deleteMany({ where: { workspaceId: ws.id } });
          await tx.chatMessage.deleteMany({ where: { workspaceId: ws.id } });
          await tx.noteLinkedTask.deleteMany({
            where: { note: { workspaceId: ws.id } },
          });
          await tx.noteCollaborator.deleteMany({
            where: { note: { workspaceId: ws.id } },
          });
          await tx.note.deleteMany({ where: { workspaceId: ws.id } });
          await tx.channelMember.deleteMany({
            where: { channel: { workspaceId: ws.id } },
          });
          await tx.channel.deleteMany({ where: { workspaceId: ws.id } });
          await tx.workspaceJoinRequest.deleteMany({ where: { workspaceId: ws.id } });

          // Project ağacını sil
          const projects = await tx.project.findMany({
            where: { workspaceId: ws.id },
            select: { id: true },
          });
          const projectIds = projects.map((p) => p.id);
          if (projectIds.length) {
            const taskIds = (
              await tx.task.findMany({
                where: { projectId: { in: projectIds } },
                select: { id: true },
              })
            ).map((t) => t.id);

            if (taskIds.length) {
              await tx.taskAttachment.deleteMany({ where: { taskId: { in: taskIds } } });
              await tx.taskLabel.deleteMany({ where: { taskId: { in: taskIds } } });
              await tx.taskAssignee.deleteMany({ where: { taskId: { in: taskIds } } });
              await tx.subtask.deleteMany({ where: { taskId: { in: taskIds } } });
              await tx.comment.deleteMany({ where: { taskId: { in: taskIds } } });
              await tx.task.deleteMany({ where: { id: { in: taskIds } } });
            }
            await tx.label.deleteMany({ where: { projectId: { in: projectIds } } });
            await tx.boardColumn.deleteMany({ where: { projectId: { in: projectIds } } });
            await tx.activityLog.deleteMany({ where: { projectId: { in: projectIds } } });
            await tx.project.deleteMany({ where: { id: { in: projectIds } } });
          }
          await tx.workspaceMember.deleteMany({ where: { workspaceId: ws.id } });
          await tx.workspaceRole.deleteMany({ where: { workspaceId: ws.id } });
          await tx.workspace.delete({ where: { id: ws.id } });
        }
      }

      // Kullanıcıya bağlı kayıtları temizle
      await tx.taskAssignee.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.comment.deleteMany({ where: { userId: user.id } });
      await tx.chatMessage.deleteMany({
        where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
      });
      await tx.activityLog.updateMany({
        where: { userId: user.id },
        data: { userId: null },
      });
      await tx.task.updateMany({
        where: { createdBy: user.id },
        data: { createdBy: null },
      });
      await tx.noteCollaborator.deleteMany({ where: { userId: user.id } });
      // Kullanıcının yazdığı notlar
      const authoredNotes = await tx.note.findMany({
        where: { authorId: user.id },
        select: { id: true },
      });
      const noteIds = authoredNotes.map((n) => n.id);
      if (noteIds.length) {
        await tx.noteLinkedTask.deleteMany({ where: { noteId: { in: noteIds } } });
        await tx.noteCollaborator.deleteMany({ where: { noteId: { in: noteIds } } });
        await tx.note.deleteMany({ where: { id: { in: noteIds } } });
      }
      await tx.workspaceMember.deleteMany({ where: { userId: user.id } });
      // currentWorkspaceId foreign key'i nullable, doğrudan silebiliriz
      await tx.user.delete({ where: { id: user.id } });
    });

    onlineState.setOffline(user.id);
    await new Promise((resolve) => req.session.destroy(() => resolve()));
    res.json({ ok: true });
  }),
);

// ─── PATCH /api/me/preferences ─────────────────────────────────────────────

apiRouter.patch(
  '/me/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'err_auth_required' });
    const data = req.body || {};
    const updates = {};

    if ('away_timeout' in data) {
      const t = parseInt(data.away_timeout, 10);
      if (Number.isFinite(t) && t >= 1 && t <= 120) {
        updates.awayTimeout = t;
      }
    }
    let newStatus = null;
    if ('status' in data && ['online', 'away', 'dnd'].includes(data.status)) {
      updates.status = data.status;
      newStatus = data.status;
    }

    let updated = user;
    if (Object.keys(updates).length) {
      updated = await prisma.user.update({ where: { id: user.id }, data: updates });
    }

    if (newStatus) {
      onlineState.setStatus(user.id, newStatus);
      const io = req.app.get('io');
      if (io) {
        const memberships = await prisma.workspaceMember.findMany({
          where: { userId: user.id },
          select: { workspaceId: true },
        });
        for (const m of memberships) {
          io.to(`ws_${m.workspaceId}`).emit('user_status', {
            user: updated.slug,
            status: updated.status,
          });
        }
      }
    }

    res.json({
      ok: true,
      away_timeout: updated.awayTimeout,
      status: updated.status,
    });
  }),
);

// ─── POST /api/users/me/avatar ─────────────────────────────────────────────

apiRouter.post(
  '/users/me/avatar',
  requireAuth,
  avatarUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' });

    const user = await loadCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'err_auth_required' });

    const stored = await storeFile(req.file, 'avatar');
    const url = `/api/media/${stored.id}`;
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarPhotoUrl: url },
    });
    res.json({ avatar_photo_url: url });
  }),
);

// ─── DELETE /api/users/me/avatar ───────────────────────────────────────────

apiRouter.delete(
  '/users/me/avatar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'err_auth_required' });
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarPhotoUrl: null },
    });
    res.json({ avatar_photo_url: null });
  }),
);

// ─── GET /api/media/:fileId ─────────────────────────────────────────────────
//
// uploaded_files tablosundan bayt servis eder. HTTP Range destekli (video seek).

apiRouter.get(
  '/media/:fileId',
  asyncHandler(async (req, res) => {
    const fileId = parseInt(req.params.fileId, 10);
    if (!Number.isFinite(fileId)) return res.status(404).end();

    const uf = await prisma.uploadedFile.findUnique({ where: { id: fileId } });
    if (!uf) return res.status(404).end();

    const buf = uf.data || Buffer.alloc(0);
    const total = buf.length;
    const contentType = uf.contentType || 'application/octet-stream';
    const safeName = (uf.filename || 'file').replace(/"/g, '');

    const rangeHeader = req.headers.range;
    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      let [startStr, endStr] = rangeHeader.slice(6).split('-');
      let start = startStr ? parseInt(startStr, 10) : 0;
      let end = endStr ? parseInt(endStr, 10) : total - 1;
      if (!Number.isFinite(start)) start = 0;
      if (!Number.isFinite(end)) end = total - 1;
      start = Math.max(0, start);
      end = Math.min(end, total - 1);
      if (start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }
      const chunk = buf.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(chunk.length));
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=2592000');
      return res.end(chunk);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Content-Length', String(total));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.end(buf);
  }),
);
