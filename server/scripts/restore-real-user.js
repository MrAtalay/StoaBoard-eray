// find-real-user.js'in geri alma adımı.
// Eray Atalay'ın orijinal hash'ini geri yazar.
import { prisma } from '../src/db.js';

const ORIGINAL_HASH =
  'scrypt:32768:8:1$QFUkb0yA0k4pN2mV$aca80977ff043207da6b569d708fee8cc15d8043da596d2be4c9c0e050abb348b164d6c9cc6e2ab8609d77dbe7d436468763446eab461d137ea385539418f179';
const ORIGINAL_AVATAR =
  'https://lh3.googleusercontent.com/a/ACg8ocKccqhD-Eivt2okKfSkQH2Ul9TKHShyxJl3xTMEk1AH2J1b2bkq=s96-c';

await prisma.user.update({
  where: { id: 2 },
  data: {
    passwordHash: ORIGINAL_HASH,
    avatarPhotoUrl: ORIGINAL_AVATAR,
    awayTimeout: 15,
    status: 'online',
  },
});

// Test kullanıcısını da temizle
await prisma.user.deleteMany({ where: { email: 'bootstrap-test@example.com' } });

console.log('Restored eray-atalay original hash, avatar, away_timeout, status.');
console.log('Deleted bootstrap-test user.');
await prisma.$disconnect();
