import re
import os
import uuid
import secrets
from sqlalchemy import or_
from flask import Blueprint, request, jsonify, session
from datetime import date
from app import db
from app.models import (
    User, Workspace, WorkspaceMember, WorkspaceRole,
    Project, BoardColumn,
    Task, Label, TaskLabel, TaskAssignee, Subtask, Comment,
    Notification, ActivityLog, ChatMessage, _now
)
from app import online_state

api_bp = Blueprint('api', __name__)


def _parse_hidden_for(val):
    """Safely parse hidden_for field regardless of TEXT or JSON/JSONB column type."""
    if not val:
        return []
    if isinstance(val, list):
        return val
    import json as _json
    try:
        return _json.loads(val)
    except Exception:
        return []



def _current_user():
    uid = session.get('user_id')
    if not uid:
        return None
    user = User.query.get(uid)
    if user:
        user.last_seen = _now()
        db.session.commit()
    return user


def _login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            return jsonify({'error': 'Giriş yapmanız gerekiyor'}), 401
        return f(*args, **kwargs)
    return decorated


def _log_activity(project_id, user, text):
    log = ActivityLog(project_id=project_id, user_id=user.id, text=text)
    db.session.add(log)


def _get_online_slugs():
    result = []
    for uid in online_state.get_online_ids():
        u = User.query.get(uid)
        if u:
            result.append({'slug': u.slug, 'status': online_state.get_status(uid)})
    return result


def _current_member(user):
    """Return user's active workspace membership, auto-fixing stale current_workspace_id."""
    if user.current_workspace_id:
        m = WorkspaceMember.query.filter_by(
            user_id=user.id, workspace_id=user.current_workspace_id
        ).first()
        if m:
            return m
    m = WorkspaceMember.query.filter_by(user_id=user.id).first()
    if m:
        user.current_workspace_id = m.workspace_id
        db.session.commit()
    return m


def _member_permissions(member):
    if not member:
        return []
    if member.role == 'owner':
        return ['manage_tasks', 'manage_projects', 'manage_members']
    if member.workspace_role:
        return member.workspace_role.permissions or []
    return []


def _has_permission(member, permission):
    return member is not None and (
        member.role == 'owner' or permission in _member_permissions(member)
    )


def _member_for_workspace(user, workspace_id):
    return WorkspaceMember.query.filter_by(
        user_id=user.id,
        workspace_id=workspace_id,
    ).first()


def _require_workspace_permission(user, workspace_id, permission, message='Bu işlem için yetkiniz yok'):
    member = _member_for_workspace(user, workspace_id)
    if not _has_permission(member, permission):
        return None, (jsonify({'error': message}), 403)
    return member, None


def _require_project_permission(user, project, permission, message='Bu işlem için yetkiniz yok'):
    return _require_workspace_permission(user, project.workspace_id, permission, message)


def _require_workspace_access(user, workspace_id, message='Bu çalışma alanına erişiminiz yok'):
    member = _member_for_workspace(user, workspace_id)
    if not member:
        return None, (jsonify({'error': message}), 403)
    return member, None


def _require_project_access(user, project, message='Bu projeye erişiminiz yok'):
    return _require_workspace_access(user, project.workspace_id, message)


def _member_to_dict(wm):
    d = wm.user.to_dict()
    d['ws_role'] = wm.role
    if wm.role_title:
        d['role'] = wm.role_title  # workspace-specific title overrides global
    if wm.workspace_role:
        d['role_id'] = wm.role_id
        d['role_name'] = wm.workspace_role.name
        d['role_color'] = wm.workspace_role.color
        d['role_permissions'] = wm.workspace_role.permissions or []
    return d


def _user_private_dict(user, member=None):
    d = user.to_dict()
    d['email'] = user.email
    if member and member.role_title:
        d['role'] = member.role_title  # workspace-specific title
    return d


def _push_notification(user_id, notif):
    """Bildirim oluştuktan sonra SocketIO ile anlık gönder."""
    import logging
    from app import socketio as _sio
    try:
        _sio.emit('notification', notif.to_dict(), to=f'user_{user_id}')
    except Exception as e:
        logging.getLogger(__name__).warning('push_notification emit failed: %s', e)


# ── Bootstrap ──────────────────────────────────────────────────────────────

