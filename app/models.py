import re
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from app import db


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)



class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(60), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(255))
    avatar_color = db.Column(db.String(100), default='oklch(58% 0.13 25)')
    avatar_initials = db.Column(db.String(10))
    avatar_photo_url = db.Column(db.String(300), nullable=True)
    role_title = db.Column(db.String(100))
    last_seen = db.Column(db.DateTime, default=_now)
    created_at = db.Column(db.DateTime, default=_now)
    current_workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'), nullable=True)
    status = db.Column(db.String(20), default='offline')   # online | away | dnd | offline
    away_timeout = db.Column(db.Integer, default=15)       # inactivity minutes before 'away'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.slug,
            'name': self.name,
            'role': self.role_title or '',
            'initials': self.avatar_initials or '',
            'color': self.avatar_color or 'oklch(58% 0.13 25)',
            'avatar_photo_url': self.avatar_photo_url or None,
            'status': self.status or 'offline',
            'away_timeout': self.away_timeout or 15,
        }


class WorkspaceRole(db.Model):
    __tablename__ = 'workspace_roles'
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'))
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(100), default='oklch(55% 0.09 230)')
    permissions = db.Column(db.JSON, default=list)
    is_default = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'color': self.color,
            'permissions': self.permissions or [],
            'is_default': self.is_default,
        }


class Workspace(db.Model):
    __tablename__ = 'workspaces'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    invite_code = db.Column(db.String(20), nullable=True, unique=True)
    logo_url = db.Column(db.String(255), nullable=True)

    owner = db.relationship('User', foreign_keys=[owner_id])
    members = db.relationship('WorkspaceMember', backref='workspace', lazy='dynamic')
    projects = db.relationship('Project', backref='workspace', lazy='dynamic')
    roles = db.relationship('WorkspaceRole', backref='workspace', lazy='select',
                            cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'owner_id': self.owner_id,
            'logo_url': self.logo_url,
        }


class WorkspaceMember(db.Model):
    __tablename__ = 'workspace_members'
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    role = db.Column(db.String(50), default='member')
    role_id = db.Column(db.Integer, db.ForeignKey('workspace_roles.id'), nullable=True)
    role_title = db.Column(db.String(100))

    user = db.relationship('User')
    workspace_role = db.relationship('WorkspaceRole')


class Project(db.Model):
    __tablename__ = 'projects'
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'))
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(100), default='oklch(55% 0.13 25)')
    icon  = db.Column(db.String(50), default='folder')

    columns = db.relationship(
        'BoardColumn', backref='project', lazy='select',
        order_by='BoardColumn.position'
    )
    tasks = db.relationship('Task', backref='project', lazy='dynamic')
    labels = db.relationship('Label', backref='project', lazy='select')
    activities = db.relationship(
        'ActivityLog', backref='project', lazy='dynamic',
        order_by='ActivityLog.created_at.desc()'
    )

    def open_count(self):
        done_col = BoardColumn.query.filter_by(project_id=self.id, slug='done').first()
        q = Task.query.filter_by(project_id=self.id)
        if done_col:
            q = q.filter(Task.column_id != done_col.id)
        return q.count()

    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'color': self.color,
            'open': self.open_count(),
            'icon': self.icon or 'folder',
        }


class BoardColumn(db.Model):
    __tablename__ = 'board_columns'
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'))
    slug = db.Column(db.String(60), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    title_tr = db.Column(db.String(100))
    color = db.Column(db.String(100))
    position = db.Column(db.Integer, default=0)
    is_done = db.Column(db.Boolean, default=False, nullable=True)

    tasks = db.relationship('Task', backref='column', lazy='dynamic',
                            foreign_keys='Task.column_id')

    def to_dict(self):
        return {
            'id': self.slug,
            'db_id': self.id,
            'title': self.title,
            'title_tr': self.title_tr or self.title,
            'color': self.color or 'oklch(55% 0.02 250)',
            'is_done': bool(self.is_done),
        }


class Label(db.Model):
    __tablename__ = 'labels'
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'))
    slug = db.Column(db.String(60), nullable=False)
    name_en = db.Column(db.String(100), nullable=False)
    name_tr = db.Column(db.String(100))
    color_tone = db.Column(db.String(50), default='blue')

    def to_dict_value(self):
        return {
            'en': self.name_en,
            'tr': self.name_tr or self.name_en,
            'tone': self.color_tone,
        }


class TaskLabel(db.Model):
    __tablename__ = 'task_labels'
    __table_args__ = (db.Index('ix_task_label_task_id', 'task_id'),)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), primary_key=True)
    label_id = db.Column(db.Integer, db.ForeignKey('labels.id'), primary_key=True)
    label = db.relationship('Label')


