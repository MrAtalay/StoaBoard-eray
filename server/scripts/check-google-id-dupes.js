// google_id'de aynı değere sahip birden fazla satır var mı?
import { prisma } from '../src/db.js';

const rows = await prisma.$queryRaw`
  SELECT google_id, COUNT(*) as count
  FROM users
  WHERE google_id IS NOT NULL
  GROUP BY google_id
  HAVING COUNT(*) > 1
`;
console.log('Duplicates:', rows.length === 0 ? 'NONE' : rows);

await prisma.$disconnect();
