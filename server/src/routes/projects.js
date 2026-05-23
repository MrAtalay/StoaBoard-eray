// Python karşılığı: app/routes/api.py'deki project/column/label endpoint'leri
//
//   GET    /api/projects                                   list workspace projects
//   POST   /api/projects                                   create project
//   PATCH  /api/projects/:projectId                        update project
//   DELETE /api/projects/:projectId                        delete project (cascades)
//
//   GET    /api/projects/:projectId/columns                list columns
//   POST   /api/projects/:projectId/columns                create column
//   POST   /api/projects/:projectId/columns/reorder        reorder
//   PATCH  /api/columns/:colId                             update column
//   DELETE /api/columns/:colId                             delete column (re-home tasks)
//
//   GET    /api/projects/:projectId/labels                 list labels (dict by slug)
//   POST   /api/projects/:projectId/labels                 create label
//   PATCH  /api/projects/:projectId/labels/:slug           update label
//   DELETE /api/projects/:projectId/labels/:slug           delete label

import { Router } from 'express';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import {
  currentMember,
  memberForWorkspace,
  hasPermission,
} from '../lib/workspace.js';
import {
  projectToDict,
  columnToDict,
  labelToDictValue,
  taskToDict,
} from '../lib/serializers.js';
import { buildNotificationText } from '../lib/notifications.js';
import { deleteProjectTree, logActivity } from '../lib/projects.js';

export const projectsRouter = Router();
export const columnsRouter = Router(); // /api/columns/:colId için ayrı mount

// ── Yardımcılar ───────────────────────────────────────────────────────────

async function loadUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

/**
 * Project'i yükle ve workspace erişimini doğrula. denied: response döndürmüş
 * isek o yüzden caller `if (denied) return` yapsın.
 */
async function loadProjectWithAccess(req, res, projectId, { permission = null } = {}) {
  const user = await loadUser(req);
  if (!user) {
    res.status(401).json({ error: 'err_auth_required' });
    return { denied: true };
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    res.status(404).json({ error: 'Proje bulunamadı' });
    return { denied: true };
  }
  const member = await memberForWorkspace(user.id, project.workspaceId);
  if (!member) {
    res.status(403).json({ error: 'Bu projeye erişiminiz yok' });
    return { denied: true };
  }
  if (permission && !hasPermission(member, permission)) {
    res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    return { denied: true };
  }
  return { denied: false, user, project, member };
}

/**
 * Project'i, çağıran kullanıcıya görünür açık-görev sayısıyla serialize et.
 */
async function projectWithOpenCount(p) {
  const doneCols = await prisma.boardColumn.findMany({
    where: { projectId: p.id, isDone: true },
    select: { id: true },
  });
  const doneIds = doneCols.map((c) => c.id);
  const openCount = await prisma.task.count({
    where: {
      projectId: p.id,
      ...(doneIds.length ? { NOT: { columnId: { in: doneIds } } } : {}),
    },
  });
  return projectToDict(p, { openCount });
}

// ─── /api/projects ─────────────────────────────────────────────────────────

projectsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const member = await currentMember(user);
    if (!member) return res.json([]);

    const projects = await prisma.project.findMany({
      where: { workspaceId: member.workspaceId },
    });
    const result = [];
    for (const p of projects) {
      result.push(await projectWithOpenCount(p));
    }
    res.json(result);
  }),
);

projectsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const data = req.body || {};
    const name = (data.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Proje adı zorunludur' });

    const member = await currentMember(user);
    if (!member) return res.status(404).json({ error: 'Çalışma alanı bulunamadı' });
    if (!hasPermission(member, 'manage_projects')) {
      return res.status(403).json({ error: 'Proje oluşturma yetkiniz yok' });
    }

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          workspaceId: member.workspaceId,
          name,
          color: data.color || 'oklch(55% 0.13 25)',
          icon: data.icon || 'folder',
        },
      });

      const defaults = [
        ['backlog', 'Backlog', 'Bekleyen', 'oklch(55% 0.02 250)', 0],
        ['todo', 'To Do', 'Yapılacak', 'oklch(55% 0.09 230)', 1],
        ['doing', 'In Progress', 'Devam Ediyor', 'oklch(65% 0.11 70)', 2],
        ['review', 'In Review', 'İncelemede', 'oklch(58% 0.13 10)', 3],
        ['done', 'Done', 'Tamamlandı', 'oklch(55% 0.09 150)', 4],
      ];
      for (const [slug, title, titleTr, color, pos] of defaults) {
        await tx.boardColumn.create({
          data: { projectId: p.id, slug, title, titleTr, color, position: pos },
        });
      }
      return p;
    });

    res.status(201).json(projectToDict(project, { openCount: 0 }));
  }),
);

