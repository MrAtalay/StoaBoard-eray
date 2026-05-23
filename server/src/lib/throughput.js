// Son 7 günün her günü için board üzerindeki kolonlara kaç task taşındı?
// ActivityLog içindeki 'task_moved' JSON event'lerini parse eder.
// Dönüş: [{ date: 'YYYY-MM-DD', cols: { [colSlug]: count } }, ...]

import { prisma } from '../db.js';

export async function throughputForProject(projectId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const cols = await prisma.boardColumn.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
  });

  const colSlugs = cols.map(c => c.slug);

  // title/title_tr → slug eşleşmesi
  const titleToSlug = new Map();
  for (const c of cols) {
    for (const t of [c.title, c.titleTr]) {
      const key = (t || '').trim().toLowerCase();
      if (key) titleToSlug.set(key, c.slug);
    }
  }

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
    } catch { colTitle = ''; }

    const slug = titleToSlug.get(colTitle);
    if (!slug) continue;

    const day = new Date(log.createdAt).toISOString().slice(0, 10);
    if (!daily.has(day)) {
      const bucket = {};
      for (const s of colSlugs) bucket[s] = 0;
      daily.set(day, bucket);
    }
    daily.get(day)[slug] = (daily.get(day)[slug] || 0) + 1;
  }

  const emptyDay = () => {
    const b = {};
    for (const s of colSlugs) b[s] = 0;
    return b;
  };

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    return { date: dateStr, cols: daily.get(dateStr) || emptyDay() };
  });
}
