// Test sırasında oluşturulan kullanıcıları temizle.
import { prisma } from '../src/db.js';

const result = await prisma.user.deleteMany({
  where: { email: { startsWith: 'nodetest' } },
});
console.log(`Deleted ${result.count} test users.`);

await prisma.$disconnect();