@api_bp.route('/bootstrap')
@_login_required
def bootstrap():
    user = _current_user()
    project_id = request.args.get('project', type=int)

    # Resolve active workspace
    if user.current_workspace_id:
        member = WorkspaceMember.query.filter_by(
            user_id=user.id, workspace_id=user.current_workspace_id
        ).first()
    else:
        member = None

    if not member:
        member = WorkspaceMember.query.filter_by(user_id=user.id).first()
        if member:
            user.current_workspace_id = member.workspace_id
            db.session.commit()

    if not member:
        return jsonify({
            'needs_workspace': True,
            'user': _user_private_dict(user),
        })

    # All workspaces the user belongs to (for switcher)
    all_memberships = WorkspaceMember.query.filter_by(user_id=user.id).all()
    workspaces_list = []
    for wm in all_memberships:
        wd = wm.workspace.to_dict()
        wd['is_current'] = (wm.workspace_id == user.current_workspace_id)
        wd['is_owner'] = (wm.role == 'owner')
        workspaces_list.append(wd)

    ws = member.workspace
    is_owner = member.role == 'owner'

    ws_dict = ws.to_dict()
    ws_dict['is_owner'] = is_owner
    ws_dict['roles'] = [r.to_dict() for r in ws.roles]
    if is_owner:
        ws_dict['invite_code'] = ws.invite_code

    members = [
        _member_to_dict(wm)
        for wm in WorkspaceMember.query.filter_by(workspace_id=ws.id).all()
        if wm.user
    ]

    online_users = _get_online_slugs()

    projects = Project.query.filter_by(workspace_id=ws.id).all()
    sidebar_projects = [p.to_dict() for p in projects]

    base_payload = {
        'user': _user_private_dict(user, member),
        'workspace': ws_dict,
        'workspaces': workspaces_list,
        'members': members,
        'online_users': online_users,
    }

    if not projects:
        base_payload.update({
            'projects': [],
            'current_project': None,
            'columns': [],
            'labels': {},
            'tasks': [],
            'notifications': [],
            'activity': [],
            'throughput': [],
        })
        return jsonify(base_payload)

    project = None
    if project_id:
        project = Project.query.filter_by(id=project_id, workspace_id=ws.id).first()
    if not project:
        project = projects[0]

    columns = [c.to_dict() for c in project.columns]
    labels = {lbl.slug: lbl.to_dict_value() for lbl in project.labels}
    tasks = [t.to_dict() for t in project.tasks.all()]

    notifs = (
        Notification.query
        .filter_by(user_id=user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )

    activity = project.activities.limit(10).all()

    base_payload.update({
        'projects': sidebar_projects,
        'current_project': str(project.id),
        'columns': columns,
        'labels': labels,
        'tasks': tasks,
        'notifications': [n.to_dict() for n in notifs],
        'activity': [a.to_dict() for a in activity],
        'throughput': _throughput_for_project(project.id),
    })
    return jsonify(base_payload)


def _throughput_for_project(project_id):
    from datetime import datetime, timedelta
    days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
    result = []
    today = datetime.now().date()
    done_col = BoardColumn.query.filter_by(project_id=project_id, slug='done').first()
    review_col = BoardColumn.query.filter_by(project_id=project_id, slug='review').first()
    doing_col = BoardColumn.query.filter_by(project_id=project_id, slug='doing').first()
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        day_label = days[d.weekday()]
        done_count = 0
        review_count = 0
        doing_count = 0
        if done_col:
            done_count = Task.query.filter(
                Task.column_id == done_col.id,
                Task.created_at >= datetime.combine(d, datetime.min.time()),
                Task.created_at < datetime.combine(d + timedelta(1), datetime.min.time()),
            ).count()
        if review_col:
            review_count = Task.query.filter(Task.column_id == review_col.id).count()
        if doing_col:
            doing_count = Task.query.filter(Task.column_id == doing_col.id).count()
        result.append({'day': day_label, 'done': done_count, 'review': review_count, 'progress': doing_count})
    return result


# ── Workspace Setup ────────────────────────────────────────────────────────

@api_bp.route('/workspaces', methods=['POST'])
@_login_required
def create_workspace():
    user = _current_user()

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Çalışma alanı adı zorunludur'}), 400

    slug = re.sub(r'[^a-z0-9-]', '', name.lower().replace(' ', '-')) or 'ws'
    base_slug = slug
    counter = 1
    while Workspace.query.filter_by(slug=slug).first():
        slug = f'{base_slug}-{counter}'
        counter += 1

    invite_code = secrets.token_hex(4).upper()
    while Workspace.query.filter_by(invite_code=invite_code).first():
        invite_code = secrets.token_hex(4).upper()

    template = data.get('template', 'software')

    TEMPLATES = {
        'software': {
            'project': 'Ana Proje',
            'color': 'oklch(52% 0.15 270)',
            'cols': [
                ('backlog',  'Backlog',      'Backlog',       'oklch(55% 0.02 250)', 0),
                ('todo',     'To Do',        'Yapılacak',     'oklch(55% 0.09 230)', 1),
                ('doing',    'In Progress',  'Devam Ediyor',  'oklch(65% 0.11 70)',  2),
                ('review',   'In Review',    'İncelemede',    'oklch(58% 0.13 10)',  3),
                ('done',     'Done',         'Tamamlandı',    'oklch(55% 0.09 150)', 4),
            ],
            'labels': [
                ('bug',          'Bug',          'Bug',          'rose'),
                ('feature',      'Feature',      'Özellik',      'blue'),
                ('tech-debt',    'Tech Debt',    'Teknik Borç',  'amber'),
                ('sprint',       'Sprint',       'Sprint',       'green'),
            ],
        },
        'design': {
            'project': 'Tasarım Projesi',
            'color': 'oklch(50% 0.14 300)',
            'cols': [
                ('brief',    'Brief',     'Brief',     'oklch(55% 0.02 250)', 0),
                ('draft',    'Draft',     'Taslak',    'oklch(55% 0.09 230)', 1),
                ('design',   'Design',    'Tasarım',   'oklch(52% 0.15 270)', 2),
                ('revision', 'Revision',  'Revizyon',  'oklch(58% 0.13 10)',  3),
                ('delivery', 'Delivered', 'Teslim',    'oklch(55% 0.09 150)', 4),
            ],
            'labels': [
                ('ui',       'UI',       'UI',       'purple'),
                ('ux',       'UX',       'UX',       'blue'),
                ('revision', 'Revision', 'Revizyon', 'amber'),
                ('approved', 'Approved', 'Onaylı',   'green'),
            ],
        },
        'personal': {
            'project': 'Kişisel Projeler',
            'color': 'oklch(55% 0.09 150)',
            'cols': [
                ('ideas',    'Ideas',     'Fikirler',    'oklch(55% 0.02 250)', 0),
                ('thisweek', 'This Week', 'Bu Hafta',    'oklch(65% 0.11 70)',  1),
                ('doing',    'Doing',     'Yapıyor',     'oklch(58% 0.13 10)',  2),
                ('done',     'Done',      'Tamamlandı',  'oklch(55% 0.09 150)', 3),
            ],
            'labels': [
                ('goal',    'Goal',    'Hedef',      'blue'),
                ('habit',   'Habit',   'Alışkanlık', 'green'),
                ('project', 'Project', 'Proje',      'amber'),
                ('personal','Personal','Kişisel',    'rose'),
            ],
        },
    }
    tmpl = TEMPLATES.get(template, TEMPLATES['software'])

    ws = Workspace(name=name, slug=slug, owner_id=user.id, invite_code=invite_code)
    db.session.add(ws)
    db.session.flush()

    default_roles = [
        ('Yönetici',     'oklch(52% 0.15 270)', ['manage_tasks', 'manage_projects', 'manage_members'], False),
        ('Düzenleyici',  'oklch(55% 0.09 150)', ['manage_tasks'], True),
        ('Görüntüleyici','oklch(55% 0.02 250)', [], False),
    ]
    for rname, rcolor, rperms, is_default in default_roles:
        db.session.add(WorkspaceRole(
            workspace_id=ws.id, name=rname, color=rcolor,
            permissions=rperms, is_default=is_default,
        ))

    member = WorkspaceMember(workspace_id=ws.id, user_id=user.id, role='owner')
    db.session.add(member)
    user.current_workspace_id = ws.id

    # Şablona göre varsayılan proje + kolonlar + etiketler
    project = Project(workspace_id=ws.id, name=tmpl['project'], color=tmpl['color'])
    db.session.add(project)
    db.session.flush()

    for slug_c, title, title_tr, color, pos in tmpl['cols']:
        db.session.add(BoardColumn(
            project_id=project.id, slug=slug_c, title=title,
            title_tr=title_tr, color=color, position=pos,
        ))
    for slug_l, name_en, name_tr, tone in tmpl['labels']:
        db.session.add(Label(
            project_id=project.id, slug=slug_l,
            name_en=name_en, name_tr=name_tr, color_tone=tone,
        ))

    db.session.commit()

    return jsonify({'ok': True, 'invite_code': invite_code, 'workspace_id': ws.id}), 201


@api_bp.route('/workspaces/join', methods=['POST'])
@_login_required
def join_workspace():
    user = _current_user()

    data = request.get_json(silent=True) or {}
    code = (data.get('code') or '').strip().upper()
    if not code:
        return jsonify({'error': 'Davet kodu zorunludur'}), 400

    ws = Workspace.query.filter_by(invite_code=code).first()
    if not ws:
        return jsonify({'error': 'Geçersiz davet kodu'}), 404

    # Already a member of this workspace?
    existing = WorkspaceMember.query.filter_by(user_id=user.id, workspace_id=ws.id).first()
    if existing:
        user.current_workspace_id = ws.id
        db.session.commit()
        return jsonify({'ok': True, 'workspace_id': ws.id})

    default_role = WorkspaceRole.query.filter_by(workspace_id=ws.id, is_default=True).first()

    member = WorkspaceMember(
        workspace_id=ws.id, user_id=user.id, role='member',
        role_id=default_role.id if default_role else None,
    )
    db.session.add(member)
    user.current_workspace_id = ws.id
    db.session.commit()

    # Notify existing workspace members in real-time
    from app import socketio as _sio
    try:
        _sio.emit('member_joined', {'member': _member_to_dict(member)}, to=f'ws_{ws.id}')
    except Exception:
        pass

    return jsonify({'ok': True, 'workspace_id': ws.id})


# ── List & Switch workspaces ───────────────────────────────────────────────

@api_bp.route('/workspaces/mine', methods=['GET'])
@_login_required
def my_workspaces():
    user = _current_user()
    memberships = WorkspaceMember.query.filter_by(user_id=user.id).all()
    result = []
    for m in memberships:
        wd = m.workspace.to_dict()
        wd['is_current'] = (m.workspace_id == user.current_workspace_id)
        wd['is_owner'] = (m.role == 'owner')
        result.append(wd)
    return jsonify(result)


@api_bp.route('/workspaces/<int:ws_id>/switch', methods=['POST'])
@_login_required
def switch_workspace(ws_id):
    user = _current_user()
    member = WorkspaceMember.query.filter_by(user_id=user.id, workspace_id=ws_id).first()
    if not member:
        return jsonify({'error': 'Bu çalışma alanına üye değilsiniz'}), 403
    user.current_workspace_id = ws_id
    db.session.commit()
    return jsonify({'ok': True, 'workspace_id': ws_id})


# ── User preferences (status / away timeout) ──────────────────────────────

@api_bp.route('/me/preferences', methods=['PATCH'])
@_login_required
def update_preferences():
    user = _current_user()
    data = request.get_json(silent=True) or {}

    if 'away_timeout' in data:
        timeout = data['away_timeout']
        try:
            timeout = int(timeout)
            if 1 <= timeout <= 120:
                user.away_timeout = timeout
        except (TypeError, ValueError):
            pass

    if 'status' in data and data['status'] in ('online', 'away', 'dnd'):
        user.status = data['status']
        online_state.set_status(user.id, data['status'])
        from app import socketio as _sio
        memberships = WorkspaceMember.query.filter_by(user_id=user.id).all()
        for m in memberships:
            try:
                _sio.emit('user_status', {'user': user.slug, 'status': user.status}, to=f'ws_{m.workspace_id}')
            except Exception:
                pass

    db.session.commit()
    return jsonify({'ok': True, 'away_timeout': user.away_timeout, 'status': user.status})


# ── Invite Code ────────────────────────────────────────────────────────────

@api_bp.route('/workspaces/me/regen-code', methods=['POST'])
@_login_required
def regen_invite_code():
    user = _current_user()
    member = _current_member(user)
    if member and member.role != 'owner':
        member = None
    if not member:
        return jsonify({'error': 'Yetkisiz işlem'}), 403

    ws = member.workspace
    new_code = secrets.token_hex(4).upper()
    while Workspace.query.filter_by(invite_code=new_code).first():
        new_code = secrets.token_hex(4).upper()
    ws.invite_code = new_code
    db.session.commit()
    return jsonify({'invite_code': ws.invite_code})


@api_bp.route('/workspaces/me/invite-code', methods=['DELETE'])
@_login_required
def delete_invite_code():
    user = _current_user()
    member = _current_member(user)
    if member and member.role != 'owner':
        member = None
    if not member:
        return jsonify({'error': 'Yetkisiz işlem'}), 403

    member.workspace.invite_code = None
    db.session.commit()
    return jsonify({'ok': True})


# ── Roles ──────────────────────────────────────────────────────────────────

@api_bp.route('/workspaces/me/roles', methods=['GET'])
@_login_required
def get_roles():
    user = _current_user()
    member = _current_member(user)
    if not member:
        return jsonify([])
    roles = WorkspaceRole.query.filter_by(workspace_id=member.workspace_id).all()
    return jsonify([r.to_dict() for r in roles])


@api_bp.route('/workspaces/me/roles', methods=['POST'])
@_login_required
def create_role():
    user = _current_user()
    member = _current_member(user)
    if member and member.role != 'owner':
        member = None
    if not member:
        return jsonify({'error': 'Yetkisiz işlem'}), 403

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Rol adı zorunludur'}), 400

    if data.get('is_default'):
        WorkspaceRole.query.filter_by(
            workspace_id=member.workspace_id, is_default=True
        ).update({'is_default': False})

    role = WorkspaceRole(
        workspace_id=member.workspace_id,
        name=name,
        color=data.get('color') or 'oklch(55% 0.09 230)',
        permissions=data.get('permissions') or [],
        is_default=bool(data.get('is_default')),
    )
    db.session.add(role)
    db.session.commit()
    return jsonify(role.to_dict()), 201


@api_bp.route('/workspaces/roles/<int:role_id>', methods=['PATCH'])
@_login_required
def update_role(role_id):
    user = _current_user()
    member = _current_member(user)
    if member and member.role != 'owner':
        member = None
    if not member:
        return jsonify({'error': 'Yetkisiz işlem'}), 403

    role = WorkspaceRole.query.filter_by(id=role_id, workspace_id=member.workspace_id).first_or_404()
    data = request.get_json(silent=True) or {}

    if 'name' in data:
        role.name = data['name']
    if 'color' in data:
        role.color = data['color']
    if 'permissions' in data:
        role.permissions = data['permissions']
    if 'is_default' in data:
        if data['is_default']:
            WorkspaceRole.query.filter_by(
                workspace_id=member.workspace_id, is_default=True
            ).update({'is_default': False})
        role.is_default = bool(data['is_default'])

    db.session.commit()
    return jsonify(role.to_dict())


@api_bp.route('/workspaces/roles/<int:role_id>', methods=['DELETE'])
@_login_required
def delete_role(role_id):
    user = _current_user()
    member = _current_member(user)
    if member and member.role != 'owner':
        member = None
    if not member:
        return jsonify({'error': 'Yetkisiz işlem'}), 403

    role = WorkspaceRole.query.filter_by(id=role_id, workspace_id=member.workspace_id).first_or_404()
    WorkspaceMember.query.filter_by(role_id=role_id).update({'role_id': None})
    db.session.delete(role)
    db.session.commit()
    return jsonify({'ok': True})


# ── Workspace Members ──────────────────────────────────────────────────────

@api_bp.route('/workspaces/members/<slug>', methods=['PATCH'])
@_login_required
def update_member(slug):
    user = _current_user()
    actor = _current_member(user)
    if not _has_permission(actor, 'manage_members'):
        return jsonify({'error': 'Üye yönetme yetkiniz yok'}), 403

    target_user = User.query.filter_by(slug=slug).first_or_404()
    target = WorkspaceMember.query.filter_by(
        workspace_id=actor.workspace_id, user_id=target_user.id
    ).first_or_404()
    if target.role == 'owner' and actor.role != 'owner':
        return jsonify({'error': 'Sahip rolü sadece sahip tarafından değiştirilebilir'}), 403

    data = request.get_json(silent=True) or {}
    if 'role_id' in data:
        role_id = data['role_id']
        if role_id:
            role = WorkspaceRole.query.filter_by(
                id=role_id, workspace_id=actor.workspace_id
            ).first()
            if not role:
                return jsonify({'error': 'Rol bulunamadı'}), 404
            target.role_id = role.id
        else:
            target.role_id = None

    db.session.commit()
    return jsonify(_member_to_dict(target))


@api_bp.route('/workspaces/members/<slug>', methods=['DELETE'])
@_login_required
def remove_member(slug):
    user = _current_user()
    actor = _current_member(user)
    if not _has_permission(actor, 'manage_members'):
        return jsonify({'error': 'Üye yönetme yetkiniz yok'}), 403

    target_user = User.query.filter_by(slug=slug).first_or_404()
    if target_user.id == user.id:
        return jsonify({'error': 'Kendinizi çıkaramazsınız'}), 400

    target = WorkspaceMember.query.filter_by(
        workspace_id=actor.workspace_id, user_id=target_user.id
    ).first_or_404()
    if target.role == 'owner':
        return jsonify({'error': 'Sahip takımdan çıkarılamaz'}), 403
    db.session.delete(target)
    db.session.commit()
    return jsonify({'ok': True})


@api_bp.route('/workspaces/<int:ws_id>/members', methods=['GET'])
@_login_required
def get_workspace_members(ws_id):
    user = _current_user()
    _, denied = _require_workspace_access(user, ws_id)
    if denied:
        return denied
    members = WorkspaceMember.query.filter_by(workspace_id=ws_id).all()
    return jsonify([_member_to_dict(m) for m in members if m.user])


# ── Tasks ──────────────────────────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/tasks', methods=['GET'])
@_login_required
def get_tasks(project_id):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    _, denied = _require_project_access(user, project)
    if denied:
        return denied
    return jsonify([t.to_dict() for t in project.tasks.all()])


@api_bp.route('/projects/<int:project_id>/tasks', methods=['POST'])
@_login_required
def create_task(project_id):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    data = request.get_json(silent=True) or {}

    _, denied = _require_project_permission(
        user, project, 'manage_tasks', 'Görev oluşturma yetkiniz yok'
    )
    if denied:
        return denied

    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Başlık zorunludur'}), 400

    col_slug = data.get('col') or 'todo'
    col = BoardColumn.query.filter_by(project_id=project_id, slug=col_slug).first()
    if not col:
        col = project.columns[0] if project.columns else None

    task = Task(
        column_id=col.id if col else None,
        project_id=project_id,
        title=title,
        description=data.get('desc') or data.get('description') or '',
        priority=data.get('priority') or 'mid',
        progress=0,
        due_date=_parse_date(data.get('due')),
        created_by=user.id,
        position=_next_position(project_id, col.id if col else None),
    )
    db.session.add(task)
    db.session.flush()

    for slug in (data.get('labels') or []):
        label = Label.query.filter_by(project_id=project_id, slug=slug).first()
        if label:
            db.session.add(TaskLabel(task_id=task.id, label_id=label.id))

    # ── Atama bildirimi (görev oluşturulurken) ──────────────────────────────
    notifs_to_push = []
    for user_slug in (data.get('assignees') or []):
        assignee = User.query.filter_by(slug=user_slug).first()
        if assignee:
            db.session.add(TaskAssignee(task_id=task.id, user_id=assignee.id))
            if assignee.id != user.id:
                notif_text = (
                    f'<em>{user.name}</em> seni '
                    f'<strong>{title}</strong> görevine atadı'
                )
                notif = Notification(user_id=assignee.id, text=notif_text)
                db.session.add(notif)
                notifs_to_push.append((assignee.id, notif))

    _log_activity(project_id, user, f'yeni kart oluşturdu: <em>{title}</em>')
    db.session.flush()

    # flush sonrası ID atandığından artık to_dict() çalışır
    for assignee_id, notif in notifs_to_push:
        _push_notification(assignee_id, notif)

    db.session.commit()
    return jsonify(task.to_dict()), 201


@api_bp.route('/tasks/<int:task_id>', methods=['GET'])
@_login_required
def get_task(task_id):
    user = _current_user()
    task = Task.query.get_or_404(task_id)
    project = Project.query.get_or_404(task.project_id)
    _, denied = _require_project_access(user, project)
    if denied:
        return denied
    return jsonify(task.to_detail_dict())


@api_bp.route('/tasks/<int:task_id>', methods=['PATCH'])
@_login_required
def update_task(task_id):
    user = _current_user()
    task = Task.query.get_or_404(task_id)
    project = Project.query.get_or_404(task.project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_tasks', 'Görev düzenleme yetkiniz yok'
    )
    if denied:
        return denied
    data = request.get_json(silent=True) or {}

    if 'title' in data:
        task.title = data['title'].strip() or task.title
    if 'desc' in data or 'description' in data:
        task.description = data.get('desc') or data.get('description') or ''
    if 'priority' in data:
        task.priority = data['priority']
    if 'progress' in data:
        task.progress = int(data['progress'])
    if 'due' in data:
        task.due_date = _parse_date(data['due'])

    if 'col' in data:
        new_col = BoardColumn.query.filter_by(
            project_id=task.project_id, slug=data['col']
        ).first()
        if new_col and new_col.id != task.column_id:
            task.column_id = new_col.id
            if new_col.is_done:
                task.progress = 100
            _log_activity(
                task.project_id, user,
                f'<em>{task.title}</em> kartını <strong>{new_col.title_tr or new_col.title}</strong>\'ye taşıdı'
            )

    if 'labels' in data:
        TaskLabel.query.filter_by(task_id=task.id).delete()
        for slug in data['labels']:
            label = Label.query.filter_by(project_id=task.project_id, slug=slug).first()
            if label:
                db.session.add(TaskLabel(task_id=task.id, label_id=label.id))

    # ── Atama bildirimi (görev güncellenirken) ──────────────────────────────
    if 'assignees' in data:
        # Mevcut atananları kaydet (silmeden önce)
        old_assignee_ids = {ta.user_id for ta in task.assignees}

        TaskAssignee.query.filter_by(task_id=task.id).delete()

        new_assignee_ids = set()
        for user_slug in data['assignees']:
            assignee = User.query.filter_by(slug=user_slug).first()
            if assignee:
                db.session.add(TaskAssignee(task_id=task.id, user_id=assignee.id))
                new_assignee_ids.add(assignee.id)

        # Sadece YENİ eklenen kişilere bildirim gönder
        notifs_to_push = []
        for aid in new_assignee_ids - old_assignee_ids:
            if aid != user.id:  # kendine bildirim gitmesin
                notif_text = (
                    f'<em>{user.name}</em> seni '
                    f'<strong>{task.title}</strong> görevine atadı'
                )
                notif = Notification(user_id=aid, text=notif_text)
                db.session.add(notif)
                notifs_to_push.append((aid, notif))

        db.session.flush()  # notif ID'leri oluşsun

        for aid, notif in notifs_to_push:
            _push_notification(aid, notif)

    db.session.commit()
    return jsonify(task.to_dict())


@api_bp.route('/tasks/<int:task_id>', methods=['DELETE'])
@_login_required
def delete_task(task_id):
    user = _current_user()
    task = Task.query.get_or_404(task_id)
    project = Project.query.get_or_404(task.project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_tasks', 'Görev silme yetkiniz yok'
    )
    if denied:
        return denied
    db.session.delete(task)
    db.session.commit()
    return jsonify({'ok': True})


# ── Subtasks ───────────────────────────────────────────────────────────────

@api_bp.route('/tasks/<int:task_id>/subtasks', methods=['GET'])
@_login_required
def get_subtasks(task_id):
    user = _current_user()
    task = Task.query.get_or_404(task_id)
    project = Project.query.get_or_404(task.project_id)
    _, denied = _require_project_access(user, project)
    if denied:
        return denied
    return jsonify([s.to_dict() for s in task.subtasks])


@api_bp.route('/tasks/<int:task_id>/subtasks', methods=['POST'])
@_login_required
def add_subtask(task_id):
    user = _current_user()
    task = Task.query.get_or_404(task_id)
    project = Project.query.get_or_404(task.project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_tasks', 'Alt görev ekleme yetkiniz yok'
    )
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or data.get('text') or '').strip()
    if not title:
        return jsonify({'error': 'Başlık zorunludur'}), 400
    pos = len(task.subtasks)
    s = Subtask(task_id=task_id, title=title, done=False, position=pos)
    db.session.add(s)
    db.session.commit()
    return jsonify(s.to_dict()), 201


