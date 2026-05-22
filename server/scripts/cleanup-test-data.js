// Test sırasında oluşan tüm geçici kullanıcı ve workspace'leri temizle.
import { prisma } from '../src/db.js';

const TEST_EMAILS = ['bootstrap-test@example.com', 'joiner-test@example.com'];

// Önce test workspace'leri sil — owner'ları test user olanlar.
const testUsers = await prisma.user.findMany({
  where: { email: { in: TEST_EMAILS } },
  select: { id: true, email: true },
});
const testIds = testUsers.map((u) => u.id);

const testWorkspaces = await prisma.workspace.findMany({
  where: { OR: [{ ownerId: { in: testIds } }, { name: { startsWith: 'Node Test' } }] },
  select: { id: true, name: true },
});

for (const ws of testWorkspaces) {
  // Bağımlı kayıtları sil
  await prisma.notification.deleteMany({ where: { workspaceId: ws.id } });
  await prisma.chatMessage.deleteMany({ where: { workspaceId: ws.id } });
  await prisma.workspaceJoinRequest.deleteMany({ where: { workspaceId: ws.id } });
  const channels = await prisma.channel.findMany({
    where: { workspaceId: ws.id },
    select: { id: true },
  });
  if (channels.length) {
    const cIds = channels.map((c) => c.id);
    await prisma.channelMember.deleteMany({ where: { channelId: { in: cIds } } });
    await prisma.channel.deleteMany({ where: { id: { in: cIds } } });
  }
  const projects = await prisma.project.findMany({
    where: { workspaceId: ws.id },
    select: { id: true },
  });
  if (projects.length) {
    const pIds = projects.map((p) => p.id);
    const tasks = await prisma.task.findMany({
      where: { projectId: { in: pIds } },
      select: { id: true },
    });
    const tIds = tasks.map((t) => t.id);
    if (tIds.length) {
      await prisma.taskAttachment.deleteMany({ where: { taskId: { in: tIds } } });
      await prisma.taskLabel.deleteMany({ where: { taskId: { in: tIds } } });
      await prisma.taskAssignee.deleteMany({ where: { taskId: { in: tIds } } });
      await prisma.subtask.deleteMany({ where: { taskId: { in: tIds } } });
      await prisma.comment.deleteMany({ where: { taskId: { in: tIds } } });
      await prisma.task.deleteMany({ where: { id: { in: tIds } } });
    }
    await prisma.label.deleteMany({ where: { projectId: { in: pIds } } });
    await prisma.boardColumn.deleteMany({ where: { projectId: { in: pIds } } });
    await prisma.activityLog.deleteMany({ where: { projectId: { in: pIds } } });
    await prisma.project.deleteMany({ where: { id: { in: pIds } } });
  }
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id } });
  await prisma.workspaceRole.deleteMany({ where: { workspaceId: ws.id } });
  // owner currentWorkspaceId'leri null'la
  await prisma.user.updateMany({
    where: { currentWorkspaceId: ws.id },
    data: { currentWorkspaceId: null },
  });
  await prisma.workspace.delete({ where: { id: ws.id } });
}

// Şimdi test kullanıcılarını sil
for (const u of testUsers) {
  await prisma.workspaceJoinRequest.deleteMany({ where: { userId: u.id } });
  await prisma.workspaceMember.deleteMany({ where: { userId: u.id } });
  await prisma.notification.deleteMany({ where: { userId: u.id } });
  await prisma.user.delete({ where: { id: u.id } });
}

console.log(`Deleted ${testWorkspaces.length} test workspace(s), ${testUsers.length} test user(s).`);
console.log('Workspaces:', testWorkspaces.map((w) => w.name).join(', '));
console.log('Users:', testUsers.map((u) => u.email).join(', '));
await prisma.$disconnect();
