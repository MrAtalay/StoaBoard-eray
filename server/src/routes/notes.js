// Python karşılığı: api.py'deki note + linked-task + workspace tasks endpoints
//
//   GET    /api/notes                        list (sıralı: pinned, updated desc)
//   GET    /api/notes/count                  badge için sayı
//   POST   /api/notes                        create (+ collaborators)
//   GET    /api/notes/:id                    detail
//   PATCH  /api/notes/:id                    update (+ collaborator senkronu)
//   DELETE /api/notes/:id                    delete (+ socket bildirimi)
//   POST   /api/notes/:id/link-task          görevle ilişkilendir
//   DELETE /api/notes/:id/link-task/:taskId  ilişkiyi kaldır
//
//   GET    /api/workspaces/me/tasks          workspace'teki tüm görevler özet listesi
//   GET    /api/tasks/:taskId/linked-notes   görevle ilişkili notlar

import { Router } from 'express';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import {
  resolveWorkspaceId,
  memberForWorkspace,
} from '../lib/workspace.js';
import {
  noteToDict,
  visibleNotesWhere,
  canViewNote,
  canEditNote,
  countVisibleNotes,
  resolveUserIdsFromSlugs,
} from '../lib/notes.js';

export const notesRouter = Router();
export const meTasksRouter = Router();    // /workspaces/me/tasks
export const taskLinkedNotesRouter = Router(); // /tasks/:taskId/linked-notes

async function loadUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

const NOTE_INCLUDE = {
  author: true,
  collaborators: { include: { user: true } },
  linkedTasks: true,
  workspace: true,
};

function emitNoteEvent(io, event, payload, note, actorSlug) {
  if (!io) return;
  const body = { ...payload, ...(actorSlug ? { actor: actorSlug } : {}) };
  try {
    if (note.visibility === 'workspace') {
      io.to(`ws_${note.workspaceId}`).emit(event, body);
    } else {
      const recipients = new Set(
        (note.collaborators || []).map((c) => c.userId),
      );
      recipients.add(note.authorId);
      if (note.workspace?.ownerId) recipients.add(note.workspace.ownerId);
      for (const uid of recipients) {
        io.to(`user_${uid}`).emit(event, body);
      }
    }
  } catch {}
}

// ─── GET /api/notes ────────────────────────────────────────────────────────

notesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = await resolveWorkspaceId(user);
    if (!wsId) return res.json([]);

    const includeArchived = ['1', 'true', 'yes'].includes(
      String(req.query.archived || '').toLowerCase(),
    );

    const collabRows = await prisma.noteCollaborator.findMany({
      where: { userId: user.id },
      select: { noteId: true },
    });
    const collabIds = collabRows.map((c) => c.noteId);

    const notes = await prisma.note.findMany({
      where: visibleNotesWhere(user.id, wsId, collabIds, includeArchived),
      include: NOTE_INCLUDE,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
    res.json(notes.map((n) => noteToDict(n, { includeBody: false })));
  }),
);

// ─── GET /api/notes/count ──────────────────────────────────────────────────

notesRouter.get(
  '/count',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = await resolveWorkspaceId(user);
    if (!wsId) return res.json({ count: 0 });
    const count = await countVisibleNotes(user, wsId);
    res.json({ count });
  }),
);

// ─── POST /api/notes ───────────────────────────────────────────────────────

notesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = await resolveWorkspaceId(user);
    if (!wsId) return res.status(400).json({ error: 'Aktif çalışma alanı yok' });

    const data = req.body || {};
    const title = ((data.title || 'Başlıksız Not').trim() || 'Başlıksız Not').slice(0, 255);
    const body = data.body || '';
    let visibility = data.visibility || 'private';
    if (!['private', 'workspace'].includes(visibility)) visibility = 'private';

    const collabIds = (await resolveUserIdsFromSlugs(data.collaborators || []))
      .filter((id) => id !== user.id);

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.note.create({
        data: {
          workspaceId: wsId,
          authorId: user.id,
          title,
          body,
          visibility,
          status: data.status || 'draft',
          labels: data.labels || [],
        },
      });
      for (const uid of collabIds) {
        await tx.noteCollaborator.create({
          data: { noteId: created.id, userId: uid },
        });
      }
      return tx.note.findUnique({ where: { id: created.id }, include: NOTE_INCLUDE });
    });

    const payload = noteToDict(note);
    emitNoteEvent(req.app.get('io'), 'note_created', payload, note, user.slug);
    res.status(201).json(payload);
  }),
);

// ─── GET /api/notes/:id ────────────────────────────────────────────────────

notesRouter.get(
  '/:noteId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const noteId = parseInt(req.params.noteId, 10);
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
    const activeWs = await resolveWorkspaceId(user);
    if (!canViewNote(user, note, activeWs)) {
      return res.status(403).json({ error: 'Bu nota erişiminiz yok' });
    }
    res.json(noteToDict(note));
  }),
);

