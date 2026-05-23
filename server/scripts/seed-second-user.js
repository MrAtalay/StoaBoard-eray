// Ikinci test kullanıcısı: join request testi için.
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { uniqueSlug } from '../src/lib/user.js';

const email = 'joiner-test@example.com';
const password = 'joiner-pass-1234';

let user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  user = await prisma.user.create({
    data: {
      slug: await uniqueSlug('Joiner Test'),
      name: 'Joiner Test',
      email,
      avatarInitials: 'JT',
      avatarColor: 'oklch(55% 0.09 230)',
      roleTitle: 'Üye',
      passwordHash: hashPassword(password),
    },
  });
} else {
  user = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password) },
  });
}
console.log(JSON.stringify({ email, password, id: user.id, slug: user.slug }));
await prisma.$disconnect();
