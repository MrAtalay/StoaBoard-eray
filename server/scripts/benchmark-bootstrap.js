// Bootstrap'taki sorgu sürelerini parçalara ayır.
import { prisma } from '../src/db.js';
import { listAccessibleChannels, userCanCreateChannel } from '../src/lib/channels.js';
import { countVisibleNotes } from '../src/lib/notes.js';
import { throughputForProject } from '../src/lib/throughput.js';

const user = await prisma.user.findUnique({ where: { id: 1 } }); // efe-kapan
console.log('User:', user.email, 'ws:', user.currentWorkspaceId);

async function time(label, fn) {
  const t0 = performance.now();
  const r = await fn();
  const ms = (performance.now() - t0).toFixed(1);
  console.log(`  ${ms}ms`.padStart(10), label);
  return r;
}

console.log('\n=== Sequential timing ===');
const t0 = performance.now();

const member = await time('workspaceMember (current)', () =>
  prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: user.currentWorkspaceId, userId: user.id } },
    include: { workspaceRole: true },
  }),
);

const allMemberships = await time('all memberships', () =>
  prisma.workspaceMember.findMany({ where: { userId: user.id }, include: { workspace: true } }),
);

const ws = await time('workspace + roles', () =>
  prisma.workspace.findUnique({ where: { id: member.workspaceId }, include: { roles: true } }),
);

const wsMembers = await time('workspace members', () =>
  prisma.workspaceMember.findMany({
    where: { workspaceId: member.workspaceId },
    include: { user: true, workspaceRole: true },
  }),
);

const projects = await time('projects', () =>
  prisma.project.findMany({ where: { workspaceId: member.workspaceId } }),
);

const channels = await time('channels + lastMessage', () => listAccessibleChannels(user));
const canCreate = await time('canCreateChannel', () => userCanCreateChannel(user, member.workspaceId));
const notesCount = await time('notesCount', () => countVisibleNotes(user, member.workspaceId));

// Project-level
if (projects.length) {
  const project = projects[0];
  await time('columns', () =>
    prisma.boardColumn.findMany({ where: { projectId: project.id }, orderBy: { position: 'asc' } }),
  );
  await time('labels', () => prisma.label.findMany({ where: { projectId: project.id } }));
  await time('tasks (full include)', () =>
    prisma.task.findMany({
      where: { projectId: project.id },
      include: {
        column: true,
        creator: true,
        assignees: { include: { user: true } },
        labelLinks: { include: { label: true } },
        subtasks: true,
        comments: { select: { id: true } },
      },
    }),
  );
  await time('notifications (30)', () =>
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  );
  await time('activity (10)', () =>
    prisma.activityLog.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
      take: 10,
    }),
  );
  await time('throughput (7 days)', () => throughputForProject(project.id));
}

console.log('\nTOTAL:', ((performance.now() - t0) / 1000).toFixed(2), 's');
await prisma.$disconnect();