// ─── PATCH /api/notes/:id ──────────────────────────────────────────────────

function sanitizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  const out = [];
  for (const l of labels) {
    if (l && typeof l === 'object' && l.name) {
      out.push({
        name: String(l.name).slice(0, 60),
        tone: String(l.tone || 'blue').slice(0, 40),
      });
    } else if (typeof l === 'string') {
      out.push({ name: l.slice(0, 60), tone: 'blue' });
    }
  }
  return out;
}

notesRouter.patch(
  '/:noteId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const noteId = parseInt(req.params.noteId, 10);
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
    const member = await memberForWorkspace(user.id, note.workspaceId);
    if (!canEditNote(user, note, member)) {
      return res.status(403).json({ error: 'Bu notu düzenleme yetkiniz yok' });
    }

    const data = req.body || {};
    const updates = {};
    if ('title' in data) {
      const t = ((data.title || '').trim() || 'Başlıksız Not').slice(0, 255);
      updates.title = t;
    }
    if ('body' in data) updates.body = data.body || '';
    if ('labels' in data) updates.labels = sanitizeLabels(data.labels);
    if ('visibility' in data && ['private', 'workspace'].includes(data.visibility)) {
      updates.visibility = data.visibility;
    }
    if ('status' in data && ['draft', 'published'].includes(data.status)) {
      updates.status = data.status;
    }
    if ('pinned' in data) updates.pinned = Boolean(data.pinned);
    if ('archived' in data) updates.archived = Boolean(data.archived);

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updates).length) {
        await tx.note.update({ where: { id: noteId }, data: updates });
      }
      if ('collaborators' in data) {
        const wanted = new Set(
          (await resolveUserIdsFromSlugs(data.collaborators || []))
            .filter((id) => id !== user.id),
        );
        await tx.noteCollaborator.deleteMany({ where: { noteId } });
        for (const uid of wanted) {
          await tx.noteCollaborator.create({
            data: { noteId, userId: uid },
          });
        }
      }
    });

    const updated = await prisma.note.findUnique({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    const payload = noteToDict(updated);
    emitNoteEvent(req.app.get('io'), 'note_updated', payload, updated, user.slug);
    res.json(payload);
  }),
);

// ─── GET /api/notes/trash ─────────────────────────────────────────────────

notesRouter.get(
  '/trash',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = await resolveWorkspaceId(user);
    if (!wsId) return res.json([]);

    const collabRows = await prisma.noteCollaborator.findMany({
      where: { userId: user.id },
      select: { noteId: true },
    });
    const collabIds = collabRows.map((c) => c.noteId);

    const notes = await prisma.note.findMany({
      where: {
        workspaceId: wsId,
        deletedAt: { not: null },
        AND: [{
          OR: [
            { visibility: 'workspace' },
            { authorId: user.id },
            ...(collabIds.length ? [{ id: { in: collabIds } }] : []),
          ],
        }],
      },
      include: NOTE_INCLUDE,
      orderBy: { deletedAt: 'desc' },
    });
    res.json(notes.map((n) => noteToDict(n)));
  }),
);

// ─── POST /api/notes/:id/restore ──────────────────────────────────────────

notesRouter.post(
  '/:noteId/restore',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const noteId = parseInt(req.params.noteId, 10);
    const note = await prisma.note.findUnique({ where: { id: noteId }, include: NOTE_INCLUDE });
    if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
    const member = await memberForWorkspace(user.id, note.workspaceId);
    if (!canEditNote(user, note, member)) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }
    const restored = await prisma.note.update({
      where: { id: noteId },
      data: { deletedAt: null },
      include: NOTE_INCLUDE,
    });
    res.json(noteToDict(restored));
  }),
);

// ─── DELETE /api/notes/:id/permanent ──────────────────────────────────────

notesRouter.delete(
  '/:noteId/permanent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const noteId = parseInt(req.params.noteId, 10);
    const note = await prisma.note.findUnique({ where: { id: noteId }, include: NOTE_INCLUDE });
    if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
    const member = await memberForWorkspace(user.id, note.workspaceId);
    if (!canEditNote(user, note, member)) {
      return res.status(403).json({ error: 'Bu notu silme yetkiniz yok' });
    }

    const recipients = new Set((note.collaborators || []).map((c) => c.userId));
    recipients.add(note.authorId);
    if (note.workspace?.ownerId) recipients.add(note.workspace.ownerId);

    await prisma.$transaction([
      prisma.noteLinkedTask.deleteMany({ where: { noteId } }),
      prisma.noteCollaborator.deleteMany({ where: { noteId } }),
      prisma.note.delete({ where: { id: noteId } }),
    ]);

    const io = req.app.get('io');
    if (io) {
      const evtPayload = { id: note.id, workspace_id: note.workspaceId, visibility: note.visibility, actor: user.slug };
      try {
        if (note.visibility === 'workspace') {
          io.to(`ws_${note.workspaceId}`).emit('note_deleted', evtPayload);
        } else {
          for (const uid of recipients) io.to(`user_${uid}`).emit('note_deleted', evtPayload);
        }
      } catch {}
    }
    res.json({ ok: true });
  }),
);

