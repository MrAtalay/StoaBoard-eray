// Test için bir kullanıcının şifresini geçici olarak set et.
// Bu script test sonrası tekrar çalıştırılmasın — gerçek kullanıcının şifresi
// değişir. Sadece kalıcı olmayan bir test hesabı oluşturup id'sini yazdır.

import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { uniqueSlug } from '../src/lib/user.js';

const email = 'bootstrap-test@example.com';
const password = 'bootstrap-test-pass';

let user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  user = await prisma.user.create({
    data: {
      slug: await uniqueSlug('Bootstrap Test'),
      name: 'Bootstrap Test',
      email,
      avatarInitials: 'BT',
      avatarColor: 'oklch(55% 0.13 25)',
      roleTitle: 'Üye',
      passwordHash: hashPassword(password),
    },
  });
  console.log('Created test user:', user.email);
} else {
  user = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password) },
  });
  console.log('Updated test user password:', user.email);
}

console.log(JSON.stringify({ email, password, id: user.id, slug: user.slug }));
await prisma.$disconnect();
