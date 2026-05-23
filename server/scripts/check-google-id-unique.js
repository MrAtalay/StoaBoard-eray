// users.google_id sütununda gerçekten unique constraint var mı?
import { prisma } from '../src/db.js';

const rows = await prisma.$queryRaw`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'users'
`;
console.log(rows);

await prisma.$disconnect();
