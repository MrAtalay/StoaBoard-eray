// Son chat mesajlarını kontrol et — channel field'ı doğru kaydediliyor mu?
import { prisma } from '../src/db.js';

const msgs = await prisma.chatMessage.findMany({
  orderBy: { createdAt: 'desc' },
  take: 15,
  include: {
    sender: { select: { slug: true } },
    receiver: { select: { slug: true } },
  },
});

console.log(`Son ${msgs.length} mesaj:`);
for (const m of msgs) {
  const tag = m.receiverId
    ? `DM ${m.sender?.slug} → ${m.receiver?.slug}`
    : `CH ${m.channel || '(null)'}`;
  const preview = (m.text || (m.fileUrl ? '[file]' : '')).slice(0, 30);
  console.log(`  id=${m.id} ws=${m.workspaceId} [${tag}] "${preview}"`);
}

await prisma.$disconnect();
