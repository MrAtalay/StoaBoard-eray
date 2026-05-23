// setup-owner-for-test.js'in geri alma adımı.
import { prisma } from '../src/db.js';
import fs from 'node:fs';

const info = JSON.parse(
  fs.readFileSync(new URL('./_restore_owner.json', import.meta.url), 'utf8'),
);

await prisma.user.update({
  where: { id: info.id },
  data: { passwordHash: info.beforeHash },
});

console.log(`Restored ${info.email} (id=${info.id}) original password hash.`);
fs.unlinkSync(new URL('./_restore_owner.json', import.meta.url));
await prisma.$disconnect();
