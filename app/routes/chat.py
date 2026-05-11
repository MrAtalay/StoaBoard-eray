import re
from flask import session, request
from flask_socketio import emit, join_room, leave_room
from app import socketio, db
from app.models import User, ChatMessage, WorkspaceMember, Notification
from app import online_state


def _get_user():
    uid = session.get('user_id')
    if not uid:
        return None
    return User.query.get(uid)


def _active_workspace_id(user):
    """Return user's currently active workspace id."""
    if user.current_workspace_id:
        m = WorkspaceMember.query.filter_by(
            user_id=user.id, workspace_id=user.current_workspace_id
        ).first()
        if m:
            return user.current_workspace_id
    # fallback to first membership
    m = WorkspaceMember.query.filter_by(user_id=user.id).first()
    if m:
        user.current_workspace_id = m.workspace_id
        db.session.commit()
        return m.workspace_id
    return None


def get_online_slugs_with_status():
    result = []
    for uid in online_state.get_online_ids():
        u = User.query.get(uid)
        if u:
            result.append({'slug': u.slug, 'status': online_state.get_status(uid)})
    return result


# ── Connect ────────────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    user = _get_user()
    if not user:
        return False

    online_state.set_online(user.id, request.sid)
    if user.status in ('away', 'dnd'):
        online_state.set_status(user.id, user.status)
    else:
        user.status = 'online'
        db.session.commit()
    join_room(f'user_{user.id}')

    # Join ALL workspace rooms so DMs + general chat always work
    memberships = WorkspaceMember.query.filter_by(user_id=user.id).all()
    for m in memberships:
        join_room(f'ws_{m.workspace_id}')
        emit('user_online', {
            'user': user.slug,
            'status': online_state.get_status(user.id),
        }, to=f'ws_{m.workspace_id}', include_self=False)

    emit('online_users', {'users': get_online_slugs_with_status()})


# ── Disconnect ─────────────────────────────────────────────────────────────

@socketio.on('disconnect')
def on_disconnect():
    user = _get_user()
    if not user:
        return

    online_state.set_offline(user.id)
    user.status = 'offline'
    db.session.commit()

    memberships = WorkspaceMember.query.filter_by(user_id=user.id).all()
    for m in memberships:
        emit('user_offline', {'user': user.slug}, to=f'ws_{m.workspace_id}', include_self=False)


# ── Status change ──────────────────────────────────────────────────────────

@socketio.on('set_status')
def on_set_status(data):
    user = _get_user()
    if not user:
        return

    status = data.get('status', 'online')
    if status not in ('online', 'away', 'dnd'):
        return

    online_state.set_status(user.id, status)
    user.status = status
    db.session.commit()

    memberships = WorkspaceMember.query.filter_by(user_id=user.id).all()
    for m in memberships:
        emit('user_status', {'user': user.slug, 'status': status}, to=f'ws_{m.workspace_id}')


# ── Switch active workspace (re-join rooms) ────────────────────────────────

@socketio.on('switch_workspace')
def on_switch_workspace(data):
    user = _get_user()
    if not user:
        return

    ws_id = data.get('workspace_id')
    if not ws_id:
        return

    member = WorkspaceMember.query.filter_by(user_id=user.id, workspace_id=ws_id).first()
    if not member:
        return

    user.current_workspace_id = ws_id
    db.session.commit()

    # Already in all workspace rooms from connect; just confirm to client
    emit('workspace_switched', {'workspace_id': ws_id})


# ── Chat message ───────────────────────────────────────────────────────────

@socketio.on('chat_message')
def on_chat_message(data):
    user = _get_user()
    if not user:
        return

    text = (data.get('text') or '').strip()
    to_slug = data.get('to')

    if not text and not data.get('file_url'):
        return

    receiver = None
    workspace_id = None

    if to_slug:
        # DM: global (cross-workspace)
        receiver = User.query.filter_by(slug=to_slug).first()
        # Store the active workspace for context but don't restrict DMs by workspace
        workspace_id = _active_workspace_id(user)
    else:
        # General team chat: use active workspace
        workspace_id = _active_workspace_id(user)

    msg = ChatMessage(
        workspace_id=workspace_id,
        sender_id=user.id,
        receiver_id=receiver.id if receiver else None,
        text=text or None,
        file_url=data.get('file_url') or None,
        file_type=data.get('file_type') or None,
        file_name=data.get('file_name') or None,
    )
    db.session.add(msg)
    db.session.flush()

    # DM notification
    if receiver:
        notif = Notification(
            user_id=receiver.id,
            text=f'<strong>{user.name}</strong> sana mesaj gönderdi: {(text or "")[:80]}',
            sender_slug=user.slug,
        )
        db.session.add(notif)
        db.session.flush()
        emit('notification', notif.to_dict(), to=f'user_{receiver.id}')

    # @mention notifications
    if text:
        mentions = re.findall(r'@([\w\-]+)', text)
        notified = set()
        for slug in mentions:
            if slug in notified:
                continue
            notified.add(slug)
            mentioned = User.query.filter_by(slug=slug).first()
            if mentioned and mentioned.id != user.id:
                preview = text[:80] + ('…' if len(text) > 80 else '')
                m_notif = Notification(
                    user_id=mentioned.id,
                    text=f'<strong>{user.name}</strong> senden bahsetti: {preview}',
                    sender_slug=user.slug,
                    workspace_id=workspace_id,
                    chat_channel='dm' if receiver else 'general',
                )
                db.session.add(m_notif)
                db.session.flush()
                emit('notification', m_notif.to_dict(), to=f'user_{mentioned.id}')

    db.session.commit()
    msg_data = msg.to_dict()

    if receiver:
        emit('chat_message', msg_data, to=f'user_{user.id}')
        emit('chat_message', msg_data, to=f'user_{receiver.id}')
    else:
        if workspace_id:
            emit('chat_message', msg_data, to=f'ws_{workspace_id}')


# ── Typing indicator ───────────────────────────────────────────────────────

@socketio.on('typing')
def on_typing(data):
    user = _get_user()
    if not user:
        return
    to_slug = data.get('to')
    is_typing = data.get('typing', False)
    if to_slug:
        receiver = User.query.filter_by(slug=to_slug).first()
        if receiver:
            emit('typing', {'user': user.slug, 'typing': is_typing},
                 to=f'user_{receiver.id}', include_self=False)
