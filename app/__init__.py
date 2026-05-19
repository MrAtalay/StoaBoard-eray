import os
from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from sqlalchemy import inspect, text
from config import Config

db = SQLAlchemy()
socketio = SocketIO()


def _migrate_db():
    """Apply small idempotent schema fixes for existing SQLite/Postgres DBs."""
    inspector = inspect(db.engine)
    tables = set(inspector.get_table_names())
    is_pg = 'postgresql' in str(db.engine.url)
    migrations = [
        ('users', 'current_workspace_id', "ALTER TABLE users ADD COLUMN current_workspace_id INTEGER"),
        ('users', 'status', "ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'offline'"),
        ('users', 'away_timeout', "ALTER TABLE users ADD COLUMN away_timeout INTEGER DEFAULT 15"),
        ('workspaces', 'logo_url', "ALTER TABLE workspaces ADD COLUMN logo_url VARCHAR(255)"),
        ('projects', 'icon', "ALTER TABLE projects ADD COLUMN icon VARCHAR(50) DEFAULT 'folder'"),
        ('chat_messages', 'is_deleted',
            "ALTER TABLE chat_messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE"
            if is_pg else
            "ALTER TABLE chat_messages ADD COLUMN is_deleted INTEGER DEFAULT 0"),
        ('chat_messages', 'hidden_for',
            "ALTER TABLE chat_messages ADD COLUMN hidden_for JSONB DEFAULT '[]'"
            if is_pg else
            "ALTER TABLE chat_messages ADD COLUMN hidden_for TEXT DEFAULT '[]'"),
        ('workspace_members', 'role_title', "ALTER TABLE workspace_members ADD COLUMN role_title VARCHAR(100)"),
        ('board_columns', 'is_done',
            "ALTER TABLE board_columns ADD COLUMN is_done BOOLEAN DEFAULT FALSE"
            if is_pg else
            "ALTER TABLE board_columns ADD COLUMN is_done INTEGER DEFAULT 0"),
        ('notifications', 'task_id', "ALTER TABLE notifications ADD COLUMN task_id INTEGER"),
        ('notifications', 'sender_slug', "ALTER TABLE notifications ADD COLUMN sender_slug VARCHAR(80)"),
        ('users', 'avatar_photo_url', "ALTER TABLE users ADD COLUMN avatar_photo_url VARCHAR(300)"),
        ('notifications', 'workspace_id', "ALTER TABLE notifications ADD COLUMN workspace_id INTEGER"),
        ('tasks', 'start_date', "ALTER TABLE tasks ADD COLUMN start_date DATE"),
        ('tasks', 'assignee_dates',
            "ALTER TABLE tasks ADD COLUMN assignee_dates JSONB DEFAULT '{}'"
            if is_pg else
            "ALTER TABLE tasks ADD COLUMN assignee_dates TEXT DEFAULT '{}'"),
        ('notifications', 'chat_channel', "ALTER TABLE notifications ADD COLUMN chat_channel VARCHAR(20)"),
        ('notifications', 'message_id', "ALTER TABLE notifications ADD COLUMN message_id INTEGER"),
        ('chat_messages', 'channel', "ALTER TABLE chat_messages ADD COLUMN channel VARCHAR(80) DEFAULT 'general'"),
        ('chat_messages', 'pinned',
            "ALTER TABLE chat_messages ADD COLUMN pinned BOOLEAN DEFAULT FALSE"
            if is_pg else
            "ALTER TABLE chat_messages ADD COLUMN pinned INTEGER DEFAULT 0"),
        ('chat_messages', 'is_read',
            "ALTER TABLE chat_messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE"
            if is_pg else
            "ALTER TABLE chat_messages ADD COLUMN is_read INTEGER DEFAULT 0"),
    ]
    index_migrations = [
        "CREATE INDEX IF NOT EXISTS ix_task_project_id  ON tasks(project_id)",
        "CREATE INDEX IF NOT EXISTS ix_task_column_id   ON tasks(column_id)",
        "CREATE INDEX IF NOT EXISTS ix_task_created_at  ON tasks(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_task_assignee_task_id ON task_assignees(task_id)",
        "CREATE INDEX IF NOT EXISTS ix_task_label_task_id    ON task_labels(task_id)",
        "CREATE INDEX IF NOT EXISTS ix_notification_user_id  ON notifications(user_id)",
    ]

    column_cache = {}
    for table_name, column_name, sql in migrations:
        if table_name not in tables:
            continue
        if table_name not in column_cache:
            column_cache[table_name] = {
                column['name'] for column in inspector.get_columns(table_name)
            }
        if column_name in column_cache[table_name]:
            continue
        with db.engine.begin() as conn:
            conn.execute(text(sql))

    # Indexes (idempotent — IF NOT EXISTS)
    with db.engine.begin() as conn:
        for idx_sql in index_migrations:
            try:
                conn.execute(text(idx_sql))
            except Exception:
                pass


