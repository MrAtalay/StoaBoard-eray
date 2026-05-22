// Python karşılığı: app/models.py *.to_dict() metodları
//
// Frontend'in beklediği JSON yapılarını üretir. Tutarlılık için tüm
// serializer'ları tek dosyada topladım — buna ileride task/note/comment için
// to_detail_dict varyantları eklenecek.

/**
 * Python User.to_dict (lib/user.js içinde userToDict olarak da var,
 * burada re-export'a gerek yok).
 */

/**
 * Workspace.to_dict
 */
export function workspaceToDict(ws) {
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    owner_id: ws.ownerId,
    logo_url: ws.logoUrl,
  };
}

/**
 * WorkspaceRole.to_dict
 */
export function workspaceRoleToDict(r) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    permissions: r.permissions || [],
    is_default: r.isDefault,
  };
}

/**
 * Project.to_dict (open count parametre olarak verilir; çağıran toplu sorguyla
 * doldurmalı — bootstrap'ta öyle yapıyoruz).
 */
export function projectToDict(p, { openCount = 0 } = {}) {
  return {
    id: String(p.id),
    name: p.name,
    color: p.color,
    open: openCount,
    icon: p.icon || 'folder',
  };
}

/**
 * BoardColumn.to_dict
 */
export function columnToDict(c) {
  return {
    id: c.slug,
    db_id: c.id,
    title: c.title,
    title_tr: c.titleTr || c.title,
    color: c.color || 'oklch(55% 0.02 250)',
    is_done: Boolean(c.isDone),
  };
}

/**
 * Label.to_dict_value
 */
export function labelToDictValue(l) {
  return {
    en: l.nameEn,
    tr: l.nameTr || l.nameEn,
    tone: l.colorTone,
  };
}

/**
 * Python Task.to_dict — board kartının özet hali.
 *
 * `task` şu join'lerle gelmeli:
 *   { column, assignees: { user }, labelLinks: { label }, subtasks, comments }
 */
export function taskToDict(task) {
  const col = task.column;
  const assigneeSlugs = (task.assignees || [])
    .map((ta) => ta.user?.slug)
    .filter(Boolean);
  const labelSlugs = (task.labelLinks || [])
    .map((tl) => tl.label?.slug)
    .filter(Boolean);
  const commentCount = (task.comments || []).length;
  const subtaskList = task.subtasks || [];

  const d = {
    id: String(task.id),
    col: col?.slug || 'backlog',
    title: task.title,
    desc: task.description || '',
    labels: labelSlugs,
    priority: task.priority || 'mid',
    assignees: assigneeSlugs,
    due: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null,
    start: task.startDate ? new Date(task.startDate).toISOString().slice(0, 10) : null,
    assignee_dates: task.assigneeDates || {},
    progress: task.progress || 0,
    comments: commentCount,
    attachments: 0,
    project_id: task.projectId,
    created_by: task.creator?.slug || null,
  };
  if (subtaskList.length > 0) {
    const doneCount = subtaskList.filter((s) => s.done).length;
    d.subtasks = `${doneCount}/${subtaskList.length}`;
  }
  return d;
}

/**
 * Python Subtask.to_dict
 */
export function subtaskToDict(s) {
  return { id: s.id, text: s.title, done: s.done };
}

/**
 * Python Comment.to_dict
 */
export function commentToDict(c) {
  return {
    id: c.id,
    author: c.user?.slug || 'unknown',
    time: c.createdAt ? new Date(c.createdAt).toISOString() : '',
    text: c.text,
  };
}

/**
 * Python Task.to_detail_dict — drawer ekranında kullanılan zenginleştirilmiş form.
 * `task` include: column, creator, assignees{user}, labelLinks{label}, subtasks, comments{user}
 */
export function taskToDetailDict(task) {
  const base = taskToDict(task);

  base.comments_list = (task.comments || []).map(commentToDict);
  base.subtasks_detail = (task.subtasks || []).map(subtaskToDict);

  if (Array.isArray(task.doc)) {
    base.doc = task.doc;
  } else {
    const doc = [];
    if (task.description) {
      doc.push({ kind: 'h2', text: 'Açıklama' });
      doc.push({ kind: 'p', text: task.description });
    }
    if ((task.subtasks || []).length > 0) {
      doc.push({ kind: 'h2', text: 'Alt görevler' });
      doc.push({
        kind: 'checklist',
        items: task.subtasks.map((s) => ({ id: s.id, done: s.done, text: s.title })),
      });
    }
    base.doc = doc.length
      ? doc
      : [{ kind: 'p', text: 'Bu kart için henüz detaylı açıklama eklenmedi.' }];
  }
  return base;
}

/**
 * Python ChatMessage.to_dict
 * `m` include: sender, receiver
 */
export function chatMessageToDict(m) {
  const created = m.createdAt ? new Date(m.createdAt) : null;
  const hh = created
    ? String(created.getHours()).padStart(2, '0') +
      ':' +
      String(created.getMinutes()).padStart(2, '0')
    : '';
  const base = {
    id: m.id,
    from: m.sender?.slug || 'unknown',
    to: m.receiver?.slug || null,
    time: hh,
    ts: created ? created.toISOString() : '',
    channel: m.channel || 'general',
    pinned: Boolean(m.pinned),
    is_read: m.receiverId ? Boolean(m.isRead) : null,
  };
  if (m.replyToId) {
    base.reply_to = {
      id: m.replyToId,
      sender: m.replyToSender || '',
      text: m.replyToText || '',
    };
  }
  if (m.isDeleted) {
    base.deleted = true;
    return base;
  }
  base.text = m.text || '';
  if (m.fileUrl) {
    base.file_url = m.fileUrl;
    base.file_type = m.fileType;
    base.file_name = m.fileName;
  }
  return base;
}

/**
 * Python TaskAttachment.to_dict
 * `att` include: uploader
 */
export function taskAttachmentToDict(att) {
  const rawName =
    att.fileName && att.fileName.includes('.')
      ? att.fileName.slice(0, att.fileName.lastIndexOf('.'))
      : att.fileName || '';
  return {
    id: att.id,
    file_name: att.fileName,
    display_name: att.displayName || rawName,
    file_type: att.fileType,
    url: `/api/attachments/${att.id}`,
    uploader: att.uploader?.slug || null,
    created_at: att.createdAt ? new Date(att.createdAt).toISOString() : '',
  };
}

/**
 * Python Notification.to_dict
 */
export function notificationToDict(n) {
  return {
    id: String(n.id),
    unread: !n.read,
    time: n.createdAt ? new Date(n.createdAt).toISOString() : '',
    text: n.text,
    task_id: n.taskId,
    sender_slug: n.senderSlug,
    workspace_id: n.workspaceId,
    chat_channel: n.chatChannel,
    message_id: n.messageId,
  };
}

/**
 * Python ActivityLog.to_dict
 */
export function activityToDict(a) {
  const who = a.user?.name ? a.user.name.split(/\s+/)[0] : '';
  return {
    who,
    time: a.createdAt ? new Date(a.createdAt).toISOString() : '',
    text: a.text,
  };
}
