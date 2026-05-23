// App shell: sidebar + topbar + shared bits

import React, { useState, useEffect } from 'react';
import { Icon } from './icons.jsx';

// ── Global Toast State ────────────────────────────────────────────────────
window.TOAST_QUEUE = [];
window.TOAST_LISTENER = null;

function showToast(message, type = 'info', meta = null) {
  const id = Date.now() + Math.random();
  const toast = typeof message === 'object'
    ? { id, type, _createdAt: Date.now(), ...message }
    : { id, message, type, meta, _createdAt: Date.now() };
  window.TOAST_QUEUE.push(toast);
  if (window.TOAST_LISTENER) {
    window.TOAST_LISTENER([...window.TOAST_QUEUE]);
  }
}

function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    window.TOAST_LISTENER = (newToasts) => setToasts(newToasts);
    const interval = setInterval(() => {
      const now = Date.now();
      window.TOAST_QUEUE = window.TOAST_QUEUE.filter(t => (now - (t._createdAt || now)) < 5000);
      if (window.TOAST_LISTENER) window.TOAST_LISTENER([...window.TOAST_QUEUE]);
    }, 400);
    return () => { clearInterval(interval); window.TOAST_LISTENER = null; };
  }, []);

  const removeToast = (id) => {
    window.TOAST_QUEUE = window.TOAST_QUEUE.filter(t => t.id !== id);
    setToasts([...window.TOAST_QUEUE]);
  };

  const handleClick = (toast) => {
    removeToast(toast.id);
    if (toast.type === 'message' && window.__OPEN_CHAT__) {
      window.__OPEN_CHAT__(toast.meta?.dmWith || null, null, toast.meta?.channelSlug || null);
    }
  };

  return (
    <div className="toast-stack">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast-item toast-${toast.type || 'info'}`} onClick={() => handleClick(toast)}>
          {toast.type === 'message' && toast.meta ? (
            <>
              <div className="toast-msg-head">
                <span className="toast-msg-name">{toast.meta.sender}</span>
                <span className="toast-msg-channel">{toast.meta.channel}</span>
                <span className="toast-msg-time">{toast.meta.time}</span>
              </div>
              <div className="toast-msg-text">
                {toast.message}
                {toast.meta.truncated && <span className="toast-see-more"> {window.t?.('shell_see_more')||'devamını gör'} →</span>}
              </div>
            </>
          ) : (
            <div className="toast-msg-text">{toast.message}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function Avatar({ member, size = 'sm' }) {
  if (!member) return null;
  if (member.avatar_photo_url) {
    return (
      <div className="avatar" data-size={size} style={{ background: 'var(--bg-subtle)', padding: 0, overflow: 'hidden' }} title={member.name}>
        <img src={member.avatar_photo_url} alt={member.initials} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div className="avatar" data-size={size} style={{ background: member.color || 'var(--ink-muted)' }} title={member.name}>
      {member.initials}
    </div>
  );
}

function AvatarStack({ members, size = 'sm', max = 4 }) {
  const shown = members.slice(0, max);
  const rest = members.length - max;
  return (
    <div className="avatar-stack">
      {shown.map(m => <Avatar key={m.id} member={m} size={size} />)}
      {rest > 0 && (
        <div className="avatar" data-size={size} style={{ background: 'var(--ink-dim)', color: 'var(--ink-2)' }}>
          +{rest}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  collapsed, onCollapseToggle, view, onView,
  projects, members: membersProp, openCmd,
  onlineUsers, onlineStatuses,
  onChatOpen, onSwitchProject, onNewProject,
  canManageProjects,
  workspaces, wsLogoUrl, onSwitchWorkspace, onAddWorkspace,
  wsSwitcherOpen, onWsSwitcherToggle,
  currentStatus, onStatusChange,
  mobileOpen, onMobileClose,
  unreadCounts,
  currentWsId,
  myTasksOpenCount,
  notifCount,
  onOpenNotifs,
  notesCount,
  trashCount,
}) {
  const me = window.CURRENT_USER || {};
  const online = onlineUsers || new Set();
  const statuses = onlineStatuses || new Map();
  const teamMembers = (membersProp || DATA.MEMBERS || []).filter(m => m.id !== me.id);
  const unreads = unreadCounts || {};
  const generalKey = currentWsId ? `general_${currentWsId}` : 'general';
  const generalUnread = unreads[generalKey] || 0;
  // Total chat unread = general + all DMs (excludes media tracker)
  const chatUnreadTotal = Object.entries(unreads).reduce((acc, [k, v]) => {
    if (k === 'media') return acc;
    return acc + (v || 0);
  }, 0);

  const myStatus = typeof currentStatus === 'string' ? currentStatus : (currentStatus?.current || 'online');
  const wsSwitcherRef = React.useRef(null);

  useEffect(() => {
    if (!wsSwitcherOpen) return;
    const handler = (e) => {
      if (wsSwitcherRef.current && !wsSwitcherRef.current.contains(e.target)) {
        onWsSwitcherToggle?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [wsSwitcherOpen]);

  return (
    <aside className="sidebar" data-collapsed={collapsed} data-mobile-open={mobileOpen}>

      {/* Header — logo doubles as expand button when collapsed */}
      <div className="sidebar-header">
        <div
          className="sidebar-logo"
          onClick={collapsed ? onCollapseToggle : undefined}
          style={collapsed ? { cursor: 'pointer' } : undefined}
          title={collapsed ? (window.t?.('shell_expand')||'Genişlet') : undefined}
        >
          <img src="/static/StoaBoard_symbol.png" width={18} height={18}
            style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', display: 'block' }}
            onError={e => { e.target.style.display='none'; e.target.parentNode.textContent='S'; }}
          />
        </div>
        <div className="sidebar-logo-text">Stoa<em>Board</em></div>
        <button className="sidebar-collapse-btn" onClick={onCollapseToggle} title={collapsed ? (window.t?.('shell_expand')||'Genişlet') : (window.t?.('shell_collapse')||'Daralt')}>
          <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={14} />
        </button>
      </div>

      {/* Workspace switcher */}
      <div style={{ position: 'relative' }} ref={wsSwitcherRef}>
        <div className="workspace-switcher" title={DATA.WORKSPACE?.name || 'StoaBoard'}
          onClick={onWsSwitcherToggle}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <div className="ws-avatar" style={wsLogoUrl ? { padding: 0, overflow: 'hidden' } : {}}>
            {wsLogoUrl
              ? <img src={wsLogoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : (DATA.WORKSPACE?.name || 'S')[0].toUpperCase()
            }
          </div>
          <div className="ws-info">
            <div className="ws-name">{DATA.WORKSPACE?.name || 'StoaBoard'}</div>
            <div className="ws-sub">{DATA.MEMBERS.length} {window.t?.('shell_members') || 'üye'}</div>
          </div>
          <div className="ws-arrow">
            <Icon name={wsSwitcherOpen ? 'chevronUp' : 'chevronDown'} size={14} />
          </div>
        </div>

        {/* Workspace dropdown */}
        {wsSwitcherOpen && (workspaces || []).length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 8, right: 8, zIndex: 200,
            background: 'var(--bg-raised)', border: '1px solid var(--line)',
            borderRadius: 10, boxShadow: '0 8px 24px oklch(0% 0 0 / 0.15)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-faint)' }}>
              {window.t?.('shell_workspaces')||'Çalışma Alanları'}
            </div>
            {(workspaces || []).map(ws => (
              <div key={ws.id}
                onClick={() => { if (!ws.is_current) onSwitchWorkspace(ws.id); else onWsSwitcherToggle(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', cursor: ws.is_current ? 'default' : 'pointer',
                  background: ws.is_current ? 'var(--bg-dim)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!ws.is_current) e.currentTarget.style.background = 'var(--bg-dim)'; }}
                onMouseLeave={e => { if (!ws.is_current) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0, fontSize: 12, fontWeight: 700,
                  background: 'var(--accent)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {ws.logo_url
                    ? <img src={ws.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : (ws.name || '?')[0].toUpperCase()
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ws.name}
                  </div>
                  {ws.is_owner && <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Sahibi</div>}
                </div>
                {ws.is_current && <Icon name="check" size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--line)', padding: 6 }}>
              <div
                onClick={() => { onWsSwitcherToggle(); onAddWorkspace?.(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--ink-muted)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-dim)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Icon name="plus" size={13} /> {window.t?.('shell_new_team')||'Yeni Takım Oluştur / Katıl'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-search" onClick={openCmd}>
        <Icon name="search" size={14} />
        <span className="sidebar-label">{window.t?.('shell_search') || 'Ara veya komut...'}</span>
        <kbd className="sidebar-label">⌘K</kbd>
      </div>

      <div className="sidebar-section">
        <NavItem icon="home"          label={window.t?.('nav_home') || 'Ana Sayfa'}   sub="Dashboard" onClick={() => onView('dashboard')} active={view === 'dashboard'} />
        <NavItem icon="circleCheck"   label={window.t?.('nav_tasks') || 'Görevlerim'}  sub="My Tasks"
          badge={myTasksOpenCount > 0 ? (myTasksOpenCount > 99 ? '99+' : String(myTasksOpenCount)) : null}
          badgeUnread
          onClick={() => {
            localStorage.setItem('stoa.filterMyTasks', 'true');
            window.dispatchEvent(new CustomEvent('stoa:activateMyTasks'));
            onView('board');
          }}
          active={false}
        />
        <NavItem icon="layoutBoard"   label={window.t?.('nav_board') || 'Pano'}       sub="Kanban"    onClick={() => onView('board')}     active={view === 'board'} />
        <NavItem icon="calendar"      label={window.t?.('nav_calendar') || 'Takvim'}  sub="Calendar"  onClick={() => onView('calendar')}  active={view === 'calendar'} />
        <NavItem icon="msg"           label={window.t?.('nav_chat') || 'Sohbet'}      sub="Chat"
          badge={chatUnreadTotal > 0 ? (chatUnreadTotal > 99 ? '99+' : String(chatUnreadTotal)) : null}
          badgeUnread
          onClick={() => onView('chat')}
          active={view === 'chat'}
        />
        <NavItem icon="note"          label={window.t?.('nav_notes') || 'Notlar'}     sub="Notes"
          badge={notesCount > 0 ? (notesCount > 99 ? '99+' : String(notesCount)) : null}
          onClick={() => onView('notes')}
          active={view === 'notes'}
        />
        <NavItem icon="bell"          label={window.t?.('nav_notifications') || 'Bildirimler'} sub="Notifications"
          badge={notifCount > 0 ? (notifCount > 99 ? '99+' : String(notifCount)) : null}
          badgeUnread
          onClick={() => onOpenNotifs?.()}
          active={view === 'notifications'}
        />
        <NavItem icon="trash"         label={window.t?.('nav_trash') || 'Çöp Kutusu'}         sub="Trash"
          badge={trashCount > 0 ? (trashCount > 99 ? '99+' : String(trashCount)) : null}
          onClick={() => onView('trash')}
          active={view === 'trash'}
        />
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>{window.t?.('nav_projects') || 'Projeler'}</span>
          {canManageProjects && <button title={window.t?.('nav_new_project') || 'Yeni proje'} onClick={onNewProject}><Icon name="plus" size={13} /></button>}
        </div>
        {(projects || []).map(p => (
          <div className="project-item" key={p.id} onClick={() => onSwitchProject && onSwitchProject(p.id)}>
            <div style={{ width:18, height:18, borderRadius:5, background:p.color, display:'grid', placeItems:'center', color:'white', flexShrink:0 }}>
              <Icon name={p.icon || 'folder'} size={11} strokeWidth={2} />
            </div>
            <span className="sidebar-label">{p.name}</span>
            <span className="project-meta">{p.open}</span>
          </div>
        ))}
        {(projects || []).length === 0 && (
          <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--ink-faint)' }}>
            <span className="sidebar-label">{window.t?.('nav_no_projects') || 'Henüz proje yok'}</span>
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title"><span>{window.t?.('nav_dms') || 'Direkt Mesajlar'}</span></div>
        {teamMembers.slice(0, 6).map(m => {
          const mStatus = statuses.get(m.id) || (online.has(m.id) ? 'online' : 'offline');
          const dotColor = { online: 'var(--status-green)', away: 'oklch(75% 0.14 75)', dnd: 'var(--status-rose)', offline: 'var(--ink-faint)' }[mStatus];
          const dmUnread = unreads[`dm_${m.id}`] || 0;
          return (
            <div className="project-item" key={m.id} onClick={() => onChatOpen && onChatOpen(m.id)}>
              <div style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
                <Avatar member={m} size="sm" />
                <span style={{ position: 'absolute', bottom: -1, right: -1, width: 7, height: 7, borderRadius: '50%', background: dotColor, border: '1.5px solid var(--bg)' }} />
              </div>
              <span className="sidebar-label">{m.name}</span>
              {dmUnread > 0 && (
                <span className="nav-badge" data-new="true" style={{ marginLeft: 'auto' }}>
                  {dmUnread > 9 ? '9+' : dmUnread}
                </span>
              )}
            </div>
          );
        })}
        {teamMembers.length === 0 && (
          <div style={{ padding: '4px 10px', fontSize: 12, color: 'var(--ink-faint)' }}>
            <span className="sidebar-label">{window.t?.('nav_no_members') || 'Henüz başka üye yok'}</span>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <NavItem icon="settings" label={window.t?.('nav_settings') || 'Ayarlar'} sub="Settings" onClick={() => onView('settings')} active={view === 'settings'} />
        <StatusProfileWidget me={me} myStatus={myStatus} onStatusChange={onStatusChange} collapsed={collapsed} />
      </div>
    </aside>
  );
}

// ── Status Profile Widget ──────────────────────────────────────────────────
function StatusProfileWidget({ me, myStatus, onStatusChange, collapsed }) {
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState({ bottom: 60, left: 8, width: 200 });
  const triggerRef = React.useRef(null);
  const popupRef = React.useRef(null);

  const statusOptions = [
    { key: 'online', label: window.t?.('shell_status_online') || 'Çevrimiçi', color: 'var(--status-green)' },
    { key: 'away',   label: window.t?.('shell_status_away')   || 'Uzakta',    color: 'oklch(75% 0.14 75)' },
    { key: 'dnd',    label: window.t?.('shell_status_dnd')    || 'Rahatsız Etme', color: 'var(--status-rose)' },
  ];
  const current = statusOptions.find(s => s.key === myStatus) || statusOptions[0];

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupPos({
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
        width: Math.max(rect.width, 200),
      });
    }
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const inTrigger = triggerRef.current && triggerRef.current.contains(e.target);
      const inPopup = popupRef.current && popupRef.current.contains(e.target);
      if (!inTrigger && !inPopup) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={triggerRef}>
      {open && (
        <div ref={popupRef} style={{
          position: 'fixed',
          bottom: popupPos.bottom,
          left: popupPos.left,
          width: popupPos.width,
          background: 'var(--bg-raised)', border: '1px solid var(--line)',
          borderRadius: 10, boxShadow: '0 4px 16px oklch(0% 0 0 / 0.18)',
          overflow: 'hidden', zIndex: 9999,
        }}>
          <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-faint)' }}>
            Durum
          </div>
          {statusOptions.map(opt => (
            <div key={opt.key}
              onClick={() => { onStatusChange?.(opt.key); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                cursor: 'pointer', background: myStatus === opt.key ? 'var(--bg-dim)' : 'transparent',
                fontSize: 13,
              }}
              onMouseEnter={e => { if (myStatus !== opt.key) e.currentTarget.style.background = 'var(--bg-dim)'; }}
              onMouseLeave={e => { if (myStatus !== opt.key) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
              {opt.label}
              {myStatus === opt.key && <Icon name="check" size={12} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
            </div>
          ))}
        </div>
      )}
      <div className="user-profile" onClick={handleToggle} style={{ cursor: 'pointer' }}
        title={collapsed ? `${me.name} — ${current.label}` : undefined}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar member={me} size="md" />
          <span style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 8, height: 8, borderRadius: '50%',
            background: current.color,
            border: '1.5px solid var(--bg)',
          }} />
        </div>
        {!collapsed && (
          <>
            <div className="user-meta">
              <div className="user-name">{me.name}</div>
              <div className="user-status" style={{ color: current.color, '--user-status-dot': current.color }}>{current.label}</div>
            </div>
            <Icon name="chevronUp" size={12} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
          </>
        )}
      </div>
    </div>
  );
}

function NavItem({ icon, label, sub, badge, badgeUnread, active, onClick }) {
  return (
    <div className="nav-item" data-active={!!active} onClick={onClick} title={sub}>
      <Icon name={icon} size={16} />
      <span className="sidebar-label">{label}</span>
      {badge && <span className="nav-badge" data-new={badge === 'Yeni' || !!badgeUnread}>{badge}</span>}
    </div>
  );
}

function Topbar({ view, onView, openCmd, openNotifs, openModal, activeCrumb, onChatOpen, notifCount, canManageTasks, onMobileMenuToggle }) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const inviteCode = DATA.WORKSPACE?.invite_code || null;

  const handleCopyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="topbar">
      <button className="mobile-menu-btn" onClick={onMobileMenuToggle} title={window.t?.('shell_menu')||'Menü'}>
        <Icon name="menu" size={18} />
      </button>
      <div className="topbar-crumbs">
        <span>{DATA.WORKSPACE?.name || 'StoaBoard'}</span>
        <span className="sep"><Icon name="chevronRight" size={12} /></span>
        <span className="current">{activeCrumb}</span>
      </div>
      <div className="topbar-right">
        {(view === 'board' || view === 'calendar' || view === 'dashboard') && (
          <div className="view-switch">
            <button data-active={view==='dashboard'} onClick={() => onView('dashboard')}><Icon name="home" size={13} /> {window.t?.('nav_home') || 'Ana Sayfa'}</button>
            <button data-active={view==='board'}     onClick={() => onView('board')}>    <Icon name="layoutBoard" size={13} /> {window.t?.('nav_board') || 'Pano'}</button>
            <button data-active={view==='calendar'}  onClick={() => onView('calendar')}> <Icon name="calendar" size={13} /> {window.t?.('nav_calendar') || 'Takvim'}</button>
          </div>
        )}
        {inviteCode && (
          <div className="topbar-invite" title="Davet kodu">
            <span className="topbar-invite-code">{showCode ? inviteCode : '•'.repeat(inviteCode.length)}</span>
            <button className="icon-btn topbar-invite-eye" onClick={() => setShowCode(v => !v)} title={showCode ? (window.t?.('shell_hide') || 'Gizle') : (window.t?.('shell_show') || 'Göster')}>
              <Icon name={showCode ? 'eyeOff' : 'eye'} size={13} />
            </button>
            <button className="icon-btn topbar-invite-eye" onClick={handleCopyCode} title={copied ? (window.t?.('shell_copied') || 'Kopyalandı!') : (window.t?.('shell_copy') || 'Kopyala')}>
              <Icon name={copied ? 'check' : 'copy'} size={13} />
            </button>
          </div>
        )}
        <button className="icon-btn" onClick={openCmd}    title={window.t?.('shell_cmd_title') || 'Komut paleti (⌘K)'}><Icon name="search" size={16} /></button>
        <button
          className="icon-btn"
          onClick={view === 'chat' ? undefined : onChatOpen}
          disabled={view === 'chat'}
          title={view === 'chat' ? (window.t?.('topbar_chat_open') || 'Sohbet zaten tam ekran açık') : (window.t?.('topbar_quick_chat') || 'Hızlı Sohbet')}
          style={view === 'chat' ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
        >
          <Icon name="msg" size={16} />
        </button>
        <button className="icon-btn" onClick={openNotifs} title="Bildirimler" style={{ position: 'relative' }}>
          <Icon name="bell" size={16} />
          {notifCount > 0
            ? <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, background: 'var(--status-rose)', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', lineHeight: 1 }}>{notifCount > 9 ? '9+' : notifCount}</span>
            : <span className="pip" />
          }
        </button>
        {canManageTasks && <button className="btn btn-primary" onClick={openModal}><Icon name="plus" size={14} /> {window.t?.('topbar_new_task')?.replace('+ ','') || 'Yeni görev'}</button>}
      </div>
    </div>
  );
}

export { showToast, ToastContainer, Avatar, AvatarStack, Sidebar, Topbar, NavItem, StatusProfileWidget };
