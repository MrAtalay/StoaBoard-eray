// Python karşılığı: api.py içindeki _delete_project_tree, _parse_date,
// _next_position, _log_activity ile aynı semantik.

import { prisma } from '../db.js';

/**
 * Project'i ve bağlı tüm kayıtları sil. Transaction'da çağrılmalı.
 * Python _delete_project_tree karşılığı.
 */
export async function deleteProjectTree(tx, projectId) {
  const tasks = await tx.task.findMany({
    where: { projectId },
    select: { id: true },
  });
  const taskIds = tasks.map((t) => t.id);

  if (taskIds.length) {
    await tx.taskAttachment.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.taskAssignee.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.taskLabel.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.subtask.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.comment.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.noteLinkedTask.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.task.deleteMany({ where: { id: { in: taskIds } } });
  }

  await tx.label.deleteMany({ where: { projectId } });
  await tx.boardColumn.deleteMany({ where: { projectId } });
  await tx.activityLog.deleteMany({ where: { projectId } });
  await tx.project.delete({ where: { id: projectId } });
}

/**
 * 'YYYY-MM-DD' stringini Date'e çevir; geçersizse null.
 * Python _parse_date karşılığı.
 */
export function parseDate(val) {
  if (!val) return null;
  // ISO date format: 'YYYY-MM-DD'
  if (typeof val !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val.trim());
  if (!m) return null;
  const d = new Date(`${val}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Belirli kolondaki bir sonraki task position'ı. Python _next_position karşılığı.
 */
export async function nextTaskPosition(projectId, columnId) {
  const last = await prisma.task.findFirst({
    where: { projectId, columnId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return last ? (last.position || 0) + 1 : 0;
}

/**
 * Aktivite log'u ekle (transaction yok — caller transaction içinden de çağırabilir).
 * Python _log_activity karşılığı.
 */
export async function logActivity(client, projectId, userId, text) {
  return client.activityLog.create({
    data: { projectId, userId, text },
  });
}
