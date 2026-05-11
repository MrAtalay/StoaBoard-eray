from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from app import db


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _time_ago(dt):
    if dt is None:
        return ''
    diff = _now() - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return 'az önce'
    if seconds < 3600:
        return f'{seconds // 60} dk önce'
    if seconds < 86400:
        return f'{seconds // 3600} saat önce'
    if seconds < 172800:
        return 'dün'
    return f'{seconds // 86400} gün önce'


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
            'time': _time_ago(self.created_at),
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
            'time': _time_ago(self.created_at),
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
        who = self.user.name.split()[0] if self.user else 'Kullanıcı'
        return {
            'who': who,
            'time': _time_ago(self.created_at),
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
            'time': _time_ago(self.created_at),
        }


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

    sender = db.relationship('User', foreign_keys=[sender_id])
    receiver = db.relationship('User', foreign_keys=[receiver_id])

    def to_dict(self):
        base = {
            'id': self.id,
            'from': self.sender.slug if self.sender else 'unknown',
            'to': self.receiver.slug if self.receiver else None,
            'time': self.created_at.strftime('%H:%M') if self.created_at else '',
            'ts': self.created_at.isoformat() if self.created_at else '',
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
