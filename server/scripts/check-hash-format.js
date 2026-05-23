// Mevcut DB'deki şifre hash formatını kontrol et.
// Werkzeug format'ı: "method$salt$hash" veya "scrypt:N:r:p$salt$hash"

import { prisma } from '../src/db.js';

const users = await prisma.user.findMany({
  where: { passwordHash: { not: null } },
  select: { email: true, passwordHash: true },
  take: 3,
});

for (const u of users) {
  const h = u.passwordHash || '';
  const prefix = h.split('$')[0] || h.slice(0, 30);
  console.log(`${u.email.slice(0, 20).padEnd(22)} → format: ${prefix.slice(0, 60)}`);
}

await prisma.$disconnect();
