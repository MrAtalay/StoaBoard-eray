// Python karşılığı: app/__init__.py içindeki `db = SQLAlchemy()`
//
// Prisma Client tek bir global instance olarak yaşar; her route içinden
// `import { prisma } from '../db.js'` ile erişilir. Bağlantı havuzunu
// Prisma kendisi yönetir.

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['error', 'warn'],
});

// Server başlangıcında DB bağlantısını ısıt — Neon serverless'da ilk sorgu
// 1-2 sn cold start yapar, warmup ile bu maliyet boot zamanına kayar.
prisma
  .$queryRaw`SELECT 1`
  .then(() => console.log('[db] warmup ok'))
  .catch((e) => console.warn('[db] warmup failed:', e.message));

// Graceful shutdown — Ctrl+C ile DB bağlantılarını kapat
async function shutdown() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