projectsRouter.patch(
  '/:projectId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId, {
      permission: 'manage_projects',
    });
    if (access.denied) return;

    const data = req.body || {};
    const updates = {};
    if ('name' in data) updates.name = data.name;
    if ('color' in data) updates.color = data.color;
    if ('icon' in data) updates.icon = data.icon;

    const updated = Object.keys(updates).length
      ? await prisma.project.update({ where: { id: projectId }, data: updates })
      : access.project;
    res.json(await projectWithOpenCount(updated));
  }),
);

projectsRouter.delete(
  '/:projectId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId, {
      permission: 'manage_projects',
    });
    if (access.denied) return;

    await prisma.$transaction(async (tx) => {
      await deleteProjectTree(tx, projectId);
    });
    res.json({ ok: true });
  }),
);

// ─── GET /api/projects/:projectId/trash ────────────────────────────────────

projectsRouter.get(
  '/:projectId/trash',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId);
    if (access.denied) return;
    const tasks = await prisma.task.findMany({
      where: { projectId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: {
        column: true, creator: true,
        assignees: { include: { user: true } },
        labelLinks: { include: { label: true } },
        subtasks: true,
        comments: { select: { id: true } },
      },
    });
    res.json(tasks.map(taskToDict));
  }),
);

// ─── /api/projects/:projectId/columns ──────────────────────────────────────

projectsRouter.get(
  '/:projectId/columns',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId);
    if (access.denied) return;

    const cols = await prisma.boardColumn.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
    });
    res.json(cols.map(columnToDict));
  }),
);

projectsRouter.post(
  '/:projectId/columns',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId, {
      permission: 'manage_projects',
    });
    if (access.denied) return;
    const { user } = access;

    const data = req.body || {};
    const title = (data.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Başlık zorunludur' });

    const last = await prisma.boardColumn.findFirst({
      where: { projectId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const pos = last ? (last.position || 0) + 1 : 0;

    const col = await prisma.$transaction(async (tx) => {
      const created = await tx.boardColumn.create({
        data: {
          projectId,
          slug: title.toLowerCase().replace(/\s+/g, '-'),
          title,
          titleTr: data.title_tr || title,
          color: data.color || 'oklch(55% 0.02 250)',
          position: pos,
          isDone: Boolean(data.is_done),
        },
      });
      await logActivity(
        tx,
        projectId,
        user.id,
        buildNotificationText('column_added', { title }),
      );
      return created;
    });

    res.status(201).json(columnToDict(col));
  }),
);

projectsRouter.post(
  '/:projectId/columns/reorder',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId, {
      permission: 'manage_projects',
    });
    if (access.denied) return;

    const ordered = (req.body || {}).column_ids || [];
    if (!Array.isArray(ordered)) {
      return res.status(400).json({ error: 'column_ids array gerekli' });
    }

    // Tek transaction, parametre güvenli
    await prisma.$transaction(
      ordered.map((colId, idx) =>
        prisma.boardColumn.updateMany({
          where: { id: parseInt(colId, 10), projectId },
          data: { position: idx },
        }),
      ),
    );
    res.json({ ok: true });
  }),
);

// ─── /api/columns/:colId — PATCH / DELETE ─────────────────────────────────

