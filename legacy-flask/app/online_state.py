# In-memory presence tracking: {user_id: {'sid': sid, 'status': status}}
_online: dict = {}


def set_online(user_id: int, sid: str):
    existing_status = _online.get(user_id, {}).get('status', 'online')
    # Preserve dnd status across reconnects
    status = existing_status if existing_status == 'dnd' else 'online'
    _online[user_id] = {'sid': sid, 'status': status}


def set_offline(user_id: int):
    _online.pop(user_id, None)


def set_status(user_id: int, status: str):
    if user_id in _online:
        _online[user_id]['status'] = status


def get_status(user_id: int) -> str:
    if user_id in _online:
        return _online[user_id]['status']
    return 'offline'


def is_online(user_id: int) -> bool:
    return user_id in _online


def get_online_ids() -> list:
    return list(_online.keys())