@api_bp.route('/subtasks/<int:subtask_id>', methods=['PATCH'])
@_login_required
def update_subtask(subtask_id):
    user = _current_user()
    s = Subtask.query.get_or_404(subtask_id)
    project = Project.query.get_or_404(s.task.project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_tasks', 'Alt görev düzenleme yetkiniz yok'
    )
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    if 'done' in data:
        s.done = bool(data['done'])
    if 'title' in data:
        s.title = data['title']

    task = s.task
    all_subs = task.subtasks
    if all_subs:
        done_count = sum(1 for st in all_subs if st.done)
        task.progress = int(done_count / len(all_subs) * 100)

    db.session.commit()
    return jsonify(s.to_dict())


@api_bp.route('/subtasks/<int:subtask_id>', methods=['DELETE'])
@_login_required
def delete_subtask(subtask_id):
    user = _current_user()
    s = Subtask.query.get_or_404(subtask_id)
    project = Project.query.get_or_404(s.task.project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_tasks', 'Alt görev silme yetkiniz yok'
    )
    if denied:
        return denied
    db.session.delete(s)
    db.session.commit()
    return jsonify({'ok': True})


# ── Comments ───────────────────────────────────────────────────────────────

@api_bp.route('/tasks/<int:task_id>/comments', methods=['GET'])
@_login_required
def get_comments(task_id):
    user = _current_user()
    task = Task.query.get_or_404(task_id)
    project = Project.query.get_or_404(task.project_id)
    _, denied = _require_project_access(user, project)
    if denied:
        return denied
    return jsonify([c.to_dict() for c in task.comments])


