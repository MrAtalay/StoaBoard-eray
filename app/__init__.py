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

    @flask_app.route('/')
    def index():
        return render_template('index.html')

    @flask_app.after_request
    def security_headers(response):
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
        response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        if response.status_code == 200 and request.path.startswith('/static/uploads/'):
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
