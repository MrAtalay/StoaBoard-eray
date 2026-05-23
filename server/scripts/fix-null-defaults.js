// Notes tablosundaki NULL default sütunlarını doğru değerlerle doldur.
// Idempotent — tekrar tekrar çalıştırılabilir.
import { prisma } from '../src/db.js';

const r1 = await prisma.note.updateMany({
  where: { archived: null },
  data: { archived: false },
});
const r2 = await prisma.note.updateMany({
  where: { pinned: null },
  data: { pinned: false },
});
const r3 = await prisma.note.updateMany({
  where: { visibility: null },
  data: { visibility: 'private' },
});
const r4 = await prisma.note.updateMany({
  where: { status: null },
  data: { status: 'draft' },
});

console.log(`Düzeltildi: archived=${r1.count}, pinned=${r2.count}, visibility=${r3.count}, status=${r4.count}`);

await prisma.$disconnect();