class TaskAssignee(db.Model):
    __tablename__ = 'task_assignees'
    __table_args__ = (db.Index('ix_task_assignee_task_id', 'task_id'),)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    user = db.relationship('User')


class Task(db.Model):
    __tablename__ = 'tasks'
    __table_args__ = (
        db.Index('ix_task_project_id', 'project_id'),
        db.Index('ix_task_column_id', 'column_id'),
        db.Index('ix_task_created_at', 'created_at'),
    )
    id = db.Column(db.Integer, primary_key=True)
    column_id = db.Column(db.Integer, db.ForeignKey('board_columns.id'))
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'))
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text)
    priority = db.Column(db.String(20), default='mid')
    progress = db.Column(db.Integer, default=0)
    due_date = db.Column(db.Date)
    start_date = db.Column(db.Date, nullable=True)
    assignee_dates = db.Column(db.JSON, nullable=True)  # {slug: {start, end}}
    doc = db.Column(db.JSON)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=_now)
    position = db.Column(db.Float, default=0.0)

    assignees = db.relationship('TaskAssignee', backref='task', lazy='select',
                                cascade='all, delete-orphan')
    label_links = db.relationship('TaskLabel', backref='task', lazy='select',
                                  cascade='all, delete-orphan')
    subtasks = db.relationship('Subtask', backref='task', lazy='select',
                               order_by='Subtask.position', cascade='all, delete-orphan')
    comments = db.relationship('Comment', backref='task', lazy='select',
                               order_by='Comment.created_at', cascade='all, delete-orphan')
    creator = db.relationship('User', foreign_keys=[created_by])

    def to_dict(self):
        col = self.column
        assignee_slugs = [ta.user.slug for ta in self.assignees if ta.user]
        label_slugs = [tl.label.slug for tl in self.label_links if tl.label]
        comment_count = len(self.comments)
        subtask_list = self.subtasks

        creator_slug = self.creator.slug if self.creator else None
        d = {
            'id': str(self.id),
            'col': col.slug if col else 'backlog',
            'title': self.title,
            'desc': self.description or '',
            'labels': label_slugs,
            'priority': self.priority or 'mid',
            'assignees': assignee_slugs,
            'due': self.due_date.isoformat() if self.due_date else None,
            'start': self.start_date.isoformat() if self.start_date else None,
            'assignee_dates': self.assignee_dates or {},
            'progress': self.progress or 0,
            'comments': comment_count,
            'attachments': 0,
            'project_id': self.project_id,
            'created_by': creator_slug,
        }
        if subtask_list:
            done_count = sum(1 for s in subtask_list if s.done)
            d['subtasks'] = f'{done_count}/{len(subtask_list)}'
        return d

    def to_detail_dict(self):
        base = self.to_dict()
        base['comments_list'] = [c.to_dict() for c in self.comments]
        base['subtasks_detail'] = [s.to_dict() for s in self.subtasks]

        if self.doc:
            base['doc'] = self.doc
        else:
            doc = []
            if self.description:
                doc.append({'kind': 'h2', 'text': 'Açıklama'})
                doc.append({'kind': 'p', 'text': self.description})
            if self.subtasks:
                doc.append({'kind': 'h2', 'text': 'Alt görevler'})
                doc.append({'kind': 'checklist', 'items': [
                    {'id': s.id, 'done': s.done, 'text': s.title} for s in self.subtasks
                ]})
            if not doc:
                doc = [{'kind': 'p', 'text': 'Bu kart için henüz detaylı açıklama eklenmedi.'}]
            base['doc'] = doc
        return base


class Subtask(db.Model):
    __tablename__ = 'subtasks'
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'))
    title = db.Column(db.String(500), nullable=False)
    done = db.Column(db.Boolean, default=False)
    position = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {'id': self.id, 'text': self.title, 'done': self.done}


class Comment(db.Model):
    __tablename__ = 'comments'
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    text = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=_now)

    user = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'author': self.user.slug if self.user else 'unknown',
            'time': self.created_at.isoformat() if self.created_at else '',
            'text': self.text,
        }


class Notification(db.Model):
    __tablename__ = 'notifications'
    __table_args__ = (db.Index('ix_notification_user_id', 'user_id'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    text = db.Column(db.Text, nullable=False)
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=_now)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True)
    sender_slug = db.Column(db.String(80), nullable=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'), nullable=True)
    chat_channel = db.Column(db.String(20), nullable=True)  # 'general' | 'dm' | None
    message_id = db.Column(db.Integer, db.ForeignKey('chat_messages.id', ondelete='SET NULL'), nullable=True)

    def to_dict(self):
        return {
            'id': str(self.id),
            'unread': not self.read,
            'time': self.created_at.isoformat() if self.created_at else '',
            'text': self.text,
            'task_id': self.task_id,
            'sender_slug': self.sender_slug,
            'workspace_id': self.workspace_id,
            'chat_channel': self.chat_channel,
            'message_id': self.message_id,
        }


class ActivityLog(db.Model):
    __tablename__ = 'activity_logs'
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    text = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=_now)

    user = db.relationship('User')

    def to_dict(self):
        who = self.user.name.split()[0] if self.user else ''
        return {
            'who': who,
            'time': self.created_at.isoformat() if self.created_at else '',
            'text': self.text,
        }


