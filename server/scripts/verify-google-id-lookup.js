// Bu, eski hata mesajındaki tam sorgu — şimdi başarılı olmalı.
import { prisma } from '../src/db.js';

const result = await prisma.user.findUnique({
  where: { googleId: '104959296022612432127' },
});
console.log('Found:', result ? `${result.email} (id=${result.id})` : 'no match');

// Mevcut Google kullanıcısı da gerçekten bulunabiliyor mu?
const realOne = await prisma.user.findFirst({
  where: { googleId: { not: null } },
  select: { id: true, email: true, googleId: true },
});
if (realOne) {
  const found = await prisma.user.findUnique({ where: { googleId: realOne.googleId } });
  console.log('Round-trip:', realOne.email, '→', found ? 'OK' : 'FAILED');
}

await prisma.$disconnect();