def _seed_default_channels():
    """Ensure every workspace has a 'general' channel and every member is in it.

    Idempotent — safe to run on every startup. Triggered after db.create_all().
    """
    from app.models import Workspace, WorkspaceMember, Channel, ChannelMember
    try:
        workspaces = Workspace.query.all()
    except Exception:
        return
    for ws in workspaces:
        gen = Channel.query.filter_by(workspace_id=ws.id, slug='general').first()
        if not gen:
            gen = Channel(
                workspace_id=ws.id,
                slug='general',
                name='genel',
                description='Tüm proje üyeleri için varsayılan kanal',
                type='public',
                created_by=ws.owner_id,
                is_default=True,
            )
            db.session.add(gen)
            db.session.flush()
        # Ensure every workspace member is also a channel member of 'general'
        existing_ids = {cm.user_id for cm in gen.members}
        ws_members = WorkspaceMember.query.filter_by(workspace_id=ws.id).all()
        for wm in ws_members:
            if wm.user_id in existing_ids:
                continue
            role = 'owner' if (ws.owner_id and wm.user_id == ws.owner_id) else 'member'
            db.session.add(ChannelMember(channel_id=gen.id, user_id=wm.user_id, role=role))
        # Workspace owner edge-case (in case owner not in workspace_members table)
        if ws.owner_id and ws.owner_id not in existing_ids and not any(wm.user_id == ws.owner_id for wm in ws_members):
            db.session.add(ChannelMember(channel_id=gen.id, user_id=ws.owner_id, role='owner'))
    db.session.commit()


def create_app():
    flask_app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static'),
        template_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates'),
    )
    flask_app.config.from_object(Config)

    db.init_app(flask_app)

    socketio.init_app(
        flask_app,
        cors_allowed_origins=flask_app.config.get('CORS_ORIGINS'),
        manage_session=False,
        async_mode=flask_app.config.get('SOCKETIO_ASYNC_MODE'),
    )

    from app.routes.auth import auth_bp
    from app.routes.api import api_bp
    import app.routes.chat  # registers socket event handlers

    flask_app.register_blueprint(auth_bp, url_prefix='/api/auth')
    flask_app.register_blueprint(api_bp, url_prefix='/api')

    with flask_app.app_context():
        db.create_all()
        _migrate_db()
        _seed_default_channels()

    @flask_app.route('/')
    def index():
        return render_template('index.html')

    @flask_app.after_request
    def security_headers(response):
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
        response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        if response.status_code == 200 and (request.path.startswith('/static/uploads/') or request.path.startswith('/api/media/')):
            response.headers['Cache-Control'] = 'public, max-age=2592000'  # 30 days
        elif response.status_code == 200 and request.path.endswith(('.png', '.ico')):
            response.headers['Cache-Control'] = 'public, max-age=86400'
        elif response.status_code == 200 and request.path.endswith(('.jsx', '.js', '.css')):
            if request.args.get('v'):
                response.headers['Cache-Control'] = 'public, max-age=604800'
            else:
                response.headers['Cache-Control'] = 'no-cache, must-revalidate'
        return response

    return flask_app