@api_bp.route('/tasks/<int:task_id>/comments', methods=['POST'])
@_login_required
def add_comment(task_id):
    user = _current_user()
    task = Task.query.get_or_404(task_id)
    project = Project.query.get_or_404(task.project_id)
    _, denied = _require_project_access(user, project)
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'Yorum metni zorunludur'}), 400

    comment = Comment(task_id=task_id, user_id=user.id, text=text)
    db.session.add(comment)

    notifs_to_push = []
    for ta in task.assignees:
        if ta.user_id != user.id:
            notif_text = f'<em>{user.name}</em> yorum yazdı: "{text[:60]}{"..." if len(text) > 60 else ""}"'
            notif = Notification(user_id=ta.user_id, text=notif_text)
            db.session.add(notif)
            notifs_to_push.append((ta.user_id, notif))

    db.session.flush()

    for uid, notif in notifs_to_push:
        _push_notification(uid, notif)

    db.session.commit()
    return jsonify(comment.to_dict()), 201


@api_bp.route('/comments/<int:comment_id>', methods=['DELETE'])
@_login_required
def delete_comment(comment_id):
    user = _current_user()
    comment = Comment.query.get_or_404(comment_id)
    if comment.user_id != user.id:
        return jsonify({'error': 'Yetkisiz işlem'}), 403
    db.session.delete(comment)
    db.session.commit()
    return jsonify({'ok': True})


