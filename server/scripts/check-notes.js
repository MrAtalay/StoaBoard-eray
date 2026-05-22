// Son eklenen notları kontrol et.
import { prisma } from '../src/db.js';

const notes = await prisma.note.findMany({
  orderBy: { createdAt: 'desc' },
  take: 10,
  include: { author: { select: { slug: true, email: true } } },
});

console.log(`Son ${notes.length} not:`);
for (const n of notes) {
  console.log(`  id=${n.id} ws=${n.workspaceId} author=${n.author?.slug || '?'} title="${n.title}" visibility=${n.visibility} archived=${n.archived} created=${n.createdAt?.toISOString() || '?'}`);
}

await prisma.$disconnect();
