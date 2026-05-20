"""Stoaboard orphan-record cleanup script.

Walks every table that has a foreign-key (or string slug) reference to
another table and deletes rows whose parent is missing. Designed for both
the local SQLite ``stoaboard.db`` and the Railway PostgreSQL database — the
queries use SQLAlchemy ORM, no DB-specific SQL.

Usage:
    python -m scripts.cleanup_orphans            # dry-run, prints counts only
    python -m scripts.cleanup_orphans --apply    # actually deletes

Run from the project root so ``app`` is importable.
"""
from __future__ import annotations

import argparse
import sys
from typing import Callable

from app import create_app, db
from app.models import (
    ActivityLog,
    BoardColumn,
    Channel,
    ChannelMember,
    ChatMessage,
    Comment,
    Label,
    Note,
    NoteCollaborator,
    NoteLinkedTask,
    Notification,
    Project,
    Subtask,
    Task,
    TaskAssignee,
    TaskAttachment,
    TaskLabel,
    UploadedFile,
    User,
    Workspace,
    WorkspaceJoinRequest,
    WorkspaceMember,
    WorkspaceRole,
)


def _ids(model, col=None):
    """Return the set of all primary-key (or specified column) values for a model."""
    col = col or model.id
    return {row[0] for row in db.session.query(col).all()}