# ── Columns ────────────────────────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/columns', methods=['GET'])
@_login_required
def get_columns(project_id):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    _, denied = _require_project_access(user, project)
    if denied:
        return denied
    return jsonify([c.to_dict() for c in project.columns])


@api_bp.route('/projects/<int:project_id>/columns', methods=['POST'])
@_login_required
def create_column(project_id):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_projects', 'Kolon oluşturma yetkiniz yok'
    )
    if denied:
        return denied

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Başlık zorunludur'}), 400

    slug = title.lower().replace(' ', '-')
    pos = project.columns[-1].position + 1 if project.columns else 0
    col = BoardColumn(
        project_id=project_id,
        slug=slug,
        title=title,
        title_tr=data.get('title_tr') or title,
        color=data.get('color') or 'oklch(55% 0.02 250)',
        position=pos,
        is_done=bool(data.get('is_done', False)),
    )
    db.session.add(col)
    _log_activity(project_id, user, f"'{title}' isimli yeni bir kolon ekledi.")
    db.session.commit()
    return jsonify(col.to_dict()), 201


@api_bp.route('/columns/<int:col_id>', methods=['PATCH'])
@_login_required
def update_column(col_id):
    user = _current_user()
    col = BoardColumn.query.get_or_404(col_id)
    project = Project.query.get_or_404(col.project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_projects', 'Kolon düzenleme yetkiniz yok'
    )
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        col.title = data['title']
    if 'title_tr' in data:
        col.title_tr = data['title_tr']
    if 'color' in data:
        col.color = data['color']
    if 'is_done' in data:
        col.is_done = bool(data['is_done'])
    db.session.commit()
    return jsonify(col.to_dict())


@api_bp.route('/columns/<int:col_id>', methods=['DELETE'])
@_login_required
def delete_column(col_id):
    user = _current_user()
    col = BoardColumn.query.get_or_404(col_id)
    project = Project.query.get_or_404(col.project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_projects', 'Kolon silme yetkiniz yok'
    )
    if denied:
        return denied
    db.session.delete(col)
    db.session.commit()
    return jsonify({'ok': True})


