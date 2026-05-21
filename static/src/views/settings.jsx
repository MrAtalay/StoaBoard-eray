// Settings view — profile, appearance, workspace (invite code + roles + members)

const LABEL_TONES = () => {
  const _t = (k, fb) => window.t?.(k) || fb;
  return [
    { id: 'rose',   label: _t('notes_color_red','Kırmızı')    },
    { id: 'blue',   label: _t('notes_color_blue','Mavi')       },
    { id: 'amber',  label: _t('notes_color_yellow','Sarı')     },
    { id: 'green',  label: _t('notes_color_green','Yeşil')     },
    { id: 'purple', label: _t('notes_color_purple','Mor')      },
    { id: 'teal',   label: _t('notes_color_teal','Turkuaz')    },
    { id: 'orange', label: _t('notes_color_orange','Turuncu')  },
    { id: 'cyan',   label: _t('notes_color_cyan','Camgöbeği') },
    { id: 'pink',   label: _t('notes_color_pink','Pembe')      },
  ];
};

function LabelsSection({ canManage }) {
  const _t = (k, fb) => window.t?.(k) || fb;
  const projectId = window.CURRENT_PROJECT_ID;
  const [labels, setLabels] = React.useState(() => ({ ...DATA.LABELS }));
  const [newName, setNewName] = React.useState('');
  const [newTone, setNewTone] = React.useState('blue');
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState('');
  const [editingSlug, setEditingSlug] = React.useState(null);
  const [editName, setEditName] = React.useState('');
  const [editTone, setEditTone] = React.useState('blue');
  const [editBusy, setEditBusy] = React.useState(false);

  const toSlug = (s) =>
    s.toLowerCase()
      .replace(/[çÇ]/g,'c').replace(/[ğĞ]/g,'g').replace(/[ıİ]/g,'i')
      .replace(/[öÖ]/g,'o').replace(/[şŞ]/g,'s').replace(/[üÜ]/g,'u')
      .replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');

  const handleDelete = async (slug) => {
    if (!projectId || !canManage) return;
    try {
      await API.deleteLabel(projectId, slug);
      const next = { ...labels };
      delete next[slug];
      setLabels(next);
      DATA.LABELS = next;
    } catch (e) { window.showToast?.(_t('set_lbl_err_delete','Etiket silinemedi: ') + e.message, 'error'); }
  };

  const handleStartEdit = (slug, label) => {
    setEditingSlug(slug);
    setEditName(label.tr);
    setEditTone(label.tone || 'blue');
  };

  const handleSaveEdit = async () => {
    const name = editName.trim();
    if (!name || !projectId || !editingSlug) return;
    setEditBusy(true);
    try {
      const result = await API.updateLabel(projectId, editingSlug, { name, tone: editTone });
      const next = { ...labels, ...result };
      setLabels(next);
      DATA.LABELS = next;
      setEditingSlug(null);
    } catch (e) { window.showToast?.(_t('set_lbl_err_update','Etiket güncellenemedi: ') + e.message, 'error'); }
    finally { setEditBusy(false); }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || !projectId) return;
    const slug = toSlug(name);
    if (!slug) { setError(_t('set_lbl_err_invalid','Geçerli bir isim girin')); return; }
    if (labels[slug]) { setError(_t('set_lbl_err_exists','Bu etiket zaten mevcut')); return; }
    setAdding(true);
    setError('');
    try {
      const result = await API.createLabel(projectId, { slug, name_en: name, name_tr: name, tone: newTone });
      const next = { ...labels, ...result };
      setLabels(next);
      DATA.LABELS = next;
      setNewName('');
    } catch (e) { setError(e.message); }
    finally { setAdding(false); }
  };

  return (
    <div className="settings-section">
      <div>
        <h3>{_t('set_lbl_title','Etiketler')}</h3>
        <p className="desc">{_t('set_lbl_desc','Görevleri kategorize etmek için etiketleri yönetin.')}</p>
      </div>
      <div className="settings-card" style={{ padding: 0, overflow: 'hidden' }}>
        {Object.keys(labels).length === 0 && (
          <div style={{ padding: '18px 20px', fontSize: 13, color: 'var(--ink-muted)' }}>{_t('set_lbl_none','Henüz etiket yok.')}</div>
        )}
        {Object.entries(labels).map(([slug, label], i, arr) => (
          <div key={slug} style={{ borderBottom: i < arr.length - 1 || canManage ? '1px solid var(--line)' : 'none' }}>
            {editingSlug === slug ? (
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingSlug(null); }}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--bg-raised)', color: 'var(--ink)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {LABEL_TONES().map(t => (
                    <button
                      key={t.id}
                      title={t.label}
                      className="label-tone-dot"
                      data-active={editTone === t.id}
                      style={{ background: `var(--status-${t.id})` }}
                      onClick={() => setEditTone(t.id)}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleSaveEdit} disabled={editBusy || !editName.trim()}>
                    {editBusy ? '…' : _t('set_lbl_save','Kaydet')}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingSlug(null)}>{_t('set_lbl_cancel','İptal')}</button>
                </div>
              </div>
            ) : (
              <div className="label-row">
                <span className="tag" data-tone={label.tone} style={{ flexShrink: 0 }}>{label.tr}</span>
                <span className="label-row-slug">{slug}</span>
                {canManage && (
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button className="icon-btn" title={_t('set_lbl_edit','Düzenle')} onClick={() => handleStartEdit(slug, label)}>
                      <Icon name="edit" size={13} />
                    </button>
                    <button className="icon-btn label-row-del" title={_t('set_lbl_delete','Sil')} onClick={() => handleDelete(slug)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {canManage && (
          <div className="label-add-row">
            <input
              className="label-add-input"
              placeholder={_t('set_lbl_new_ph','Yeni etiket adı…')}
              value={newName}
              onChange={e => { setNewName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <div className="label-tone-row">
              {LABEL_TONES().map(t => (
                <button
                  key={t.id}
                  title={t.label}
                  className="label-tone-dot"
                  data-active={newTone === t.id}
                  style={{ background: `var(--status-${t.id})` }}
                  onClick={() => setNewTone(t.id)}
                />
              ))}
            </div>
            <button className="btn btn-primary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}
              onClick={handleAdd} disabled={adding || !newName.trim() || !projectId}>
              {adding ? '…' : _t('set_lbl_add','+ Ekle')}
            </button>
          </div>
        )}
        {error && (
          <div style={{ padding: '0 20px 14px', fontSize: 12, color: 'var(--status-rose)' }}>{error}</div>
        )}
        {!projectId && canManage && (
          <div style={{ padding: '0 20px 14px', fontSize: 12, color: 'var(--ink-muted)' }}>{_t('set_lbl_no_project','Etiket yönetimi için bir proje açın.')}</div>
        )}
      </div>
    </div>
  );
}

function RoleDropdown({ value, roles, onChange, disabled, onRoleCreated }) {
  const _t = (k, fb) => window.t?.(k) || fb;
  const [open, setOpen] = React.useState(false);
  const [qOpen, setQOpen] = React.useState(false);
  const [qName, setQName] = React.useState('');
  const [qBusy, setQBusy] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQOpen(false); setQName(''); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = roles.find(r => r.id === value);

  const createRole = async () => {
    const n = qName.trim();
    if (!n) return;
    setQBusy(true);
    try {
      const r = await API.createRole({ name: n, color: ROLE_COLORS[roles.length % ROLE_COLORS.length], permissions: [] });
      onRoleCreated?.(r);
      onChange(r.id);
      setQName(''); setQOpen(false); setOpen(false);
      window.showToast?.(`"${r.name}"${_t('set_rol_created',' rolü oluşturuldu.')}`, 'success');
    } catch (e) { window.showToast?.(e.message, 'error'); }
    finally { setQBusy(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 8,
          border: '1px solid var(--line)',
          background: open ? 'var(--bg-raised)' : 'var(--bg-subtle)',
          color: current ? 'var(--ink)' : 'var(--ink-muted)',
          fontSize: 12, fontFamily: 'var(--font-ui)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          minWidth: 110, justifyContent: 'space-between',
          transition: 'border-color 0.15s, background 0.15s',
          borderColor: open ? 'var(--accent)' : 'var(--line)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.name : '— Rol seç —'}
        </span>
        <span style={{ color: 'var(--ink-faint)', flexShrink: 0, display: 'flex', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <Icon name="chevronDown" size={11} />
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
          background: 'var(--bg-raised)', border: '1px solid var(--line)',
          borderRadius: 10, boxShadow: 'var(--shadow-md)',
          minWidth: 160, overflow: 'hidden',
        }}>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 12px', textAlign: 'left',
                fontSize: 11.5, color: 'var(--ink-muted)',
                background: 'none', borderBottom: '1px solid var(--line)',
                fontFamily: 'var(--font-ui)', cursor: 'pointer',
              }}
            >
              — Rol seç —
            </button>
          )}
          {roles.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onChange(r.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 12px', textAlign: 'left',
                fontSize: 12, fontWeight: r.id === value ? 500 : 400,
                color: r.id === value ? 'var(--accent)' : 'var(--ink)',
                background: r.id === value ? 'var(--accent-soft)' : 'none',
                fontFamily: 'var(--font-ui)', cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (r.id !== value) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = r.id === value ? 'var(--accent-soft)' : 'none'; }}
            >
              {r.color && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
              )}
              <span style={{ flex: 1 }}>{r.name}</span>
              {r.id === value && <Icon name="check" size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            </button>
          ))}
          {onRoleCreated && (
            <div style={{ borderTop: '1px solid var(--line)', padding: '6px 8px' }}>
              {!qOpen ? (
                <button
                  type="button"
                  onClick={() => setQOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    width: '100%', padding: '7px 4px', textAlign: 'left',
                    fontSize: 11.5, color: 'var(--ink-muted)',
                    background: 'none', fontFamily: 'var(--font-ui)', cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-muted)'}
                >
                  <Icon name="plus" size={11} /> {_t('set_mem_new_role', 'Yeni rol oluştur')}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    autoFocus
                    value={qName}
                    onChange={e => setQName(e.target.value)}
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') createRole(); if (e.key === 'Escape') { setQOpen(false); setQName(''); } }}
                    placeholder={_t('set_mem_role_name_ph', 'Rol adı…')}
                    style={{
                      padding: '5px 8px', borderRadius: 6, border: '1px solid var(--accent)',
                      background: 'var(--bg)', color: 'var(--ink)', fontSize: 12,
                      outline: 'none', fontFamily: 'var(--font-ui)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={createRole}
                      disabled={qBusy || !qName.trim()}
                      style={{
                        flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 11.5,
                        background: 'var(--accent)', color: '#fff', fontFamily: 'var(--font-ui)',
                        cursor: qBusy || !qName.trim() ? 'not-allowed' : 'pointer',
                        opacity: qBusy || !qName.trim() ? 0.6 : 1,
                      }}
                    >
                      {qBusy ? '…' : _t('set_lbl_add', 'Ekle')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQOpen(false); setQName(''); }}
                      style={{
                        padding: '5px 8px', borderRadius: 6, fontSize: 11.5,
                        background: 'var(--bg-subtle)', color: 'var(--ink-muted)',
                        fontFamily: 'var(--font-ui)', cursor: 'pointer',
                      }}
                    >
                      {_t('set_lbl_cancel', 'İptal')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PERM_LABELS_KEYS = {
  manage_tasks:    ['set_rol_perm_tasks',    'Görevleri yönet'],
  manage_projects: ['set_rol_perm_projects', 'Projeleri yönet'],
  manage_labels:   ['set_rol_perm_labels',   'Etiketleri yönet'],
  invite_members:  ['set_rol_perm_invite',   'Üye davet et'],
  manage_members:  ['set_rol_perm_members',  'Üyeleri yönet'],
  manage_channels: ['set_rol_perm_channels', 'Kanalları yönet'],
  delete_messages: ['set_rol_perm_del_msgs', 'Başkalarının mesajlarını sil'],
};
const ALL_PERMS = Object.keys(PERM_LABELS_KEYS);

const ROLE_COLORS = [
  'oklch(52% 0.15 270)', 'oklch(55% 0.09 150)', 'oklch(55% 0.13 25)',
  'oklch(50% 0.14 340)', 'oklch(65% 0.11 70)',  'oklch(50% 0.04 250)',
];

function JoinRequestsSection() {
  const _t = (k, fb) => window.t?.(k) || fb;
  const [requests, setRequests] = React.useState([]);
  const [loading, setLoading]   = React.useState(true);

  React.useEffect(() => {
    API.getJoinRequests()
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Live update via socket
  React.useEffect(() => {
    const sock = window.SOCKET;
    if (!sock) return;
    const onNew = (req) => {
      setRequests(prev => prev.some(r => r.id === req.id) ? prev : [req, ...prev]);
    };
    sock.on('join_request_new', onNew);
    return () => sock.off('join_request_new', onNew);
  }, []);

  const handleApprove = async (id) => {
    try {
      await API.approveJoinRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      window.showToast?.(_t('set_jrq_approved','Katılım isteği onaylandı.'), 'success');
    } catch (e) { window.showToast?.(e.message, 'error'); }
  };

  const handleReject = async (id) => {
    try {
      await API.rejectJoinRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      window.showToast?.(_t('set_jrq_rejected_msg','Katılım isteği reddedildi.'), 'info');
    } catch (e) { window.showToast?.(e.message, 'error'); }
  };

  return (
    <div className="settings-section">
      <div>
        <h3>{_t('set_jrq_title','Katılım İstekleri')} {requests.length > 0 && <span style={{ fontSize: 12, fontWeight: 400, background: 'var(--status-rose)', color: 'white', borderRadius: 99, padding: '1px 7px', marginLeft: 6 }}>{requests.length}</span>}</h3>
        <p className="desc">{_t('set_jrq_desc','Takıma katılmak isteyen kullanıcıları onaylayın veya reddedin.')}</p>
      </div>
      <div className="settings-card settings-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '16px 20px', color: 'var(--ink-faint)', fontSize: 13 }}>{_t('set_jrq_loading','Yükleniyor…')}</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '16px 20px', color: 'var(--ink-muted)', fontSize: 13 }}>{_t('set_jrq_none','Bekleyen katılım isteği yok.')}</div>
        ) : requests.map((req, i) => (
          <div key={req.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px',
            borderBottom: i < requests.length - 1 ? '1px solid var(--line)' : 'none',
          }}>
            <Avatar member={req.user} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{req.user?.name || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{req.time}</div>
            </div>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '4px 14px' }}
              onClick={() => handleApprove(req.id)}
            >
              {_t('set_jrq_approve','Onayla')}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 14px', color: 'var(--status-rose)' }}
              onClick={() => handleReject(req.id)}
            >
              {_t('set_jrq_reject','Reddet')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsView({ tweaks, setTweak, onLogout, onWsLogoChange, onMembersChange }) {
  const _t = (k, fb) => window.t?.(k) || fb;

  const me       = window.CURRENT_USER || DATA.MEMBERS[0] || {};
  const ws       = window.DATA.WORKSPACE || {};
  const isOwner  = ws.is_owner || false;
  const myMember = (DATA.MEMBERS || []).find(m => m.id === me.id) || {};
  const myPerms  = myMember.role_permissions || [];
  const canManageMembers  = isOwner || myPerms.includes('manage_members');
  const canManageProjects = isOwner || myPerms.includes('manage_projects');

  const [name, setName]   = React.useState(me.name || '');
  const [role, setRole]   = React.useState(me.role || '');
  const [email, setEmail] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy]   = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteEmail, setDeleteEmail] = React.useState('');
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [transferSlug, setTransferSlug] = React.useState('');
  const [transferBusy, setTransferBusy] = React.useState(false);
  const [transferError, setTransferError] = React.useState('');
  const [avatarUrl, setAvatarUrl]     = React.useState(me.avatar_photo_url || null);
  const [avatarBusy, setAvatarBusy]   = React.useState(false);
  const avatarInputRef = React.useRef(null);

  const [inviteCode, setInviteCode]   = React.useState(ws.invite_code || null);
  const [codeLoading, setCodeLoading] = React.useState(false);
  const [codeCopied, setCodeCopied]   = React.useState(false);
  const [confirmRegen, setConfirmRegen]   = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const [roles, setRoles]           = React.useState(ws.roles || []);
  const [roleForm, setRoleForm]     = React.useState(null); // null = closed, {} = new, {id,...} = edit
  const [rolePerms, setRolePerms]   = React.useState([]);
  const [roleColor, setRoleColor]   = React.useState(ROLE_COLORS[0]);
  const [roleName, setRoleName]     = React.useState('');
  const [roleDefault, setRoleDefault] = React.useState(false);
  const [roleBusy, setRoleBusy]     = React.useState(false);

  const [members, setMembers]         = React.useState([...DATA.MEMBERS]);
  const [memberBusy, setMemberBusy]   = React.useState(null);

  // ── Keyboard shortcut customization ──────────────────────────────────────
  const DEFAULT_SHORTCUTS = [
    { id: 'cmd_palette',   label: _t('set_sct_cmd_palette','Komut paleti aç'),        keys: ['Ctrl','K'] },
    { id: 'new_task',      label: _t('set_sct_new_task','Yeni görev'),                 keys: ['N'] },
    { id: 'go_home',       label: _t('set_sct_home','Ana sayfa'),                      keys: ['G','H'] },
    { id: 'go_board',      label: _t('set_sct_board','Pano (Kanban)'),                 keys: ['G','B'] },
    { id: 'go_list',       label: _t('set_sct_list','Liste görünümü'),                 keys: ['G','L'] },
    { id: 'go_calendar',   label: _t('set_sct_calendar','Takvim'),                     keys: ['G','C'] },
    { id: 'go_chat',       label: _t('set_sct_chat','Sohbet'),                         keys: ['G','M'] },
    { id: 'go_settings',   label: _t('set_sct_settings','Ayarlar'),                    keys: ['G','S'] },
    { id: 'search',        label: _t('set_sct_search','Arama odakla'),                 keys: ['/'] },
    { id: 'send_msg',      label: _t('set_sct_send','Mesaj gönder'),                   keys: ['↵'] },
    { id: 'newline',       label: _t('set_sct_newline','Yeni satır (mesajda)'),        keys: ['⇧','↵'] },
    { id: 'close_panels',  label: _t('set_sct_close_panels','Tüm panelleri kapat'),    keys: ['Esc'] },
  ];
  const [customShortcuts, setCustomShortcuts] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('stoa.shortcuts') || 'null') || {}; } catch { return {}; }
  });
  const [recordingId, setRecordingId] = React.useState(null);
  const recordingRef = React.useRef(null);

  const getShortcutKeys = (id) => customShortcuts[id] || DEFAULT_SHORTCUTS.find(s => s.id === id)?.keys || [];

  const saveShortcut = (id, keys) => {
    const next = { ...customShortcuts, [id]: keys };
    setCustomShortcuts(next);
    localStorage.setItem('stoa.shortcuts', JSON.stringify(next));
  };

  const resetShortcuts = () => {
    setCustomShortcuts({});
    localStorage.removeItem('stoa.shortcuts');
    window.showToast?.(window.t?.('set_sct_reset_done') || 'Kısayollar varsayılana sıfırlandı.', 'success');
  };

  React.useEffect(() => {
    if (!recordingId) return;
    const handler = (e) => {
      e.preventDefault();
      const parts = [];
      if (e.metaKey || e.ctrlKey) parts.push('⌘');
      if (e.altKey) parts.push('⌥');
      if (e.shiftKey) parts.push('⇧');
      const key = e.key;
      if (!['Meta','Control','Alt','Shift'].includes(key)) {
        parts.push(key === 'Enter' ? '↵' : key === 'Escape' ? 'Esc' : key === '/' ? '/' : key.length === 1 ? key.toUpperCase() : key);
        saveShortcut(recordingId, parts);
        setRecordingId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [recordingId, customShortcuts]);
  const [confirmDeleteRoleId, setConfirmDeleteRoleId] = React.useState(null);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = React.useState(null);

  const syncMembers = (nextMembers) => {
    setMembers(nextMembers);
    DATA.MEMBERS = nextMembers;
    if (onMembersChange) onMembersChange(nextMembers);
  };

  const [logoUrl, setLogoUrl]       = React.useState(ws.logo_url || null);
  const [logoBusy, setLogoBusy]     = React.useState(false);
  const logoInputRef = React.useRef(null);
  const [wsName, setWsName]         = React.useState(ws.name || '');
  const [wsNameBusy, setWsNameBusy] = React.useState(false);
  const [wsNameSaved, setWsNameSaved] = React.useState(false);

  const saveWsName = async () => {
    const trimmed = wsName.trim();
    if (!trimmed || trimmed === ws.name) return;
    setWsNameBusy(true);
    try {
      const res = await API.updateWorkspace(ws.id, { name: trimmed });
      window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, name: res.name };
      ws.name = res.name;
      setWsNameSaved(true);
      setTimeout(() => setWsNameSaved(false), 2000);
    } catch (e) { window.showToast?.(e.message || window.t?.('set_err_name_update') || 'İsim güncellenemedi', 'error'); }
    finally { setWsNameBusy(false); }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await API.uploadWorkspaceLogo(ws.id, fd);
      setLogoUrl(res.logo_url);
      window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, logo_url: res.logo_url };
      if (onWsLogoChange) onWsLogoChange(res.logo_url);
    } catch (err) { window.showToast?.((window.t?.('set_err_logo_upload') || 'Logo yüklenemedi: ') + err.message, 'error'); }
    finally { setLogoBusy(false); }
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      const updated = await API.updateProfile({ name, role_title: role, email: email || undefined });
      window.CURRENT_USER = { ...window.CURRENT_USER, ...updated };
      const idx = DATA.MEMBERS.findIndex(m => m.id === me.id);
      if (idx >= 0) DATA.MEMBERS[idx] = { ...DATA.MEMBERS[idx], ...updated };
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { window.showToast?.((window.t?.('set_err_save') || 'Kaydedilemedi: ') + e.message, 'error'); }
    finally { setBusy(false); }
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await API.uploadAvatar(fd);
      setAvatarUrl(res.avatar_photo_url);
      window.CURRENT_USER = { ...window.CURRENT_USER, avatar_photo_url: res.avatar_photo_url };
      const idx = DATA.MEMBERS.findIndex(m => m.id === me.id);
      if (idx >= 0) DATA.MEMBERS[idx] = { ...DATA.MEMBERS[idx], avatar_photo_url: res.avatar_photo_url };
    } catch (err) { window.showToast?.((window.t?.('set_err_photo_upload') || 'Fotoğraf yüklenemedi: ') + err.message, 'error'); }
    finally { setAvatarBusy(false); if (avatarInputRef.current) avatarInputRef.current.value = ''; }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await API.deleteAvatar();
      setAvatarUrl(null);
      window.CURRENT_USER = { ...window.CURRENT_USER, avatar_photo_url: null };
      const idx = DATA.MEMBERS.findIndex(m => m.id === me.id);
      if (idx >= 0) DATA.MEMBERS[idx] = { ...DATA.MEMBERS[idx], avatar_photo_url: null };
    } catch (err) { window.showToast?.((window.t?.('set_err_photo_delete') || 'Fotoğraf silinemedi: ') + err.message, 'error'); }
    finally { setAvatarBusy(false); }
  };



  const copyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const regenCode = async () => {
    setConfirmRegen(false);
    setCodeLoading(true);
    try {
      const res = await API.regenInviteCode();
      setInviteCode(res.invite_code);
      window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, invite_code: res.invite_code };
    } catch (e) { window.showToast?.(e.message, 'error'); }
    finally { setCodeLoading(false); }
  };

  const deleteCode = async () => {
    setConfirmDelete(false);
    setCodeLoading(true);
    try {
      await API.deleteInviteCode();
      setInviteCode(null);
      window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, invite_code: null };
    } catch (e) { window.showToast?.(e.message, 'error'); }
    finally { setCodeLoading(false); }
  };

  const enableCode = async () => {
    setCodeLoading(true);
    try {
      const res = await API.regenInviteCode();
      setInviteCode(res.invite_code);
      window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, invite_code: res.invite_code };
    } catch (e) { window.showToast?.(e.message, 'error'); }
    finally { setCodeLoading(false); }
  };


  const openRoleForm = (existing) => {
    if (existing) {
      setRoleName(existing.name);
      setRoleColor(existing.color);
      setRolePerms(existing.permissions || []);
      setRoleDefault(existing.is_default);
      setRoleForm(existing);
    } else {
      setRoleName('');
      setRoleColor(ROLE_COLORS[0]);
      setRolePerms([]);
      setRoleDefault(false);
      setRoleForm({});
    }
  };

  const togglePerm = (p) => setRolePerms(prev =>
    prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
  );

  const saveRole = async (e) => {
    e.preventDefault();
    if (!roleName.trim()) return;
    setRoleBusy(true);
    try {
      const body = { name: roleName.trim(), color: roleColor, permissions: rolePerms, is_default: roleDefault };
      let saved;
      if (roleForm.id) {
        saved = await API.updateRole(roleForm.id, body);
        const nextRoles = roles.map(r => r.id === saved.id ? saved : r);
        setRoles(nextRoles);
        window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, roles: nextRoles };
      } else {
        saved = await API.createRole(body);
        const nextRoles = [...roles, saved];
        setRoles(nextRoles);
        window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, roles: nextRoles };
      }
      setRoleForm(null);
    } catch (e) { window.showToast?.(e.message, 'error'); }
    finally { setRoleBusy(false); }
  };

  const deleteRoleById = async (id) => {
    setConfirmDeleteRoleId(null);
    try {
      await API.deleteRole(id);
      const nextRoles = roles.filter(r => r.id !== id);
      setRoles(nextRoles);
      window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, roles: nextRoles };
      const nextMembers = members.map(m => m.role_id === id ? { ...m, role_id: null, role_name: '', role_permissions: [] } : m);
      syncMembers(nextMembers);
    } catch (e) { window.showToast?.(e.message, 'error'); }
  };

  // ── Members ───────────────────────────────────────────────────────────────

  const changeMemberRole = async (slug, roleId) => {
    setMemberBusy(slug);
    try {
      const updated = await API.updateMember(slug, { role_id: roleId || null });
      const nextMembers = members.map(m => m.id === slug ? { ...m, ...updated } : m);
      syncMembers(nextMembers);
    } catch (e) { window.showToast?.(e.message, 'error'); }
    finally { setMemberBusy(null); }
  };

  const removeMember = async (slug) => {
    setConfirmRemoveMemberId(null);
    try {
      await API.removeMember(slug);
      syncMembers(members.filter(m => m.id !== slug));
    } catch (e) { window.showToast?.(e.message, 'error'); }
  };

  const transferOwnership = async () => {
    setTransferError('');
    if (!transferSlug) { setTransferError('Lütfen bir üye seçin.'); return; }
    setTransferBusy(true);
    try {
      await API.transferOwnership(transferSlug);
      window.showToast?.(window.t?.('set_transfer_done') || 'Sahiplik aktarıldı. Yetkiniz güncellendi.', 'success');
      setTransferOpen(false);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setTransferError(e.message || 'Sahiplik aktarılamadı.');
    } finally {
      setTransferBusy(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteError('');
    if (!deleteEmail.trim()) {
      setDeleteError('Devam etmek için hesabınızın e-posta adresini yazın.');
      return;
    }
    setDeleteBusy(true);
    try {
      await API.deleteAccount(deleteEmail.trim());
      if (window.SOCKET) {
        window.SOCKET.disconnect();
        window.SOCKET = null;
      }
      if (onLogout) onLogout();
    } catch (e) {
      setDeleteError(e.message || 'Hesap silinemedi.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const [projects, setProjects] = React.useState([...(DATA.PROJECTS || [])]);
  const [editingProject, setEditingProject] = React.useState(null);

  const saveProjectIcon = async (projectId, icon, color) => {
    try {
      const updated = await API.updateProject(projectId, { icon, color });
      setProjects(ps => ps.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      DATA.PROJECTS = DATA.PROJECTS.map(p => p.id === updated.id ? { ...p, ...updated } : p);
      setEditingProject(null);
    } catch (e) { window.showToast?.(e.message, 'error'); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // Inner-nav sections (ids match section [data-nav-id])
  const navSections = [
    { id: 'profile',        label: _t('set_profile','Profil'),               icon: 'user' },
    { id: 'appearance',     label: _t('set_appearance','Görünüm'),           icon: 'palette' },
    { id: 'workspace',      label: _t('set_workspace','Çalışma Alanı'),      icon: 'building', ownerOnly: true },
    { id: 'join_requests',  label: _t('set_jrq_nav','Katılım İstekleri'),    icon: 'userPlus', ownerOnly: true },
    { id: 'invite',         label: _t('set_invite','Davet Kodu'),            icon: 'key', ownerOnly: true },
    { id: 'roles',          label: _t('set_roles','Roller'),                 icon: 'shield', ownerOnly: true },
    { id: 'projects',       label: _t('set_prj_nav','Projeler'),             icon: 'folder', manageProjOnly: true, hideWhenEmpty: true },
    { id: 'labels',         label: _t('set_labels','Etiketler'),             icon: 'tag' },
    { id: 'members',        label: _t('set_members','Üyeler'),               icon: 'users' },
    { id: 'notifications',  label: _t('set_notifications','Bildirimler'),    icon: 'bell' },
    { id: 'shortcuts',      label: _t('set_shortcuts','Kısayollar'),         icon: 'cmd' },
    { id: 'language',       label: _t('set_language','Dil & Bölge'),         icon: 'languages' },
    { id: 'danger',         label: _t('set_danger','Tehlikeli Bölge'),       icon: 'alertTriangle', danger: true },
  ];
  const [activeNav, setActiveNav] = React.useState('profile');
  const scrollRef = React.useRef(null);

  const scrollToSection = (id) => {
    setActiveNav(id);
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-nav-id="${id}"]`);
    if (el) {
      const rootRect = root.getBoundingClientRect();
      const elRect   = el.getBoundingClientRect();
      root.scrollTo({ top: root.scrollTop + (elRect.top - rootRect.top) - 20, behavior: 'smooth' });
    }
  };

  // Scroll-spy — use getBoundingClientRect for accurate threshold
  React.useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => {
      const sections = root.querySelectorAll('[data-nav-id]');
      const rootTop  = root.getBoundingClientRect().top;
      let current = sections[0]?.dataset.navId;
      sections.forEach(s => {
        const top = s.getBoundingClientRect().top - rootTop;
        if (top <= 80) current = s.dataset.navId;
      });
      if (current) setActiveNav(prev => prev === current ? prev : current);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  // Listen for external navigation requests (e.g., from NotifPanel "Tüm ayarlar →")
  React.useEffect(() => {
    const handler = (e) => {
      const section = e.detail?.section;
      if (section) setTimeout(() => scrollToSection(section), 80);
    };
    window.addEventListener('stoa:gotoSettings', handler);
    return () => window.removeEventListener('stoa:gotoSettings', handler);
  }, []);

  return (
    <div className="settings-shell">
      {/* ─── Inner nav (sticky left rail) ─── */}
      <aside className="settings-nav">
        <div className="settings-nav-head">
          <h1 className="settings-nav-title">{_t('set_title','Ayarlar')}</h1>
          <p className="settings-nav-sub">{_t('set_subtitle','Hesap & çalışma alanı')}</p>
        </div>
        <nav className="settings-nav-list">
          {navSections.map(s => {
            if (s.ownerOnly && !isOwner) return null;
            if (s.membersOnly && !canManageMembers) return null;
            if (s.manageProjOnly && !canManageProjects) return null;
            if (s.hideWhenEmpty && projects.length === 0) return null;
            return (
              <button
                key={s.id}
                className="settings-nav-item"
                data-active={activeNav === s.id}
                data-danger={s.danger}
                onClick={() => scrollToSection(s.id)}
              >
                <Icon name={s.icon} size={14} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

    <div className="settings-wrap" ref={scrollRef}>
      <h1 style={{ display: 'none' }}>Ayarlar<em>.</em></h1>

      {/* ── Profile ── */}
      <div className="settings-section" data-nav-id="profile">
        <div>
          <h3>{_t('set_pro_title','Profil')}</h3>
          <p className="desc">{_t('set_pro_desc','Takım üyelerinin sizi nasıl göreceği.')}</p>
        </div>
        <div className="settings-card">
          <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:18 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {avatarUrl ? (
                <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--line)' }}>
                  <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <Avatar member={{ ...me, avatar_photo_url: null }} size="lg" />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                  <Icon name="upload" size={12} /> {avatarBusy ? _t('set_pro_uploading','Yükleniyor…') : _t('set_pro_upload_photo','Fotoğraf Yükle')}
                </button>
                {avatarUrl && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--status-rose)' }} disabled={avatarBusy} onClick={removeAvatar}>
                    {_t('set_pro_remove','Kaldır')}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{_t('set_pro_photo_hint','PNG, JPG, WEBP — maks. 5 MB')}</div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{_t('set_pro_name','Ad Soyad')}</label>
              <input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>{_t('set_pro_email','E-posta (değiştirmek için girin)')}</label>
              <input type="email" value={email} placeholder={me.email || 'eposta@ornek.com'} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginTop:12 }}>
            <label>{_t('set_pro_title_role','Başlık / Rol')}</label>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Founder · Product Manager" />
          </div>
          <div style={{ marginTop:14 }}>
            <button className="btn btn-primary" onClick={saveProfile} disabled={busy}>
              {busy ? _t('set_pro_saving','Kaydediliyor…') : saved ? _t('set_pro_saved','✓ Kaydedildi') : _t('set_pro_save','Kaydet')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Appearance ── */}
      <div className="settings-section" data-nav-id="appearance">
        <div>
          <h3>{_t('set_app_title','Görünüm')}</h3>
          <p className="desc">{_t('set_app_desc','Tema, renk ve tipografi tercihlerin.')}</p>
        </div>
        <div className="settings-card settings-panel">
          <div className="tweak-group">
            <div className="tweak-label">{_t('set_app_theme','Tema')}</div>
            <div className="tweak-options">
              {['light','cream','dark'].map(t => (
                <button key={t} className="tweak-opt" data-active={tweaks.theme===t} onClick={() => setTweak('theme',t)}>
                  {t==='light' ? _t('set_app_light','Açık') : t==='cream' ? _t('set_app_cream','Krem') : _t('set_app_dark','Koyu')}
                </button>
              ))}
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">{_t('set_app_accent','Vurgu rengi')}</div>
            <div className="swatch-row">
              {[['navy','#1a4a70'],['terracotta','oklch(55% 0.13 25)'],['sage','oklch(55% 0.09 150)'],['slate','oklch(50% 0.04 250)'],['indigo','oklch(52% 0.15 270)'],['plum','oklch(50% 0.14 340)']].map(([k,v]) => (
                <button key={k} className="swatch" data-active={tweaks.accent===k} style={{ background:v }} onClick={() => setTweak('accent',k)} title={k} />
              ))}
              <label
                className="swatch swatch-custom"
                data-active={tweaks.accent === 'custom'}
                title={_t('set_app_accent_custom','Özel renk')}
                style={{
                  background: (tweaks.accent === 'custom' && tweaks.accentHex) ? tweaks.accentHex : 'var(--bg-subtle)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: tweaks.accent !== 'custom' ? '1px dashed var(--line)' : undefined,
                  cursor: 'pointer'
                }}
              >
                {tweaks.accent !== 'custom' && (
                  <Icon name="plus" size={14} style={{ color: 'var(--ink-muted)' }} />
                )}
                <input
                  type="color"
                  value={tweaks.accentHex || '#1a4a70'}
                  onChange={(e) => {
                    const hex = e.target.value;
                    setTweak('accentHex', hex);
                    setTweak('accent', 'custom');
                  }}
                  style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer', margin: 0, padding: 0 }}
                />
              </label>
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">{_t('set_app_density','Yoğunluk')}</div>
            <div className="tweak-options">
              {['airy','balanced','compact'].map(d => (
                <button key={d} className="tweak-opt" data-active={tweaks.density===d} onClick={() => setTweak('density',d)}>
                  {d==='airy' ? _t('set_app_spacious','Ferah') : d==='balanced' ? _t('set_app_balanced','Dengeli') : _t('set_app_compact','Kompakt')}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Workspace logo ── (owner only) */}
      {isOwner && (
        <div className="settings-section" data-nav-id="workspace">
          <div>
            <h3>{_t('set_ws_title','Çalışma Alanı')}</h3>
            <p className="desc">{_t('set_ws_desc','Takımınızın logo veya fotoğrafını yükleyin.')}</p>
          </div>
          <div className="settings-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                background: 'var(--accent)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white',
                border: '1px solid var(--line)',
              }}>
                {logoUrl
                  ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (ws.name || 'W')[0].toUpperCase()
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{ws.name || _t('set_ws_title','Çalışma Alanı')}</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadLogo} />
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={logoBusy}
                    onClick={() => logoInputRef.current?.click()}>
                    <Icon name="upload" size={12} /> {logoBusy ? _t('set_ws_uploading','Yükleniyor…') : _t('set_ws_upload_logo','Logo Yükle')}
                  </button>
                  {logoUrl && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--status-rose)' }}
                      onClick={async () => {
                        try {
                          await API.deleteWorkspaceLogo(ws.id);
                          setLogoUrl(null);
                          window.DATA.WORKSPACE = { ...window.DATA.WORKSPACE, logo_url: null };
                          if (onWsLogoChange) onWsLogoChange(null);
                        } catch(err) { window.showToast?.(err.message, 'error'); }
                      }}>
                      {_t('set_ws_remove','Kaldır')}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{_t('set_ws_photo_hint','PNG, JPG, WEBP — maks. 5 MB')}</div>
              </div>
            </div>
            <div className="field" style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 16 }}>
              <label>{_t('set_ws_team_name','Takım Adı')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={wsName}
                  onChange={e => setWsName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveWsName(); }}
                  placeholder={ws.name || _t('set_ws_team_placeholder','Takım adı…')}
                  style={{ flex: 1, minWidth: 140 }}
                />
                <button className="btn btn-primary" style={{ fontSize: 12, flexShrink: 0, marginBottom: 0 }} disabled={wsNameBusy || !wsName.trim() || wsName.trim() === ws.name} onClick={saveWsName}>
                  {wsNameBusy ? _t('set_ws_saving','Kaydediliyor…') : wsNameSaved ? _t('set_ws_saved','✓ Kaydedildi') : _t('set_ws_save','Kaydet')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Join Requests ── (owner only) */}
      {isOwner && <div data-nav-id="join_requests"><JoinRequestsSection /></div>}

      {/* ── Workspace / Invite code ── (owner only) */}
      {isOwner && (
        <div className="settings-section" data-nav-id="invite">
          <div>
            <h3>{_t('set_inv_title','Davet Kodu')}</h3>
            <p className="desc">{_t('set_inv_desc','Bu kodu paylaşarak takıma üye ekleyin.')}</p>
          </div>
          <div className="settings-card settings-panel">
            {inviteCode ? (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', background:'var(--bg-raised)', border:'1px solid var(--line)', borderRadius:10, marginBottom:12, flexWrap:'wrap' }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'clamp(16px,4vw,22px)', letterSpacing:'0.15em', fontWeight:600, color:'var(--ink)', flex:1, minWidth:0, wordBreak:'break-all' }}>
                    {inviteCode}
                  </span>
                  <button className="btn btn-ghost" onClick={copyCode} style={{ fontSize:12, padding:'5px 10px', flexShrink:0 }}>
                    {codeCopied ? _t('set_inv_copied','Kopyalandı') : _t('set_inv_copy','Kopyala')}
                  </button>
                </div>
                <div style={{ display:'flex', gap:16, alignItems:'flex-start', marginBottom:12, flexWrap:'wrap' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`${window.location.origin}/?join=${inviteCode}`)}&bgcolor=ffffff&color=1d3461&qzone=1&format=png`}
                      alt="QR Kod"
                      style={{ width:140, height:140, borderRadius:8, border:'1px solid var(--line)', display:'block' }}
                    />
                    <span style={{ fontSize:11, color:'var(--ink-faint)' }}>{_t('set_inv_qr','QR ile katıl')}</span>
                  </div>
                  <div style={{ flex:1, minWidth:160 }}>
                    <div style={{ fontSize:12, color:'var(--ink-muted)', lineHeight:1.6, marginBottom:10 }}>
                      {_t('set_inv_qr_desc','Kameranızı bu koda tutun veya kodu paylaşarak takıma üye ekleyin.')}
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px' }} onClick={() => {
                      const joinUrl = `${window.location.origin}/?join=${inviteCode}`;
                      navigator.clipboard.writeText(joinUrl).catch(() => {});
                      window.showToast?.(window.t?.('app_link_copied') || 'Katılım linki kopyalandı!', 'success');
                    }}>
                      <Icon name="link" size={13} /> {_t('set_inv_copy_link','Linki Kopyala')}
                    </button>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {confirmRegen ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--line)', fontSize:13 }}>
                      <span style={{ color:'var(--ink-muted)' }}>{_t('set_inv_regen_warn','Mevcut kod geçersiz olacak.')}</span>
                      <button className="btn btn-primary" style={{ fontSize:12, padding:'4px 10px' }} onClick={regenCode} disabled={codeLoading}>{_t('set_inv_regen','Yenile')}</button>
                      <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} onClick={() => setConfirmRegen(false)}>{_t('set_inv_cancel','İptal')}</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setConfirmRegen(true)} disabled={codeLoading}>
                      <Icon name="refresh" size={13} /> {_t('set_inv_regen','Yenile')}
                    </button>
                  )}
                  {confirmDelete ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--line)', fontSize:13 }}>
                      <span style={{ color:'var(--status-rose)' }}>{_t('set_inv_delete_warn','Kod silinecek, üye eklenemez.')}</span>
                      <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px', color:'var(--status-rose)' }} onClick={deleteCode} disabled={codeLoading}>{_t('set_inv_delete','Sil')}</button>
                      <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} onClick={() => setConfirmDelete(false)}>{_t('set_inv_cancel','İptal')}</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)} disabled={codeLoading} style={{ color:'var(--status-rose)' }}>
                      <Icon name="trash" size={13} /> {_t('set_inv_delete_title','Kodu Sil')}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ fontSize:13, color:'var(--ink-muted)', padding:'12px 14px', background:'var(--bg-subtle)', borderRadius:8 }}>
                  {_t('set_inv_no_code','Davet kodu yok — şu an kimse davet edilemiyor.')}
                </div>
                <button className="btn btn-primary" onClick={enableCode} disabled={codeLoading}>
                  <Icon name="plus" size={13} /> {_t('set_inv_create','Davet Kodu Oluştur')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Roles ── (owner only) */}
      {isOwner && (
        <div className="settings-section" data-nav-id="roles">
          <div>
            <h3>{_t('set_rol_title','Roller')}</h3>
            <p className="desc">{_t('set_rol_desc','Özel roller ve izinler tanımlayın.')}</p>
          </div>
          <div className="settings-card settings-panel">
            {/* Role list */}
            <div className="rol-list">
              {roles.map(r => (
                <div key={r.id} className="rol-item">
                  <span className="rol-item-dot" style={{ background: r.color }} />
                  <span className="rol-item-name">{r.name}</span>
                  {r.is_default && <span className="rol-default-badge">{_t('set_rol_default','Varsayılan')}</span>}
                  <div className="rol-item-actions">
                    <button className="icon-btn" title={_t('set_rol_edit','Düzenle')} onClick={() => openRoleForm(r)}><Icon name="edit" size={13} /></button>
                    {confirmDeleteRoleId === r.id ? (
                      <div className="rol-item-confirm">
                        <button className="col-menu-confirm-yes" onClick={() => deleteRoleById(r.id)}>{_t('set_rol_delete','Sil')}</button>
                        <button className="col-menu-confirm-no" onClick={() => setConfirmDeleteRoleId(null)}>{_t('set_rol_cancel','İptal')}</button>
                      </div>
                    ) : (
                      <button className="icon-btn icon-btn-danger" title={_t('set_rol_delete','Sil')} onClick={() => setConfirmDeleteRoleId(r.id)}><Icon name="trash" size={13} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add role button */}
            {!roleForm && (
              <button className="btn btn-ghost" onClick={() => openRoleForm(null)}>
                <Icon name="plus" size={13} /> {_t('set_rol_new','Yeni Rol')}
              </button>
            )}

            {/* Role form */}
            {roleForm !== null && (
              <form onSubmit={saveRole} className="rol-form">
                <div className="rol-form-title">
                  {roleForm.id ? _t('set_rol_edit_title','Rolü Düzenle') : _t('set_rol_new','Yeni Rol')}
                </div>
                <div className="field">
                  <label>{_t('set_rol_name','Rol Adı')}</label>
                  <input autoFocus placeholder={_t('set_rol_name_ph','Örn: Geliştirici, Tasarımcı…')} value={roleName} onChange={e => setRoleName(e.target.value)} required />
                </div>
                <div className="field">
                  <label>{_t('set_rol_color','Renk')}</label>
                  <div className="rol-color-picker">
                    {ROLE_COLORS.map(c => (
                      <button key={c} type="button" className="rol-color-swatch" data-active={roleColor === c}
                        style={{ background: c }} onClick={() => setRoleColor(c)} />
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>{_t('set_rol_permissions','İzinler')}</label>
                  <div className="rol-perms-list">
                    {ALL_PERMS.map(p => (
                      <label key={p} className="rol-perm-item">
                        <input type="checkbox" checked={rolePerms.includes(p)} onChange={() => togglePerm(p)} />
                        {_t(PERM_LABELS_KEYS[p][0], PERM_LABELS_KEYS[p][1])}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="rol-perm-item rol-default-item">
                  <input type="checkbox" checked={roleDefault} onChange={e => setRoleDefault(e.target.checked)} />
                  {_t('set_rol_default_for_new','Yeni üyeler için varsayılan rol')}
                </label>
                <div className="rol-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={roleBusy || !roleName.trim()}>
                    {roleBusy ? _t('set_rol_saving','Kaydediliyor…') : _t('set_rol_save','Kaydet')}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setRoleForm(null)}>{_t('set_rol_cancel','İptal')}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Projects ── */}
      {canManageProjects && projects.length > 0 && (
        <div className="settings-section" data-nav-id="projects">
          <div>
            <h3>{_t('set_prj_title','Projeler')}</h3>
            <p className="desc">{_t('set_prj_desc','Her projenin ikon ve rengini özelleştirin.')}</p>
          </div>
          <div className="settings-card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {projects.map(p => {
              const isEditing = editingProject?.id === p.id;
              const editColor = editingProject?.id === p.id ? editingProject.color : p.color;
              const editIcon  = editingProject?.id === p.id ? editingProject.icon  : (p.icon || 'folder');
              const COLORS = [
                ['Terracotta','oklch(55% 0.13 25)'],['Sage','oklch(55% 0.09 150)'],
                ['Indigo','oklch(52% 0.15 270)'],   ['Plum','oklch(50% 0.14 340)'],
                ['Amber','oklch(65% 0.11 70)'],     ['Slate','oklch(50% 0.04 250)'],
              ];
              return (
                <div key={p.id} style={{ border:'1px solid var(--line)', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px' }}>
                    <div style={{ width:34, height:34, borderRadius:8, background:p.color, display:'grid', placeItems:'center', color:'white', flexShrink:0 }}>
                      <Icon name={p.icon || 'folder'} size={16} strokeWidth={1.8} />
                    </div>
                    <span style={{ fontWeight:500, fontSize:13, flex:1 }}>{p.name}</span>
                    <button className="icon-btn" title={_t('set_prj_edit','Düzenle')} onClick={() => setEditingProject(isEditing ? null : { id:p.id, color:p.color, icon:p.icon||'folder' })}>
                      <Icon name={isEditing ? 'x' : 'edit'} size={13} />
                    </button>
                  </div>
                  {isEditing && (
                    <div style={{ padding:'0 14px 14px', borderTop:'1px solid var(--line)', paddingTop:14, display:'flex', flexDirection:'column', gap:12 }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>{_t('set_prj_color','Renk')}</div>
                        <div style={{ display:'flex', gap:7 }}>
                          {COLORS.map(([lbl,val]) => (
                            <button key={val} type="button" title={lbl} onClick={() => setEditingProject(ep => ({...ep, color:val}))}
                              style={{ width:24, height:24, borderRadius:6, background:val, cursor:'pointer',
                                border: editColor===val ? '2px solid var(--ink)' : '2px solid transparent',
                                boxShadow: editColor===val ? '0 0 0 1px var(--bg),0 0 0 3px var(--ink)' : 'none' }} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>{_t('set_prj_icon','İkon')}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(10,1fr)', gap:4, maxHeight:160, overflowY:'auto' }}>
                          {(window.PROJECT_ICONS||[]).map(({id,label}) => (
                            <button key={id+label} type="button" title={label} onClick={() => setEditingProject(ep => ({...ep, icon:id}))}
                              style={{ width:30, height:30, borderRadius:7, display:'grid', placeItems:'center',
                                background: editIcon===id ? editColor : 'var(--bg-raised)',
                                color: editIcon===id ? 'white' : 'var(--ink-muted)',
                                border: editIcon===id ? `2px solid ${editColor}` : '2px solid transparent',
                                cursor:'pointer', transition:'all 0.1s' }}>
                              <Icon name={id} size={14} strokeWidth={1.8} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, marginTop:2 }}>
                        <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => saveProjectIcon(p.id, editIcon, editColor)}>{_t('set_prj_save','Kaydet')}</button>
                        <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setEditingProject(null)}>{_t('set_prj_cancel','İptal')}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Labels ── */}
      <div data-nav-id="labels"><LabelsSection canManage={canManageProjects} /></div>

      {/* ── Members ── */}
      {ws.name && (
        <div className="settings-section" data-nav-id="members">
          <div>
            <h3>{_t('set_mem_title','Takım Üyeleri')}</h3>
            <p className="desc">{members.length} üye · {ws.name}</p>
          </div>
          <div className="settings-card settings-panel members-panel">
            {members.map(m => {
              const workspaceRole = m.ws_role === 'owner' ? _t('set_mem_owner','Sahip') : (m.role_name || 'Üye');
              const profileRole = m.role && m.role !== workspaceRole ? ` · ${m.role}` : '';
              return (
              <div key={m.id} className="member-row">
                <Avatar member={m} size="md" />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:500, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                    {m.name}
                    {m.ws_role === 'owner' && (
                      <span className="member-badge">{_t('set_mem_owner','Sahip')}</span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:'var(--ink-muted)', marginTop:1 }}>{workspaceRole}{profileRole}</div>
                </div>
                {canManageMembers && m.ws_role !== 'owner' && (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <RoleDropdown
                      value={m.role_id || null}
                      roles={roles}
                      onChange={roleId => changeMemberRole(m.id, roleId)}
                      disabled={memberBusy === m.id || (!isOwner && m.id === me.id)}
                      title={(!isOwner && m.id === me.id) ? _t('set_mem_cannot_change','Kendi rolünüzü değiştiremezsiniz') : undefined}
                      onRoleCreated={canManageMembers ? (r) => setRoles(prev => [...prev, r]) : undefined}
                    />
                    {confirmRemoveMemberId === m.id ? (
                      <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
                        <button className="col-menu-confirm-yes" onClick={() => removeMember(m.id)}>{_t('set_mem_remove','Çıkar')}</button>
                        <button className="col-menu-confirm-no" onClick={() => setConfirmRemoveMemberId(null)}>{_t('set_mem_cancel','İptal')}</button>
                      </div>
                    ) : (
                    <button
                      className="icon-btn"
                      title={_t('set_mem_remove_title','Üyeyi çıkar')}
                      onClick={() => setConfirmRemoveMemberId(m.id)}
                      style={{ color:'var(--status-rose)' }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                    )}
                  </div>
                )}
              </div>
            );})}
          </div>
        </div>
      )}

      {/* ── Notifications ── */}
      <div className="settings-section" data-nav-id="notifications">
        <div>
          <h3>{_t('set_notif_title','Bildirimler')}</h3>
          <p className="desc">{_t('set_notif_desc','Hangi bildirimleri, nasıl alacağınızı özelleştirin.')}</p>
        </div>
        <div className="settings-card settings-panel">

          <div className="notif-pref-group">
            <div className="notif-pref-title">{_t('set_notif_general','Genel')}</div>
            <div className="tweak-toggle" onClick={() => setTweak('notifyMessages', !(tweaks.notifyMessages !== false))}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_msg','Mesaj bildirimleri')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_msg_desc','Chat mesajları için anlık bildirim al')}</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMessages !== false} />
            </div>
            <div className="tweak-toggle"
              onClick={() => setTweak('soundEnabled', tweaks.soundEnabled === false)}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_sound','Bildirim sesi')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_sound_desc','Yeni mesajlarda kısa bir ses çalar. Rahatsız Etme modunda çalmaz.')}</span>
              </div>
              <div className="toggle" data-on={tweaks.soundEnabled !== false} />
            </div>
            <div className="tweak-toggle"
              style={{ opacity: tweaks.notifyMessages === false ? 0.4 : 1 }}
              onClick={() => tweaks.notifyMessages !== false && setTweak('notifyToasts', !(tweaks.notifyToasts !== false))}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_toast','Toast bildirimleri')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_toast_desc','Ekranın köşesinde bildirim baloncuğu göster')}</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMessages !== false && tweaks.notifyToasts !== false} />
            </div>
          </div>

          <div className="notif-pref-group" style={{ opacity: tweaks.notifyMessages === false ? 0.4 : 1 }}>
            <div className="notif-pref-title">{_t('set_notif_filters','Mesaj Filtreleri')}</div>
            <div className="tweak-toggle"
              onClick={() => tweaks.notifyMessages !== false && setTweak('notifyDMs', !(tweaks.notifyDMs !== false))}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_dm','Direkt mesajlar')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_dm_desc','Birisinden doğrudan mesaj aldığında')}</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMessages !== false && tweaks.notifyDMs !== false} />
            </div>
            <div className="tweak-toggle"
              onClick={() => tweaks.notifyMessages !== false && setTweak('notifyGroupChat', !(tweaks.notifyGroupChat !== false))}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_channel','Genel kanal mesajları')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_channel_desc','Takım kanalında yeni mesaj geldiğinde')}</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMessages !== false && tweaks.notifyGroupChat !== false} />
            </div>
            <div className="tweak-toggle"
              onClick={() => setTweak('notifyMentions', !(tweaks.notifyMentions !== false))}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_mention','@Bahsedilmeler')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_mention_desc','Adın @ile geçtiğinde her zaman bildir')}</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMentions !== false} />
            </div>
          </div>

          <div className="notif-pref-group">
            <div className="notif-pref-title">{_t('set_notif_tasks','Görev Bildirimleri')}</div>
            <div className="tweak-toggle" onClick={() => setTweak('notifyAssigned', !(tweaks.notifyAssigned !== false))}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_assign','Görev atama')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_assign_desc','Bir kart sana atandığında')}</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyAssigned !== false} />
            </div>
            <div className="tweak-toggle" onClick={() => setTweak('notifyComments', !(tweaks.notifyComments !== false))}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_comment','Yorum bildirimleri')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_comment_desc','Takip ettiğin bir kartta yorum olduğunda')}</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyComments !== false} />
            </div>
            <div className="tweak-toggle" onClick={() => setTweak('notifyWeekly', !tweaks.notifyWeekly)}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_weekly','Haftalık özet')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_weekly_desc','Pazartesi sabahı haftalık aktivite özeti')}</span>
              </div>
              <div className="toggle" data-on={!!tweaks.notifyWeekly} />
            </div>
          </div>

          <div className="notif-pref-note">
            <Icon name="info" size={12} />
            <span>{_t('set_notif_dnd_hint','"Rahatsız Etme" modunda tüm mesaj bildirimleri sessize alınır.')}</span>
          </div>

          {/* Per-event channel matrix */}
          <div className="notif-pref-group">
            <div className="notif-pref-title">{_t('set_notif_channels','Olay türüne göre kanallar')}</div>
            <table className="notif-matrix">
              <thead>
                <tr>
                  <th>Olay</th>
                  <th>Uygulama</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { k: 'mention',    label: _t('set_notif_ev_mention','@Bahsetme') },
                  { k: 'taskAssign', label: _t('set_notif_ev_assign','Görev atama') },
                  { k: 'dm',         label: _t('set_notif_ev_dm','Direkt mesaj') },
                  { k: 'channel',    label: _t('set_notif_ev_channel','Kanal mesajı') },
                  { k: 'reaction',   label: _t('set_notif_ev_reaction','Mesajına reaksiyon') },
                  { k: 'calendar',   label: _t('set_notif_ev_calendar','Takvim hatırlatma') },
                ].map(row => {
                  const get = (def) => {
                    const key = `notifMatrix_${row.k}_inapp`;
                    return tweaks[key] === undefined ? def : !!tweaks[key];
                  };
                  return (
                    <tr key={row.k}>
                      <td>{row.label}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="toggle-switch"
                          data-on={get(true)}
                          onClick={() => setTweak(`notifMatrix_${row.k}_inapp`, !get(true))}
                        >
                          <span className="toggle-knob" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* DND schedule */}
          <div className="notif-pref-group">
            <div className="notif-pref-title">{_t('set_notif_dnd_schedule','Rahatsız etme zamanlaması')}</div>
            <div className="tweak-toggle" onClick={() => setTweak('dndEnabled', !tweaks.dndEnabled)}>
              <div className="tweak-toggle-info">
                <span>{_t('set_notif_auto_dnd','Otomatik DND penceresi')}</span>
                <span className="tweak-toggle-desc">{_t('set_notif_auto_dnd_desc','Her gün belirli saat aralığında bildirimleri sustur')}</span>
              </div>
              <div className="toggle" data-on={!!tweaks.dndEnabled} />
            </div>
            {tweaks.dndEnabled && (
              <div className="notif-pref-schedule" style={{ paddingLeft: 0 }}>
                <span>{_t('set_notif_start','Başlangıç')}</span>
                <input type="time" value={tweaks.dndStart || '19:00'} onChange={e => setTweak('dndStart', e.target.value)} />
                <span>–</span>
                <span>{_t('set_notif_end','Bitiş')}</span>
                <input type="time" value={tweaks.dndEnd || '08:00'} onChange={e => setTweak('dndEnd', e.target.value)} />
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Keyboard shortcuts ── */}
      <div className="settings-section" data-nav-id="shortcuts">
        <div>
          <h3>{_t('set_sct_title','Klavye Kısayolları')}</h3>
          <p className="desc">{_t('set_sct_desc','Kısayollara tıklayarak kendi tuş atamalarını yapabilirsin.')}</p>
        </div>
        <div className="settings-card settings-panel">
          <div className="keymap-list">
            {DEFAULT_SHORTCUTS.map((sc) => {
              const isRecording = recordingId === sc.id;
              const currentKeys = getShortcutKeys(sc.id);
              const isCustom    = !!customShortcuts[sc.id];
              return (
                <div key={sc.id} className="keymap-row" data-recording={isRecording || undefined}>
                  <span className="keymap-label">{sc.label}</span>
                  <div className="keymap-keys-wrap">
                    {isRecording ? (
                      <span className="keymap-recording-hint">Tuşa bas… <button className="keymap-cancel" onClick={() => setRecordingId(null)}>✕</button></span>
                    ) : (
                      <>
                        <span
                          className="keymap-keys"
                          title="Değiştirmek için tıkla"
                          onClick={() => setRecordingId(sc.id)}
                        >
                          {currentKeys.map((k, i) => <kbd key={i}>{k}</kbd>)}
                        </span>
                        {isCustom && (
                          <button
                            className="keymap-reset-one"
                            title="Bu kısayolu sıfırla"
                            onClick={() => {
                              const next = { ...customShortcuts };
                              delete next[sc.id];
                              setCustomShortcuts(next);
                              localStorage.setItem('stoa.shortcuts', JSON.stringify(next));
                            }}
                          >
                            ↺
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="keymap-foot">
            <button className="btn btn-ghost" onClick={resetShortcuts}>
              ↺ {_t('set_sct_reset','Varsayılana sıfırla')}
            </button>
            {Object.keys(customShortcuts).length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--ink-muted)', marginLeft: 10 }}>
                {Object.keys(customShortcuts).length} özelleştirilmiş kısayol
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Language & Region ── */}
      <div className="settings-section" data-nav-id="language">
        <div>
          <h3>{_t('set_language','Dil & Bölge')}</h3>
          <p className="desc">Yerel ayarlar.</p>
        </div>
        <div className="settings-card settings-panel">
          <div className="tweak-group">
            <div className="tweak-label">{_t('set_lng_interface','Arayüz dili')}</div>
            <div className="tweak-options">
              {[['tr', 'Türkçe'], ['en', 'English']].map(([k, l]) => (
                <button key={k} className="tweak-opt" data-active={(tweaks.locale || 'tr') === k} onClick={() => { setTweak('locale', k); localStorage.setItem('stoa.lang', k); }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">{_t('set_lng_date_format','Tarih formatı')}</div>
            <div className="tweak-options">
              {[
                ['dmY', '24 May 2026'],
                ['Ymd', '2026-05-24'],
                ['mdY', '05/24/2026'],
              ].map(([k, l]) => (
                <button key={k} className="tweak-opt" data-active={(tweaks.dateFormat || 'dmY') === k} onClick={() => setTweak('dateFormat', k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">{_t('set_lng_week_start','Haftanın ilk günü')}</div>
            <div className="tweak-options">
              {[['mon', _t('set_lng_monday','Pazartesi')], ['sun', _t('set_lng_sunday','Pazar')], ['sat', _t('set_lng_saturday','Cumartesi')]].map(([k, l]) => (
                <button key={k} className="tweak-opt" data-active={(tweaks.weekStart || 'mon') === k} onClick={() => setTweak('weekStart', k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">{_t('set_lng_timezone','Saat dilimi')}</div>
            <div className="field">
              <input
                value={tweaks.timezone || 'Europe/Istanbul (UTC+03:00)'}
                onChange={(e) => setTweak('timezone', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Danger zone ── */}
      <div className="settings-section" data-nav-id="danger">
        <div>
          <h3 style={{ color:'var(--status-rose)' }}>{_t('set_dng_title','Tehlikeli bölge')}</h3>
          <p className="desc">{_t('set_dng_desc','Geri alınamayan işlemler.')}</p>
        </div>
        <div className="settings-card settings-panel">
          {onLogout && (
            <button className="btn btn-ghost" style={{ justifyContent:'flex-start' }} onClick={onLogout}>
              <Icon name="logOut" size={14} /> {_t('set_dng_logout','Çıkış yap')}
            </button>
          )}
          {isOwner && (
            <>
              {!transferOpen ? (
                <button
                  className="btn btn-ghost"
                  style={{ justifyContent:'flex-start', color:'var(--status-rose)', borderColor:'oklch(58% 0.13 10 / 0.3)' }}
                  onClick={() => { setTransferOpen(true); setTransferSlug(''); setTransferError(''); }}
                >
                  <Icon name="userPlus" size={14} /> {_t('set_dng_transfer','Sahipliği aktar')}
                </button>
              ) : (
                <div className="danger-confirm">
                  <div>
                    <strong>{_t('set_dng_transfer_desc','Sahipliği başka bir üyeye aktar.')}</strong>
                    <p>{_t('set_dng_transfer_warn','Bu işlemden sonra sahip yetkilerinizi kaybedersiniz. Geri alınamaz.')}</p>
                  </div>
                  <select
                    value={transferSlug}
                    onChange={e => setTransferSlug(e.target.value)}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--line)', background:'var(--bg)', color:'var(--ink)', fontSize:13 }}
                  >
                    <option value="">{_t('set_dng_select_member','— Üye seçin —')}</option>
                    {members.filter(m => m.id !== window.CURRENT_USER?.id).map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {transferError && <div className="inline-error">{transferError}</div>}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button className="btn btn-ghost" onClick={() => { setTransferOpen(false); setTransferError(''); }} disabled={transferBusy}>
                      {_t('set_dng_cancel','İptal')}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ color:'var(--status-rose)', borderColor:'oklch(58% 0.13 10 / 0.35)' }}
                      onClick={transferOwnership}
                      disabled={transferBusy || !transferSlug}
                    >
                      <Icon name="userPlus" size={14} /> {transferBusy ? _t('set_dng_transferring','Aktarılıyor…') : _t('set_dng_transfer_btn','Sahipliği aktar')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {!deleteOpen ? (
            <button
              className="btn btn-ghost"
              style={{ justifyContent:'flex-start', color:'var(--status-rose)', borderColor:'oklch(58% 0.13 10 / 0.3)' }}
              onClick={() => { setDeleteOpen(true); setDeleteError(''); }}
            >
              <Icon name="trash" size={14} /> {_t('set_dng_delete_account','Hesabı sil')}
            </button>
          ) : (
            <div className="danger-confirm">
              <div>
                <strong>{_t('set_dng_delete_desc','Hesap kalıcı olarak silinecek.')}</strong>
                <p>{_t('set_dng_delete_confirm','Devam etmek için hesabınızın e-posta adresini yazın.')}</p>
              </div>
              <input
                type="email"
                value={deleteEmail}
                onChange={e => setDeleteEmail(e.target.value)}
                placeholder={me.email || 'eposta@ornek.com'}
                autoFocus
              />
              {deleteError && <div className="inline-error">{deleteError}</div>}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button className="btn btn-ghost" onClick={() => { setDeleteOpen(false); setDeleteEmail(''); setDeleteError(''); }} disabled={deleteBusy}>
                  {_t('set_dng_cancel','İptal')}
                </button>
                <button className="btn btn-ghost" style={{ color:'var(--status-rose)', borderColor:'oklch(58% 0.13 10 / 0.35)' }} onClick={deleteAccount} disabled={deleteBusy || !deleteEmail.trim()}>
                  <Icon name="trash" size={14} /> {deleteBusy ? _t('set_dng_deleting','Siliniyor…') : _t('set_dng_delete_btn','Hesabı kalıcı sil')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

function SettingsToggle({ label, defaultOn }) {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <div className="tweak-toggle" onClick={() => setOn(!on)}>
      {label && <span>{label}</span>}
      <div className="toggle" data-on={on} />
    </div>
  );
}

window.SettingsView = SettingsView;
