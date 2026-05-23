// Python karşılığı: api.py içindeki _user_can_create_channel,
// _list_accessible_channels, _get_channel_or_404, _user_channel_role,
// _can_manage_channel, channel serialization.
//
// Bootstrap için minimum gerekenleri içerir; chat grubunda genişletilecek.

import { prisma } from '../db.js';
import { resolveWorkspaceId } from './workspace.js';

const CHANNEL_SLUG_STRIP = /[^a-z0-9\-_çğıöşü]+/g;

/**
 * Python _slugify_channel karşılığı: lower, allowed harfler/digits/-/_,
 * Turkish karakterleri korur; geri kalan ardışıkları '-' yapar.
 */
export function slugifyChannel(name) {
  const raw = (name || '').trim().toLowerCase();
  return raw.replace(CHANNEL_SLUG_STRIP, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/**
 * Kullanıcının kanaldaki rolü ('owner' | 'admin' | 'member') veya null.
 * Public kanallarda workspace üyesi otomatik 'member'.
 */
export async function userChannelRole(channel, userId) {
  if (!channel) return null;
  const cm = (channel.members || []).find((m) => m.userId === userId);
  if (cm) return cm.role || 'member';
  if (channel.type === 'public' && channel.workspaceId) {
    const wm = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: channel.workspaceId, userId } },
    });
    if (wm) return 'member';
    const ws = await prisma.workspace.findUnique({
      where: { id: channel.workspaceId },
    });
    if (ws?.ownerId === userId) return 'member';
  }
  return null;
}

export function canManageChannel(role) {
  return role === 'owner' || role === 'admin';
}

/**
 * Kanal + bağlı mesajlarını sil. Transaction client al.
 * Python _delete_channel_tree karşılığı.
 */
export async function deleteChannelTree(tx, channel) {
  await tx.chatMessage.deleteMany({
    where: {
      workspaceId: channel.workspaceId,
      receiverId: null,
      channel: channel.slug,
    },
  });
  await tx.channelMember.deleteMany({ where: { channelId: channel.id } });
  await tx.channel.delete({ where: { id: channel.id } });
}

/**
 * Hidden-for alanı string ya da array gelebilir — array'e normalize et.
 */
export function parseHiddenFor(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

/**
 * Channel modelini frontend formatına çevir. Python Channel.to_dict() karşılığı.
 * `channel` { members: ChannelMember[], lastMessage? } şeklinde include edilmiş olmalı.
 *
 * `lastMessage` opsiyonel: { id, text, fileName, createdAt, sender:{slug,name} }
 */
export function channelToDict(channel, { currentUserId = null, includeMembers = false } = {}) {
  const data = {
    id: channel.slug, // frontend slug'ı id olarak kullanıyor
    channel_id: channel.id, // numeric id backend operasyonlar için
    slug: channel.slug,
    name: channel.name,
    description: channel.description || '',
    type: channel.type || 'public',
    icon: channel.icon || (channel.type === 'private' ? 'lock' : 'hash'),
    is_default: Boolean(channel.isDefault),
    created_by: channel.createdBy,
    member_count: channel.members?.length || 0,
  };
  if (currentUserId != null && Array.isArray(channel.members)) {
    const me = channel.members.find((m) => m.userId === currentUserId);
    data.my_role = me?.role || null;
    data.is_member = Boolean(me);
  }
  if (includeMembers && Array.isArray(channel.members)) {
    data.members = channel.members.map((m) => ({
      user_id: m.user?.slug || null,
      user_db_id: m.userId,
      name: m.user?.name || '',
      role: m.role || 'member',
      joined_at: m.joinedAt ? new Date(m.joinedAt).toISOString() : '',
    }));
  }
  if (channel.lastMessage) {
    const lm = channel.lastMessage;
    data.last_message = {
      id: lm.id,
      text: lm.text || '',
      file_name: lm.fileName || null,
      time: lm.createdAt ? new Date(lm.createdAt).toISOString() : '',
      from: lm.sender?.slug || null,
      from_name: lm.sender?.name || '',
    };
  }
  return data;
}

/**
 * Workspace sahibi mi, ya da `manage_channels` / `channel:create` izinli mi.
 * Python _user_can_create_channel karşılığı.
 */
export async function userCanCreateChannel(user, workspaceId) {
  if (!workspaceId) return false;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (ws?.ownerId === user.id) return true;

  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: { workspaceRole: true },
  });
  if (!m) return false;
  if (m.role === 'owner') return true;
  const perms = m.workspaceRole?.permissions;
  if (Array.isArray(perms)) {
    if (perms.includes('manage_channels') || perms.includes('channel:create')) {
      return true;
    }
  }
  return false;
}

/**
 * Kullanıcının görebileceği kanalları döner: aktif workspace'teki tüm public +
 * üye olduğu private kanallar. Default kanal (general) önce, sonra created_at.
 *
 * Python _list_accessible_channels karşılığı.
 */
export async function listAccessibleChannels(user) {
  const wsId = await resolveWorkspaceId(user);
  if (!wsId) return [];

  const pub = await prisma.channel.findMany({
    where: { workspaceId: wsId, type: 'public' },
    include: { members: { include: { user: true } } },
  });

  const privMemberships = await prisma.channelMember.findMany({
    where: { userId: user.id },
    select: { channelId: true },
  });
  const privIds = privMemberships.map((p) => p.channelId);
  const priv = privIds.length
    ? await prisma.channel.findMany({
        where: {
          workspaceId: wsId,
          type: 'private',
          id: { in: privIds },
        },
        include: { members: { include: { user: true } } },
      })
    : [];

  // dedupe by id (public+private kesişebilir teorik olarak)
  const byId = new Map();
  for (const c of [...pub, ...priv]) byId.set(c.id, c);

  // Her kanal için son mesajı tek raw SQL ile çek (DISTINCT ON kanal başına 1).
  // Sender adını workspace members'tan zaten biliyoruz; ekstra join gereksiz.
  const slugs = Array.from(byId.values()).map((c) => c.slug);
  if (slugs.length) {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON (channel)
        channel, id, text, file_name, sender_id, created_at
      FROM chat_messages
      WHERE workspace_id = ${wsId}
        AND receiver_id IS NULL
        AND is_deleted = false
        AND channel = ANY(${slugs}::text[])
      ORDER BY channel, created_at DESC
    `;
    // Sender slugları toplu çek
    const senderIds = [...new Set(rows.map((r) => r.sender_id).filter(Boolean))];
    const senders = senderIds.length
      ? await prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, slug: true, name: true },
        })
      : [];
    const senderById = new Map(senders.map((s) => [s.id, s]));

    for (const r of rows) {
      const c = byId.get(
        // r.channel slug, find channel by slug
        [...byId.values()].find((ch) => ch.slug === r.channel)?.id,
      );
      if (c) {
        const s = senderById.get(r.sender_id);
        c.lastMessage = {
          id: r.id,
          text: r.text,
          fileName: r.file_name,
          createdAt: r.created_at,
          sender: s ? { slug: s.slug, name: s.name } : null,
        };
      }
    }
  }

  // default önce, sonra created_at asc
  return Array.from(byId.values()).sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt;
  });
}