columnsRouter.patch(
  '/:colId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const colId = parseInt(req.params.colId, 10);
    const col = await prisma.boardColumn.findUnique({ where: { id: colId } });
    if (!col) return res.status(404).json({ error: 'Kolon bulunamadı' });

    const project = await prisma.project.findUnique({ where: { id: col.projectId } });
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });

    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!hasPermission(member, 'manage_projects')) {
      return res.status(403).json({ error: 'Kolon düzenleme yetkiniz yok' });
    }

    const data = req.body || {};
    const updates = {};
    if ('title' in data) updates.title = data.title;
    if ('title_tr' in data) updates.titleTr = data.title_tr;
    if ('color' in data) updates.color = data.color;
    if ('is_done' in data) updates.isDone = Boolean(data.is_done);

    const updated = Object.keys(updates).length
      ? await prisma.boardColumn.update({ where: { id: colId }, data: updates })
      : col;
    res.json(columnToDict(updated));
  }),
);

columnsRouter.delete(
  '/:colId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const colId = parseInt(req.params.colId, 10);
    const col = await prisma.boardColumn.findUnique({ where: { id: colId } });
    if (!col) return res.status(404).json({ error: 'Kolon bulunamadı' });

    const project = await prisma.project.findUnique({ where: { id: col.projectId } });
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });

    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!hasPermission(member, 'manage_projects')) {
      return res.status(403).json({ error: 'Kolon silme yetkiniz yok' });
    }

    // Aynı projedeki diğer kolonlardan ilkine task'leri taşı (orphan olmasın);
    // hiçbiri yoksa null'a düşür.
    const fallback = await prisma.boardColumn.findFirst({
      where: { projectId: col.projectId, NOT: { id: colId } },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.task.updateMany({
        where: { columnId: colId },
        data: { columnId: fallback?.id || null },
      }),
      prisma.boardColumn.delete({ where: { id: colId } }),
    ]);

    res.json({ ok: true });
  }),
);

// ─── /api/projects/:projectId/labels ──────────────────────────────────────

projectsRouter.get(
  '/:projectId/labels',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId);
    if (access.denied) return;

    const labels = await prisma.label.findMany({ where: { projectId } });
    const out = {};
    for (const l of labels) out[l.slug] = labelToDictValue(l);
    res.json(out);
  }),
);

projectsRouter.post(
  '/:projectId/labels',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId, {
      permission: 'manage_projects',
    });
    if (access.denied) return;

    const data = req.body || {};
    const slug = (data.slug || '').trim();
    const nameEn = (data.name_en || data.name || '').trim();
    if (!slug || !nameEn) {
      return res.status(400).json({ error: 'slug ve name_en zorunludur' });
    }

    const label = await prisma.label.create({
      data: {
        projectId,
        slug,
        nameEn,
        nameTr: data.name_tr || nameEn,
        colorTone: data.tone || 'blue',
      },
    });
    res.status(201).json({ [label.slug]: labelToDictValue(label) });
  }),
);

projectsRouter.patch(
  '/:projectId/labels/:slug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId, {
      permission: 'manage_projects',
    });
    if (access.denied) return;

    const label = await prisma.label.findFirst({
      where: { projectId, slug: req.params.slug },
    });
    if (!label) return res.status(404).json({ error: 'Etiket bulunamadı' });

    const data = req.body || {};
    const updates = {};
    if (typeof data.name === 'string' && data.name.trim()) {
      const name = data.name.trim();
      updates.nameEn = name;
      updates.nameTr = name;
    }
    if ('tone' in data) updates.colorTone = data.tone;

    const updated = Object.keys(updates).length
      ? await prisma.label.update({ where: { id: label.id }, data: updates })
      : label;
    res.json({ [updated.slug]: labelToDictValue(updated) });
  }),
);

projectsRouter.delete(
  '/:projectId/labels/:slug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId, 10);
    const access = await loadProjectWithAccess(req, res, projectId, {
      permission: 'manage_projects',
    });
    if (access.denied) return;

    const label = await prisma.label.findFirst({
      where: { projectId, slug: req.params.slug },
    });
    if (!label) return res.status(404).json({ error: 'Etiket bulunamadı' });

    await prisma.$transaction([
      prisma.taskLabel.deleteMany({ where: { labelId: label.id } }),
      prisma.label.delete({ where: { id: label.id } }),
    ]);
    res.json({ ok: true });
  }),
);
