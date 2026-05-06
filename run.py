import sys

if sys.version_info < (3, 14):
    import eventlet
    eventlet.monkey_patch()

from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)
