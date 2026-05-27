// Python karşılığı: app/routes/api.py'deki task/subtask/comment endpoint'leri
//
//   GET    /api/projects/:projectId/tasks         list project tasks
//   POST   /api/projects/:projectId/tasks         create task (+ assignees, labels, notif)
//   GET    /api/tasks/:taskId                     task detail
//   PATCH  /api/tasks/:taskId                     update task (column move, assignees, labels)
//   DELETE /api/tasks/:taskId                     delete task (cascades)
//
//   GET    /api/tasks/:taskId/subtasks            list
//   POST   /api/tasks/:taskId/subtasks            add
//   PATCH  /api/subtasks/:subtaskId               update + auto progress
//   DELETE /api/subtasks/:subtaskId               delete
//
//   GET    /api/tasks/:taskId/comments            list
//   POST   /api/tasks/:taskId/comments            add (+ assignee/mention notifs)
//   DELETE /api/comments/:commentId               delete (own only)

import { Router } from 'express';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import { memberForWorkspace, hasPermission } from '../lib/workspace.js';
import {
  taskToDict,
  taskToDetailDict,
  subtaskToDict,
  commentToDict,
} from '../lib/serializers.js';
import {
  parseDate,
  nextTaskPosition,
  logActivity,
} from '../lib/projects.js';
import { buildNotificationText, createAndPush } from '../lib/notifications.js';

export const projectTasksRouter = Router({ mergeParams: true }); // /projects/:projectId/tasks
export const tasksRouter = Router();         // /tasks/:taskId
export const subtasksRouter = Router();      // /subtasks/:subtaskId
export const commentsRouter = Router();      // /comments/:commentId

// Task'ın detail için full include
const TASK_FULL_INCLUDE = {
  column: true,
  creator: true,
  assignees: { include: { user: true } },
  labelLinks: { include: { label: true } },
  subtasks: { orderBy: { position: 'asc' } },
  comments: { include: { user: true }, orderBy: { createdAt: 'asc' } },
};

// Task list için hafif include (taskToDict yeterli alır)
const TASK_LIST_INCLUDE = {
  column: true,
  creator: true,
  assignees: { include: { user: true } },
  labelLinks: { include: { label: true } },
  subtasks: true,
  comments: { select: { id: true } },
};

async function loadUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

/**
 * Task'ı yükle ve workspace erişim/izin kontrolü yap.
 * `permission` verilirse manage_tasks gibi izin gerektirir; verilmezse sadece üye olmak yeter.
 */
async function loadTaskWithAccess(req, res, taskId, { permission = null, include = null } = {}) {
  const user = await loadUser(req);
  if (!user) {
    res.status(401).json({ error: 'err_auth_required' });
    return { denied: true };
  }
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: include || TASK_LIST_INCLUDE,
  });
  if (!task) {
    res.status(404).json({ error: 'Görev bulunamadı' });
    return { denied: true };
  }
  const project = await prisma.project.findUnique({
    where: { id: task.projectId },
  });
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
  return { denied: false, user, task, project, member };
}

// ─── GET /projects/:projectId/tasks ────────────────────────────────────────

projectTasksRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const projectId = parseInt(req.params.projectId, 10);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });
    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!member) return res.status(403).json({ error: 'Bu projeye erişiminiz yok' });

    const tasks = await prisma.task.findMany({
      where: { projectId, deletedAt: null },
      include: TASK_LIST_INCLUDE,
      orderBy: { position: 'asc' },
    });
    res.json(tasks.map(taskToDict));
  }),
);

// ─── POST /projects/:projectId/tasks ───────────────────────────────────────

projectTasksRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const projectId = parseInt(req.params.projectId, 10);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });

    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!hasPermission(member, 'manage_tasks')) {
      return res.status(403).json({ error: 'Görev oluşturma yetkiniz yok' });
    }

    const data = req.body || {};
    const title = (data.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Başlık zorunludur' });

    const colSlug = data.col || 'todo';
    let col = project.columns.find((c) => c.slug === colSlug);
    if (!col) col = project.columns[0] || null;

    const position = await nextTaskPosition(projectId, col?.id || null);

    const io = req.app.get('io');

    const created = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          columnId: col?.id || null,
          projectId,
          title,
          description: data.desc || data.description || '',
          priority: data.priority || 'mid',
          progress: 0,
          dueDate: parseDate(data.due),
          startDate: parseDate(data.start),
          assigneeDates: data.assignee_dates || null,
          createdBy: user.id,
          position,
        },
      });

      // Etiketler
      for (const slug of data.labels || []) {
        const label = await tx.label.findFirst({ where: { projectId, slug } });
        if (label) {
          await tx.taskLabel.create({
            data: { taskId: task.id, labelId: label.id },
          });
        }
      }

      // Atamalar
      const notifsToPush = [];
      for (const userSlug of data.assignees || []) {
        const assignee = await tx.user.findUnique({ where: { slug: userSlug } });
        if (!assignee) continue;
        await tx.taskAssignee.create({
          data: { taskId: task.id, userId: assignee.id },
        });
        if (assignee.id !== user.id) {
          notifsToPush.push({
            userId: assignee.id,
            text: buildNotificationText('task_assigned', {
              task: title,
              who: user.name,
            }),
            senderSlug: user.slug,
            workspaceId: project.workspaceId,
            taskId: task.id,
          });
        }
      }

      await logActivity(
        tx,
        projectId,
        user.id,
        buildNotificationText('task_created', { title }),
      );

      return { task, notifsToPush };
    });

    // Notifs transaction dışında, çünkü createAndPush io.emit yapıyor.
    for (const n of created.notifsToPush) {
      await createAndPush(io, n);
    }

    // Tam veri (assignee + label join) yeniden çek
    const full = await prisma.task.findUnique({
      where: { id: created.task.id },
      include: TASK_LIST_INCLUDE,
    });
    res.status(201).json(taskToDict(full));
  }),
);

// ─── GET /tasks/:taskId ────────────────────────────────────────────────────

tasksRouter.get(
  '/:taskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, {
      include: TASK_FULL_INCLUDE,
    });
    if (access.denied) return;
    res.json(taskToDetailDict(access.task));
  }),
);

// ─── PATCH /tasks/:taskId ──────────────────────────────────────────────────

tasksRouter.patch(
  '/:taskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, {
      permission: 'manage_tasks',
    });
    if (access.denied) return;

    const { user, task, project } = access;
    const data = req.body || {};
    const updates = {};

    if (typeof data.title === 'string') {
      const t = data.title.trim();
      if (t) updates.title = t;
    }
    if ('desc' in data || 'description' in data) {
      updates.description = data.desc ?? data.description ?? '';
    }
    if ('priority' in data) updates.priority = data.priority;
    if ('progress' in data) updates.progress = parseInt(data.progress, 10) || 0;
    if ('due' in data) updates.dueDate = parseDate(data.due);
    if ('start' in data) updates.startDate = parseDate(data.start);
    if ('assignee_dates' in data) {
      updates.assigneeDates = data.assignee_dates || null;
    }

    if ('doc' in data) {
      if (Array.isArray(data.doc)) {
        updates.doc = data.doc;
        // description'ı doc'taki text bloklarından senkronize et
        const textParts = data.doc
          .filter((b) => ['p', 'h1', 'h2', 'h3'].includes(b?.kind) && b?.text)
          .map((b) => b.text);
        updates.description = textParts.join(' ').slice(0, 1000);
      } else {
        updates.doc = null;
      }
    }

    // Column move (+ aktivite log + is_done ise progress=100)
    let movedActivity = null;
    if ('col' in data) {
      const newCol = await prisma.boardColumn.findFirst({
        where: { projectId: task.projectId, slug: data.col },
      });
      if (newCol && newCol.id !== task.columnId) {
        updates.columnId = newCol.id;
        if (newCol.isDone) updates.progress = 100;
        movedActivity = buildNotificationText('task_moved', {
          task: data.title?.trim() || task.title,
          col: newCol.titleTr || newCol.title,
        });
      }
    }

    const io = req.app.get('io');
    const notifsToPush = [];

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updates).length) {
        await tx.task.update({ where: { id: taskId }, data: updates });
      }

      if (Array.isArray(data.labels)) {
        await tx.taskLabel.deleteMany({ where: { taskId } });
        for (const slug of data.labels) {
          const label = await tx.label.findFirst({
            where: { projectId: task.projectId, slug },
          });
          if (label) {
            await tx.taskLabel.create({
              data: { taskId, labelId: label.id },
            });
          }
        }
      }

      if (Array.isArray(data.assignees)) {
        const oldIds = new Set(task.assignees.map((a) => a.userId));
        await tx.taskAssignee.deleteMany({ where: { taskId } });
        const newIds = new Set();
        for (const slug of data.assignees) {
          const u = await tx.user.findUnique({ where: { slug } });
          if (!u) continue;
          await tx.taskAssignee.create({
            data: { taskId, userId: u.id },
          });
          newIds.add(u.id);
        }
        for (const newId of newIds) {
          if (!oldIds.has(newId) && newId !== user.id) {
            notifsToPush.push({
              userId: newId,
              text: buildNotificationText('task_assigned', {
                task: updates.title || task.title,
                who: user.name,
              }),
              taskId,
              senderSlug: user.slug,
              workspaceId: project.workspaceId,
            });
          }
        }
      }

      if (movedActivity) {
        await logActivity(tx, task.projectId, user.id, movedActivity);
      }
    });

    for (const n of notifsToPush) await createAndPush(io, n);

    const updated = await prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_LIST_INCLUDE,
    });
    res.json(taskToDict(updated));
  }),
);

