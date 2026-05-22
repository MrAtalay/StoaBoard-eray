// Python karşılığı: api.py içindeki _current_member, _resolve_workspace_id,
// _member_permissions, _has_permission, _member_for_workspace,
// _require_workspace_*, _member_to_dict, _user_private_dict
//
// Tüm sorgular Prisma üzerinden, Flask helper'larının semantiği aynen korunur.

import { prisma } from '../db.js';
import { userToDict } from './user.js';

/**
 * Kullanıcının aktif workspace membership'i — current_workspace_id'ye bakar,
 * yoksa ilk membership'i bulup onu set eder. Python _current_member karşılığı.
 */
export async function currentMember(user) {
  if (!user) return null;
  if (user.currentWorkspaceId) {
    const m = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: user.currentWorkspaceId,
          userId: user.id,
        },
      },
      include: { workspaceRole: true },
    });
    if (m) return m;
  }
  const m = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspaceRole: true },
  });
  if (m) {
    await prisma.user.update({
      where: { id: user.id },
      data: { currentWorkspaceId: m.workspaceId },
    });
    user.currentWorkspaceId = m.workspaceId; // local mutation, frontend için
  }
  return m;
}

/**
 * Aktif workspace id'sini döner. Python _resolve_workspace_id karşılığı.
 */
export async function resolveWorkspaceId(user) {
  if (user.currentWorkspaceId) return user.currentWorkspaceId;
  const m = await currentMember(user);
  return m?.workspaceId || null;
}

/**
 * Üyenin sahip olduğu izinler. 'owner' her zaman tam yetkili.
 */
export function memberPermissions(member) {
  if (!member) return [];
  if (member.role === 'owner') {
    return ['manage_tasks', 'manage_projects', 'manage_members'];
  }
  if (member.workspaceRole) {
    return member.workspaceRole.permissions || [];
  }
  return [];
}

export function hasPermission(member, permission) {
  if (!member) return false;
  if (member.role === 'owner') return true;
  return memberPermissions(member).includes(permission);
}

/**
 * Belirli workspace'teki üyelik kaydı.
 */
export function memberForWorkspace(userId, workspaceId) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspaceRole: true },
  });
}

/**
 * Workspace erişimi gerektiren route'larda kullanılır.
 * Erişim yoksa { error, status } döner, varsa { member }.
 *
 * Kullanım:
 *   const access = await requireWorkspaceAccess(userId, wsId);
 *   if (!access.member) return res.status(access.status).json({ error: access.error });
 */
export async function requireWorkspaceAccess(
  userId,
  workspaceId,
  message = 'Bu çalışma alanına erişiminiz yok',
) {
  const member = await memberForWorkspace(userId, workspaceId);
  if (!member) return { member: null, status: 403, error: message };
  return { member, status: 200, error: null };
}

export async function requireWorkspacePermission(
  userId,
  workspaceId,
  permission,
  message = 'Bu işlem için yetkiniz yok',
) {
  const member = await memberForWorkspace(userId, workspaceId);
  if (!hasPermission(member, permission)) {
    return { member: null, status: 403, error: message };
  }
  return { member, status: 200, error: null };
}

/**
 * İki kullanıcının aynı workspace'te üye olup olmadığını sorgular.
 * Python _users_share_workspace karşılığı.
 */
export async function usersShareWorkspace(userAId, userBId, workspaceId) {
  if (!workspaceId) return false;
  const count = await prisma.workspaceMember.count({
    where: {
      workspaceId,
      userId: { in: [userAId, userBId] },
    },
  });
  return count === 2;
}

/**
 * WorkspaceMember kaydını frontend için serialize et (workspace-specific
 * role title ve role meta'sıyla). Python _member_to_dict karşılığı.
 *
 * `wm` join'li gelmeli: { user, workspaceRole }
 */
export function memberToDict(wm) {
  if (!wm?.user) return null;
  const d = userToDict(wm.user);
  d.ws_role = wm.role;
  if (wm.roleTitle) {
    d.role = wm.roleTitle; // workspace-specific override
  }
  if (wm.workspaceRole) {
    d.role_id = wm.roleId;
    d.role_name = wm.workspaceRole.name;
    d.role_color = wm.workspaceRole.color;
    d.role_permissions = wm.workspaceRole.permissions || [];
  }
  return d;
}

/**
 * Kullanıcının kendi profili (email dahil, role membership başlığıyla).
 * Python _user_private_dict karşılığı.
 */
export function userPrivateDict(user, member = null) {
  const d = userToDict(user);
  d.email = user.email;
  if (member?.roleTitle) {
    d.role = member.roleTitle;
  }
  return d;
}
