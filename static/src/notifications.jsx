// Notifications panel — API-backed

function _notifType(text) {
  if (!text) return 'info';
  const t = text.toLowerCase();
  if (/mesaj gönderdi|gönderdi:/.test(t)) return 'message';
  if (/atadı|görev|atand/.test(t)) return 'task';
  if (/@/.test(t)) return 'mention';
  return 'info';
}

function _notifIcon(type) {
  return { message: 'msg', task: 'circleCheck', mention: 'tag', info: 'bell' }[type] || 'bell';
}

function NotifPanel({ open, onClose, socket, onOpenTask, onOpenChat, currentWsId }) {
  const [tab, setTab]     = React.useState('all');
  const [items, setItems] = React.useState(() => DATA.NOTIFICATIONS || []);
  const panelRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      API.getNotifications()
        .then(notifs => { setItems(notifs); DATA.NOTIFICATIONS = notifs; })
        .catch(() => {});
    }
  }, [open]);

  React.useEffect(() => {
    const sock = socket || window.SOCKET;
    if (!sock) return;
    const onNewNotification = (notif) => {
      setItems(prev => {
        if (prev.some(n => n.id === notif.id)) return prev;
        const newItems = [notif, ...prev];
        DATA.NOTIFICATIONS = newItems;
        return newItems;
      });
    };
    sock.on('notification', onNewNotification);
    return () => sock.off('notification', onNewNotification);
  }, [socket]);

  const markRead = async (id) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
    try { await API.markRead(id); } catch (_) {}
  };

  const markAllRead = async () => {
    setItems(prev => prev.map(n => ({ ...n, unread: false })));
    try { await API.markAllRead(); } catch (_) {}
  };

  const dismiss = async (e, id) => {
    e.stopPropagation();
    setItems(prev => prev.filter(n => n.id !== id));
    try { await API.deleteNotif(id); } catch (_) {}
  };

  const handleNotifClick = (n) => {
    markRead(n.id);
    if (n.task_id) {
      const task = (window.DATA?.tasks || []).find(t => String(t.id) === String(n.task_id))
                || (window.__APP_TASKS__ || []).find(t => String(t.id) === String(n.task_id));
      if (task) { onOpenTask?.(task); onClose(); return; }
      if (window.__OPEN_TASK_BY_ID__) { window.__OPEN_TASK_BY_ID__(n.task_id); onClose(); return; }
    }
    if (n.sender_slug) {
      onOpenChat?.(n.sender_slug);
      onClose();
    }
  };

  // Show current workspace's notifications + DM notifications always
  const visibleItems = currentWsId
    ? items.filter(n => !n.workspace_id || n.workspace_id === currentWsId || _notifType(n.text) === 'message')
    : items;
  const filtered    = tab === 'unread' ? visibleItems.filter(n => n.unread) : visibleItems;
  const unreadCount = visibleItems.filter(n => n.unread).length;

  return (
    <>
      <div className="notif-panel" ref={panelRef} data-open={open}>
        <div className="notif-head">
          <div className="notif-title">Bildirimler</div>
          {unreadCount > 0 && <div className="notif-count">{unreadCount}</div>}
          <div className="notif-tabs">
            <button data-active={tab === 'all'}    onClick={() => setTab('all')}>Tümü</button>
            <button data-active={tab === 'unread'} onClick={() => setTab('unread')}>Okunmamış</button>
          </div>
        </div>

        <div className="notif-list">
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              <Icon name="check" size={20} /><br />Hepsi bu kadar.
            </div>
          )}
          {filtered.map(n => {
            const type = n.type || _notifType(n.text);
            return (
              <div
                key={n.id}
                className={`notif-item notif-type-${type}`}
                data-unread={n.unread}
                onClick={() => handleNotifClick(n)}
                style={{ cursor: (n.task_id || n.sender_slug) ? 'pointer' : 'default' }}
              >
                <div className="notif-icon-badge">
                  <Icon name={_notifIcon(type)} size={13} />
                </div>
                <div className="notif-body">
                  <div className="notif-text" dangerouslySetInnerHTML={{ __html: n.text }} />
                  <div className="notif-time">{n.time}</div>
                </div>
                {(n.task_id || n.sender_slug) && (
                  <Icon name="arrowRight" size={11} style={{ color: 'var(--ink-faint)', flexShrink: 0, marginRight: 24 }} />
                )}
                <button
                  className="notif-dismiss"
                  onClick={(e) => dismiss(e, n.id)}
                  title="Kaldır"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', fontSize: 12 }}>
          <button style={{ color: 'var(--ink-muted)' }} onClick={markAllRead}>
            Tümünü okundu işaretle
          </button>
          <button style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }} onClick={onClose}>
            Kapat <Icon name="arrowRight" size={11} />
          </button>
        </div>
      </div>
    </>
  );
}

window.NotifPanel = NotifPanel;