// ─── DELETE /tasks/:taskId — soft delete ────────────────────────────────────

tasksRouter.delete(
  '/:taskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, { permission: 'manage_tasks' });
    if (access.denied) return;
    await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
    res.json({ ok: true });
  }),
);

// ─── POST /tasks/:taskId/restore ────────────────────────────────────────────

tasksRouter.post(
  '/:taskId/restore',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, { permission: 'manage_tasks' });
    if (access.denied) return;
    await prisma.task.update({ where: { id: taskId }, data: { deletedAt: null } });
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: true, creator: true,
        assignees: { include: { user: true } },
        labelLinks: { include: { label: true } },
        subtasks: true,
        comments: { select: { id: true } },
      },
    });
    res.json(taskToDict(task));
  }),
);

// ─── DELETE /tasks/:taskId/permanent ────────────────────────────────────────

tasksRouter.delete(
  '/:taskId/permanent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, { permission: 'manage_tasks' });
    if (access.denied) return;
    await prisma.$transaction([
      prisma.taskAttachment.deleteMany({ where: { taskId } }),
      prisma.taskAssignee.deleteMany({ where: { taskId } }),
      prisma.taskLabel.deleteMany({ where: { taskId } }),
      prisma.subtask.deleteMany({ where: { taskId } }),
      prisma.comment.deleteMany({ where: { taskId } }),
      prisma.noteLinkedTask.deleteMany({ where: { taskId } }),
      prisma.notification.updateMany({ where: { taskId }, data: { taskId: null } }),
      prisma.task.delete({ where: { id: taskId } }),
    ]);
    res.json({ ok: true });
  }),
);

// ─── GET /tasks/:taskId/subtasks ───────────────────────────────────────────

tasksRouter.get(
  '/:taskId/subtasks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId);
    if (access.denied) return;

    const subs = await prisma.subtask.findMany({
      where: { taskId },
      orderBy: { position: 'asc' },
    });
    res.json(subs.map(subtaskToDict));
  }),
);

// ─── POST /tasks/:taskId/subtasks ──────────────────────────────────────────

tasksRouter.post(
  '/:taskId/subtasks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, {
      permission: 'manage_tasks',
    });
    if (access.denied) return;

    const data = req.body || {};
    const title = (data.title || data.text || '').trim();
    if (!title) return res.status(400).json({ error: 'Başlık zorunludur' });

    const count = await prisma.subtask.count({ where: { taskId } });
    const s = await prisma.subtask.create({
      data: { taskId, title, done: false, position: count },
    });
    res.status(201).json(subtaskToDict(s));
  }),
);

// ─── PATCH /subtasks/:subtaskId ────────────────────────────────────────────