# ── Labels ─────────────────────────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/labels', methods=['GET'])
@_login_required
def get_labels(project_id):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    _, denied = _require_project_access(user, project)
    if denied:
        return denied
    return jsonify({lbl.slug: lbl.to_dict_value() for lbl in project.labels})


@api_bp.route('/projects/<int:project_id>/labels', methods=['POST'])
@_login_required
def create_label(project_id):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_projects', 'Etiket oluşturma yetkiniz yok'
    )
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    slug = (data.get('slug') or '').strip()
    name_en = (data.get('name_en') or data.get('name') or '').strip()
    if not slug or not name_en:
        return jsonify({'error': 'slug ve name_en zorunludur'}), 400

    label = Label(
        project_id=project_id,
        slug=slug,
        name_en=name_en,
        name_tr=data.get('name_tr') or name_en,
        color_tone=data.get('tone') or 'blue',
    )
    db.session.add(label)
    db.session.commit()
    return jsonify({label.slug: label.to_dict_value()}), 201


@api_bp.route('/projects/<int:project_id>/labels/<slug>', methods=['DELETE'])
@_login_required
def delete_label(project_id, slug):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_projects', 'Etiket silme yetkiniz yok'
    )
    if denied:
        return denied
    label = Label.query.filter_by(project_id=project_id, slug=slug).first_or_404()
    TaskLabel.query.filter_by(label_id=label.id).delete()
    db.session.delete(label)
    db.session.commit()
    return jsonify({'ok': True})


# ── Notifications ──────────────────────────────────────────────────────────

@api_bp.route('/notifications', methods=['GET'])
@_login_required
def get_notifications():
    user = _current_user()
    notifs = (
        Notification.query
        .filter_by(user_id=user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify([n.to_dict() for n in notifs])


@api_bp.route('/notifications/<int:notif_id>/read', methods=['POST'])
@_login_required
def mark_read(notif_id):
    user = _current_user()
    notif = Notification.query.filter_by(id=notif_id, user_id=user.id).first_or_404()
    notif.read = True
    db.session.commit()
    return jsonify({'ok': True})


@api_bp.route('/notifications/read-all', methods=['POST'])
@_login_required
def mark_all_read():
    user = _current_user()
    Notification.query.filter_by(user_id=user.id, read=False).update({'read': True})
    db.session.commit()
    return jsonify({'ok': True})


@api_bp.route('/notifications/<int:notif_id>', methods=['DELETE'])
@_login_required
def delete_notification(notif_id):
    user = _current_user()
    notif = Notification.query.filter_by(id=notif_id, user_id=user.id).first_or_404()
    db.session.delete(notif)
    db.session.commit()
    return jsonify({'ok': True})


@api_bp.route('/notifications', methods=['POST'])
@_login_required
def create_notification():
    user = _current_user()
    data = request.get_json(silent=True) or {}
    text = data.get('text', '').strip()
    target_user_id = data.get('user_id', user.id)  # Default to current user, but allow specifying another
    
    if not text:
        return jsonify({'error': 'Bildirim metni gerekli'}), 400
    
    if target_user_id != user.id:
        target_user = User.query.get(target_user_id)
        if not target_user:
            return jsonify({'error': 'Kullanıcı bulunamadı'}), 404
    
    notif = Notification(user_id=target_user_id, text=text)
    db.session.add(notif)
    db.session.commit()
    _push_notification(target_user_id, notif)
    return jsonify(notif.to_dict()), 201


# ── Users ──────────────────────────────────────────────────────────────────

def _delete_project_tree(project):
    tasks = Task.query.filter_by(project_id=project.id).all()
    for task in tasks:
        TaskAssignee.query.filter_by(task_id=task.id).delete()
        TaskLabel.query.filter_by(task_id=task.id).delete()
        Subtask.query.filter_by(task_id=task.id).delete()
        Comment.query.filter_by(task_id=task.id).delete()
        db.session.delete(task)

    db.session.flush()
    Label.query.filter_by(project_id=project.id).delete()
    BoardColumn.query.filter_by(project_id=project.id).delete()
    ActivityLog.query.filter_by(project_id=project.id).delete()
    db.session.delete(project)


def _delete_workspace_tree(workspace):
    for project in Project.query.filter_by(workspace_id=workspace.id).all():
        _delete_project_tree(project)

    ChatMessage.query.filter_by(workspace_id=workspace.id).delete()
    WorkspaceMember.query.filter_by(workspace_id=workspace.id).delete()
    WorkspaceRole.query.filter_by(workspace_id=workspace.id).delete()
    db.session.delete(workspace)


@api_bp.route('/users/me', methods=['GET'])
@_login_required
def get_me():
    return jsonify(_user_private_dict(_current_user()))


@api_bp.route('/users/me', methods=['PUT'])
@_login_required
def update_me():
    user = _current_user()
    data = request.get_json(silent=True) or {}

    if 'name' in data:
        name = data['name'].strip()
        if name:
            user.name = name
            parts = name.split()
            user.avatar_initials = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else '')).upper()
    if 'role_title' in data:
        # Save workspace-specific title on the membership, fall back to user-level
        wm = WorkspaceMember.query.filter_by(
            user_id=user.id, workspace_id=user.current_workspace_id
        ).first()
        if wm:
            wm.role_title = data['role_title']
        else:
            user.role_title = data['role_title']
    if 'email' in data:
        new_email = data['email'].strip().lower()
        if new_email and new_email != user.email:
            if User.query.filter_by(email=new_email).first():
                return jsonify({'error': 'Bu e-posta adresi zaten kayıtlı'}), 409
            user.email = new_email
    if 'password' in data and data['password']:
        if len(data['password']) < 6:
            return jsonify({'error': 'Parola en az 6 karakter olmalıdır'}), 400
        user.set_password(data['password'])

    db.session.commit()
    wm_current = WorkspaceMember.query.filter_by(
        user_id=user.id, workspace_id=user.current_workspace_id
    ).first()
    return jsonify(_user_private_dict(user, wm_current))


# ── Projects ───────────────────────────────────────────────────────────────

@api_bp.route('/users/me', methods=['DELETE'])
@_login_required
def delete_me():
    user = _current_user()
    data = request.get_json(force=True, silent=True) or {}
    confirm_email = (data.get('email') or data.get('confirm_email') or '').strip().lower()

    if confirm_email != (user.email or '').lower():
        return jsonify({'error': 'Hesabı silmek için e-posta adresinizi doğru yazın'}), 400

    for ws in Workspace.query.filter_by(owner_id=user.id).all():
        replacement = (
            WorkspaceMember.query
            .filter(WorkspaceMember.workspace_id == ws.id, WorkspaceMember.user_id != user.id)
            .first()
        )
        if replacement:
            ws.owner_id = replacement.user_id
            replacement.role = 'owner'
            replacement.role_id = None
        else:
            _delete_workspace_tree(ws)

    TaskAssignee.query.filter_by(user_id=user.id).delete()
    Notification.query.filter_by(user_id=user.id).delete()
    Comment.query.filter_by(user_id=user.id).delete()
    ChatMessage.query.filter(
        or_(ChatMessage.sender_id == user.id, ChatMessage.receiver_id == user.id)
    ).delete(synchronize_session=False)
    ActivityLog.query.filter_by(user_id=user.id).update({'user_id': None})
    Task.query.filter_by(created_by=user.id).update({'created_by': None})
    WorkspaceMember.query.filter_by(user_id=user.id).delete()

    online_state.set_offline(user.id)
    db.session.delete(user)
    db.session.commit()
    session.clear()
    return jsonify({'ok': True})


