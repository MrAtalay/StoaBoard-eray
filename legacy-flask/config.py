import os
import secrets
import sys
from datetime import timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _is_production():
    return (
        os.environ.get('FLASK_ENV') == 'production'
        or os.environ.get('RAILWAY_ENVIRONMENT') is not None
    )


try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, '.env'))
except ImportError:
    pass


IS_PRODUCTION = _is_production()


def _as_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def _split_origins(value):
    origins = [item.strip() for item in (value or '').split(',') if item.strip()]
    if not origins:
        return None
    if origins == ['*']:
        return '*'
    return origins


def _get_socketio_async_mode():
    mode = os.environ.get('SOCKETIO_ASYNC_MODE')
    if not mode:
        mode = 'eventlet' if IS_PRODUCTION else 'threading'

    if mode == 'eventlet' and sys.version_info >= (3, 14):
        # Eventlet is not compatible with Python 3.14's threading internals yet.
        return 'threading'
    return mode


def _get_secret_key():
    """Load from env, or use a local dev key file outside production."""
    env_key = os.environ.get('SECRET_KEY')
    if env_key:
        return env_key
    if IS_PRODUCTION:
        raise RuntimeError('SECRET_KEY must be set in production.')

    key_file = os.path.join(BASE_DIR, '.secret_key')
    if os.path.exists(key_file):
        with open(key_file, 'r') as f:
            key = f.read().strip()
            if key:
                return key
    key = secrets.token_hex(32)
    with open(key_file, 'w') as f:
        f.write(key)
    return key


def _add_neon_sslmode(url):
    if 'neon.tech' not in url or 'sslmode=' in url:
        return url
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query['sslmode'] = 'require'
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _get_db_url():
    url = os.environ.get('DATABASE_URL')
    if not url:
        if IS_PRODUCTION:
            raise RuntimeError('DATABASE_URL must be set in production.')
        url = 'sqlite:///' + os.path.join(BASE_DIR, 'stoaboard.db')

    if url.startswith('postgres://'):
        url = 'postgresql+psycopg2://' + url[len('postgres://'):]
    elif url.startswith('postgresql://'):
        url = 'postgresql+psycopg2://' + url[len('postgresql://'):]
    return _add_neon_sslmode(url)


class Config:
    SECRET_KEY = _get_secret_key()
    SQLALCHEMY_DATABASE_URI = _get_db_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }
    CORS_ORIGINS = _split_origins(os.environ.get('CORS_ORIGINS'))
    SOCKETIO_ASYNC_MODE = _get_socketio_async_mode()
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = _as_bool('SESSION_COOKIE_SECURE', IS_PRODUCTION)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_NAME = 'stoa_session'
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
    PREFERRED_URL_SCHEME = 'https' if SESSION_COOKIE_SECURE else 'http'
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