subtasksRouter.patch(
  '/:subtaskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const subtaskId = parseInt(req.params.subtaskId, 10);
    const s = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: true },
    });
    if (!s) return res.status(404).json({ error: 'Alt görev bulunamadı' });
    if (!s.task) return res.status(404).json({ error: 'Task bulunamadı' });

    const project = await prisma.project.findUnique({
      where: { id: s.task.projectId },
    });
    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!hasPermission(member, 'manage_tasks')) {
      return res.status(403).json({ error: 'Alt görev düzenleme yetkiniz yok' });
    }

    const data = req.body || {};
    const updates = {};
    if ('done' in data) updates.done = Boolean(data.done);
    if ('title' in data) updates.title = data.title;

    await prisma.subtask.update({ where: { id: subtaskId }, data: updates });

    // Auto progress: tüm subtask'lerin yüzdesini hesapla
    const allSubs = await prisma.subtask.findMany({
      where: { taskId: s.taskId },
      select: { done: true },
    });
    if (allSubs.length) {
      const done = allSubs.filter((x) => x.done).length;
      const progress = Math.round((done / allSubs.length) * 100);
      await prisma.task.update({
        where: { id: s.taskId },
        data: { progress },
      });
    }

    const updated = await prisma.subtask.findUnique({ where: { id: subtaskId } });
    res.json(subtaskToDict(updated));
  }),
);

// ─── DELETE /subtasks/:subtaskId ───────────────────────────────────────────

subtasksRouter.delete(
  '/:subtaskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const subtaskId = parseInt(req.params.subtaskId, 10);
    const s = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: true },
    });
    if (!s) return res.status(404).json({ error: 'Alt görev bulunamadı' });
    const project = await prisma.project.findUnique({
      where: { id: s.task.projectId },
    });
    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!hasPermission(member, 'manage_tasks')) {
      return res.status(403).json({ error: 'Alt görev silme yetkiniz yok' });
    }
    await prisma.subtask.delete({ where: { id: subtaskId } });
    res.json({ ok: true });
  }),
);

// ─── GET /tasks/:taskId/comments ───────────────────────────────────────────

tasksRouter.get(
  '/:taskId/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId);
    if (access.denied) return;

    const comments = await prisma.comment.findMany({
      where: { taskId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments.map(commentToDict));
  }),
);

// ─── POST /tasks/:taskId/comments ──────────────────────────────────────────

const MENTION_RE = /@([\wçğışöüÇĞİŞÖÜ]+)/g;

tasksRouter.post(
  '/:taskId/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, {
      include: TASK_FULL_INCLUDE,
    });
    if (access.denied) return;
    const { user, task, project } = access;

    const data = req.body || {};
    const text = (data.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Yorum metni zorunludur' });

    const io = req.app.get('io');
    const notifsToPush = [];
    const notified = new Set();

    // Assignee bildirimleri
    for (const ta of task.assignees) {
      if (ta.userId !== user.id) {
        notifsToPush.push({
          userId: ta.userId,
          text: buildNotificationText('comment_added', {
            who: user.name,
            preview: text.slice(0, 80),
          }),
          taskId,
          senderSlug: user.slug,
          workspaceId: project.workspaceId,
        });
        notified.add(ta.userId);
      }
    }

    // @mention parse
    const mentions = [...text.matchAll(MENTION_RE)].map((m) => m[1]);
    for (const fname of mentions) {
      const mentioned = await prisma.user.findFirst({
        where: { name: { startsWith: fname, mode: 'insensitive' } },
      });
      if (mentioned && mentioned.id !== user.id && !notified.has(mentioned.id)) {
        notifsToPush.push({
          userId: mentioned.id,
          text: `<strong>${user.name}</strong> seni bir görev yorumunda bahsetti: ${text.slice(0, 80)}`,
          taskId,
          senderSlug: user.slug,
          workspaceId: project.workspaceId,
        });
        notified.add(mentioned.id);
      }
    }

    const comment = await prisma.comment.create({
      data: { taskId, userId: user.id, text },
      include: { user: true },
    });

    for (const n of notifsToPush) await createAndPush(io, n);

    res.status(201).json(commentToDict(comment));
  }),
);

// ─── DELETE /comments/:commentId ───────────────────────────────────────────

commentsRouter.delete(
  '/:commentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const commentId = parseInt(req.params.commentId, 10);
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return res.status(404).json({ error: 'Yorum bulunamadı' });
    if (comment.userId !== user.id) {
      return res.status(403).json({ error: 'Yetkisiz işlem' });
    }
    await prisma.comment.delete({ where: { id: commentId } });
    res.json({ ok: true });
  }),
);
