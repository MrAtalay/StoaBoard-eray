// google_id sütununa unique index ekle. Idempotent (IF NOT EXISTS).
import { prisma } from '../src/db.js';

await prisma.$executeRawUnsafe(
  `CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key ON public.users (google_id)`,
);
console.log('users_google_id_key UNIQUE index ensured.');

await prisma.$disconnect();
