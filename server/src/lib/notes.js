// Python karşılığı: api.py içindeki _visible_notes_query, _can_view_note,
// _can_edit_note ve app/models.py Note.to_dict + _markdown_to_plain.

import { prisma } from '../db.js';
import { memberPermissions } from './workspace.js';

const NOTE_STRIP_RE = /[`>#*_~\[\]]/g;

function markdownToPlain(text) {
  if (!text) return '';
  let s = String(text);
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // links
  s = s.replace(/```[\w-]*/g, '');               // code fence markers
  s = s.replace(NOTE_STRIP_RE, '');
  s = s.replace(/^\s*[-*+]\s+(\[[\sxX]\]\s+)?/gm, ''); // bullet/todo
  s = s.replace(/^\s*\d+\.\s+/gm, '');                  // ordered list
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Python Note.to_dict — body opsiyonel.
 * `note` include: author, collaborators{user}, linkedTasks
 */
export function noteToDict(note, { includeBody = true } = {}) {
  const collabSlugs = (note.collaborators || [])
    .map((c) => c.user?.slug)
    .filter(Boolean);
  const linkedTaskIds = (note.linkedTasks || []).map((lt) => String(lt.taskId));

  const updatedIso = note.updatedAt ? new Date(note.updatedAt).toISOString() : '';
  const createdIso = note.createdAt ? new Date(note.createdAt).toISOString() : '';

  const d = {
    id: note.id,
    title: note.title || '',
    labels: note.labels || [],
    visibility: note.visibility || 'private',
    status: note.status || 'draft',
    pinned: Boolean(note.pinned),
    archived: Boolean(note.archived),
    author: note.author?.slug || null,
    collaborators: collabSlugs,
    linked_tasks: linkedTaskIds,
    workspace_id: note.workspaceId,
    created_at: createdIso,
    updated_at: updatedIso,
    updated_ago: updatedIso,
  };
  if (includeBody) d.body = note.body || '';
  d.preview = markdownToPlain(note.body || '').slice(0, 240);
  return d;
}

/**
 * Note view erişim kontrolü. Python _can_view_note karşılığı.
 */
export function canViewNote(user, note, activeWorkspaceId) {
  if (note.workspaceId !== activeWorkspaceId) {
    // Sadece o workspace'in owner'ı bakabilir
    return note.workspace?.ownerId === user.id;
  }
  if (note.visibility === 'workspace') return true;
  if (note.authorId === user.id) return true;
  const collabIds = (note.collaborators || []).map((c) => c.userId);
  return collabIds.includes(user.id);
}

/**
 * Note edit kontrolü. Python _can_edit_note karşılığı.
 * `member` workspace'teki kullanıcı üyeliği.
 */
export function canEditNote(user, note, member) {
  if (note.authorId === user.id) return true;
  const collabIds = (note.collaborators || []).map((c) => c.userId);
  if (collabIds.includes(user.id)) return true;
  if (note.workspace?.ownerId === user.id) return true;
  if (member && memberPermissions(member).includes('manage_projects')) return true;
  return false;
}

/**
 * Kullanıcının görebileceği workspace notlarını sayar:
 *  - workspace visibility'li tüm notlar
 *  - private + author kullanıcı kendisi
 *  - private + kullanıcı collaborator
 *
 * Python _visible_notes_query(...).count() karşılığı.
 */
export async function countVisibleNotes(user, workspaceId, { includeArchived = false } = {}) {
  if (!workspaceId) return 0;

  const collabRows = await prisma.noteCollaborator.findMany({
    where: { userId: user.id },
    select: { noteId: true },
  });
  const collabIds = collabRows.map((c) => c.noteId);

  const where = visibleNotesWhere(user.id, workspaceId, collabIds, includeArchived);
  try {
    return await prisma.note.count({ where });
  } catch {
    return 0;
  }
}

/**
 * Python _visible_notes_query'in 'where' bloğu — list ve count tarafından paylaşılır.
 */
export function visibleNotesWhere(userId, workspaceId, collabIds, includeArchived = false) {
  // archived NULL veya false olanları arşivlenmemiş say — eski DB kayıtlarında
  // archived sütunu NULL kalmış olabilir.
  const archivedFilter = includeArchived
    ? {}
    : { OR: [{ archived: false }, { archived: null }] };
  return {
    workspaceId,
    ...archivedFilter,
    AND: [
      {
        OR: [
          { visibility: 'workspace' },
          {
            visibility: 'private',
            OR: [
              { authorId: userId },
              ...(collabIds.length ? [{ id: { in: collabIds } }] : []),
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Slug listesini user.id listesine çevir.
 */
export async function resolveUserIdsFromSlugs(slugs) {
  if (!slugs || !slugs.length) return [];
  const users = await prisma.user.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