class UploadedFile(db.Model):
    """Persistent file storage in PostgreSQL — avoids ephemeral-disk loss on Railway."""
    __tablename__ = 'uploaded_files'
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(100), nullable=False)
    purpose = db.Column(db.String(20), default='chat')  # chat | avatar | logo
    data = db.Column(db.LargeBinary, nullable=False)
    size = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=_now)


class TaskAttachment(db.Model):
    __tablename__ = 'task_attachments'
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    file_id = db.Column(db.Integer, db.ForeignKey('uploaded_files.id', ondelete='CASCADE'), nullable=False)
    file_name = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(255), nullable=True)  # user-editable label
    file_type = db.Column(db.String(100), nullable=False)
    uploader_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=_now)

    uploader = db.relationship('User')
    uploaded_file = db.relationship('UploadedFile')

    def to_dict(self):
        raw_name = self.file_name.rsplit('.', 1)[0] if '.' in self.file_name else self.file_name
        return {
            'id': self.id,
            'file_name': self.file_name,
            'display_name': self.display_name or raw_name,
            'file_type': self.file_type,
            'url': f'/api/attachments/{self.id}',
            'uploader': self.uploader.slug if self.uploader else None,
            'created_at': self.created_at.isoformat() if self.created_at else '',
        }


class WorkspaceJoinRequest(db.Model):
    __tablename__ = 'workspace_join_requests'
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    status = db.Column(db.String(20), default='pending')  # pending | approved | rejected
    created_at = db.Column(db.DateTime, default=_now)

    user = db.relationship('User')
    workspace = db.relationship('Workspace')

    def to_dict(self):
        return {
            'id': self.id,
            'user': self.user.to_dict() if self.user else None,
            'status': self.status,
            'time': self.created_at.isoformat() if self.created_at else '',
        }


class Channel(db.Model):
    __tablename__ = 'channels'
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'), nullable=False, index=True)
    slug = db.Column(db.String(80), nullable=False, index=True)  # per-workspace lower-case slug; matches ChatMessage.channel
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    type = db.Column(db.String(10), default='public')  # 'public' | 'private'
    icon = db.Column(db.String(50), default='hash')
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=_now)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now)
    is_default = db.Column(db.Boolean, default=False)  # 'general' channel — undeletable

    members = db.relationship('ChannelMember', backref='channel', lazy='select',
                              cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('workspace_id', 'slug', name='uq_channel_workspace_slug'),
    )

    def to_dict(self, include_members=False, current_user_id=None):
        data = {
            'id': self.slug,           # frontend uses slug as id
            'channel_id': self.id,     # numeric id for backend ops
            'slug': self.slug,
            'name': self.name,
            'description': self.description or '',
            'type': self.type or 'public',
            'icon': self.icon or ('lock' if self.type == 'private' else 'hash'),
            'is_default': bool(self.is_default),
            'created_by': self.created_by,
            'member_count': len(self.members),
        }
        if current_user_id is not None:
            me = next((m for m in self.members if m.user_id == current_user_id), None)
            data['my_role'] = me.role if me else None
            data['is_member'] = me is not None
        if include_members:
            data['members'] = [m.to_dict() for m in self.members]
        return data


