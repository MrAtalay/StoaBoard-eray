// Settings view — profile, appearance, workspace (invite code + roles + members)

const LABEL_TONES = [
  { id: 'rose',   label: 'Kırmızı'    },
  { id: 'blue',   label: 'Mavi'       },
  { id: 'amber',  label: 'Sarı'       },
  { id: 'green',  label: 'Yeşil'      },
  { id: 'purple', label: 'Mor'        },
  { id: 'teal',   label: 'Turkuaz'    },
  { id: 'orange', label: 'Turuncu'    },
  { id: 'cyan',   label: 'Camgöbeği' },
  { id: 'pink',   label: 'Pembe'      },
];

function LabelsSection({ canManage }) {
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
    } catch (e) { window.showToast?.('Etiket silinemedi: ' + e.message, 'error'); }
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
    } catch (e) { window.showToast?.('Etiket güncellenemedi: ' + e.message, 'error'); }
    finally { setEditBusy(false); }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || !projectId) return;
    const slug = toSlug(name);
    if (!slug) { setError('Geçerli bir isim girin'); return; }
    if (labels[slug]) { setError('Bu etiket zaten mevcut'); return; }
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
        <h3>Etiketler</h3>
        <p className="desc">Görevleri kategorize etmek için etiketleri yönetin.</p>
      </div>
      <div className="settings-card" style={{ padding: 0, overflow: 'hidden' }}>
        {Object.keys(labels).length === 0 && (
          <div style={{ padding: '18px 20px', fontSize: 13, color: 'var(--ink-muted)' }}>Henüz etiket yok.</div>
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
                  {LABEL_TONES.map(t => (
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
                    {editBusy ? '…' : 'Kaydet'}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingSlug(null)}>İptal</button>
                </div>
              </div>
            ) : (
              <div className="label-row">
                <span className="tag" data-tone={label.tone} style={{ flexShrink: 0 }}>{label.tr}</span>
                <span className="label-row-slug">{slug}</span>
                {canManage && (
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button className="icon-btn" title="Düzenle" onClick={() => handleStartEdit(slug, label)}>
                      <Icon name="edit" size={13} />
                    </button>
                    <button className="icon-btn label-row-del" title="Sil" onClick={() => handleDelete(slug)}>
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
              placeholder="Yeni etiket adı…"
              value={newName}
              onChange={e => { setNewName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <div className="label-tone-row">
              {LABEL_TONES.map(t => (
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
              {adding ? '…' : '+ Ekle'}
            </button>
          </div>
        )}
        {error && (
          <div style={{ padding: '0 20px 14px', fontSize: 12, color: 'var(--status-rose)' }}>{error}</div>
        )}
        {!projectId && canManage && (
          <div style={{ padding: '0 20px 14px', fontSize: 12, color: 'var(--ink-muted)' }}>Etiket yönetimi için bir proje açın.</div>
        )}
      </div>
    </div>
  );
}

function RoleDropdown({ value, roles, onChange, disabled }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = roles.find(r => r.id === value);

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
          minWidth: 148, overflow: 'hidden',
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
        </div>
      )}
    </div>
  );
}

const PERM_LABELS = {
  manage_tasks:    'Görevleri yönet',
  manage_projects: 'Projeleri yönet',
  manage_members:  'Üyeleri yönet',
};
const ALL_PERMS = Object.keys(PERM_LABELS);

const ROLE_COLORS = [
  'oklch(52% 0.15 270)', 'oklch(55% 0.09 150)', 'oklch(55% 0.13 25)',
  'oklch(50% 0.14 340)', 'oklch(65% 0.11 70)',  'oklch(50% 0.04 250)',
];

function SettingsView({ tweaks, setTweak, onLogout, onWsLogoChange, onMembersChange }) {
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
    } catch (err) { window.showToast?.('Logo yüklenemedi: ' + err.message, 'error'); }
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
    } catch (e) { window.showToast?.('Kaydedilemedi: ' + e.message, 'error'); }
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
    } catch (err) { window.showToast?.('Fotoğraf yüklenemedi: ' + err.message, 'error'); }
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
    } catch (err) { window.showToast?.('Fotoğraf silinemedi: ' + err.message, 'error'); }
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

  return (
    <div className="settings-wrap">
      <h1>Ayarlar<em>.</em></h1>
      <p className="settings-sub">Hesabınızı, çalışma alanınızı ve görünümü yönetin.</p>

      {/* ── Profile ── */}
      <div className="settings-section">
        <div>
          <h3>Profil</h3>
          <p className="desc">Takım üyelerinin sizi nasıl göreceği.</p>
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
                  <Icon name="upload" size={12} /> {avatarBusy ? 'Yükleniyor…' : 'Fotoğraf Yükle'}
                </button>
                {avatarUrl && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--status-rose)' }} disabled={avatarBusy} onClick={removeAvatar}>
                    Kaldır
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>PNG, JPG, WEBP — maks. 5 MB</div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Ad Soyad</label>
              <input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>E-posta (değiştirmek için girin)</label>
              <input type="email" value={email} placeholder={me.email || 'eposta@ornek.com'} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginTop:12 }}>
            <label>Başlık / Rol</label>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Founder · Product Manager" />
          </div>
          <div style={{ marginTop:14 }}>
            <button className="btn btn-primary" onClick={saveProfile} disabled={busy}>
              {busy ? 'Kaydediliyor…' : saved ? '✓ Kaydedildi' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Appearance ── */}
      <div className="settings-section">
        <div>
          <h3>Görünüm</h3>
          <p className="desc">Tema, renk ve tipografi tercihlerin.</p>
        </div>
        <div className="settings-card settings-panel">
          <div className="tweak-group">
            <div className="tweak-label">Tema</div>
            <div className="tweak-options">
              {['light','cream','dark'].map(t => (
                <button key={t} className="tweak-opt" data-active={tweaks.theme===t} onClick={() => setTweak('theme',t)}>
                  {t==='light' ? 'Açık' : t==='cream' ? 'Krem' : 'Koyu'}
                </button>
              ))}
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">Vurgu rengi</div>
            <div className="swatch-row">
              {[['terracotta','oklch(55% 0.13 25)'],['sage','oklch(55% 0.09 150)'],['slate','oklch(50% 0.04 250)'],['indigo','oklch(52% 0.15 270)'],['plum','oklch(50% 0.14 340)']].map(([k,v]) => (
                <button key={k} className="swatch" data-active={tweaks.accent===k} style={{ background:v }} onClick={() => setTweak('accent',k)} />
              ))}
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">Yoğunluk</div>
            <div className="tweak-options">
              {['airy','balanced','compact'].map(d => (
                <button key={d} className="tweak-opt" data-active={tweaks.density===d} onClick={() => setTweak('density',d)}>
                  {d==='airy' ? 'Ferah' : d==='balanced' ? 'Dengeli' : 'Kompakt'}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Workspace logo ── (owner only) */}
      {isOwner && (
        <div className="settings-section">
          <div>
            <h3>Çalışma Alanı</h3>
            <p className="desc">Takımınızın logo veya fotoğrafını yükleyin.</p>
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
                <div style={{ fontSize: 14, fontWeight: 500 }}>{ws.name || 'Çalışma Alanı'}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadLogo} />
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={logoBusy}
                    onClick={() => logoInputRef.current?.click()}>
                    <Icon name="upload" size={12} /> {logoBusy ? 'Yükleniyor…' : 'Logo Yükle'}
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
                      Kaldır
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>PNG, JPG, WEBP — maks. 5 MB</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Workspace / Invite code ── (owner only) */}
      {isOwner && (
        <div className="settings-section">
          <div>
            <h3>Davet Kodu</h3>
            <p className="desc">Bu kodu paylaşarak takıma üye ekleyin.</p>
          </div>
          <div className="settings-card settings-panel">
            {inviteCode ? (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', background:'var(--bg-raised)', border:'1px solid var(--line)', borderRadius:10, marginBottom:12 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:22, letterSpacing:'0.15em', fontWeight:600, color:'var(--ink)', flex:1 }}>
                    {inviteCode}
                  </span>
                  <button className="btn btn-ghost" onClick={copyCode} style={{ fontSize:12, padding:'5px 10px' }}>
                    {codeCopied ? '✓ Kopyalandı' : 'Kopyala'}
                  </button>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {confirmRegen ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--line)', fontSize:13 }}>
                      <span style={{ color:'var(--ink-muted)' }}>Mevcut kod geçersiz olacak.</span>
                      <button className="btn btn-primary" style={{ fontSize:12, padding:'4px 10px' }} onClick={regenCode} disabled={codeLoading}>Yenile</button>
                      <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} onClick={() => setConfirmRegen(false)}>İptal</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setConfirmRegen(true)} disabled={codeLoading}>
                      <Icon name="refresh" size={13} /> Yenile
                    </button>
                  )}
                  {confirmDelete ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--line)', fontSize:13 }}>
                      <span style={{ color:'var(--status-rose)' }}>Kod silinecek, üye eklenemez.</span>
                      <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px', color:'var(--status-rose)' }} onClick={deleteCode} disabled={codeLoading}>Sil</button>
                      <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} onClick={() => setConfirmDelete(false)}>İptal</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)} disabled={codeLoading} style={{ color:'var(--status-rose)' }}>
                      <Icon name="trash" size={13} /> Kodu Sil
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ fontSize:13, color:'var(--ink-muted)', padding:'12px 14px', background:'var(--bg-subtle)', borderRadius:8 }}>
                  Davet kodu yok — şu an kimse davet edilemiyor.
                </div>
                <button className="btn btn-primary" onClick={enableCode} disabled={codeLoading}>
                  <Icon name="plus" size={13} /> Davet Kodu Oluştur
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Roles ── (owner only) */}
      {isOwner && (
        <div className="settings-section">
          <div>
            <h3>Roller</h3>
            <p className="desc">Özel roller ve izinler tanımlayın.</p>
          </div>
          <div className="settings-card settings-panel">
            {/* Role list */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
              {roles.map(r => (
                <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg-raised)', border:'1px solid var(--line)', borderRadius:9 }}>
                  <span style={{ width:10, height:10, borderRadius:'50%', background:r.color, flexShrink:0 }} />
                  <span style={{ fontWeight:500, fontSize:13, flex:1 }}>{r.name}</span>
                  {r.is_default && <span style={{ fontSize:10, padding:'2px 6px', background:'var(--accent-soft)', color:'var(--accent-ink)', borderRadius:4 }}>Varsayılan</span>}
                  <div style={{ display:'flex', gap:4 }}>
                    <button className="icon-btn" title="Düzenle" onClick={() => openRoleForm(r)}><Icon name="edit" size={13} /></button>
                    {confirmDeleteRoleId === r.id ? (
                      <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
                        <button className="col-menu-confirm-yes" onClick={() => deleteRoleById(r.id)}>Sil</button>
                        <button className="col-menu-confirm-no" onClick={() => setConfirmDeleteRoleId(null)}>İptal</button>
                      </div>
                    ) : (
                      <button className="icon-btn" title="Sil" onClick={() => setConfirmDeleteRoleId(r.id)} style={{ color:'var(--status-rose)' }}><Icon name="trash" size={13} /></button>
                    )}
                  </div>
                </div>
              ))}
              {roles.length === 0 && (
                <div style={{ fontSize:13, color:'var(--ink-muted)', padding:'10px 0' }}>Henüz özel rol yok.</div>
              )}
            </div>

            {/* Add role button */}
            {!roleForm && (
              <button className="btn btn-ghost" onClick={() => openRoleForm(null)}>
                <Icon name="plus" size={13} /> Yeni Rol
              </button>
            )}

            {/* Role form */}
            {roleForm !== null && (
              <form onSubmit={saveRole} style={{ marginTop:8, padding:'16px', background:'var(--bg-subtle)', borderRadius:10, border:'1px solid var(--line)' }}>
                <div style={{ fontWeight:500, fontSize:13, marginBottom:12, color:'var(--ink)' }}>
                  {roleForm.id ? 'Rolü Düzenle' : 'Yeni Rol'}
                </div>
                <div className="field" style={{ marginBottom:10 }}>
                  <label>Rol Adı</label>
                  <input autoFocus placeholder="Örn: Geliştirici, Tasarımcı…" value={roleName} onChange={e => setRoleName(e.target.value)} required />
                </div>
                <div className="field" style={{ marginBottom:10 }}>
                  <label>Renk</label>
                  <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                    {ROLE_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setRoleColor(c)}
                        style={{ width:24, height:24, borderRadius:6, background:c, cursor:'pointer', flexShrink:0,
                          border: roleColor===c ? '2px solid var(--ink)' : '2px solid transparent',
                          transform: roleColor===c ? 'scale(1.15)' : 'none' }} />
                    ))}
                  </div>
                </div>
                <div className="field" style={{ marginBottom:10 }}>
                  <label>İzinler</label>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {ALL_PERMS.map(p => (
                      <label key={p} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                        <input type="checkbox" checked={rolePerms.includes(p)} onChange={() => togglePerm(p)} style={{ accentColor:'var(--accent)' }} />
                        {PERM_LABELS[p]}
                      </label>
                    ))}
                  </div>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', marginBottom:14 }}>
                  <input type="checkbox" checked={roleDefault} onChange={e => setRoleDefault(e.target.checked)} style={{ accentColor:'var(--accent)' }} />
                  Yeni üyeler için varsayılan rol
                </label>
                <div style={{ display:'flex', gap:8 }}>
                  <button type="submit" className="btn btn-primary" disabled={roleBusy || !roleName.trim()}>
                    {roleBusy ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setRoleForm(null)}>İptal</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Projects ── */}
      {canManageProjects && projects.length > 0 && (
        <div className="settings-section">
          <div>
            <h3>Projeler</h3>
            <p className="desc">Her projenin ikon ve rengini özelleştirin.</p>
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
                    <button className="icon-btn" title="Düzenle" onClick={() => setEditingProject(isEditing ? null : { id:p.id, color:p.color, icon:p.icon||'folder' })}>
                      <Icon name={isEditing ? 'x' : 'edit'} size={13} />
                    </button>
                  </div>
                  {isEditing && (
                    <div style={{ padding:'0 14px 14px', borderTop:'1px solid var(--line)', paddingTop:14, display:'flex', flexDirection:'column', gap:12 }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Renk</div>
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
                        <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>İkon</div>
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
                        <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => saveProjectIcon(p.id, editIcon, editColor)}>Kaydet</button>
                        <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setEditingProject(null)}>İptal</button>
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
      <LabelsSection canManage={canManageProjects} />

      {/* ── Members ── */}
      {ws.name && (
        <div className="settings-section">
          <div>
            <h3>Takım Üyeleri</h3>
            <p className="desc">{members.length} üye · {ws.name}</p>
          </div>
          <div className="settings-card settings-panel members-panel">
            {members.map(m => {
              const workspaceRole = m.ws_role === 'owner' ? 'Sahip' : (m.role_name || 'Üye');
              const profileRole = m.role && m.role !== workspaceRole ? ` · ${m.role}` : '';
              return (
              <div key={m.id} className="member-row">
                <Avatar member={m} size="md" />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:500, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                    {m.name}
                    {m.ws_role === 'owner' && (
                      <span className="member-badge">Sahip</span>
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
                      disabled={memberBusy === m.id}
                    />
                    {confirmRemoveMemberId === m.id ? (
                      <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
                        <button className="col-menu-confirm-yes" onClick={() => removeMember(m.id)}>Çıkar</button>
                        <button className="col-menu-confirm-no" onClick={() => setConfirmRemoveMemberId(null)}>İptal</button>
                      </div>
                    ) : (
                    <button
                      className="icon-btn"
                      title="Üyeyi çıkar"
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
      <div className="settings-section">
        <div>
          <h3>Bildirimler</h3>
          <p className="desc">Hangi bildirimleri, nasıl alacağınızı özelleştirin.</p>
        </div>
        <div className="settings-card settings-panel">

          <div className="notif-pref-group">
            <div className="notif-pref-title">Genel</div>
            <div className="tweak-toggle" onClick={() => setTweak('notifyMessages', !(tweaks.notifyMessages !== false))}>
              <div className="tweak-toggle-info">
                <span>Mesaj bildirimleri</span>
                <span className="tweak-toggle-desc">Chat mesajları için anlık bildirim al</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMessages !== false} />
            </div>
            <div className="tweak-toggle"
              style={{ opacity: tweaks.notifyMessages === false ? 0.4 : 1 }}
              onClick={() => tweaks.notifyMessages !== false && setTweak('notifyToasts', !(tweaks.notifyToasts !== false))}>
              <div className="tweak-toggle-info">
                <span>Toast bildirimleri</span>
                <span className="tweak-toggle-desc">Ekranın köşesinde bildirim baloncuğu göster</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMessages !== false && tweaks.notifyToasts !== false} />
            </div>
          </div>

          <div className="notif-pref-group" style={{ opacity: tweaks.notifyMessages === false ? 0.4 : 1 }}>
            <div className="notif-pref-title">Mesaj Filtreleri</div>
            <div className="tweak-toggle"
              onClick={() => tweaks.notifyMessages !== false && setTweak('notifyDMs', !(tweaks.notifyDMs !== false))}>
              <div className="tweak-toggle-info">
                <span>Direkt mesajlar</span>
                <span className="tweak-toggle-desc">Birisinden doğrudan mesaj aldığında</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMessages !== false && tweaks.notifyDMs !== false} />
            </div>
            <div className="tweak-toggle"
              onClick={() => tweaks.notifyMessages !== false && setTweak('notifyGroupChat', !(tweaks.notifyGroupChat !== false))}>
              <div className="tweak-toggle-info">
                <span>Genel kanal mesajları</span>
                <span className="tweak-toggle-desc">Takım kanalında yeni mesaj geldiğinde</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMessages !== false && tweaks.notifyGroupChat !== false} />
            </div>
            <div className="tweak-toggle"
              onClick={() => setTweak('notifyMentions', !(tweaks.notifyMentions !== false))}>
              <div className="tweak-toggle-info">
                <span>@Bahsedilmeler</span>
                <span className="tweak-toggle-desc">Adın @ile geçtiğinde her zaman bildir</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyMentions !== false} />
            </div>
          </div>

          <div className="notif-pref-group">
            <div className="notif-pref-title">Görev Bildirimleri</div>
            <div className="tweak-toggle" onClick={() => setTweak('notifyAssigned', !(tweaks.notifyAssigned !== false))}>
              <div className="tweak-toggle-info">
                <span>Görev atama</span>
                <span className="tweak-toggle-desc">Bir kart sana atandığında</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyAssigned !== false} />
            </div>
            <div className="tweak-toggle" onClick={() => setTweak('notifyComments', !(tweaks.notifyComments !== false))}>
              <div className="tweak-toggle-info">
                <span>Yorum bildirimleri</span>
                <span className="tweak-toggle-desc">Takip ettiğin bir kartta yorum olduğunda</span>
              </div>
              <div className="toggle" data-on={tweaks.notifyComments !== false} />
            </div>
            <div className="tweak-toggle" onClick={() => setTweak('notifyWeekly', !tweaks.notifyWeekly)}>
              <div className="tweak-toggle-info">
                <span>Haftalık özet</span>
                <span className="tweak-toggle-desc">Pazartesi sabahı haftalık aktivite özeti</span>
              </div>
              <div className="toggle" data-on={!!tweaks.notifyWeekly} />
            </div>
          </div>

          <div className="notif-pref-note">
            <Icon name="info" size={12} />
            <span>"Rahatsız Etme" modunda tüm mesaj bildirimleri sessize alınır.</span>
          </div>
        </div>
      </div>

      {/* ── Danger zone ── */}
      <div className="settings-section">
        <div>
          <h3 style={{ color:'var(--status-rose)' }}>Tehlikeli bölge</h3>
          <p className="desc">Geri alınamayan işlemler.</p>
        </div>
        <div className="settings-card settings-panel">
          {onLogout && (
            <button className="btn btn-ghost" style={{ justifyContent:'flex-start' }} onClick={onLogout}>
              <Icon name="logOut" size={14} /> Çıkış yap
            </button>
          )}
          {!deleteOpen ? (
            <button
              className="btn btn-ghost"
              style={{ justifyContent:'flex-start', color:'var(--status-rose)', borderColor:'oklch(58% 0.13 10 / 0.3)' }}
              onClick={() => { setDeleteOpen(true); setDeleteError(''); }}
            >
              <Icon name="trash" size={14} /> Hesabı sil
            </button>
          ) : (
            <div className="danger-confirm">
              <div>
                <strong>Hesap kalıcı olarak silinecek.</strong>
                <p>Devam etmek için hesabınızın e-posta adresini yazın.</p>
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
                  İptal
                </button>
                <button className="btn btn-ghost" style={{ color:'var(--status-rose)', borderColor:'oklch(58% 0.13 10 / 0.35)' }} onClick={deleteAccount} disabled={deleteBusy || !deleteEmail.trim()}>
                  <Icon name="trash" size={14} /> {deleteBusy ? 'Siliniyor…' : 'Hesabı kalıcı sil'}
                </button>
              </div>
            </div>
          )}
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