@api_bp.route('/projects', methods=['GET'])
@_login_required
def get_projects():
    user = _current_user()
    member = _current_member(user)
    if not member:
        return jsonify([])
    projects = Project.query.filter_by(workspace_id=member.workspace_id).all()
    return jsonify([p.to_dict() for p in projects])


@api_bp.route('/projects', methods=['POST'])
@_login_required
def create_project():
    user = _current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Proje adı zorunludur'}), 400

    member = _current_member(user)
    if not member:
        return jsonify({'error': 'Çalışma alanı bulunamadı'}), 404

    if not _has_permission(member, 'manage_projects'):
        return jsonify({'error': 'Proje oluşturma yetkiniz yok'}), 403

    project = Project(
        workspace_id=member.workspace_id,
        name=name,
        color=data.get('color') or 'oklch(55% 0.13 25)',
        icon=data.get('icon') or 'folder',
    )
    db.session.add(project)
    db.session.flush()

    defaults = [
        ('backlog', 'Backlog',     'Bekleyen',     'oklch(55% 0.02 250)', 0),
        ('todo',    'To Do',       'Yapılacak',    'oklch(55% 0.09 230)', 1),
        ('doing',   'In Progress', 'Devam Ediyor', 'oklch(65% 0.11 70)',  2),
        ('review',  'In Review',   'İncelemede',   'oklch(58% 0.13 10)',  3),
        ('done',    'Done',        'Tamamlandı',   'oklch(55% 0.09 150)', 4),
    ]
    for slug, title, title_tr, color, pos in defaults:
        db.session.add(BoardColumn(
            project_id=project.id, slug=slug, title=title,
            title_tr=title_tr, color=color, position=pos
        ))

    db.session.commit()
    return jsonify(project.to_dict()), 201


@api_bp.route('/projects/<int:project_id>', methods=['PATCH'])
@_login_required
def update_project(project_id):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_projects', 'Proje düzenleme yetkiniz yok'
    )
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    if 'name' in data:
        project.name = data['name']
    if 'color' in data:
        project.color = data['color']
    if 'icon' in data:
        project.icon = data['icon']
    db.session.commit()
    return jsonify(project.to_dict())


@api_bp.route('/projects/<int:project_id>', methods=['DELETE'])
@_login_required
def delete_project(project_id):
    user = _current_user()
    project = Project.query.get_or_404(project_id)
    _, denied = _require_project_permission(
        user, project, 'manage_projects', 'Proje silme yetkiniz yok'
    )
    if denied:
        return denied
    db.session.delete(project)
    db.session.commit()
    return jsonify({'ok': True})


# ── Workspace logo upload ─────────────────────────────────────────────────

@api_bp.route('/workspaces/<int:ws_id>/logo', methods=['POST'])
@_login_required
def upload_workspace_logo(ws_id):
    from app.models import Workspace, WorkspaceMember
    user = _current_user()
    ws = Workspace.query.get_or_404(ws_id)
    if ws.owner_id != user.id:
        member = WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=user.id).first()
        if not member:
            return jsonify({'error': 'Yetkisiz'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'Dosya seçilmedi'}), 400
    f = request.files['file']
    if not f or not f.filename:
        return jsonify({'error': 'Geçersiz dosya'}), 400

    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in {'jpg', 'jpeg', 'png', 'gif', 'webp'}:
        return jsonify({'error': 'Sadece resim dosyaları yüklenebilir'}), 400

    f.seek(0, 2)
    size = f.tell()
    f.seek(0)
    if size > 5 * 1024 * 1024:
        return jsonify({'error': 'Logo 5 MB\'dan büyük olamaz'}), 400

    safe_name = f'ws_{ws_id}_{uuid.uuid4().hex[:8]}.{ext}'
    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'static', 'uploads', 'logos'
    )
    os.makedirs(upload_dir, exist_ok=True)
    f.save(os.path.join(upload_dir, safe_name))

    ws.logo_url = f'/static/uploads/logos/{safe_name}'
    db.session.commit()
    return jsonify({'logo_url': ws.logo_url})


@api_bp.route('/workspaces/<int:ws_id>/logo', methods=['DELETE'])
@_login_required
def delete_workspace_logo(ws_id):
    from app.models import Workspace
    user = _current_user()
    ws = Workspace.query.get_or_404(ws_id)
    if ws.owner_id != user.id:
        return jsonify({'error': 'Yetkisiz'}), 403
    ws.logo_url = None
    db.session.commit()
    return jsonify({'logo_url': None})


# ── Chat file upload ──────────────────────────────────────────────────────

ALLOWED_IMAGE = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
ALLOWED_VIDEO = {'mp4', 'webm', 'ogg', 'mov'}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@api_bp.route('/chat/upload', methods=['POST'])
@_login_required
def upload_chat_file():
    if 'file' not in request.files:
        return jsonify({'error': 'Dosya seçilmedi'}), 400
    f = request.files['file']
    if not f or not f.filename:
        return jsonify({'error': 'Geçersiz dosya'}), 400


    f.seek(0, 2)
    size = f.tell()
    f.seek(0)
    if size > MAX_UPLOAD_BYTES:
        return jsonify({'error': 'Dosya 50 MB\'dan büyük olamaz'}), 400

    orig_name = f.filename
    ext = orig_name.rsplit('.', 1)[-1].lower() if '.' in orig_name else ''

    if ext in ALLOWED_IMAGE:
        ftype = 'image'
    elif ext in ALLOWED_VIDEO:
        ftype = 'video'
    else:
        ftype = 'file'

    # Cloudinary: persistent cloud storage (set CLOUDINARY_URL env var to enable)
    cloudinary_url_env = os.environ.get('CLOUDINARY_URL')
    if cloudinary_url_env:
        try:
            import cloudinary
            import cloudinary.uploader
            cloudinary.config.from_url(cloudinary_url_env)
            resource_type = 'image' if ftype == 'image' else ('video' if ftype == 'video' else 'raw')
            result = cloudinary.uploader.upload(
                f, resource_type=resource_type,
                use_filename=True, unique_filename=True,
                folder='stoaboard/chat',
            )
            return jsonify({
                'url': result['secure_url'],
                'type': ftype,
                'name': orig_name,
                'size': size,
            })
        except Exception:
            f.seek(0)  # reset for local fallback

    # Local storage fallback (ephemeral on Railway without a volume)
    safe_name = f'{uuid.uuid4().hex}.{ext}' if ext else uuid.uuid4().hex
    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'static', 'uploads', 'chat'
    )
    os.makedirs(upload_dir, exist_ok=True)
    f.save(os.path.join(upload_dir, safe_name))

    return jsonify({
        'url': f'/static/uploads/chat/{safe_name}',
        'type': ftype,
        'name': orig_name,
        'size': size,
    })


