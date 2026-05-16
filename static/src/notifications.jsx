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
  return { message: 'msg', task: 'circleCheck', mention: 'at', calendar: 'calendar', info: 'bell' }[type] || 'bell';
}

function _notifCategory(n) {
  // Returns one of: 'mention' | 'message' | 'task' | 'calendar' | 'other'
  if (n.type) {
    if (['mention','message','task','calendar'].includes(n.type)) return n.type;
  }
  const t = (n.text || '').toLowerCase();
  if (/@/.test(t)) return 'mention';
  if (n.chat_channel || n.sender_slug || /mesaj/.test(t)) return 'message';
  if (n.task_id || /görev|atandı|atadı/.test(t)) return 'task';
  if (/takvim|hatırlat|toplantı|etkinlik/.test(t)) return 'calendar';
  return 'other';
}

function NotifPanel({ open, onClose, socket, onOpenTask, onOpenChat, currentWsId, tweaks, setTweak, fullPage }) {
  const [tab, setTab]           = React.useState('all');
  const [prefsOpen, setPrefsOpen] = React.useState(fullPage);
  const [items, setItems]       = React.useState(() => DATA.NOTIFICATIONS || []);
  const [confirmDel, setConfirmDel] = React.useState(false);
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

  const deleteAll = async () => {
    const ids = filtered.map(n => n.id);
    setItems(prev => prev.filter(n => !ids.includes(n.id)));
    setConfirmDel(false);
    try { await Promise.all(ids.map(id => API.deleteNotif(id))); } catch (_) {}
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
    // @mention in general chat → open general channel, scroll to message
    if (n.chat_channel === 'general') {
      onOpenChat?.(null, n.message_id || null);
      onClose();
      return;
    }
    // DM message or DM mention → open DM with sender, scroll to message
    if (n.sender_slug) {
      onOpenChat?.(n.sender_slug, n.message_id || null);
      onClose();
    }
  };

  // Show current workspace's notifications + DM notifications always
  const visibleItems = currentWsId
    ? items.filter(n => !n.workspace_id || n.workspace_id === currentWsId || _notifType(n.text) === 'message')
    : items;
  const counts = visibleItems.reduce((acc, n) => {
    const c = _notifCategory(n);
    acc[c] = (acc[c] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    if (n.unread) acc.unread = (acc.unread || 0) + 1;
    return acc;
  }, {});
  const filtered = tab === 'all' ? visibleItems
                 : tab === 'unread' ? visibleItems.filter(n => n.unread)
                 : visibleItems.filter(n => _notifCategory(n) === tab);
  const unreadCount = counts.unread || 0;

  const tabs = [
    { id: 'all',      label: 'Tümü',       count: counts.all || 0 },
    { id: 'unread',   label: 'Okunmamış',  count: counts.unread || 0 },
    { id: 'mention',  label: 'Bahsetmeler', count: counts.mention || 0 },
    { id: 'message',  label: 'Mesajlar',   count: counts.message || 0 },
    { id: 'task',     label: 'Görevler',   count: counts.task || 0 },
    { id: 'calendar', label: 'Takvim',     count: counts.calendar || 0 },
  ];

  // Preferences (reflect tweaks; default ON if undefined)
  const T = tweaks || {};
  const v = (k, def = true) => (T[k] === undefined ? def : !!T[k]);
  const updatePref = (k, val) => setTweak?.(k, val);

  return (
    <>
      <div
        className="notif-panel"
        ref={panelRef}
        data-open={open || !!fullPage}
        data-full-page={!!fullPage}
      >
        <div className="notif-head">
          <div className="notif-title">Bildirimler</div>
          {unreadCount > 0 && <div className="notif-count">{unreadCount}</div>}
          {fullPage && (
            <button
              className="btn btn-ghost"
              style={{ marginLeft: 'auto', fontSize: 11.5 }}
              onClick={markAllRead}
            >
              <Icon name="check" size={12} /> Tümünü oku
            </button>
          )}
        </div>
        <div className="notif-tabs notif-tabs-scroll">
          {tabs.map(t => (
            <button key={t.id} data-active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.count > 0 && <span className="notif-tab-count">{t.count > 99 ? '99+' : t.count}</span>}
            </button>
          ))}
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

        {/* Preferences özet section */}
        <div className="notif-prefs">
          <button
            className="notif-prefs-toggle"
            onClick={() => setPrefsOpen(o => !o)}
            aria-expanded={prefsOpen}
          >
            <Icon name="settings" size={12} />
            <span>Tercihler</span>
            <Icon name={prefsOpen ? 'chevronUp' : 'chevronDown'} size={11} style={{ marginLeft: 'auto' }} />
          </button>
          {prefsOpen && (
            <div className="notif-prefs-body">
              <NotifPrefRow
                label="Bildirim sesi"
                desc="Yeni mesaj/bildirim sesi"
                checked={v('soundEnabled', true)}
                onChange={(b) => updatePref('soundEnabled', b)}
              />
              <NotifPrefRow
                label="Rahatsız etme"
                desc="Sesler ve push'lar susturulur"
                checked={v('dndEnabled', false)}
                onChange={(b) => updatePref('dndEnabled', b)}
              />
              {v('dndEnabled', false) && (
                <div className="notif-pref-schedule">
                  <span>Saat:</span>
                  <input
                    type="time"
                    value={T.dndStart || '19:00'}
                    onChange={(e) => updatePref('dndStart', e.target.value)}
                  />
                  <span>–</span>
                  <input
                    type="time"
                    value={T.dndEnd || '08:00'}
                    onChange={(e) => updatePref('dndEnd', e.target.value)}
                  />
                </div>
              )}
              <NotifPrefRow
                label="Masaüstü bildirimleri"
                desc="Tarayıcı push"
                checked={v('desktopPush', true)}
                onChange={(b) => updatePref('desktopPush', b)}
              />
              <NotifPrefRow
                label="Takımlar arası DM'ler"
                desc="DM'ler her zaman gelir"
                checked={v('crossTeamDM', true)}
                onChange={(b) => updatePref('crossTeamDM', b)}
              />
              <NotifPrefRow
                label="E-posta özeti"
                desc="Günlük 08:00 özeti"
                checked={v('emailDigest', false)}
                onChange={(b) => updatePref('emailDigest', b)}
              />
              <div className="notif-prefs-foot">
                <button onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('stoa:gotoSettings', { detail: { section: 'notifications' } })); }}>
                  Tüm ayarlar →
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', fontSize: 12, gap: 8 }}>
          {confirmDel ? (
            <>
              <span style={{ color: 'var(--ink-muted)' }}>Silinsin mi?</span>
              <button style={{ color: 'var(--status-rose)', fontWeight: 600 }} onClick={deleteAll}>Evet</button>
              <button style={{ color: 'var(--ink-muted)' }} onClick={() => setConfirmDel(false)}>Hayır</button>
            </>
          ) : (
            <>
              <button style={{ color: 'var(--ink-muted)' }} onClick={markAllRead}>
                Tümünü oku
              </button>
              {filtered.length > 0 && (
                <button style={{ color: 'var(--status-rose)' }} onClick={() => setConfirmDel(true)}>
                  Tümünü sil
                </button>
              )}
            </>
          )}
          <button style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }} onClick={onClose}>
            Kapat <Icon name="arrowRight" size={11} />
          </button>
        </div>
      </div>
    </>
  );
}

function NotifPrefRow({ label, desc, checked, onChange }) {
  return (
    <div className="notif-pref-row">
      <div className="notif-pref-text">
        <div className="notif-pref-label">{label}</div>
        {desc && <div className="notif-pref-desc">{desc}</div>}
      </div>
      <button
        type="button"
        className="toggle-switch"
        data-on={!!checked}
        onClick={() => onChange?.(!checked)}
        aria-pressed={!!checked}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

window.NotifPanel = NotifPanel;
window.NotifPrefRow = NotifPrefRow;