class ChannelMember(db.Model):
    __tablename__ = 'channel_members'
    channel_id = db.Column(db.Integer, db.ForeignKey('channels.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    role = db.Column(db.String(20), default='member')  # 'owner' | 'admin' | 'member'
    joined_at = db.Column(db.DateTime, default=_now)

    user = db.relationship('User')

    def to_dict(self):
        u = self.user
        return {
            'user_id': u.slug if u else None,
            'user_db_id': self.user_id,
            'name': u.name if u else '',
            'role': self.role or 'member',
            'joined_at': self.joined_at.isoformat() if self.joined_at else '',
        }


_NOTE_STRIP_RE = re.compile(r'[`>#*_~\[\]]')

def _markdown_to_plain(text):
    if not text:
        return ''
    s = text or ''
    # links: [label](url) → label
    s = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', s)
    # code fences and inline code markers
    s = re.sub(r'```[\w-]*', '', s)
    s = _NOTE_STRIP_RE.sub('', s)
    # bullet/todo prefixes
    s = re.sub(r'^\s*[-*+]\s+(\[[\sxX]\]\s+)?', '', s, flags=re.MULTILINE)
    s = re.sub(r'^\s*\d+\.\s+', '', s, flags=re.MULTILINE)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


class Note(db.Model):
    __tablename__ = 'notes'
    __table_args__ = (
        db.Index('ix_note_workspace_id', 'workspace_id'),
        db.Index('ix_note_author_id', 'author_id'),
        db.Index('ix_note_updated_at', 'updated_at'),
    )
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False, default='Başlıksız Not')
    body = db.Column(db.Text, default='')                       # markdown
    labels = db.Column(db.JSON, default=list)                   # [{name, tone}, ...]
    visibility = db.Column(db.String(20), default='private')    # 'private' | 'workspace'
    status = db.Column(db.String(20), default='draft')          # 'draft' | 'published'
    pinned = db.Column(db.Boolean, default=False)
    archived = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=_now)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now)

    author = db.relationship('User', foreign_keys=[author_id])
    collaborators = db.relationship('NoteCollaborator', backref='note', lazy='select',
                                    cascade='all, delete-orphan')
    linked_tasks = db.relationship('NoteLinkedTask', backref='note', lazy='select',
                                   cascade='all, delete-orphan')

    def collaborator_ids(self):
        return [c.user_id for c in self.collaborators]

    def linked_task_ids(self):
        return [lt.task_id for lt in self.linked_tasks]

    def to_dict(self, include_body=True):
        author_slug = self.author.slug if self.author else None
        collab_slugs = []
        if self.collaborators:
            uids = [c.user_id for c in self.collaborators]
            users = User.query.filter(User.id.in_(uids)).all() if uids else []
            collab_slugs = [u.slug for u in users]
        d = {
            'id': self.id,
            'title': self.title or '',
            'labels': self.labels or [],
            'visibility': self.visibility or 'private',
            'status': self.status or 'draft',
            'pinned': bool(self.pinned),
            'archived': bool(self.archived),
            'author': author_slug,
            'collaborators': collab_slugs,
            'linked_tasks': [str(tid) for tid in self.linked_task_ids()],
            'workspace_id': self.workspace_id,
            'created_at': self.created_at.isoformat() if self.created_at else '',
            'updated_at': self.updated_at.isoformat() if self.updated_at else '',
            'updated_ago': self.updated_at.isoformat() if self.updated_at else '',
        }
        if include_body:
            d['body'] = self.body or ''
        plain = _markdown_to_plain(self.body or '')
        d['preview'] = plain[:240]
        return d


class NoteCollaborator(db.Model):
    __tablename__ = 'note_collaborators'
    note_id = db.Column(db.Integer, db.ForeignKey('notes.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)


class NoteLinkedTask(db.Model):
    __tablename__ = 'note_linked_tasks'
    __table_args__ = (
        db.Index('ix_note_linked_task_task_id', 'task_id'),
        db.Index('ix_note_linked_task_note_id', 'note_id'),
    )
    note_id = db.Column(db.Integer, db.ForeignKey('notes.id', ondelete='CASCADE'), primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), primary_key=True)


class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspaces.id'))
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    text = db.Column(db.Text, nullable=True)
    file_url = db.Column(db.String(500), nullable=True)
    file_type = db.Column(db.String(20), nullable=True)   # 'image' | 'video' | 'file'
    file_name = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=_now)
    is_deleted = db.Column(db.Boolean, default=False)
    hidden_for = db.Column(db.JSON, default=list)  # list of user IDs who deleted "for self"
    channel = db.Column(db.String(80), default='general')  # 'general' = legacy default; team channel id
    pinned = db.Column(db.Boolean, default=False)
    is_read = db.Column(db.Boolean, default=False)
    reply_to_id = db.Column(db.Integer, nullable=True)
    reply_to_sender = db.Column(db.String(120), nullable=True)
    reply_to_text = db.Column(db.String(280), nullable=True)

    sender = db.relationship('User', foreign_keys=[sender_id])
    receiver = db.relationship('User', foreign_keys=[receiver_id])

    def to_dict(self):
        base = {
            'id': self.id,
            'from': self.sender.slug if self.sender else 'unknown',
            'to': self.receiver.slug if self.receiver else None,
            'time': self.created_at.strftime('%H:%M') if self.created_at else '',
            'ts': self.created_at.isoformat() if self.created_at else '',
            'channel': self.channel or 'general',
            'pinned': bool(self.pinned),
            'is_read': bool(self.is_read) if self.receiver_id else None,
        }
        if self.reply_to_id:
            base['reply_to'] = {
                'id': self.reply_to_id,
                'sender': self.reply_to_sender or '',
                'text': self.reply_to_text or '',
            }
        if self.is_deleted:
            base['deleted'] = True
            return base
        base['text'] = self.text or ''
        if self.file_url:
            base['file_url']  = self.file_url
            base['file_type'] = self.file_type
            base['file_name'] = self.file_name
        return base