# ── Chat messages ──────────────────────────────────────────────────────────

@api_bp.route('/chat/messages', methods=['POST'])
@_login_required
def create_chat_message():
    user = _current_user()
    data = request.get_json(silent=True) or {}

    text     = (data.get('text') or '').strip()
    to_slug  = data.get('to') or None
    file_url  = data.get('file_url') or None
    file_type = data.get('file_type') or None
    file_name = data.get('file_name') or None

    if not text and not file_url:
        return jsonify({'error': 'Mesaj boş olamaz'}), 400

    receiver = None
    workspace_id = None

    if to_slug:
        receiver = User.query.filter_by(slug=to_slug).first()
        if not receiver:
            return jsonify({'error': 'Kullanıcı bulunamadı'}), 404
        workspace_id = user.current_workspace_id
        if not workspace_id:
            m = _current_member(user)
            workspace_id = m.workspace_id if m else None
    else:
        m = _current_member(user)
        workspace_id = m.workspace_id if m else None

    msg = ChatMessage(
        workspace_id=workspace_id,
        sender_id=user.id,
        receiver_id=receiver.id if receiver else None,
        text=text or None,
        file_url=file_url,
        file_type=file_type,
        file_name=file_name,
    )
    db.session.add(msg)
    db.session.flush()

    notifs_to_push = []

    # DM notification
    if receiver:
        notif = Notification(
            user_id=receiver.id,
            text=f'<strong>{user.name}</strong> sana mesaj gönderdi: {text[:80]}',
        )
        db.session.add(notif)
        db.session.flush()
        notifs_to_push.append((receiver.id, notif))

    # @mention notifications
    if text:
        mentions = re.findall(r'@([\w\-]+)', text)
        notified = set()
        if receiver:
            notified.add(receiver.slug)
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
                )
                db.session.add(m_notif)
                db.session.flush()
                notifs_to_push.append((mentioned.id, m_notif))

    db.session.commit()

    for uid, notif in notifs_to_push:
        _push_notification(uid, notif)

    msg_data = msg.to_dict()

    # Broadcast via socket
    from app import socketio as _sio
    try:
        if receiver:
            _sio.emit('chat_message', msg_data, to=f'user_{user.id}')
            _sio.emit('chat_message', msg_data, to=f'user_{receiver.id}')
        elif workspace_id:
            _sio.emit('chat_message', msg_data, to=f'ws_{workspace_id}')
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning('socket emit failed: %s', e)

    return jsonify(msg_data), 201


@api_bp.route('/chat/messages', methods=['GET'])
@_login_required
def get_chat_messages():
    user = _current_user()
    with_slug = request.args.get('with')
    limit = request.args.get('limit', 100, type=int)

    if with_slug:
        # DMs are global — not restricted by workspace
        other = User.query.filter_by(slug=with_slug).first()
        if not other:
            return jsonify([])
        messages = (
            ChatMessage.query
            .filter(
                db.or_(
                    db.and_(ChatMessage.sender_id == user.id, ChatMessage.receiver_id == other.id),
                    db.and_(ChatMessage.sender_id == other.id, ChatMessage.receiver_id == user.id),
                )
            )
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
            .all()
        )
    else:
        # General team chat: use active workspace
        ws_id = user.current_workspace_id
        if not ws_id:
            member = _current_member(user)
            ws_id = member.workspace_id if member else None
        if not ws_id:
            return jsonify([])
        messages = (
            ChatMessage.query
            .filter_by(workspace_id=ws_id, receiver_id=None)
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
            .all()
        )

    uid = user.id
    result = []
    for m in messages:
        hidden = _parse_hidden_for(m.hidden_for)
        if uid in hidden:
            continue
        result.append(m.to_dict())
    return jsonify(result)


@api_bp.route('/chat/messages/<int:msg_id>', methods=['DELETE'])
@_login_required
def delete_chat_message(msg_id):
    user = _current_user()
    if not user:
        return jsonify({'error': 'Giriş yapmanız gerekiyor'}), 401
    scope = (request.get_json(silent=True) or {}).get('scope', 'self')

    msg = db.session.get(ChatMessage, msg_id)
    if not msg:
        return jsonify({'error': 'Mesaj bulunamadı'}), 404

    is_sender = msg.sender_id == user.id
    is_receiver = msg.receiver_id == user.id
    if not is_sender and not is_receiver and msg.receiver_id is not None:
        return jsonify({'error': 'Yetkiniz yok'}), 403
    if not is_sender and msg.receiver_id is None:
        return jsonify({'error': 'Yetkiniz yok'}), 403

    if scope == 'all':
        if not is_sender:
            return jsonify({'error': 'Sadece gönderen herkesten silebilir'}), 403
        msg.is_deleted = True
        db.session.commit()
        from app import socketio as _sio
        try:
            if msg.receiver_id:
                _sio.emit('message_deleted', {'id': msg_id, 'scope': 'all'}, to=f'user_{msg.sender_id}')
                _sio.emit('message_deleted', {'id': msg_id, 'scope': 'all'}, to=f'user_{msg.receiver_id}')
            elif msg.workspace_id:
                _sio.emit('message_deleted', {'id': msg_id, 'scope': 'all'}, to=f'ws_{msg.workspace_id}')
        except Exception:
            pass
    else:
        hidden = list(_parse_hidden_for(msg.hidden_for))
        if user.id not in hidden:
            hidden.append(user.id)
            msg.hidden_for = hidden
            db.session.commit()

    return jsonify({'ok': True})


@api_bp.route('/chat/media', methods=['GET'])
@_login_required
def get_chat_media():
    """Return media/file messages split by type (general or dm)."""
    user = _current_user()
    msg_type = request.args.get('type', 'general')  # 'general' or 'dm'
    ws_id = user.current_workspace_id
    if not ws_id:
        member = _current_member(user)
        ws_id = member.workspace_id if member else None
    if not ws_id:
        return jsonify([])

    if msg_type == 'dm':
        # All DM media involving current user
        messages = (
            ChatMessage.query
            .filter(
                ChatMessage.file_url != None,
                ChatMessage.receiver_id != None,
                db.or_(
                    ChatMessage.sender_id == user.id,
                    ChatMessage.receiver_id == user.id,
                ),
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(200)
            .all()
        )
    else:
        messages = (
            ChatMessage.query
            .filter(
                ChatMessage.workspace_id == ws_id,
                ChatMessage.receiver_id == None,
                ChatMessage.file_url != None,
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(200)
            .all()
        )
    return jsonify([m.to_dict() for m in messages])


# ── Helpers ────────────────────────────────────────────────────────────────

def _parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


def _next_position(project_id, column_id):
    last = (
        Task.query
        .filter_by(project_id=project_id, column_id=column_id)
        .order_by(Task.position.desc())
        .first()
    )
    return (last.position + 1.0) if last else 0.0
