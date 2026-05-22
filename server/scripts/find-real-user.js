// Workspace üyeliği olan bir kullanıcı bul.
// (Test login için şifresini geçici olarak değiştireceğiz.)
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';

const password = 'temp-test-pass-1234';
const user = await prisma.user.findFirst({
  where: { workspaceMemberships: { some: {} } },
  include: { workspaceMemberships: true },
});

if (!user) {
  console.log('No user with workspace found.');
  process.exit(1);
}

// Önceki hash'i sakla, restore script için
const beforeHash = user.passwordHash;

await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash: hashPassword(password) },
});

console.log(JSON.stringify({
  id: user.id,
  email: user.email,
  slug: user.slug,
  workspaces: user.workspaceMemberships.length,
  currentWorkspaceId: user.currentWorkspaceId,
  testPassword: password,
  beforeHash,
}, null, 2));

await prisma.$disconnect();