def run_cleanup(apply: bool) -> int:
    """Return the total number of orphan rows found (and deleted if --apply)."""
    user_ids = _ids(User)
    ws_ids = _ids(Workspace)
    project_ids = _ids(Project)
    task_ids = _ids(Task)
    column_ids = _ids(BoardColumn)
    label_ids = _ids(Label)
    channel_ids = _ids(Channel)
    message_ids = _ids(ChatMessage)
    note_ids = _ids(Note)

    # (workspace_id, slug) pairs of existing channels — for chat_messages cleanup
    channel_keys = {
        (ws, slug) for ws, slug in db.session.query(Channel.workspace_id, Channel.slug).all()
    }

    findings: list[tuple[str, Callable[[], int]]] = []

    def add(label: str, query):
        findings.append((label, query))

    # ── workspace-scoped ────────────────────────────────────────────────
    add(
        'projects with missing workspace',
        Project.query.filter(~Project.workspace_id.in_(ws_ids or {-1})),
    )
    add(
        'workspace_members with missing workspace/user',
        WorkspaceMember.query.filter(
            (~WorkspaceMember.workspace_id.in_(ws_ids or {-1}))
            | (~WorkspaceMember.user_id.in_(user_ids or {-1}))
        ),
    )
    add(
        'workspace_roles with missing workspace',
        WorkspaceRole.query.filter(~WorkspaceRole.workspace_id.in_(ws_ids or {-1})),
    )
    add(
        'workspace_join_requests with missing workspace/user',
        WorkspaceJoinRequest.query.filter(
            (~WorkspaceJoinRequest.workspace_id.in_(ws_ids or {-1}))
            | (~WorkspaceJoinRequest.user_id.in_(user_ids or {-1}))
        ),
    )
    add(
        'channels with missing workspace',
        Channel.query.filter(~Channel.workspace_id.in_(ws_ids or {-1})),
    )
    add(
        'notes with missing workspace/author',
        Note.query.filter(
            (~Note.workspace_id.in_(ws_ids or {-1}))
            | (~Note.author_id.in_(user_ids or {-1}))
        ),
    )

    # ── project-scoped ─────────────────────────────────────────────────
    add(
        'board_columns with missing project',
        BoardColumn.query.filter(~BoardColumn.project_id.in_(project_ids or {-1})),
    )
    add(
        'labels with missing project',
        Label.query.filter(~Label.project_id.in_(project_ids or {-1})),
    )
    add(
        'tasks with missing project',
        Task.query.filter(~Task.project_id.in_(project_ids or {-1})),
    )
    add(
        'tasks with missing column',
        Task.query.filter(
            Task.column_id.isnot(None),
            ~Task.column_id.in_(column_ids or {-1}),
        ),
    )
    add(
        'activity_logs with missing project',
        ActivityLog.query.filter(~ActivityLog.project_id.in_(project_ids or {-1})),
    )

    # ── task-scoped ────────────────────────────────────────────────────
    add(
        'subtasks with missing task',
        Subtask.query.filter(~Subtask.task_id.in_(task_ids or {-1})),
    )
    add(
        'comments with missing task',
        Comment.query.filter(~Comment.task_id.in_(task_ids or {-1})),
    )
    add(
        'task_assignees with missing task/user',
        TaskAssignee.query.filter(
            (~TaskAssignee.task_id.in_(task_ids or {-1}))
            | (~TaskAssignee.user_id.in_(user_ids or {-1}))
        ),
    )
    add(
        'task_labels with missing task/label',
        TaskLabel.query.filter(
            (~TaskLabel.task_id.in_(task_ids or {-1}))
            | (~TaskLabel.label_id.in_(label_ids or {-1}))
        ),
    )

    # ── channel-scoped ─────────────────────────────────────────────────
    add(
        'channel_members with missing channel/user',
        ChannelMember.query.filter(
            (~ChannelMember.channel_id.in_(channel_ids or {-1}))
            | (~ChannelMember.user_id.in_(user_ids or {-1}))
        ),
    )

    # ── chat_messages: workspace must exist; if it's a channel msg
    #    (no receiver), the (workspace_id, channel slug) pair must match
    #    an existing channel (or be the legacy reserved 'general' slug).
    add(
        'chat_messages with missing workspace',
        ChatMessage.query.filter(
            ChatMessage.workspace_id.isnot(None),
            ~ChatMessage.workspace_id.in_(ws_ids or {-1}),
        ),
    )
    add(
        'chat_messages with missing sender',
        ChatMessage.query.filter(
            ChatMessage.sender_id.isnot(None),
            ~ChatMessage.sender_id.in_(user_ids or {-1}),
        ),
    )
    # Channel messages with no surviving Channel row (DMs are exempt:
    # they have receiver_id set). 'general' is reserved/auto-created on
    # workspace bootstrap and may legitimately exist without a row pre-init.
    orphan_channel_msgs = []
    for msg in ChatMessage.query.filter(ChatMessage.receiver_id.is_(None)).all():
        slug = (msg.channel or 'general')
        if slug == 'general':
            continue
        if (msg.workspace_id, slug) not in channel_keys:
            orphan_channel_msgs.append(msg)
    findings.append(
        ('chat_messages whose channel slug no longer exists', orphan_channel_msgs)
    )

    # ── note-scoped ────────────────────────────────────────────────────
    add(
        'note_collaborators with missing note/user',
        NoteCollaborator.query.filter(
            (~NoteCollaborator.note_id.in_(note_ids or {-1}))
            | (~NoteCollaborator.user_id.in_(user_ids or {-1}))
        ),
    )
    add(
        'note_linked_tasks with missing note/task',
        NoteLinkedTask.query.filter(
            (~NoteLinkedTask.note_id.in_(note_ids or {-1}))
            | (~NoteLinkedTask.task_id.in_(task_ids or {-1}))
        ),
    )

    # ── notifications (user must exist; task_id/message_id are SET NULL on parent) ──
    add(
        'notifications with missing user',
        Notification.query.filter(~Notification.user_id.in_(user_ids or {-1})),
    )

    # ── attachments (file is CASCADE, but uploader can vanish) ────────
    add(
        'task_attachments with missing task',
        TaskAttachment.query.filter(~TaskAttachment.task_id.in_(task_ids or {-1})),
    )

    # ── uploaded_files: orphan if no avatar, no workspace logo, no attachment refs it ──
    referenced_file_ids = set()
    for url in db.session.query(User.avatar_photo_url).filter(User.avatar_photo_url.isnot(None)).all():
        u = url[0] or ''
        if '/api/media/' in u:
            try:
                referenced_file_ids.add(int(u.rsplit('/', 1)[-1]))
            except ValueError:
                pass
    for url in db.session.query(Workspace.logo_url).filter(Workspace.logo_url.isnot(None)).all():
        u = url[0] or ''
        if '/api/media/' in u:
            try:
                referenced_file_ids.add(int(u.rsplit('/', 1)[-1]))
            except ValueError:
                pass
    referenced_file_ids.update(
        row[0] for row in db.session.query(TaskAttachment.file_id).all()
    )
    add(
        'uploaded_files not referenced anywhere',
        UploadedFile.query.filter(~UploadedFile.id.in_(referenced_file_ids or {-1})),
    )

    total = 0
    print('\nOrphan audit:')
    for label, target in findings:
        if isinstance(target, list):
            rows = target
            count = len(rows)
        else:
            count = target.count()
            rows = None  # will fetch in apply branch
        if count == 0:
            continue
        total += count
        print(f'  - {label}: {count}')
        if apply:
            if rows is None:
                rows = target.all()
            for r in rows:
                db.session.delete(r)
            db.session.flush()

    if apply:
        db.session.commit()
        print(f'\nDeleted {total} orphan row(s).')
    else:
        print(f'\nTotal: {total} orphan row(s). Re-run with --apply to delete.')
    return total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--apply', action='store_true',
        help='Actually delete the orphan rows (default: dry-run).'
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        run_cleanup(apply=args.apply)


if __name__ == '__main__':
    sys.exit(main())
