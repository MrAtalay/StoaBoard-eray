// Workspace owner olan birinin şifresini geçici olarak değiştir.
// beforeHash kullanılarak restore-real-user.js benzeri restore script'i üretir.
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import fs from 'node:fs';

const password = 'temp-c-test-pass';

const owner = await prisma.user.findFirst({
  where: { ownedWorkspaces: { some: {} } },
  include: { ownedWorkspaces: { take: 1 } },
});
if (!owner) {
  console.log('No owner found');
  process.exit(1);
}
const beforeHash = owner.passwordHash;

await prisma.user.update({
  where: { id: owner.id },
  data: { passwordHash: hashPassword(password) },
});

const info = {
  id: owner.id,
  email: owner.email,
  slug: owner.slug,
  workspaceId: owner.ownedWorkspaces[0].id,
  testPassword: password,
  beforeHash,
};
console.log(JSON.stringify(info, null, 2));
// Restore için ayrı dosyaya yaz
fs.writeFileSync(
  new URL('./_restore_owner.json', import.meta.url),
  JSON.stringify(info, null, 2),
);
await prisma.$disconnect();
