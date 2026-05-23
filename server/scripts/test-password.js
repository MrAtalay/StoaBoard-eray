// Hızlı bir round-trip testi: yeni hash üret, verify et.
// Ayrıca mevcut bir hash'i yanlış şifreyle test edip false döndüğünden emin ol.

import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { prisma } from '../src/db.js';

// 1) Round trip
const hash = hashPassword('test1234');
console.log('Generated hash:', hash.slice(0, 50) + '...');
console.log('Verify correct  :', verifyPassword('test1234', hash));
console.log('Verify wrong    :', verifyPassword('wrong', hash));

// 2) Mevcut DB hash'ini yanlış şifreyle test et
const u = await prisma.user.findFirst({ where: { passwordHash: { not: null } } });
if (u) {
  console.log(`\nLive hash for ${u.email}:`);
  console.log('  Verify wrong pw:', verifyPassword('definitelyWrong123', u.passwordHash));
}

await prisma.$disconnect();