// ─── DELETE /api/notes/:id ─────────────────────────────────────────────────

notesRouter.delete(
  '/:noteId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const noteId = parseInt(req.params.noteId, 10);
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
    const member = await memberForWorkspace(user.id, note.workspaceId);
    if (!canEditNote(user, note, member)) {
      return res.status(403).json({ error: 'Bu notu silme yetkiniz yok' });
    }

    await prisma.note.update({ where: { id: noteId }, data: { deletedAt: new Date() } });

    const io = req.app.get('io');
    const evtPayload = { id: note.id, workspace_id: note.workspaceId, visibility: note.visibility, actor: user.slug };
    if (io) {
      try {
        const recipients = new Set((note.collaborators || []).map((c) => c.userId));
        recipients.add(note.authorId);
        if (note.workspace?.ownerId) recipients.add(note.workspace.ownerId);
        if (note.visibility === 'workspace') {
          io.to(`ws_${note.workspaceId}`).emit('note_deleted', evtPayload);
        } else {
          for (const uid of recipients) io.to(`user_${uid}`).emit('note_deleted', evtPayload);
        }
      } catch {}
    }
    res.json({ ok: true });
  }),
);

// ─── POST /api/notes/:id/link-task ─────────────────────────────────────────

notesRouter.post(
  '/:noteId/link-task',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const noteId = parseInt(req.params.noteId, 10);
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
    const member = await memberForWorkspace(user.id, note.workspaceId);
    if (!canEditNote(user, note, member)) {
      return res.status(403).json({ error: 'Bu notu düzenleme yetkiniz yok' });
    }

    const taskId = parseInt(req.body?.task_id, 10);
    if (!Number.isFinite(taskId)) {
      return res.status(400).json({ error: 'task_id gerekli' });
    }
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });
    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
    });
    if (!project || project.workspaceId !== note.workspaceId) {
      return res.status(400).json({ error: 'Bu görev bu çalışma alanına ait değil' });
    }

    const existing = await prisma.noteLinkedTask.findUnique({
      where: { noteId_taskId: { noteId, taskId } },
    });
    if (!existing) {
      await prisma.noteLinkedTask.create({ data: { noteId, taskId } });
    }

    const updated = await prisma.note.findUnique({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    const payload = noteToDict(updated);
    emitNoteEvent(req.app.get('io'), 'note_updated', payload, updated, user.slug);
    res.json(payload);
  }),
);

// ─── DELETE /api/notes/:id/link-task/:taskId ──────────────────────────────

notesRouter.delete(
  '/:noteId/link-task/:taskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const noteId = parseInt(req.params.noteId, 10);
    const taskId = parseInt(req.params.taskId, 10);
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
    const member = await memberForWorkspace(user.id, note.workspaceId);
    if (!canEditNote(user, note, member)) {
      return res.status(403).json({ error: 'Bu notu düzenleme yetkiniz yok' });
    }
    await prisma.noteLinkedTask.deleteMany({ where: { noteId, taskId } });
    const updated = await prisma.note.findUnique({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    const payload = noteToDict(updated);
    emitNoteEvent(req.app.get('io'), 'note_updated', payload, updated, user.slug);
    res.json(payload);
  }),
);

// ─── GET /api/workspaces/me/tasks — hafif liste (Notes link picker için) ──

meTasksRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const wsId = await resolveWorkspaceId(user);
    if (!wsId) return res.json([]);

    const rows = await prisma.task.findMany({
      where: { project: { workspaceId: wsId } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        title: true,
        projectId: true,
        project: { select: { name: true } },
        column: { select: { slug: true, titleTr: true } },
      },
    });
    res.json(
      rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        project_id: r.projectId,
        project_name: r.project?.name || '',
        col: r.column?.slug || null,
        col_title: r.column?.titleTr || r.column?.slug || null,
      })),
    );
  }),
);

// ─── GET /api/tasks/:taskId/linked-notes ──────────────────────────────────

taskLinkedNotesRouter.get(
  '/:taskId/linked-notes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const taskId = parseInt(req.params.taskId, 10);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });
    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
    });
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });
    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!member) return res.status(403).json({ error: 'Bu projeye erişiminiz yok' });

    const linkRows = await prisma.noteLinkedTask.findMany({
      where: { taskId },
      select: { noteId: true },
    });
    if (!linkRows.length) return res.json([]);

    const notes = await prisma.note.findMany({
      where: { id: { in: linkRows.map((l) => l.noteId) } },
      include: NOTE_INCLUDE,
    });
    const activeWs = await resolveWorkspaceId(user);
    const visible = notes
      .filter((n) => canViewNote(user, n, activeWs))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    res.json(visible.map((n) => noteToDict(n, { includeBody: false })));
  }),
);
