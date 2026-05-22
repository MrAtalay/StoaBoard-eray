// Python karşılığı: api.py _throughput_for_project
//
// Son 7 günün her günü için board üzerinde "done / review / progress" kategorilerine
// kaç task taşındı? ActivityLog içindeki 'task_moved' JSON event'lerini parse eder.

import { prisma } from '../db.js';

function isReviewColumn(col) {
  const slug = (col.slug || '').toLowerCase();
  const title = (col.title || '').toLowerCase();
  const titleTr = (col.titleTr || '').toLowerCase();
  return slug.includes('review') || title.includes('inceleme') || titleTr.includes('inceleme');
}

export async function throughputForProject(projectId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const cols = await prisma.boardColumn.findMany({
    where: { projectId },
  });

  const titleToCat = new Map();
  for (const c of cols) {
    const cat = c.isDone ? 'done' : isReviewColumn(c) ? 'review' : 'progress';
    for (const t of [c.title, c.titleTr]) {
      const key = (t || '').trim().toLowerCase();
      if (key) titleToCat.set(key, cat);
    }
  }

  // Son 7 günlük task_moved aktiviteleri
  const logs = await prisma.activityLog.findMany({
    where: {
      projectId,
      text: { contains: 'task_moved' },
      createdAt: { gte: weekStart },
    },
    select: { createdAt: true, text: true },
  });

  const daily = new Map();
  for (const log of logs) {
    let colTitle = '';
    try {
      const parsed = JSON.parse(log.text);
      colTitle = (parsed.col || '').trim().toLowerCase();
    } catch {
      colTitle = '';
    }
    const cat = titleToCat.get(colTitle);
    if (!cat) continue;
    const day = new Date(log.createdAt).toISOString().slice(0, 10);
    if (!daily.has(day)) daily.set(day, { done: 0, review: 0, progress: 0 });
    daily.get(day)[cat] += 1;
  }

  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStr = d.toISOString().slice(0, 10);
    const bucket = daily.get(dayStr) || { done: 0, review: 0, progress: 0 };
    result.push({ date: dayStr, done: bucket.done, review: bucket.review, progress: bucket.progress });
  }
  return result;
}
