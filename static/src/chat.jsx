// Team chat panel — real-time DM + group chat, file/image/video sharing

const { useState: useChatS, useEffect: useChatE, useRef: useChatRef, useCallback: useChatCb } = React;

// ── ConfirmModal — replaces all native confirm() dialogs ─────────────────
function ConfirmModal({ open, title, message, hint, confirmText, cancelText, variant, onConfirm, onCancel }) {
  useChatE(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onConfirm(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="stoa-channel-modal-backdrop" onClick={onCancel}>
      <div className="stoa-channel-modal stoa-confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="stoa-channel-modal-head">
          <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {variant === 'danger'
              ? <Icon name="trash" size={15} style={{ color: 'var(--status-rose)' }} />
              : <Icon name="alertTriangle" size={15} style={{ color: 'var(--status-amber)' }} />}
            {title}
          </div>
          <button className="icon-btn" onClick={onCancel} style={{ padding: 4 }}><Icon name="x" size={14} /></button>
        </div>
        <div className="stoa-channel-modal-body" style={{ gap: 8 }}>
          <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: 0 }}>{message}</p>
          {hint && <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: 0 }}>{hint}</p>}
        </div>
        <div className="stoa-channel-modal-foot">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelText || (window.t?.('app_cancel') || 'İptal')}
          </button>
          <button className={variant === 'danger' ? 'btn btn-danger' : 'btn btn-warn'} onClick={onConfirm}>
            {confirmText || (window.t?.('app_confirm') || 'Onayla')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Hook: useConfirm() — replaces window.confirm()
// Returns [confirmState, askConfirm, ConfirmUI]
function useConfirm() {
  const [state, setState] = useChatS(null); // { title, message, hint, confirmText, variant, resolve }
  const ask = (opts) => new Promise(resolve => setState({ ...opts, resolve }));
  const handleConfirm = () => { state?.resolve(true);  setState(null); };
  const handleCancel  = () => { state?.resolve(false); setState(null); };
  const UI = (
    <ConfirmModal
      open={!!state}
      title={state?.title || ''}
      message={state?.message || ''}
      hint={state?.hint}
      confirmText={state?.confirmText}
      cancelText={state?.cancelText}
      variant={state?.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
  return [ask, UI];
}

// ── Lightbox (image OR video) ─────────────────────────────────────────────
function Lightbox({ src, kind = 'image', onClose }) {
  useChatE(() => {
    // Lightbox-level ESC handler. Video keyboard shortcuts live on the player itself.
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);
  return (
    <div className="stoa-lightbox-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      cursor: 'zoom-out',
      animation: 'stoa-lightbox-fade 0.2s var(--ease, ease-out)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 48px)',
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {kind === 'video'
          ? <CustomVideoPlayer src={src} autoPlay lightbox />
          : <img src={src} alt="" style={{
              maxWidth: 'calc(100vw - 48px)',
              maxHeight: 'calc(100vh - 48px)',
              borderRadius: 8,
              objectFit: 'contain',
              display: 'block',
            }} />
        }
      </div>
      <button onClick={onClose} title={window.t?.('chat_close') || 'Kapat (ESC)'} style={{
        position: 'absolute', top: 18, right: 22, background: 'rgba(0, 0, 0, 0.55)',
        color: 'white', border: '1px solid rgba(255, 255, 255, 0.15)',
        width: 36, height: 36, borderRadius: 18, padding: 0, cursor: 'pointer',
        display: 'grid', placeItems: 'center',
      }}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

// ── Emoji reactions — 100 emoji pack ─────────────────────────────────────
const EMOJI_PACK = [
  '👍','❤️','😂','😮','😢','🔥','🎉','👀',
  '😊','😍','🤩','😎','🤔','😅','😆','🥰',
  '😭','😤','🤯','😱','🤗','😏','😒','🙃',
  '🙌','👏','🤝','✌️','🤞','🤙','👋','💪',
  '🎊','🏆','🥇','⭐','✨','💫','🌟','🎯',
  '💯','🔑','💡','⚡','🌈','💎','🌺','🍀',
  '🚀','🛸','🎭','🎨','🎵','🎸','🎮','🎲',
  '🍕','🍔','🍣','☕','🍺','🎂','🍰','🍫',
  '🐶','🐱','🦊','🐼','🦁','🐸','🦄','🐉',
  '🌍','🌊','🏔️','🌅','🌃','🏠','🏖️','🌵',
  '💬','📢','📌','📎','🔔','🔒','📱','💻',
  '😇','🤓','🤑','🥳','😴','🥺','🫡','👻',
  '💀','🤖','👽','🫶',
];

// ── File size formatter ───────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ── Local YYYY-MM-DD (uses viewer's timezone, not UTC) ─────────────────────
function _localDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// ── Time formatter (converts UTC ISO timestamp to local HH:MM) ────────────
function fmtMsgTime(msg) {
  const raw = msg.ts || msg.created_at;
  const d = window._parseServerDate?.(raw);
  if (d) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return msg.time || '';
}
// ── Date key (LOCAL YYYY-MM-DD) for grouping messages ──────────────────────
function msgDateKey(msg) {
  const raw = msg.ts || msg.created_at;
  const d = window._parseServerDate?.(raw);
  return d ? _localDayKey(d) : null;
}
// ── Date separator label ───────────────────────────────────────────────────
function fmtDateSep(dateKey) {
  if (!dateKey) return '';
  const lang = localStorage.getItem('stoa.lang') || 'tr';
  const months = lang === 'en'
    ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    : ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const now = new Date();
  const today = _localDayKey(now);
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const yesterday = _localDayKey(yest);
  if (dateKey === today) return window.t?.('chat_today') || 'Bugün';
  if (dateKey === yesterday) return window.t?.('chat_yesterday') || 'Dün';
  const d = new Date(dateKey + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
// ── Render message text with @mention chips + markdown (**bold**, *italic*, `code`) ─
function _renderInline(text, keyBase = '') {
  if (!text) return [];
  // Tokenize: ` code `  **bold**  *italic*  (greedy, non-nested for inline scope)
  const out = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let last = 0; let m; let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(React.createElement('strong', { key: `${keyBase}b${idx++}` }, tok.slice(2, -2)));
    } else if (tok.startsWith('`')) {
      out.push(React.createElement('code', { key: `${keyBase}c${idx++}`, className: 'md-code-inline' }, tok.slice(1, -1)));
    } else if (tok.startsWith('*')) {
      out.push(React.createElement('em', { key: `${keyBase}i${idx++}` }, tok.slice(1, -1)));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function RenderMsgText({ text, allMembers, onMentionClick }) {
  if (!text) return null;
  const parts = text.split(/(@[\w.-]+)/g);
  return React.createElement('span', null, ...parts.map((part, i) => {
    if (part.startsWith('@')) {
      const slug = part.slice(1).replace(/[.\-]+$/, '');
      const member = allMembers.find(m => m.id === slug);
      if (member) {
        const isSelfMention = member.id === window.CURRENT_USER?.id;
        return React.createElement('span', {
          key: i,
          onClick: (e) => { e.stopPropagation(); if (!isSelfMention) onMentionClick(member); },
          style: {
            display: 'inline-block',
            background: 'var(--accent)',
            color: 'white',
            borderRadius: 4, padding: '1px 6px',
            fontWeight: 600, fontSize: '0.85em', cursor: isSelfMention ? 'default' : 'pointer',
            verticalAlign: 'middle',
          }
        }, `@${member.name}`);
      }
    }
    return React.createElement(React.Fragment, { key: i }, ..._renderInline(part, `p${i}`));
  }));
}
// ── Full date+time formatter for media/links ──────────────────────────────
function fmtMsgDateTime(msg) {
  const raw = msg.ts || msg.created_at;
  if (raw) {
    try {
      const iso = (raw.endsWith('Z') || raw.includes('+')) ? raw : raw + 'Z';
      const d = new Date(iso);
      const lang = localStorage.getItem('stoa.lang') || 'tr';
      const MONTHS = lang === 'en'
        ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        : ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
      const dateStr = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const timeStr = d.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} · ${timeStr}`;
    } catch(e) {}
  }
  return msg.time || '';
}
// ── Status dot ────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const colors = {
    online:  'var(--status-green)',
    away:    'oklch(75% 0.14 75)',
    dnd:     'var(--status-rose)',
    offline: 'var(--ink-faint)',
  };
  const titles = { online: window.t?.('shell_status_online')||'Çevrimiçi', away: window.t?.('shell_status_away')||'Uzakta', dnd: window.t?.('shell_status_dnd')||'Rahatsız Etme', offline: window.t?.('shell_status_offline')||'Çevrimdışı' };
  return (
    <span title={titles[status] || (window.t?.('shell_status_offline')||'Çevrimdışı')} style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: colors[status] || colors.offline,
      border: '1.5px solid var(--bg)',
      flexShrink: 0,
    }} />
  );
}

// ── Message bubble content ────────────────────────────────────────────────
function chatToastPayload(msg, sender) {
  return {
    message: msg.text || msg.file_name || (window.t?.('chat_file')||'Dosya'),
    meta: {
      sender: sender?.name || msg.from || (window.t?.('chat_new_msg')||'Yeni mesaj'),
      channel: msg.to ? (window.t?.('chat_direct_messages')||'Direkt mesaj') : (window.t?.('chat_team_channels')||'Genel kanal'),
      time: msg.time || new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    },
  };
}

function MsgContent({ msg, onImageClick }) {
  const openMedia = (kind, src) => {
    const handler = onImageClick;
    if (!handler) return;
    handler(kind === 'image' ? src : { src, kind });
  };
  if (msg.file_type === 'image') {
    return (
      <div className="chat-media-wrap">
        <img
          src={msg.file_url} alt={msg.file_name || (window.t?.('chat_img_not_found')||'Görsel')}
          className="chat-media-img"
          onClick={() => openMedia('image', msg.file_url)}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex');
          }}
        />
        <div style={{ display: 'none', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-dim)', color: 'var(--ink-muted)', fontSize: 12 }}>
          <Icon name="eyeOff" size={14} />
          <span>{msg.file_name || (window.t?.('chat_img_not_found')||'Görsel bulunamadı')}</span>
        </div>
        {msg.text && <div className="chat-bubble-text">{msg.text}</div>}
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 3 }}>{fmtMsgDateTime(msg)}</div>
      </div>
    );
  }
  if (msg.file_type === 'video') {
    return (
      <div className="chat-media-wrap" onDoubleClick={() => openMedia('video', msg.file_url)}>
        <CustomVideoPlayer src={msg.file_url} />
        {msg.text && <div className="chat-bubble-text">{msg.text}</div>}
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 3 }}>{fmtMsgDateTime(msg)}</div>
      </div>
    );
  }
  if (msg.file_type === 'file') {
    return (
      <div className="chat-file-attach">
        <Icon name="paperclip" size={14} />
        <a href={msg.file_url} target="_blank" rel="noreferrer" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {msg.file_name || 'Dosya'}
        </a>
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', width: '100%', marginTop: 2 }}>{fmtMsgDateTime(msg)}</div>
        {msg.text && <div className="chat-bubble-text" style={{ marginTop: 4 }}>{msg.text}</div>}
      </div>
    );
  }
  return <span><RenderMsgText text={msg.text} allMembers={window.DATA?.MEMBERS || []} onMentionClick={msg._onMentionClick || (() => {})} /></span>;
}

function buildReplyRef(msg, allMembers) {
  if (!msg || msg.deleted) return null;
  const sender = allMembers.find(m => m.id === msg.from);
  const rawText = (msg.text || msg.file_name || (msg.file_url ? (window.t?.('chat_file') || 'Dosya') : '')).trim();
  const text = rawText || (msg.file_type === 'image' ? 'Fotoğraf' : msg.file_type === 'video' ? 'Video' : 'Mesaj');
  return {
    id: msg.id,
    sender: sender?.name || msg.from || '',
    text: text.length > 140 ? text.slice(0, 137) + '...' : text,
  };
}

function ReplyPreview({ reply, mine, onClose, onJump, compact = false }) {
  if (!reply) return null;
  return (
    <div
      className={`chat-reply-preview ${compact ? 'is-compact' : ''}`}
      data-mine={!!mine}
      onClick={() => onJump?.(reply.id)}
    >
      <div className="chat-reply-bar" />
      <div className="chat-reply-body">
        <div className="chat-reply-sender">{reply.sender || 'Mesaj'}</div>
        <div className="chat-reply-text">{reply.text || 'Mesaj'}</div>
      </div>
      {onClose && (
        <button className="chat-reply-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

// ── Create-channel modal (public/private + member picker) ─────────────────
function CreateChannelModal({ open, onClose, onCreated, allMembers, me }) {
  const [name, setName] = useChatS('');
  const [description, setDescription] = useChatS('');
  const [type, setType] = useChatS('public');
  const [selected, setSelected] = useChatS(new Set()); // user slugs
  const [search, setSearch] = useChatS('');
  const [submitting, setSubmitting] = useChatS(false);

  useChatE(() => {
    if (open) {
      setName(''); setDescription(''); setType('public');
      setSelected(new Set()); setSearch(''); setSubmitting(false);
    }
  }, [open]);

  useChatE(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const others = (allMembers || []).filter(m => m.id !== me);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? others.filter(m => (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q))
    : others;

  const toggleMember = (slug) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(filtered.map(m => m.id)));
  const clearAll  = () => setSelected(new Set());

  const canSubmit = name.trim().length > 0 && (type === 'public' || selected.size > 0) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        member_slugs: type === 'private' ? Array.from(selected) : [],
      };
      const ch = await window.API.createChannel(payload);
      onCreated(ch);
      onClose();
    } catch (e) {
      window.showToast?.((window.t?.('chat_create_failed')||'Kanal oluşturulamadı: ') + e.message, 'error');
      setSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="stoa-channel-modal-backdrop" onClick={onClose}>
      <div className="stoa-channel-modal" onClick={e => e.stopPropagation()}>
        <div className="stoa-channel-modal-head">
          <div style={{ fontSize: 15, fontWeight: 600 }}>Yeni Kanal</div>
          <button className="icon-btn" onClick={onClose} title="Kapat" style={{ padding: 4 }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="stoa-channel-modal-body">
          <label className="stoa-field">
            <span className="stoa-field-label">{window.t?.('chat_channel_name_label')||'Kanal adı'}</span>
            <div className="stoa-input-prefix">
              <span style={{ color: 'var(--ink-faint)' }}>#</span>
              <input
                autoFocus
                placeholder="ornek-kanal"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={60}
              />
            </div>
          </label>

          <label className="stoa-field">
            <span className="stoa-field-label">{window.t?.('chat_channel_desc_label')||'Açıklama'} <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>{window.t?.('chat_channel_desc_opt')||'(opsiyonel)'}</span></span>
            <textarea
              placeholder={window.t?.('chat_desc_ph')||'Bu kanal ne için kullanılacak?'}
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              maxLength={280}
            />
          </label>

          <div className="stoa-field">
            <span className="stoa-field-label">{window.t?.('chat_channel_type')||'Kanal tipi'}</span>
            <div className="stoa-radio-group">
              <label className={`stoa-radio-card ${type === 'public' ? 'is-active' : ''}`} onClick={() => setType('public')}>
                <Icon name="globe" size={16} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{window.t?.('chat_channel_public')||'Genel'}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{window.t?.('chat_channel_public_join')||'Projedeki herkes katılır ve görür.'}</div>
                </div>
              </label>
              <label className={`stoa-radio-card ${type === 'private' ? 'is-active' : ''}`} onClick={() => setType('private')}>
                <Icon name="lock" size={16} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{window.t?.('chat_channel_private')||'Özel'}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{window.t?.('chat_channel_private_join')||'Sadece davet edilenler erişir.'}</div>
                </div>
              </label>
            </div>
          </div>

          {type === 'private' && (
            <div className="stoa-field">
              <span className="stoa-field-label">
                {window.t?.('chat_members')||'Üyeler'} <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>({selected.size} {window.t?.('chat_members_selected')||'seçili'})</span>
              </span>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 6 }}>
                {window.t?.('chat_private_members_note')||'Bu kanalı sadece eklediğiniz kişiler görebilir.'}
              </div>
              {selected.size > 0 && (
                <div className="stoa-chip-row">
                  {Array.from(selected).map(slug => {
                    const m = others.find(o => o.id === slug);
                    return (
                      <span key={slug} className="stoa-chip">
                        {m?.name || slug}
                        <button onClick={() => toggleMember(slug)} title={window.t?.('chat_remove')||'Kaldır'}><Icon name="x" size={10} /></button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="stoa-member-search">
                <Icon name="search" size={13} />
                <input
                  placeholder={window.t?.('chat_member_search')||'Üye ara…'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <div className="stoa-quick-actions">
                  <button onClick={selectAll}>{window.t?.('chat_select_all')||'Tümünü seç'}</button>
                  <button onClick={clearAll}>{window.t?.('chat_clear')||'Temizle'}</button>
                </div>
              </div>
              <div className="stoa-member-list">
                {filtered.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center' }}>
                    {window.t?.('chat_no_matching_members')||'Eşleşen üye yok.'}
                  </div>
                ) : filtered.map(m => {
                  const checked = selected.has(m.id);
                  return (
                    <label key={m.id} className={`stoa-member-row ${checked ? 'is-checked' : ''}`} onClick={() => toggleMember(m.id)}>
                      <Avatar member={m} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                        {m.role && <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{m.role}</div>}
                      </div>
                      <div className="stoa-checkbox" data-checked={checked}>
                        {checked && <Icon name="check" size={11} />}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="stoa-channel-modal-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>{window.t?.('app_cancel') || 'İptal'}</button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? (window.t?.('app_creating') || 'Oluşturuluyor…') : (window.t?.('chat_create_channel') || 'Kanal Oluştur')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Role badge ────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  if (!role) return null;
  const meta = {
    owner:  { label: window.t?.('chat_role_owner')||'Sahip',    bg: 'oklch(60% 0.18 295 / 0.18)', fg: 'oklch(40% 0.15 295)', icon: 'gem' },
    admin:  { label: window.t?.('chat_role_admin')||'Yönetici', bg: 'oklch(60% 0.15 230 / 0.18)', fg: 'oklch(40% 0.14 230)', icon: 'shield' },
    member: { label: window.t?.('chat_role_member')||'Üye',      bg: 'oklch(85% 0.01 240 / 0.50)', fg: 'oklch(45% 0.02 240)', icon: null },
  }[role] || null;
  if (!meta) return null;
  return (
    <span className="stoa-role-badge" style={{ background: meta.bg, color: meta.fg }} data-role={role}>
      {meta.icon && <Icon name={meta.icon} size={9} />}
      {meta.label}
    </span>
  );
}

// ── Add-member modal ─────────────────────────────────────────────────────
function AddMemberModal({ open, onClose, channel, onAdded, allMembers, me }) {
  const [selected, setSelected] = useChatS(new Set());
  const [search, setSearch] = useChatS('');
  const [submitting, setSubmitting] = useChatS(false);

  useChatE(() => {
    if (open) { setSelected(new Set()); setSearch(''); setSubmitting(false); }
  }, [open]);

  useChatE(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !channel) return null;
  const memberSlugs = new Set((channel.members || []).map(m => m.user_id));
  const candidates = (allMembers || []).filter(m => m.id !== me && !memberSlugs.has(m.id));
  const q = search.trim().toLowerCase();
  const filtered = q
    ? candidates.filter(m => (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q))
    : candidates;

  const toggle = (slug) => setSelected(prev => {
    const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n;
  });

  const submit = async () => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await window.API.addChannelMembers(channel.channel_id, Array.from(selected));
      onAdded(res.channel);
      window.showToast?.(`${res.added.length} ${window.t?.('chat_added_members')||'üye eklendi'}`, 'success');
      onClose();
    } catch (e) {
      window.showToast?.((window.t?.('chat_add_member_failed')||'Üye eklenemedi: ') + e.message, 'error');
      setSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="stoa-channel-modal-backdrop" onClick={onClose}>
      <div className="stoa-channel-modal" onClick={e => e.stopPropagation()} style={{ width: 'min(440px, 100%)' }}>
        <div className="stoa-channel-modal-head">
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>#{channel.name}</span> {window.t?.('chat_add_members_title')||'kanalına üye ekle'}
          </div>
          <button className="icon-btn" onClick={onClose} title="Kapat" style={{ padding: 4 }}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="stoa-channel-modal-body">
          {candidates.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>
              {window.t?.('chat_all_in_channel')||'Bu workspace\'teki tüm üyeler zaten kanalda.'}
            </div>
          ) : (
            <>
              <div className="stoa-member-search">
                <Icon name="search" size={13} />
                <input placeholder={window.t?.('chat_member_search')||'Üye ara…'} value={search} onChange={e => setSearch(e.target.value)} autoFocus />
              </div>
              <div className="stoa-member-list">
                {filtered.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center' }}>{window.t?.('chat_no_matching_members')||'Eşleşen üye yok.'}</div>
                ) : filtered.map(m => {
                  const checked = selected.has(m.id);
                  return (
                    <label key={m.id} className={`stoa-member-row ${checked ? 'is-checked' : ''}`} onClick={() => toggle(m.id)}>
                      <Avatar member={m} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                        {m.role && <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{m.role}</div>}
                      </div>
                      <div className="stoa-checkbox" data-checked={checked}>
                        {checked && <Icon name="check" size={11} />}
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="stoa-channel-modal-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>{window.t?.('app_cancel') || 'İptal'}</button>
          <button className="btn btn-primary" onClick={submit} disabled={selected.size === 0 || submitting}>
            {submitting ? (window.t?.('chat_adding') || 'Ekleniyor…') : `${window.t?.('chat_add') || 'Ekle'} (${selected.size})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Channel-settings modal ───────────────────────────────────────────────
const CHANNEL_ICON_OPTIONS = [
  'hash', 'msg', 'users', 'layoutBoard', 'calendar', 'target',
  'flag', 'star', 'bolt', 'lightbulb', 'briefcase', 'building',
  'book', 'file', 'layers', 'chart', 'rocket', 'shield',
];

function ChannelIconMark({ channel, slug, size = 12 }) {
  const key = slug || channel?.slug || channel?.id || channel?.channel_id;
  const isPrivate = channel?.type === 'private';
  let icon = channel?.icon || '';
  try {
    icon = icon || localStorage.getItem(`stoa.ch_icon.${key}`) || '';
    if (!icon) {
      const oldEmoji = localStorage.getItem(`stoa.ch_emoji.${key}`);
      if (oldEmoji) localStorage.removeItem(`stoa.ch_emoji.${key}`);
    }
  } catch {}
  if (isPrivate && !icon) return <Icon name="lock" size={size} />;
  return <Icon name={icon || 'hash'} size={size} />;
}

function ChannelSettingsModal({ open, onClose, channel, onUpdated, onDeleted, me }) {
  const [askConfirm, ConfirmUI] = useConfirm();
  const [name, setName] = useChatS('');
  const [description, setDescription] = useChatS('');
  const [type, setType] = useChatS('public');
  const [channelIcon, setChannelIcon] = useChatS('hash');
  const [submitting, setSubmitting] = useChatS(false);
  const [postPerm, setPostPerm] = useChatS('everyone'); // 'everyone' | 'admins'

  // Per-channel notification prefs stored in localStorage
  const notifKey = channel ? `stoa.ch_notif.${channel.slug || channel.channel_id}` : null;
  const [notifMode, setNotifMode] = useChatS(() => {
    if (!notifKey) return 'all';
    try { return JSON.parse(localStorage.getItem(notifKey) || '{}').mode || 'all'; } catch { return 'all'; }
  });
  const [muted, setMuted] = useChatS(() => {
    if (!notifKey) return false;
    try { return !!JSON.parse(localStorage.getItem(notifKey) || '{}').muted; } catch { return false; }
  });

  useChatE(() => {
    if (open && channel) {
      setName(channel.name || '');
      setDescription(channel.description || '');
      setType(channel.type || 'public');
      setSubmitting(false);
      const savedPerm = (() => { try { return localStorage.getItem(`stoa.ch_perm.${channel.slug || channel.channel_id}`); } catch { return null; } })();
      setPostPerm(savedPerm || channel.post_perm || 'everyone');
      const savedIcon = (() => { try { return localStorage.getItem(`stoa.ch_icon.${channel.slug || channel.channel_id}`); } catch { return null; } })();
      setChannelIcon(channel.icon || savedIcon || (channel.type === 'private' ? 'lock' : 'hash'));
      if (notifKey) {
        try {
          const saved = JSON.parse(localStorage.getItem(notifKey) || '{}');
          setNotifMode(saved.mode || 'all');
          setMuted(!!saved.muted);
        } catch {}
      }
    }
  }, [open, channel?.channel_id]);

  useChatE(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !channel) return null;
  const myRole = channel.my_role;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';
  const isDefault = !!channel.is_default;
  const tx = (key, fallback) => {
    const value = window.t?.(key);
    return (!value || String(value).toLowerCase() === String(key).toLowerCase()) ? fallback : value;
  };

  const saveNotifPref = (mode, muteVal) => {
    if (!notifKey) return;
    try { localStorage.setItem(notifKey, JSON.stringify({ mode, muted: muteVal })); } catch {}
  };

  const saveBasic = async () => {
    if (submitting) return;
    if (!name.trim()) { window.showToast?.(tx('chat_name_empty', 'Kanal adı boş olamaz'), 'error'); return; }
    setSubmitting(true);
    try {
      const updated = await window.API.updateChannel(channel.channel_id, {
        name: name.trim(),
        description: description.trim(),
        icon: channelIcon || 'hash',
      });
      // Keep a local mirror for immediate UI and old cached sessions.
      const iconKey    = `stoa.ch_icon.${channel.slug || channel.channel_id}`;
      const permKey    = `stoa.ch_perm.${channel.slug || channel.channel_id}`;
      try { localStorage.setItem(iconKey, channelIcon || 'hash'); localStorage.removeItem(`stoa.ch_emoji.${channel.slug || channel.channel_id}`); } catch {}
      try { localStorage.setItem(permKey, postPerm); } catch {}
      onUpdated({ ...updated, icon: channelIcon || 'hash', post_perm: postPerm });
      window.showToast?.(tx('chat_channel_updated', 'Kanal güncellendi'), 'success');
    } catch (e) {
      window.showToast?.(e.message, 'error');
    } finally { setSubmitting(false); }
  };

  const flipType = async () => {
    if (!isOwner || isDefault || submitting) return;
    const newType = type === 'public' ? 'private' : 'public';
    const ok = await askConfirm({
      title: newType === 'public' ? tx('chat_make_public', 'Genele Dönüştür') : tx('chat_make_private', 'Özele Dönüştür'),
      message: newType === 'public'
        ? `#${channel.name} ${tx('chat_make_public_confirm', 'kanalı GENEL yapılacak. Tüm workspace üyeleri otomatik eklenir.')}`
        : `#${channel.name} ${tx('chat_make_private_confirm', 'kanalı ÖZEL yapılacak. Yeni üyeler sadece davetle katılabilir.')}`,
      confirmText: newType === 'public' ? tx('chat_make_public', 'Genele dönüştür') : tx('chat_make_private', 'Özele dönüştür'),
      variant: 'warn',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const updated = await window.API.updateChannel(channel.channel_id, { type: newType });
      setType(newType);
      onUpdated(updated);
      window.showToast?.(tx('chat_type_changed', 'Kanal tipi değiştirildi'), 'success');
    } catch (e) {
      window.showToast?.(e.message, 'error');
    } finally { setSubmitting(false); }
  };

  const doLeaveChannel = async () => {
    setSubmitting(true);
    try {
      const mySlug = window.CURRENT_USER?.slug || window.CURRENT_USER?.id || me;
      await window.API.removeChannelMember(channel.channel_id, mySlug);
      onDeleted({ slug: channel.slug || channel.id, leftSelf: true });
      window.showToast?.(`#${channel.name} ${tx('chat_left_channel', 'kanalından ayrıldın')}`, 'info');
      onClose();
    } catch (e) {
      window.showToast?.(e.message, 'error');
      setSubmitting(false);
    }
  };

  const deleteChannel = async () => {
    if (!isOwner || isDefault) return;
    const ok = await askConfirm({
      title: tx('chat_delete_channel', 'Kanalı Sil'),
      message: `#${channel.name} kanalını silmek istediğinize emin misiniz?`,
      hint: tx('chat_delete_channel_hint', 'Bu işlem geri alınamaz. Kanaldaki tüm mesajlar silinecektir.'),
      confirmText: tx('chat_perm_delete', 'Kalıcı Olarak Sil'),
      cancelText: tx('app_cancel', 'İptal'),
      variant: 'danger',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await window.API.deleteChannel(channel.channel_id);
      onDeleted({ slug: channel.slug || channel.id });
      window.showToast?.(tx('chat_channel_deleted', 'Kanal silindi'), 'info');
      onClose();
    } catch (e) {
      window.showToast?.(e.message, 'error');
      setSubmitting(false);
    }
  };

  // Settings dialog plus custom confirmation modals.
  const mainPortal = ReactDOM.createPortal(
    <div className="stoa-channel-modal-backdrop" onClick={onClose}>
      <div className="stoa-channel-modal" onClick={e => e.stopPropagation()}>
        <div className="stoa-channel-modal-head">
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            <ChannelIconMark channel={{ ...channel, type, icon: channelIcon }} size={13} />
            {channel.name} {tx('chat_channel_settings_title', 'ayarları')}
          </div>
          <button className="icon-btn" onClick={onClose} title="Kapat" style={{ padding: 4 }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="stoa-channel-modal-body">

          <section className="stoa-settings-card">
            <div className="stoa-settings-card-head">
              <div>
                <div className="stoa-settings-card-title">{tx('chat_section_info', 'Kanal bilgileri')}</div>
                <div className="stoa-settings-card-sub">{tx('chat_section_info_desc', 'Kanal adı, açıklaması ve listede görünen simge.')}</div>
              </div>
              <div className="stoa-channel-preview-icon">
                <ChannelIconMark channel={{ ...channel, type, icon: channelIcon }} size={16} />
              </div>
            </div>

            {canManage && (
              <div className="stoa-field">
                <span className="stoa-field-label">{tx('chat_channel_icon', 'Kanal simgesi')}</span>
                <div className="stoa-icon-picker">
                  {CHANNEL_ICON_OPTIONS.map(iconName => (
                    <button
                      key={iconName}
                      type="button"
                      className="stoa-icon-choice"
                      data-active={channelIcon === iconName}
                      onClick={() => setChannelIcon(iconName)}
                      title={iconName}
                    >
                      <Icon name={iconName} size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="stoa-field">
              <span className="stoa-field-label">{tx('chat_channel_name', 'Kanal adı')}</span>
              <div className="stoa-input-prefix">
                <span className="stoa-prefix-icon"><ChannelIconMark channel={{ ...channel, type, icon: channelIcon }} size={13} /></span>
                <input value={name} onChange={e => setName(e.target.value)} disabled={!canManage} maxLength={60} />
              </div>
            </label>

            <label className="stoa-field">
              <span className="stoa-field-label">{tx('chat_description', 'Açıklama')}</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={!canManage} rows={2} maxLength={280} />
            </label>

            {canManage && (
              <button className="btn btn-primary-sm" onClick={saveBasic} disabled={submitting}>
                <Icon name="check" size={13} /> {submitting ? tx('app_saving', 'Kaydediliyor…') : tx('chat_save_info', 'Bilgileri Kaydet')}
              </button>
            )}
          </section>

          {/* ── Kanal tipi ── */}
          {isOwner && !isDefault && (
            <section className="stoa-settings-card">
              <div className="stoa-settings-card-title">{tx('chat_channel_type', 'Kanal tipi')}</div>
              <div className="stoa-radio-group">
                <div className={`stoa-radio-card ${type === 'public' ? 'is-active' : ''}`}>
                  <Icon name="globe" size={16} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{tx('chat_channel_public', 'Genel')}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{tx('chat_channel_public_desc', 'Tüm çalışma alanı üyeleri.')}</div>
                  </div>
                </div>
                <div className={`stoa-radio-card ${type === 'private' ? 'is-active' : ''}`}>
                  <Icon name="lock" size={16} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{tx('chat_channel_private', 'Özel')}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{tx('chat_channel_private_desc', 'Sadece davetli üyeler.')}</div>
                  </div>
                </div>
              </div>
              <button className="btn btn-secondary" onClick={flipType} disabled={submitting} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                <Icon name={type === 'public' ? 'lock' : 'globe'} size={13} />
                {type === 'public' ? tx('chat_make_private', 'Özele dönüştür') : tx('chat_make_public', 'Genele dönüştür')}
              </button>
            </section>
          )}

          {/* ── Üye izinleri (owner only) ── */}
          {isOwner && !isDefault && (
            <section className="stoa-settings-card">
              <div className="stoa-settings-card-title">{tx('chat_section_perms', 'Üye izinleri')}</div>
              <span className="stoa-field-label">{tx('chat_post_perm', 'Mesaj gönderebilir')}</span>
              <div className="stoa-radio-group">
                <div
                  className={`stoa-radio-card ${postPerm === 'everyone' ? 'is-active' : ''}`}
                  onClick={() => setPostPerm('everyone')}
                  style={{ cursor: 'pointer' }}
                >
                  <Icon name="users" size={15} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{tx('chat_perm_everyone', 'Herkes')}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{tx('chat_perm_everyone_desc', 'Tüm üyeler mesaj yazabilir.')}</div>
                  </div>
                </div>
                <div
                  className={`stoa-radio-card ${postPerm === 'admins' ? 'is-active' : ''}`}
                  onClick={() => setPostPerm('admins')}
                  style={{ cursor: 'pointer' }}
                >
                  <Icon name="shield" size={15} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{tx('chat_perm_admins', 'Yöneticiler')}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{tx('chat_perm_admins_desc', 'Sadece sahip ve yöneticiler.')}</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Bildirimler ── */}
          <section className="stoa-settings-card">
            <div className="stoa-settings-card-title">{tx('chat_section_notif', 'Bildirimler')}</div>
            <span className="stoa-field-label" style={{ marginBottom: 4 }}>{tx('chat_notif_mode', 'Bildirim seviyesi')}</span>
            <div className="stoa-notif-radio">
              {[
                ['all',     tx('chat_notif_all', 'Tüm mesajlar')],
                ['mention', tx('chat_notif_mention', 'Sadece @bahsetmeler')],
                ['none',    tx('chat_notif_none', 'Hiçbiri')],
              ].map(([val, label]) => (
                <label key={val} className={`stoa-notif-option ${notifMode === val ? 'is-active' : ''}`}>
                  <input type="radio" name="notifMode" value={val} checked={notifMode === val}
                    onChange={() => { setNotifMode(val); saveNotifPref(val, muted); }} />
                  {label}
                </label>
              ))}
            </div>
            <div
              className="stoa-toggle-row"
              onClick={() => { const next = !muted; setMuted(next); saveNotifPref(notifMode, next); }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{tx('chat_mute_channel', 'Kanalı sessize al')}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{tx('chat_mute_channel_desc', 'Bildirimler ve sesler kapatılır.')}</div>
              </div>
              <div className="toggle" data-on={muted} />
            </div>
          </section>

          {/* ── Tehlikeli bölge ── */}
          {!isDefault && (
            <section className="stoa-settings-card stoa-danger-zone">
              <div className="stoa-settings-card-title stoa-danger-label">{tx('chat_section_danger', 'Tehlikeli bölge')}</div>

              {/* Kanaldan ayrıl */}
              <button
                className="btn btn-warn"
                onClick={async () => {
                  const ok = await askConfirm({
                    title: tx('chat_leave_title', 'Kanaldan Ayrıl'),
                    message: `#${channel.name} ${tx('chat_leave_confirm_body', 'kanalından ayrılmak istediğinize emin misiniz?')}`,
                    hint: tx('chat_leave_confirm_hint', 'Ayrıldıktan sonra tekrar davet edilmeniz gerekebilir.'),
                    confirmText: tx('chat_leave', 'Ayrıl'),
                    variant: 'warn',
                  });
                  if (ok) doLeaveChannel();
                }}
                disabled={submitting}
              >
                <Icon name="logOut" size={13} />
                {tx('chat_leave', 'Kanaldan Ayrıl')}
              </button>

              {/* Kanalı sil (owner only) */}
              {isOwner && (
                <button
                  className="btn btn-danger"
                  onClick={deleteChannel}
                  disabled={submitting}
                >
                  <Icon name="trash" size={13} />
                  {tx('chat_delete_channel', 'Kanalı Sil')}
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
  return <>{mainPortal}{ConfirmUI}</>;
}

// ── Pinned messages banner (above chat) ───────────────────────────────────
function PinnedBanner({ pinned, allMembers, onJump, onUnpin, onClose }) {
  const [expanded, setExpanded] = useChatS(false);
  if (!pinned || pinned.length === 0) return null;
  const ordered = [...pinned].sort((a, b) => {
    const ta = a.ts || a.created_at || ''; const tb = b.ts || b.created_at || '';
    return tb.localeCompare(ta);
  });
  const top = ordered[0];
  const sender = allMembers.find(m => m.id === top.from);
  const preview = top.deleted
    ? (window.t?.('chat_deleted_msg')||'Bu mesaj silindi')
    : (top.text || (top.file_url ? `📎 ${top.file_name || (window.t?.('chat_file')||'Dosya')}` : ''));

  return (
    <div className="chat-pinned-banner" style={{
      position: 'sticky', top: 0, zIndex: 5,
      background: 'var(--bg-raised, var(--bg))',
      borderBottom: '1px solid var(--line)',
      boxShadow: '0 2px 6px oklch(0% 0 0 / 0.05)',
    }}>
      <div
        onClick={() => onJump(top.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', cursor: 'pointer',
        }}
      >
        <Icon name="pin" size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 11 }}>
            {window.t?.('chat_pinned_msg')||'Sabitli mesaj'}{ordered.length > 1 ? ` (${ordered.length})` : ''} · {sender?.name || top.from}
          </div>
          <div style={{
            color: 'var(--ink-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{preview}</div>
        </div>
        {ordered.length > 1 && (
          <button
            className="icon-btn"
            title={expanded ? (window.t?.('chat_collapse')||'Daralt') : (window.t?.('chat_see_all')||'Tümünü gör')}
            onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
            style={{ padding: 3, color: 'var(--ink-muted)' }}
          >
            <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} />
          </button>
        )}
        <button
          className="icon-btn"
          title={window.t?.('chat_unpin')||'Sabitlemeyi kaldır'}
          onClick={(e) => { e.stopPropagation(); onUnpin(top); }}
          style={{ padding: 3, color: 'var(--ink-muted)' }}
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      {expanded && ordered.slice(1).map(msg => {
        const s = allMembers.find(m => m.id === msg.from);
        const p = msg.deleted ? (window.t?.('chat_deleted_msg')||'Bu mesaj silindi') : (msg.text || (msg.file_url ? `📎 ${msg.file_name || (window.t?.('chat_file')||'Dosya')}` : ''));
        return (
          <div key={msg.id}
            onClick={() => onJump(msg.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px 6px 32px', cursor: 'pointer',
              borderTop: '1px dashed var(--line)',
              fontSize: 11.5, color: 'var(--ink-muted)',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{s?.name || msg.from}:</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{p}</span>
            <button className="icon-btn" title={window.t?.('chat_remove')||'Kaldır'} onClick={(e) => { e.stopPropagation(); onUnpin(msg); }} style={{ padding: 2 }}>
              <Icon name="x" size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Custom Video Player ───────────────────────────────────────────────────
function CustomVideoPlayer({ src, poster, autoPlay = false, fullscreenContainer = false, lightbox = false }) {
  const videoRef = useChatRef(null);
  const wrapRef  = useChatRef(null);
  const [playing, setPlaying]   = useChatS(false);
  const [muted, setMuted]       = useChatS(false);
  const [duration, setDuration] = useChatS(0);
  const [progress, setProgress] = useChatS(0);
  const [volume, setVolume]     = useChatS(1);
  const [showCtrls, setShowCtrls] = useChatS(true);
  const hideTimer = useChatRef(null);

  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
  };

  const skip = (deltaSeconds) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + deltaSeconds));
    setProgress(v.currentTime);
  };

  const onTimeUpdate = () => {
    const v = videoRef.current; if (!v) return;
    setProgress(v.currentTime);
  };
  const onLoaded = () => {
    const v = videoRef.current; if (!v) return;
    setDuration(v.duration || 0);
    setVolume(v.volume);
    setMuted(v.muted);
  };
  // Drag-to-seek — pointermove/up listeners are attached to `document` so the drag
  // survives even if the pointer leaves the bar. A ref tracks the in-flight drag so
  // we don't depend on React state propagation between rapid pointer events.
  const [seeking, setSeeking] = useChatS(false);
  const [hoverSeek, setHoverSeek] = useChatS(null); // ratio 0..1 while pointer hovers
  const seekBarRef = useChatRef(null);
  const seekActiveRef = useChatRef(false);

  const _ratioFromClientX = (clientX) => {
    const bar = seekBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const onSeekPointerDown = (e) => {
    const v = videoRef.current;
    if (!v) return;
    // Use v.duration directly — duration state can lag behind metadata load
    const dur = (isFinite(v.duration) && v.duration > 0) ? v.duration : duration;
    if (!dur) return;
    if (e.button != null && e.button !== 0) return; // left click only
    e.preventDefault();
    e.stopPropagation();
    seekActiveRef.current = true;
    setSeeking(true);
    // Immediate jump on first click
    const r0 = _ratioFromClientX(e.clientX);
    v.currentTime = r0 * dur;
    setProgress(v.currentTime);
    setHoverSeek(r0);

    const onMove = (ev) => {
      if (!seekActiveRef.current) return;
      const r = _ratioFromClientX(ev.clientX);
      const d = (isFinite(v.duration) && v.duration > 0) ? v.duration : dur;
      v.currentTime = r * d;
      setProgress(v.currentTime);
      setHoverSeek(r);
    };
    const onUp = () => {
      seekActiveRef.current = false;
      setSeeking(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      showAndAutoHide();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    showAndAutoHide();
  };

  // Pure-hover preview (no drag): only runs when we are NOT mid-drag
  const onSeekPointerMove = (e) => {
    if (seekActiveRef.current) return;
    setHoverSeek(_ratioFromClientX(e.clientX));
  };
  const onSeekPointerLeave = () => {
    if (!seekActiveRef.current) setHoverSeek(null);
  };
  const changeVolume = (e) => {
    const v = videoRef.current; if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val; setVolume(val);
    if (val > 0 && v.muted) { v.muted = false; setMuted(false); }
  };
  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  const showAndAutoHide = () => {
    setShowCtrls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setShowCtrls(false);
    }, 2000);
  };

  // Keyboard shortcuts — only active in lightbox/fullscreen modes to avoid stealing typing focus
  useChatE(() => {
    if (!lightbox && !fullscreenContainer) return;
    const onKey = (e) => {
      // Don't hijack when user is in an input/textarea
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault(); togglePlay(); showAndAutoHide(); break;
        case 'ArrowLeft':
          e.preventDefault(); skip(-5); showAndAutoHide(); break;
        case 'ArrowRight':
          e.preventDefault(); skip(5); showAndAutoHide(); break;
        case 'f':
        case 'F':
          e.preventDefault(); toggleFullscreen(); break;
        case 'm':
        case 'M':
          e.preventDefault(); toggleMute(); showAndAutoHide(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, fullscreenContainer]);

  const wrapStyle = lightbox
    ? {
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#000',
        display: 'inline-flex',
        maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 48px)',
      }
    : {
        position: 'relative',
        borderRadius: fullscreenContainer ? 0 : 12,
        overflow: 'hidden',
        background: '#000',
        width: '100%',
        maxWidth: fullscreenContainer ? 'none' : 520,
        aspectRatio: '16 / 10',
      };

  const videoStyle = lightbox
    ? {
        maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 48px)',
        objectFit: 'contain',
        display: 'block',
        cursor: 'pointer',
      }
    : { width: '100%', height: '100%', objectFit: 'contain', display: 'block', cursor: 'pointer' };

  return (
    <div
      ref={wrapRef}
      className="stoa-video"
      onMouseMove={showAndAutoHide}
      onMouseLeave={() => { const v = videoRef.current; if (v && !v.paused) setShowCtrls(false); }}
      style={wrapStyle}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        autoPlay={autoPlay}
        controls={false}
        onPlay={() => { setPlaying(true); showAndAutoHide(); }}
        onPause={() => { setPlaying(false); setShowCtrls(true); }}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoaded}
        onClick={togglePlay}
        style={videoStyle}
      />
      {!playing && (
        <button
          onClick={togglePlay}
          aria-label="Oynat"
          style={{
            position: 'absolute', inset: 0, margin: 'auto',
            width: 64, height: 64, borderRadius: '50%',
            background: 'oklch(0% 0 0 / 0.55)',
            border: '2px solid white', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </button>
      )}
      <div
        className="stoa-video-ctrls"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '20px 12px 10px',
          background: 'linear-gradient(transparent, oklch(0% 0 0 / 0.65))',
          opacity: (showCtrls || seeking) ? 1 : 0,
          transition: 'opacity 0.25s',
          pointerEvents: (showCtrls || seeking) ? 'auto' : 'none',
        }}
      >
        <div
          ref={seekBarRef}
          className="stoa-video-seekbar"
          data-active={seeking}
          onPointerDown={onSeekPointerDown}
          onPointerMove={onSeekPointerMove}
          onPointerLeave={onSeekPointerLeave}
          style={{
            position: 'relative',
            height: 18, // bigger hit-area for dragging; visual bar sits inside
            cursor: 'pointer',
            marginBottom: 8,
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            userSelect: 'none',
          }}
        >
          {/* Track */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            height: seeking ? 6 : 4,
            background: 'oklch(100% 0 0 / 0.25)',
            borderRadius: 4,
            transition: 'height 0.12s var(--ease, ease-out)',
          }} />
          {/* Hover preview overlay (faint white up to hover position) */}
          {hoverSeek != null && !seeking && (
            <div style={{
              position: 'absolute', left: 0,
              width: `${hoverSeek * 100}%`,
              height: seeking ? 6 : 4,
              background: 'oklch(100% 0 0 / 0.18)',
              borderRadius: 4,
              pointerEvents: 'none',
            }} />
          )}
          {/* Progress fill */}
          <div style={{
            position: 'absolute', left: 0,
            width: `${duration ? (progress / duration) * 100 : 0}%`,
            height: seeking ? 6 : 4,
            background: 'var(--accent)',
            borderRadius: 4,
            transition: 'height 0.12s var(--ease, ease-out)',
            pointerEvents: 'none',
          }} />
          {/* Draggable thumb */}
          <div style={{
            position: 'absolute',
            left: `${duration ? (progress / duration) * 100 : 0}%`,
            width: seeking ? 14 : 12,
            height: seeking ? 14 : 12,
            borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 0 3px oklch(100% 0 0 / 0.25)',
            transform: 'translate(-50%, 0)',
            transition: 'width 0.12s var(--ease, ease-out), height 0.12s var(--ease, ease-out), opacity 0.12s',
            opacity: (seeking || hoverSeek != null) ? 1 : 0,
            pointerEvents: 'none',
          }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'white', fontSize: 11 }}>
          <button onClick={togglePlay} className="icon-btn" style={{ color: 'white', padding: 2 }} aria-label={playing ? 'Duraklat' : 'Oynat'}>
            {playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>}
          </button>
          <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 80 }}>
            {fmtTime(progress)} / {fmtTime(duration)}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={toggleMute} className="icon-btn" style={{ color: 'white', padding: 2 }} aria-label={muted ? (window.t?.('chat_video_unmute')||'Sesi aç') : (window.t?.('chat_video_mute')||'Sustur')} title={muted ? `${window.t?.('chat_video_unmute')||'Sesi aç'} (M)` : `${window.t?.('chat_video_mute')||'Sustur'} (M)`}>
            {muted || volume === 0
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
          </button>
          <input
            type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume}
            onChange={changeVolume}
            style={{ width: 70, accentColor: 'var(--accent)' }}
            aria-label="Ses"
          />
          <button onClick={toggleFullscreen} className="icon-btn" style={{ color: 'white', padding: 2 }} aria-label="Tam ekran" title="Tam ekran (F)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Video thumbnail (poster captured from first frame, lazy via IntersectionObserver) ─
function VideoThumb({ src, size = 'square', onClick }) {
  const [poster, setPoster] = useChatS(null);
  const [duration, setDuration] = useChatS(null);
  const [visible, setVisible] = useChatS(false);
  const refEl = useChatRef(null);

  useChatE(() => {
    if (!refEl.current) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } });
    }, { rootMargin: '200px' });
    io.observe(refEl.current);
    return () => io.disconnect();
  }, []);

  useChatE(() => {
    if (!visible || poster) return;
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.preload = 'metadata';
    v.muted = true;
    v.src = src;
    v.addEventListener('loadedmetadata', () => {
      setDuration(v.duration || 0);
      try { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); } catch {}
    });
    v.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 320;
        canvas.height = v.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        setPoster(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        setPoster(null);
      }
      v.remove();
    });
    v.addEventListener('error', () => v.remove());
    return () => { try { v.remove(); } catch {} };
  }, [visible, src]);

  const fmtDur = (s) => {
    if (s == null || !isFinite(s)) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div
      ref={refEl}
      onClick={onClick}
      style={{
        position: 'relative',
        paddingBottom: size === 'square' ? '100%' : '56.25%',
        background: '#222', borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
      }}
    >
      {poster && (
        <img src={poster} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'oklch(0% 0 0 / 0.55)', border: '1.5px solid white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      {duration != null && duration > 0 && (
        <div style={{
          position: 'absolute', bottom: 4, right: 4,
          background: 'oklch(0% 0 0 / 0.75)', color: 'white',
          fontSize: 10, padding: '1px 5px', borderRadius: 3,
          fontVariantNumeric: 'tabular-nums',
        }}>{fmtDur(duration)}</div>
      )}
    </div>
  );
}

// ── Media Gallery Tab ─────────────────────────────────────────────────────
function MediaList({ media, allMembers, onImageClick }) {
  if (media.length === 0) return (
    <div className="chat-empty" style={{ padding: 24 }}>{window.t?.('chat_media_empty')||'Henüz paylaşılan medya yok.'}</div>
  );
  const images = media.filter(m => m.file_type === 'image');
  const videos = media.filter(m => m.file_type === 'video');
  const files  = media.filter(m => m.file_type === 'file');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {images.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            {window.t?.('chat_media_photos')||'Fotoğraflar'} ({images.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {images.map(m => (
              <div key={m.id} style={{ position: 'relative', paddingBottom: '100%', overflow: 'hidden', borderRadius: 6, background: 'var(--bg-dim)', cursor: 'zoom-in' }}
                onClick={() => onImageClick(m.file_url)}
              >
                <img src={m.file_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy"
                  onError={(e) => { e.currentTarget.style.opacity = '0'; }}
                />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'oklch(0% 0 0 / 0.55)', color: 'white',
                  fontSize: 9, padding: '3px 5px', lineHeight: 1.3,
                }}>
                  {fmtMsgDateTime(m)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            {window.t?.('chat_media_videos')||'Videolar'} ({videos.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {videos.map(m => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <VideoThumb src={m.file_url} onClick={() => onImageClick({ src: m.file_url, kind: 'video' })} />
                <div style={{ fontSize: 9, color: 'var(--ink-faint)', lineHeight: 1.2, padding: '0 2px' }}>
                  {fmtMsgDateTime(m)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            {window.t?.('chat_media_files')||'Dosyalar'} ({files.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {files.map(m => {
              const sender = allMembers.find(u => u.id === m.from);
              return (
                <a key={m.id} href={m.file_url} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-dim)', borderRadius: 8, textDecoration: 'none', color: 'var(--ink)' }}>
                  <Icon name="paperclip" size={14} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{sender?.name || m.from} · {fmtMsgDateTime(m)}</div>
                  </div>
                  <Icon name="chevronRight" size={12} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MediaGallery({ allMembers, onImageClick }) {
  const [mediaTab, setMediaTab] = useChatS('general');
  const [generalMedia, setGeneralMedia] = useChatS([]);
  const [dmMedia, setDmMedia]           = useChatS([]);
  const [loading, setLoading]           = useChatS(true);

  useChatE(() => {
    setLoading(true);
    Promise.all([
      API.getChatMedia('general').catch(() => []),
      API.getChatMedia('dm').catch(() => []),
    ]).then(([gen, dm]) => {
      if (Array.isArray(gen)) setGeneralMedia(gen);
      if (Array.isArray(dm))  setDmMedia(dm);
    }).finally(() => setLoading(false));
  }, []);

  const media = mediaTab === 'general' ? generalMedia : dmMedia;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Media sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 12px' }}>
        {[['general','Genel'],['dm','Direkt']].map(([k, label]) => (
          <button key={k} onClick={() => setMediaTab(k)}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: mediaTab === k ? 600 : 400,
              color: mediaTab === k ? 'var(--accent)' : 'var(--ink-muted)',
              borderBottom: mediaTab === k ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none', border: 'none', borderBottom: mediaTab === k ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading
          ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: 'var(--ink-faint)', fontSize: 13 }}>{window.t?.('chat_loading')||'Yükleniyor…'}</div>
          : <MediaList media={media} allMembers={allMembers} onImageClick={onImageClick} />
        }
      </div>
    </div>
  );
}

// ── Main Chat Panel ───────────────────────────────────────────────────────
function ChatPanel({ open, onClose, onExpand, onlineUsers, onlineStatuses, members: membersProp, socket, initialDmWith, initialChannel, canManageChannels, canDeleteMessages, unreadCounts, markAsRead, wsId, highlightMsgId, fullPage }) {
  const [askConfirm, ConfirmUI] = useConfirm();
  const [tab, setTab]             = useChatS('general');
  const [dmWith, setDmWith]       = useChatS(null);
  const [messages, setMessages]   = useChatS([]);
  const [text, setText]           = useChatS('');
  const [typingUsers, setTypingUsers] = useChatS(() => new Set());
  const [uploading, setUploading] = useChatS(false);
  const [lightbox, setLightbox]   = useChatS(null);
  const [pendingFile, setPendingFile] = useChatS(null);
  const [replyTo, setReplyTo] = useChatS(null);
  const [deleteMenu, setDeleteMenu] = useChatS(null); // {msgId, isMine, starred, x, y}
  const [starredMsgs, setStarredMsgs] = useChatS(() => {
    try { return new Set(JSON.parse(localStorage.getItem('stoa.starred') || '[]').map(m => String(m.id || m))); }
    catch { return new Set(); }
  });
  const [starredData, setStarredData] = useChatS(() => {
    try { return JSON.parse(localStorage.getItem('stoa.starredData') || '[]'); }
    catch { return []; }
  });
  const [mutedUsers, setMutedUsers] = useChatS(() => {
    try { return new Set(JSON.parse(localStorage.getItem('stoa.muted') || '[]')); }
    catch { return new Set(); }
  });
  const [reactions, setReactions] = useChatS(() => {
    try { return JSON.parse(localStorage.getItem('stoa.reactions') || '{}'); }
    catch { return {}; }
  });
  const [emojiPicker, setEmojiPicker] = useChatS(null); // { msgId, x, y }

  // Pinned messages (per channel) — localStorage
  const [pinnedMsgs, setPinnedMsgs] = useChatS(() => {
    try { return new Set(JSON.parse(localStorage.getItem('stoa.pinned') || '[]').map(m => String(m.id || m))); }
    catch { return new Set(); }
  });
  const [pinnedData, setPinnedData] = useChatS(() => {
    try { return JSON.parse(localStorage.getItem('stoa.pinnedData') || '[]'); }
    catch { return []; }
  });

  // Full-page only state — left list filter, right detail panel tab, mobile right-panel toggle
  const [leftListTab, setLeftListTab] = useChatS('channels'); // channels | dms
  const [rightTab, setRightTab]       = useChatS('members');  // members | media | starred | pinned
  const [leftSearch, setLeftSearch]   = useChatS('');
  const [rightPanelOpen, setRightPanelOpen] = useChatS(true);
  const [headerSearchOpen, setHeaderSearchOpen] = useChatS(false);
  const [headerSearch, setHeaderSearch] = useChatS('');

  // Channels are now backend-backed. Initial state loads from bootstrap (window.DATA.CHANNELS),
  // then sock'et events keep it in sync.
  const _initialChannels = () => {
    const fromData = (window.DATA?.CHANNELS) || [];
    if (Array.isArray(fromData) && fromData.length) return fromData;
    return [{ id: 'general', slug: 'general', name: 'genel', type: 'public', is_default: true, my_role: 'member', is_member: true }];
  };
  const [channels, setChannels] = useChatS(_initialChannels);
  const [activeChannel, setActiveChannel] = useChatS('general');
  const [addChannelOpen, setAddChannelOpen] = useChatS(false);
  const [channelSettingsId, setChannelSettingsId] = useChatS(null); // for future use
  const [mentionTaskRef, setMentionTaskRef] = useChatS(null); // { id, title } set when navigating from a @mention

  // Refresh channels from API on open / workspace switch
  useChatE(() => {
    if (!open) return;
    fetch('/api/channels').then(r => r.json()).then(list => {
      if (Array.isArray(list)) {
        setChannels(list);
        window.DATA.CHANNELS = list;
      }
    }).catch(() => {});
  }, [open, wsId]);

  // Helper: find channel meta by slug (id)
  const _findCh = (slug) => channels.find(c => (c.slug || c.id) === slug);

  // Active channel detail (incl. members list with roles) — for right-panel members tab + settings
  const [currentChannelDetail, setCurrentChannelDetail] = useChatS(null);
  const [addMemberOpen, setAddMemberOpen] = useChatS(false);
  const [channelSettingsOpen, setChannelSettingsOpen] = useChatS(false);
  const [memberRowMenu, setMemberRowMenu] = useChatS(null); // { x, y, cm }

  useChatE(() => {
    if (!open || dmWith) { setCurrentChannelDetail(null); return; }
    const ch = _findCh(activeChannel);
    if (!ch || !ch.channel_id) { setCurrentChannelDetail(null); return; }
    let cancelled = false;
    window.API.getChannel(ch.channel_id).then(detail => {
      if (!cancelled) setCurrentChannelDetail(detail);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, dmWith, activeChannel, _findCh(activeChannel)?.channel_id]);

  const removeChannel = async (id) => {
    if (id === 'general') return;
    const ch = _findCh(id);
    if (!ch) return;
    const ok = await askConfirm({
      title: window.t?.('chat_delete_channel') || 'Kanalı Sil',
      message: `#${ch.name} ${window.t?.('chat_remove_channel_confirm') || 'kanalını silmek istediğinize emin misiniz?'}`,
      hint: window.t?.('chat_delete_channel_hint') || 'Bu işlem geri alınamaz. Kanaldaki tüm mesajlar silinecektir.',
      confirmText: window.t?.('chat_perm_delete') || 'Kalıcı Olarak Sil',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await window.API.deleteChannel(ch.channel_id || ch.id);
      const next = channels.filter(c => (c.slug || c.id) !== id);
      setChannels(next);
      window.DATA.CHANNELS = next;
      if (activeChannel === id) setActiveChannel('general');
      window.showToast?.(`#${ch.name} ${window.t?.('chat_channel_removed')||'kanalı silindi'}`, 'info');
    } catch (e) {
      window.showToast?.('Kanal silinemedi: ' + e.message, 'error');
    }
  };

  // Format helper — wrap selected text in textarea with markdown markers.
  // No selection → inserts only the marker pair and places cursor between them
  // (user types inside, gets formatted text). No placeholder words are injected.
  const [activeFmtKey, setActiveFmtKey] = useChatS(null);
  const fmtPulseTimer = useChatRef(null);
  const wrapSelection = (prefix, suffix = prefix, _placeholder = '', fmtKey = null) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? text.length;
    const end   = el.selectionEnd   ?? text.length;
    const selected = text.slice(start, end);
    const hasSelection = end > start;
    if (hasSelection) {
      const newText = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
      setText(newText);
      setTimeout(() => {
        el.focus();
        const selStart = start + prefix.length;
        const selEnd   = selStart + selected.length;
        el.setSelectionRange(selStart, selEnd);
      }, 0);
    } else {
      // Insert just the marker pair with cursor between → user types into formatted region
      const newText = text.slice(0, start) + prefix + suffix + text.slice(end);
      setText(newText);
      setTimeout(() => {
        el.focus();
        const caret = start + prefix.length;
        el.setSelectionRange(caret, caret);
      }, 0);
    }
    if (fmtKey) {
      setActiveFmtKey(fmtKey);
      clearTimeout(fmtPulseTimer.current);
      fmtPulseTimer.current = setTimeout(() => setActiveFmtKey(null), 600);
    }
  };

  const bottomRef   = useChatRef(null);
  const typingTimers = useChatRef({});
  const inputRef    = useChatRef(null);
  const fileRef     = useChatRef(null);
  const msgIds      = useChatRef(new Set());
  const prevOpenRef = useChatRef(false);

  const me = window.CURRENT_USER?.id;
  const allMembers = membersProp || DATA.MEMBERS || [];
  const members = allMembers.filter(m => m.id !== me);
  const canOpenDm = (slug) => !!slug && slug !== me && members.some(m => m.id === slug);
  const dmUser = dmWith ? allMembers.find(m => m.id === dmWith) : null;
  const online = onlineUsers || new Set();
  const statuses = onlineStatuses || new Map();
  const lastReadSentId = dmWith
    ? ([...messages].reverse().find(m => m.to === dmWith && m.is_read && !m._temp)?.id ?? null)
    : null;

  useChatE(() => {
    if (!dmWith) return;
    if (canOpenDm(dmWith)) return;
    setDmWith(null);
    setMessages([]);
    setTab('general');
    setPendingFile(null);
  }, [dmWith, members.length]);

  // @mention autocomplete
  const [mentionOpen, setMentionOpen] = useChatS(false);
  const [mentionQuery, setMentionQuery] = useChatS('');
  const [mentionIdx, setMentionIdx]   = useChatS(0);
  const mentionMembers = useChatRef([]);
  mentionMembers.current = mentionQuery
    ? allMembers.filter(m => m.id !== me && (m.name.toLowerCase().includes(mentionQuery.toLowerCase()) || m.id.toLowerCase().includes(mentionQuery.toLowerCase())))
    : allMembers.filter(m => m.id !== me);

  // Handle open/initialDmWith/initialChannel changes
  useChatE(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;
    if (initialDmWith) {
      if (!canOpenDm(initialDmWith)) {
        setDmWith(null);
        setMessages([]);
        setTab('general');
        return;
      }
      if (initialDmWith !== dmWith) {
        setDmWith(initialDmWith);
        setMessages([]);
        setTab('dm');
      }
      if (window.__CHAT_MENTION_TASK__) {
        setMentionTaskRef(window.__CHAT_MENTION_TASK__);
        window.__CHAT_MENTION_TASK__ = null;
      }
    } else if (initialChannel) {
      // opened via notification → navigate to specific channel
      setDmWith(null);
      setMessages([]);
      setTab('general');
      setActiveChannel(initialChannel);
    } else if (!wasOpen) {
      // opened via sidebar chat button without a DM target → reset to general
      setDmWith(null);
      setMessages([]);
      setTab('general');
    }
  }, [open, initialDmWith, initialChannel, members.length]);

  // Reset general messages when workspace changes
  useChatE(() => {
    if (!wsId || dmWith) return;
    setMessages([]);
    msgIds.current = new Set();
  }, [wsId]);

  // Mark conversation as read when user views it
  useChatE(() => {
    if (!open || !markAsRead) return;
    if (dmWith) {
      markAsRead(`dm_${dmWith}`);
      if (socket) socket.emit('dm_mark_read', { with: dmWith });
    } else if (tab === 'general') {
      const key = wsId ? `general_${wsId}` : 'general';
      markAsRead(key);
    } else if (tab === 'media') {
      markAsRead('media');
    }
  }, [open, dmWith, tab, wsId]);

  // ── Load history — AbortController prevents stale responses on rapid DM/channel switches ──
  // wsId + activeChannel in deps so messages reload when workspace/channel switches
  useChatE(() => {
    if (!open) return;
    const controller = new AbortController();
    msgIds.current = new Set();
    const url = dmWith
      ? `/api/chat/messages?with=${dmWith}`
      : `/api/chat/messages?channel=${encodeURIComponent(activeChannel || 'general')}`;
    fetch(url, { signal: controller.signal })
      .then(r => r.json())
      .then(msgs => {
        if (!Array.isArray(msgs)) return;
        msgs.forEach(m => msgIds.current.add(String(m.id)));
        setMessages(msgs);
      })
      .catch(err => { if (err.name !== 'AbortError') setMessages([]); });
    return () => controller.abort();
  }, [open, dmWith, wsId, activeChannel]);

  // ── Load pinned messages for current channel/DM ──
  const [pinnedMessages, setPinnedMessages] = useChatS([]); // backend-backed pinned for current view
  const [pinnedAllChannels, setPinnedAllChannels] = useChatS([]); // pinned across ALL channels in ws
  const [pinnedBannerHidden, setPinnedBannerHidden] = useChatS(false);
  const [pinnedScope, setPinnedScope] = useChatS('channel');   // 'channel' | 'all'
  const [starredScope, setStarredScope] = useChatS('channel'); // 'channel' | 'all'
  useChatE(() => {
    if (!open) return;
    setPinnedBannerHidden(false);
    const url = dmWith
      ? `/api/chat/pinned?with=${dmWith}`
      : `/api/chat/pinned?channel=${encodeURIComponent(activeChannel || 'general')}`;
    fetch(url).then(r => r.json()).then(list => {
      if (Array.isArray(list)) setPinnedMessages(list);
    }).catch(() => {});
  }, [open, dmWith, wsId, activeChannel]);

  // Load "all channels" pinned set whenever the workspace changes or right tab opens to pinned
  useChatE(() => {
    if (!open || dmWith) return;
    fetch('/api/chat/pinned?scope=all').then(r => r.json()).then(list => {
      if (Array.isArray(list)) setPinnedAllChannels(list);
    }).catch(() => {});
  }, [open, wsId, pinnedMessages.length]);

  // ── Scroll to highlighted message after load ──────────────────────────────
  useChatE(() => {
    if (!highlightMsgId || messages.length === 0) return;
    const el = document.querySelector(`[data-msgid="${highlightMsgId}"]`);
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background 0.3s';
      el.style.background = 'var(--accent-softer, oklch(80% 0.08 25 / 0.3))';
      setTimeout(() => { el.style.background = ''; }, 2000);
    }, 150);
  }, [messages, highlightMsgId]);

  // ── Socket listeners — use `socket` prop as dependency (fixes stale/null issue) ──
  useChatE(() => {
    const sock = socket || window.SOCKET;
    if (!sock) return;

    const onMsg = (msg) => {
      // Hangi kanalın son mesajı olduğunu sidebar için güncelle (her durumda)
      if (!msg.to) {
        const msgCh = msg.channel || 'general';
        const sender = allMembers.find(m => m.id === msg.from);
        const senderName = sender?.name || msg.from || '';
        setChannels(prev => prev.map(c => {
          const cSlug = c.slug || c.id;
          if (cSlug !== msgCh) return c;
          return {
            ...c,
            last_message: {
              id: msg.id,
              text: msg.text || '',
              file_name: msg.file_name || null,
              time: msg.ts || new Date().toISOString(),
              from: msg.from,
              from_name: senderName,
            },
          };
        }));
      }

      // Check relevance — sadece aktif kanal/DM'in messages dizisine ekle
      let relevant = false;
      if (dmWith) {
        relevant = (msg.from === dmWith && msg.to === me) || (msg.from === me && msg.to === dmWith);
      } else {
        // Team channel: must match active channel (legacy null channel = 'general')
        const msgCh = msg.channel || 'general';
        relevant = !msg.to && msgCh === (activeChannel || 'general');
      }
      if (!relevant) return;

      const msgKey = String(msg.id);
      if (msgIds.current.has(msgKey)) return;
      msgIds.current.add(msgKey);

      setMessages(prev => {
        const optIdx = prev.findIndex(m =>
          m._temp && m.from === msg.from &&
          ((!m.file_url && !msg.file_url && m.text === msg.text) ||
           (m.file_url && m.file_url === msg.file_url))
        );
        if (optIdx !== -1) {
          const next = [...prev];
          next[optIdx] = msg;
          return next;
        }
        return [...prev, msg];
      });

      // If message is from the other person and we're actively viewing the DM, mark as read
      if (dmWith && msg.from === dmWith && msg.to === me && socket) {
        socket.emit('dm_mark_read', { with: dmWith });
      }
    };

    const onTyping = ({ user, typing }) => {
      if (!dmWith || user !== dmWith) return;
      setTypingUsers(prev => {
        const next = new Set(prev);
        typing ? next.add(user) : next.delete(user);
        return next;
      });
      if (typing) {
        clearTimeout(typingTimers.current[user]);
        typingTimers.current[user] = setTimeout(() => {
          setTypingUsers(prev => { const next = new Set(prev); next.delete(user); return next; });
        }, 3000);
      }
    };

    const onDmRead = ({ by, msg_ids }) => {
      setMessages(prev => prev.map(m =>
        msg_ids.includes(m.id) ? { ...m, is_read: true } : m
      ));
    };

    const onMsgDeleted = ({ id, scope }) => {
      if (scope === 'all') {
        setMessages(prev => prev.map(m => String(m.id) === String(id) ? { ...m, deleted: true, text: '', file_url: undefined } : m));
      } else {
        setMessages(prev => prev.filter(m => String(m.id) !== String(id)));
      }
    };

    const onMsgPinned = (info) => {
      // Update in-message flag
      setMessages(prev => prev.map(m =>
        String(m.id) === String(info.id) ? { ...m, pinned: info.pinned } : m
      ));
      // Update pinned banner list if relevant view
      const sameDm = dmWith && ((info.from === dmWith && info.to === me) || (info.from === me && info.to === dmWith));
      const sameCh = !dmWith && !info.to && (info.channel || 'general') === (activeChannel || 'general');
      if (sameDm || sameCh) {
        if (info.pinned) {
          // fetch the message details by id from current messages
          setPinnedMessages(prev => {
            const fromList = (window.__lastMessages || []).find(m => String(m.id) === String(info.id));
            const existing = prev.find(m => String(m.id) === String(info.id));
            if (existing) return prev.map(m => String(m.id) === String(info.id) ? { ...m, pinned: true } : m);
            if (fromList) return [{ ...fromList, pinned: true }, ...prev];
            // Otherwise refetch
            const url = dmWith
              ? `/api/chat/pinned?with=${dmWith}`
              : `/api/chat/pinned?channel=${encodeURIComponent(activeChannel || 'general')}`;
            fetch(url).then(r => r.json()).then(list => Array.isArray(list) && setPinnedMessages(list)).catch(() => {});
            return prev;
          });
        } else {
          setPinnedMessages(prev => prev.filter(m => String(m.id) !== String(info.id)));
        }
        setPinnedBannerHidden(false);
      }
    };

    const onChannelCreated = (ch) => {
      const slug = ch.slug || ch.id;
      setChannels(prev => {
        if (prev.some(c => (c.slug || c.id) === slug)) return prev;
        const next = [...prev, ch];
        window.DATA.CHANNELS = next;
        return next;
      });
      window.showToast?.(`#${ch.name} ${window.t?.('chat_channel_added')||'kanalına eklendin'}`, 'info');
    };
    const onChannelUpdated = (ch) => {
      const slug = ch.slug || ch.id;
      setChannels(prev => {
        const next = prev.map(c => (c.slug || c.id) === slug ? { ...c, ...ch } : c);
        window.DATA.CHANNELS = next;
        return next;
      });
      // Also refresh the right-panel detail if it's for the active channel
      setCurrentChannelDetail(prev => {
        if (!prev) return prev;
        if ((prev.slug || prev.id) !== slug) return prev;
        return { ...prev, ...ch };
      });
    };
    const onChannelDeleted = ({ slug, channel_id }) => {
      setChannels(prev => {
        const next = prev.filter(c => (c.slug || c.id) !== slug && c.channel_id !== channel_id);
        window.DATA.CHANNELS = next;
        return next;
      });
      if (activeChannel === slug) setActiveChannel('general');

      // Remove pinned messages that belong to the deleted channel
      setPinnedData(prev => {
        const next = prev.filter(m => m.channel !== slug);
        try { localStorage.setItem('stoa.pinnedData', JSON.stringify(next)); } catch {}
        return next;
      });
      setPinnedMsgs(prev => {
        // Rebuild from surviving pinnedData (use functional form after pinnedData update)
        const survived = (() => {
          try { return JSON.parse(localStorage.getItem('stoa.pinnedData') || '[]'); } catch { return []; }
        })();
        const next = new Set(survived.map(m => String(m.id)));
        try { localStorage.setItem('stoa.pinned', JSON.stringify([...next])); } catch {}
        return next;
      });

      // Remove starred messages that belong to the deleted channel
      setStarredData(prev => {
        const next = prev.filter(m => m.channel !== slug);
        try { localStorage.setItem('stoa.starredData', JSON.stringify(next)); } catch {}
        return next;
      });
      setStarredMsgs(prev => {
        const survived = (() => {
          try { return JSON.parse(localStorage.getItem('stoa.starredData') || '[]'); } catch { return []; }
        })();
        const next = new Set(survived.map(m => String(m.id)));
        try { localStorage.setItem('stoa.starred', JSON.stringify([...next])); } catch {}
        return next;
      });
    };
    const onChannelMemberAdded = (ch) => onChannelUpdated(ch);
    const onChannelMemberRemoved = (payload) => {
      // If I'm the one removed, drop the channel from my list
      const mySlug = window.CURRENT_USER?.slug || window.CURRENT_USER?.id;
      if (payload.removed_user_slug && payload.removed_user_slug === mySlug) {
        const slug = payload.slug || payload.id;
        setChannels(prev => {
          const next = prev.filter(c => (c.slug || c.id) !== slug);
          window.DATA.CHANNELS = next;
          return next;
        });
        if (activeChannel === slug) setActiveChannel('general');
        window.showToast?.(`#${payload.name || slug} ${window.t?.('chat_channel_kicked')||'kanalından çıkarıldın'}`, 'info');
        return;
      }
      onChannelUpdated(payload);
    };

    sock.on('chat_message', onMsg);
    sock.on('typing', onTyping);
    sock.on('dm_read', onDmRead);
    sock.on('message_deleted', onMsgDeleted);
    sock.on('message_pinned', onMsgPinned);
    sock.on('channel_created', onChannelCreated);
    sock.on('channel_updated', onChannelUpdated);
    sock.on('channel_deleted', onChannelDeleted);
    sock.on('channel_member_added', onChannelMemberAdded);
    sock.on('channel_member_removed', onChannelMemberRemoved);
    return () => {
      sock.off('chat_message', onMsg);
      sock.off('typing', onTyping);
      sock.off('dm_read', onDmRead);
      sock.off('message_deleted', onMsgDeleted);
      sock.off('message_pinned', onMsgPinned);
      sock.off('channel_created', onChannelCreated);
      sock.off('channel_updated', onChannelUpdated);
      sock.off('channel_deleted', onChannelDeleted);
      sock.off('channel_member_added', onChannelMemberAdded);
      sock.off('channel_member_removed', onChannelMemberRemoved);
    };
  }, [socket, dmWith, me, activeChannel]);

  // expose messages for socket handler closure
  useChatE(() => { window.__lastMessages = messages; }, [messages]);

  // ── Auto-scroll ───────────────────────────────────────────────────────
  useChatE(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Focus input ───────────────────────────────────────────────────────
  useChatE(() => {
    if (open && tab !== 'media') setTimeout(() => inputRef.current?.focus(), 120);
  }, [open, dmWith, tab]);

  // ── Send text message (HTTP POST → backend saves + broadcasts via socket) ─
  const sendMessage = async () => {
    const t = text.trim();
    if (!t && !pendingFile) return;
    if (dmWith && dmWith === me) {
      window.showToast?.(window.t?.('chat_err_self_msg') || 'Kendinize mesaj gönderemezsiniz.', 'error');
      return;
    }

    const tempId  = `temp_${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const tempMsg = {
      id: tempId,
      from: me, to: dmWith || null,
      channel: dmWith ? 'dm' : (activeChannel || 'general'),
      text: t,
      time: nowTime,
      ts: new Date().toISOString(),
      file_url:  pendingFile?.url  || undefined,
      file_type: pendingFile?.type || undefined,
      file_name: pendingFile?.name || undefined,
      reply_to: replyTo || undefined,
      _temp: true,
    };
    setMessages(prev => [...prev, tempMsg]);
    const sentText = t;
    const sentFile = pendingFile;
    const sentReply = replyTo;
    setText('');
    setPendingFile(null);
    setReplyTo(null);
    setMentionOpen(false);

    try {
      const body = { text: sentText, to: dmWith || null };
      if (!dmWith) body.channel = activeChannel || 'general';
      if (sentFile) {
        body.file_url  = sentFile.url;
        body.file_type = sentFile.type;
        body.file_name = sentFile.name;
      }
      if (sentReply) body.reply_to = sentReply;
      const saved = await API.sendChatMessage(body);
      msgIds.current.add(String(saved.id));
      setMessages(prev => prev.map(m => m.id === tempId ? saved : m));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      console.error((window.t?.('chat_send_failed')||'Mesaj gönderilemedi:'), err.message);
    }
  };

  // ── File pick & upload ────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/chat/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { window.showToast?.(data.error || (window.t?.('chat_upload_failed')||'Yükleme başarısız'), 'error'); return; }
      setPendingFile({ url: data.url, type: data.type, name: data.name, size: data.size });
    } catch (err) {
      window.showToast?.((window.t?.('chat_upload_error')||'Yükleme sırasında hata: ') + err.message, 'error');
    } finally {
      setUploading(false);
      inputRef.current?.focus();
    }
  };

  // ── Keyboard ──────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (mentionOpen && mentionMembers.current.length > 0) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(mentionMembers.current.length - 1, i + 1)); return; }
      if (e.key === 'Enter')     { e.preventDefault(); insertMention(mentionMembers.current[mentionIdx]); return; }
      if (e.key === 'Escape')    { setMentionOpen(false); return; }
    }
    // Markdown shortcuts
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); wrapSelection('**', '**', '', 'bold'); return; }
      if (k === 'i') { e.preventDefault(); wrapSelection('*', '*', '', 'italic');  return; }
      if (k === 'e') { e.preventDefault(); wrapSelection('`', '`', '', 'code');    return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    // detect @mention trigger
    const cursor = e.target.selectionStart;
    const match = val.slice(0, cursor).match(/@([\w\-]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionOpen(true);
      setMentionIdx(0);
    } else {
      setMentionOpen(false);
    }
    if (dmWith) {
      const sock = socket || window.SOCKET;
      if (sock) {
        sock.emit('typing', { to: dmWith, typing: true });
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => {
          sock.emit('typing', { to: dmWith, typing: false });
        }, 2000);
      }
    }
  };

  const openDm = (slug) => {
    if (slug && slug === me) {
      window.__SWITCH_VIEW__?.('settings');
      onClose?.();
      return false;
    }
    if (!canOpenDm(slug)) {
      setDmWith(null);
      setMessages([]);
      setTab('general');
      setPendingFile(null);
      setReplyTo(null);
      return false;
    }
    setDmWith(slug);
    setMessages([]);
    setTypingUser(null);
    setPendingFile(null);
    setReplyTo(null);
    setTab('dm');
    markAsRead?.(`dm_${slug}`);
    return true;
  };
  const backToGeneral = () => { setDmWith(null); setMessages([]); setPendingFile(null); setReplyTo(null); };

  const toggleReaction = (msgId, emoji) => {
    const key = String(msgId);
    // Composer-level emoji insert (not a reaction)
    if (key === '__composer__') {
      setText(t => t + emoji);
      setEmojiPicker(null);
      setTimeout(() => inputRef.current?.focus(), 10);
      return;
    }
    setReactions(prev => {
      const msgR = { ...(prev[key] || {}) };
      // Check if user already had this exact emoji (for toggle-off)
      const alreadyHad = (msgR[emoji] || []).includes(me);
      // Remove user from ALL emojis (enforce max 1 per user per message)
      Object.keys(msgR).forEach(e => {
        const users = (msgR[e] || []).filter(u => u !== me);
        if (users.length === 0) delete msgR[e]; else msgR[e] = users;
      });
      // Add emoji only if user didn't already have it (toggle off when clicking same)
      if (!alreadyHad) {
        msgR[emoji] = [...(msgR[emoji] || []), me];
      }
      const next = Object.keys(msgR).length === 0
        ? (({ [key]: _removed, ...rest }) => rest)(prev)
        : { ...prev, [key]: msgR };
      localStorage.setItem('stoa.reactions', JSON.stringify(next));
      return next;
    });
    setEmojiPicker(null);
  };

  const openEmojiPicker = (e, msgId) => {
    e.stopPropagation();
    const key = String(msgId);
    if (emojiPicker?.msgId === key) { setEmojiPicker(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setEmojiPicker({ msgId: key, x: rect.left + rect.width / 2, y: rect.top });
  };

  const toggleMute = (userId) => {
    setMutedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      localStorage.setItem('stoa.muted', JSON.stringify([...next]));
      window.__MUTED_USERS__ = next;
      return next;
    });
  };

  const toggleStar = (msg) => {
    const id = String(msg.id);
    setStarredMsgs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        const nextData = starredData.filter(m => String(m.id) !== id);
        setStarredData(nextData);
        localStorage.setItem('stoa.starredData', JSON.stringify(nextData));
      } else {
        next.add(id);
        const nextData = [...starredData.filter(m => String(m.id) !== id), { ...msg }];
        setStarredData(nextData);
        localStorage.setItem('stoa.starredData', JSON.stringify(nextData));
      }
      localStorage.setItem('stoa.starred', JSON.stringify([...next]));
      return next;
    });
    setDeleteMenu(null);
  };

  const togglePin = async (msg) => {
    setDeleteMenu(null);
    const id = String(msg.id);
    // Only persisted (non-temp) messages can be pinned server-side
    if (msg._temp || id.startsWith('temp_')) {
      window.showToast?.('Mesaj kaydedildikten sonra sabitleyebilirsin.', 'info');
      return;
    }
    // Optimistic UI
    const wasPinned = !!msg.pinned;
    setMessages(prev => prev.map(m => String(m.id) === id ? { ...m, pinned: !wasPinned } : m));
    if (wasPinned) {
      setPinnedMessages(prev => prev.filter(m => String(m.id) !== id));
    } else {
      setPinnedMessages(prev => [{ ...msg, pinned: true }, ...prev.filter(m => String(m.id) !== id)]);
    }
    setPinnedBannerHidden(false);
    try {
      await API.togglePinMessage(msg.id);
    } catch (e) {
      // Roll back
      setMessages(prev => prev.map(m => String(m.id) === id ? { ...m, pinned: wasPinned } : m));
      window.showToast?.((window.t?.('chat_pin_failed')||'Sabitleme başarısız: ') + e.message, 'error');
    }
  };

  // Jump to a message: switch channel/DM if it lives elsewhere, then smooth-scroll & highlight.
  // Accepts either a msg id (legacy) or a full msg object (with channel/to/from fields).
  const scrollToMessage = (msgOrId) => {
    const msg = (msgOrId && typeof msgOrId === 'object') ? msgOrId : null;
    const id  = msg ? msg.id : msgOrId;

    const doScroll = () => {
      const el = document.querySelector(`[data-msgid="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('chat-msg-jumped');
      // force reflow so animation can restart
      void el.offsetWidth;
      el.classList.add('chat-msg-jumped');
      setTimeout(() => el.classList.remove('chat-msg-jumped'), 2400);
    };

    if (msg) {
      // DM target switch
      const isDm = !!msg.to || msg.channel === 'dm';
      if (isDm) {
        const peer = (msg.from === me) ? msg.to : msg.from;
        if (peer && peer !== dmWith) {
          if (!canOpenDm(peer)) return;
          setDmWith(peer);
          setTab('dm');
          setTimeout(doScroll, 350);
          return;
        }
      } else {
        const ch = msg.channel || 'general';
        if (dmWith || ch !== (activeChannel || 'general')) {
          if (dmWith) setDmWith(null);
          setTab('general');
          setActiveChannel(ch);
          setTimeout(doScroll, 350);
          return;
        }
      }
    }
    setTimeout(doScroll, 30);
  };

  const replyToMessage = (msg) => {
    setDeleteMenu(null);
    const replyRef = buildReplyRef(msg, allMembers);
    if (!replyRef) return;
    setReplyTo(replyRef);
    setTimeout(() => {
      inputRef.current?.focus();
      const len = inputRef.current?.value.length || 0;
      inputRef.current?.setSelectionRange(len, len);
    }, 50);
  };

  const handleMentionClick = (member) => {
    if (!member || member.id === me) return;
    openDm(member.id);
  };

  const handleDeleteMessage = async (msgId, scope) => {
    setDeleteMenu(null);
    if (scope === 'self') {
      setMessages(prev => prev.filter(m => String(m.id) !== String(msgId)));
    } else {
      setMessages(prev => prev.map(m => String(m.id) === String(msgId) ? { ...m, deleted: true, text: '', file_url: undefined } : m));
    }
    try { await API.deleteChatMessage(msgId, scope); } catch (e) { console.error('Mesaj silinemedi:', e.message); }
  };


  const insertMention = useChatCb((member) => {
    const inputEl = inputRef.current;
    if (!inputEl) return;
    const cursor = inputEl.selectionStart;
    const before = text.slice(0, cursor).replace(/@[\w\-]*$/, `@${member.id} `);
    const after  = text.slice(cursor);
    const newText = before + after;
    setText(newText);
    setMentionOpen(false);
    setMentionQuery('');
    setTimeout(() => {
      inputEl.focus();
      inputEl.setSelectionRange(before.length, before.length);
    }, 0);
  }, [text]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {ConfirmUI}
      <CreateChannelModal
        open={addChannelOpen}
        onClose={() => setAddChannelOpen(false)}
        onCreated={(ch) => {
          const slug = ch.slug || ch.id;
          setChannels(prev => {
            if (prev.some(c => (c.slug || c.id) === slug)) {
              return prev.map(c => (c.slug || c.id) === slug ? { ...c, ...ch } : c);
            }
            const next = [...prev, ch];
            window.DATA.CHANNELS = next;
            return next;
          });
          setActiveChannel(slug);
          setDmWith(null);
          setTab('general');
          window.showToast?.(`#${ch.name} ${window.t?.('chat_channel_created')||'kanalı oluşturuldu'}`, 'success');
        }}
        allMembers={allMembers}
        me={me}
      />
      <AddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        channel={currentChannelDetail}
        onAdded={(updated) => {
          setCurrentChannelDetail(updated);
          setChannels(prev => prev.map(c => c.channel_id === updated.channel_id ? { ...c, member_count: updated.member_count, my_role: c.my_role } : c));
        }}
        allMembers={allMembers}
        me={me}
      />
      <ChannelSettingsModal
        open={channelSettingsOpen}
        onClose={() => setChannelSettingsOpen(false)}
        channel={currentChannelDetail}
        me={me}
        onUpdated={(updated) => {
          setCurrentChannelDetail(updated);
          setChannels(prev => prev.map(c => c.channel_id === updated.channel_id ? { ...c, name: updated.name, description: updated.description, type: updated.type, member_count: updated.member_count, my_role: updated.my_role } : c));
        }}
        onDeleted={({ slug }) => {
          setChannels(prev => {
            const next = prev.filter(c => (c.slug || c.id) !== slug);
            window.DATA.CHANNELS = next;
            return next;
          });
          if (activeChannel === slug) setActiveChannel('general');
          setCurrentChannelDetail(null);
        }}
      />
      {memberRowMenu && ReactDOM.createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setMemberRowMenu(null)} />
          <div style={{
            position: 'fixed',
            top: Math.min(memberRowMenu.y, window.innerHeight - 220),
            left: Math.max(8, Math.min(memberRowMenu.x, window.innerWidth - 200)),
            zIndex: 9999,
            background: 'var(--bg-raised)', border: '1px solid var(--line)',
            borderRadius: 10, boxShadow: 'var(--shadow-lg, 0 8px 24px oklch(0% 0 0 / 0.18))',
            overflow: 'hidden', minWidth: 190,
          }}>
            <button className="chat-menu-item" onClick={() => {
              const target = memberRowMenu.member;
              setMemberRowMenu(null);
              openDm(target.id);
            }}>
              <Icon name="msg" size={13} style={{ color: 'var(--ink-muted)' }} /> {window.t?.('chat_send_msg')||'Mesaj gönder'}
            </button>
            {memberRowMenu.canChangeRole && (
              <>
                <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
                  onClick={async () => {
                    const cm = memberRowMenu.cm;
                    const nextRole = cm.role === 'admin' ? 'member' : 'admin';
                    setMemberRowMenu(null);
                    try {
                      const updated = await window.API.updateChannelMemberRole(currentChannelDetail.channel_id, cm.user_id, nextRole);
                      setCurrentChannelDetail(updated);
                      window.showToast?.(`${memberRowMenu.member.name} ${window.t?.('chat_role_changed')||'rolü: '}${nextRole === 'admin' ? (window.t?.('chat_role_admin')||'Yönetici') : (window.t?.('chat_role_member')||'Üye')}`, 'success');
                    } catch (e) { window.showToast?.(e.message, 'error'); }
                  }}>
                  <Icon name="shield" size={13} style={{ color: 'var(--ink-muted)' }} />
                  {memberRowMenu.cm.role === 'admin' ? (window.t?.('chat_revoke_admin')||'Yöneticiyi geri al') : (window.t?.('chat_make_admin')||'Yönetici yap')}
                </button>
                <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
                  onClick={async () => {
                    const cm = memberRowMenu.cm;
                    const memberName = memberRowMenu.member.name;
                    setMemberRowMenu(null);
                    const ok = await askConfirm({
                      title: window.t?.('chat_transfer_ownership') || 'Sahiplik Devret',
                      message: `${memberName} ${window.t?.('chat_transfer_confirm') || 'kanal sahipliğini devralsın mı?'}`,
                      hint: window.t?.('chat_transfer_hint') || 'Sen yönetici rolüne geçersin.',
                      confirmText: window.t?.('chat_transfer_ownership') || 'Devret',
                      variant: 'warn',
                    });
                    if (!ok) return;
                    try {
                      const updated = await window.API.updateChannelMemberRole(currentChannelDetail.channel_id, cm.user_id, 'owner');
                      setCurrentChannelDetail(updated);
                      window.showToast?.(window.t?.('chat_transferred')||'Sahiplik devredildi', 'success');
                    } catch (e) { window.showToast?.(e.message, 'error'); }
                  }}>
                  <Icon name="gem" size={13} style={{ color: 'var(--ink-muted)' }} />
                  {window.t?.('chat_transfer_ownership')||'Sahiplik devret'}
                </button>
              </>
            )}
            {memberRowMenu.canRemove && (
              <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)', color: 'var(--status-rose)' }}
                onClick={async () => {
                  const cm = memberRowMenu.cm;
                  const name = memberRowMenu.member.name;
                  setMemberRowMenu(null);
                  const ok = await askConfirm({
                    title: window.t?.('chat_kick_member') || 'Kanaldan Çıkar',
                    message: `${name} ${window.t?.('chat_kick_confirm') || 'kanaldan çıkarılsın mı?'}`,
                    confirmText: window.t?.('chat_kick_member') || 'Kanaldan Çıkar',
                    variant: 'danger',
                  });
                  if (!ok) return;
                  try {
                    await window.API.removeChannelMember(currentChannelDetail.channel_id, cm.user_id);
                    const refreshed = await window.API.getChannel(currentChannelDetail.channel_id);
                    setCurrentChannelDetail(refreshed);
                    window.showToast?.(`${name} ${window.t?.('chat_member_kicked')||'kanaldan çıkarıldı'}`, 'info');
                  } catch (e) { window.showToast?.(e.message, 'error'); }
                }}>
                <Icon name="x" size={13} /> {window.t?.('chat_kick_member')||'Kanaldan çıkar'}
              </button>
            )}
          </div>
        </>,
        document.body
      )}
      {lightbox && <Lightbox src={typeof lightbox === 'string' ? lightbox : lightbox.src} kind={typeof lightbox === 'string' ? 'image' : (lightbox.kind || 'image')} onClose={() => setLightbox(null)} />}
      {deleteMenu && ReactDOM.createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setDeleteMenu(null)} />
          <div style={{
            position: 'fixed',
            top: Math.min(deleteMenu.y, window.innerHeight - 130),
            left: Math.max(4, Math.min(deleteMenu.x, window.innerWidth - 184)),
            zIndex: 9999,
            background: 'var(--bg-raised)', border: '1px solid var(--line)',
            borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', minWidth: 180,
          }}>
            <button className="chat-menu-item"
              onClick={() => toggleStar(deleteMenu.msg)}>
              <Icon name="star" size={13} style={{ color: deleteMenu.starred ? 'var(--status-yellow)' : 'var(--ink-muted)' }} />
              {deleteMenu.starred ? (window.t?.('chat_unstar')||'Yıldızı kaldır') : (window.t?.('chat_star')||'Yıldızla')}
            </button>
            <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
              onClick={() => togglePin(deleteMenu.msg)}>
              <Icon name="pin" size={13} style={{ color: deleteMenu.pinned ? 'var(--accent)' : 'var(--ink-muted)' }} />
              {deleteMenu.pinned ? (window.t?.('chat_pinned_remove')||'Sabitlemeyi kaldır') : (window.t?.('chat_pin')||'Kanala sabitle')}
            </button>
            <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
              onClick={() => replyToMessage(deleteMenu.msg)}>
              <Icon name="arrowUpRight" size={13} style={{ transform: 'scaleX(-1)', color: 'var(--ink-muted)' }} />
              {window.t?.('chat_reply')||'Cevapla'}
            </button>
            <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
              onClick={async () => {
                const text = deleteMenu.msg.text || deleteMenu.msg.file_url || '';
                try {
                  await navigator.clipboard?.writeText(text);
                  window.showToast?.(window.t?.('chat_msg_copied')||'Mesaj kopyalandı', 'success');
                } catch {
                  window.showToast?.(window.t?.('chat_copy_failed')||'Kopyalama başarısız', 'error');
                }
                setDeleteMenu(null);
              }}>
              <Icon name="copy" size={13} style={{ color: 'var(--ink-muted)' }} />
              {window.t?.('chat_copy')||'Kopyala'}
            </button>
            {deleteMenu.isMine && !deleteMenu.msg.file_url && (
              <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
                onClick={() => {
                  setDeleteMenu(null);
                  const current = deleteMenu.msg.text || '';
                  const updated = window.prompt(window.t?.('chat_edit_msg')||'Mesajı düzenle:', current);
                  if (updated == null || updated.trim() === '' || updated === current) return;
                  window.showToast?.(window.t?.('chat_edit_soon')||'Mesaj düzenleme yakında — şimdilik silip yeniden gönderebilirsin', 'info');
                }}>
                <Icon name="edit" size={13} style={{ color: 'var(--ink-muted)' }} />
                {window.t?.('chat_edit')||'Düzenle'}
              </button>
            )}
            <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
              onClick={() => handleDeleteMessage(deleteMenu.msgId, 'self')}
            >
              <Icon name="eyeOff" size={13} style={{ color: 'var(--ink-muted)' }} /> {window.t?.('chat_delete_self')||'Benden sil'}
            </button>
            {(deleteMenu.isMine || canDeleteMessages) && (
              <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)', color: 'var(--status-rose)' }}
                onClick={() => handleDeleteMessage(deleteMenu.msgId, 'all')}
              >
                <Icon name="trash" size={13} /> {window.t?.('chat_delete_all')||'Herkesten sil'}
              </button>
            )}
            {!deleteMenu.isMine && (
              <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
                onClick={() => {
                  setDeleteMenu(null);
                  window.showToast?.(window.t?.('chat_reported')||'Mesaj raporlandı, ekibimiz inceleyecek.', 'info');
                }}>
                <Icon name="alertTriangle" size={13} style={{ color: 'var(--status-yellow)' }} />
                {window.t?.('chat_report')||'Şikayet et'}
              </button>
            )}
          </div>
        </>,
        document.body
      )}
      {emojiPicker && ReactDOM.createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9997 }} onClick={() => setEmojiPicker(null)} />
          <div style={{
            position: 'fixed',
            bottom: window.innerHeight - emojiPicker.y + 8,
            left: Math.max(8, Math.min(emojiPicker.x - 160, window.innerWidth - 336)),
            zIndex: 9998,
            background: 'var(--bg-raised)', border: '1px solid var(--line)',
            borderRadius: 14, boxShadow: '0 8px 24px oklch(0% 0 0 / 0.18)',
            padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
            gap: 2, maxHeight: 200, overflowY: 'auto', width: 320,
          }}>
            {EMOJI_PACK.map(emoji => (
              <button key={emoji}
                className="chat-emoji-opt"
                onClick={() => toggleReaction(emojiPicker.msgId, emoji)}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
      {!fullPage && <div className="chat-overlay" data-open={open} onClick={onClose} />}
      <div className="chat-panel" data-open={open || fullPage} data-full-page={!!fullPage}>

      {/* ═════════════════ FULL-PAGE 3-COLUMN LAYOUT ═════════════════ */}
      {fullPage && (() => {
        const visibleMembers = leftSearch
          ? members.filter(m => m.name.toLowerCase().includes(leftSearch.toLowerCase()))
          : members;
        const showHeaderSearchHits = headerSearchOpen && headerSearch.trim();
        const headerHits = showHeaderSearchHits
          ? messages.filter(m => (m.text || m.file_name || '').toLowerCase().includes(headerSearch.toLowerCase()))
          : [];
        const filteredMessages = messages; // header search dropdown, not filter
        // participant avatars (recent senders, max 4)
        const recentParticipants = [];
        const seenIds = new Set();
        for (let i = messages.length - 1; i >= 0 && recentParticipants.length < 4; i--) {
          const fromId = messages[i].from;
          if (!seenIds.has(fromId)) {
            const m = allMembers.find(x => x.id === fromId);
            if (m) { recentParticipants.push(m); seenIds.add(fromId); }
          }
        }
        return (
        <div className="chat-fp-grid">
          {/* ─── LEFT COLUMN ─── */}
          <aside className="chat-fp-left">
            <div className="chat-fp-left-pad">
              <div className="chat-fp-search">
                <Icon name="search" size={13} />
                <input
                  placeholder={window.t?.('chat_search_ph') || 'Sohbet ara...'}
                  value={leftSearch}
                  onChange={e => setLeftSearch(e.target.value)}
                />
                {leftSearch && (
                  <button onClick={() => setLeftSearch('')} className="icon-btn" style={{ padding: 2 }}>
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
              <div className="chat-fp-list-tabs">
                <button data-active={leftListTab === 'channels'} onClick={() => setLeftListTab('channels')}>
                  <Icon name="hash" size={11} /> {window.t?.('chat_team_channels') || 'Takım kanalları'}
                </button>
                <button data-active={leftListTab === 'dms'} onClick={() => setLeftListTab('dms')}>
                  <Icon name="msg" size={11} /> {window.t?.('chat_direct_messages') || 'Direkt mesajlar'}
                </button>
              </div>
              <div className="chat-fp-list-sub" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  {leftListTab === 'channels'
                    ? `${DATA.WORKSPACE?.name || 'Atlas'} · ${channels.length} kanal`
                    : 'Direkt Mesajlar'}
                </span>
                {leftListTab === 'channels' && (DATA.WORKSPACE?.can_create_channel || DATA.WORKSPACE?.is_owner || canManageChannels) && (
                  <button
                    className="icon-btn"
                    title="Yeni kanal"
                    onClick={() => setAddChannelOpen(o => !o)}
                    style={{ padding: 2, color: 'var(--ink-muted)' }}
                  >
                    <Icon name="plus" size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="chat-fp-list">
              {leftListTab === 'channels' ? (
                <>
                  {channels.map(ch => {
                    const slug = ch.slug || ch.id;
                    const isDefault = !!ch.is_default;
                    const isPrivate = ch.type === 'private';
                    const myRole = ch.my_role;
                    const canDelete = !isDefault && myRole === 'owner';
                    return (
                      <div
                        key={slug}
                        className="chat-fp-row"
                        data-active={!dmWith && activeChannel === slug}
                        onClick={() => { setDmWith(null); setTab('general'); setActiveChannel(slug); }}
                      >
                        <div className="chat-fp-row-ic chat-fp-row-ic-channel">
                          <ChannelIconMark channel={ch} slug={slug} size={11} />
                        </div>
                        <div className="chat-fp-row-body">
                          <div className="chat-fp-row-name">{ch.name}</div>
                          <div className="chat-fp-row-preview">
                            {/* Her kanalın kendi son mesajını backend'in
                                döndürdüğü last_message field'ından oku.
                                Aktif kanalda yazılan yeni mesajlar
                                onMsg handler'ında channel state'ine yazılıyor. */}
                            {(() => {
                              const lm = ch.last_message;
                              if (lm && (lm.text || lm.file_name)) {
                                const senderName = (lm.from_name || lm.from || '').split(' ')[0];
                                const preview = lm.text || lm.file_name || (window.t?.('chat_file')||'Dosya');
                                return `${senderName}: ${preview}`;
                              }
                              return isPrivate
                                ? `${ch.member_count || 0} ${window.t?.('chat_members_count')||'üye'}`
                                : (isDefault ? (window.t?.('chat_no_msg_yet')||'Henüz mesaj yok') : (window.t?.('chat_msg_none_yet')||'Mesaj henüz yok'));
                            })()}
                          </div>
                        </div>
                        <div className="chat-fp-row-right">
                          {ch.last_message?.time && (
                            <div className="chat-fp-row-time">{(() => {
                              try {
                                const d = new Date(ch.last_message.time);
                                const h = String(d.getHours()).padStart(2,'0');
                                const m = String(d.getMinutes()).padStart(2,'0');
                                return `${h}:${m}`;
                              } catch { return ''; }
                            })()}</div>
                          )}
                          {(() => {
                            if (slug !== 'general') return null;
                            const u = (unreadCounts || {})[wsId ? `general_${wsId}` : 'general'] || 0;
                            return u > 0 && <div className="chat-fp-row-unread">+{u > 99 ? 99 : u}</div>;
                          })()}
                          {canDelete && (
                            <button
                              className="chat-fp-row-del"
                              title={window.t?.('chat_delete_channel_title')||'Kanalı sil'}
                              onClick={(e) => { e.stopPropagation(); removeChannel(slug); }}
                            >
                              <Icon name="x" size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                visibleMembers.map(m => {
                  const mStatus = statuses.get(m.id) || (online.has(m.id) ? 'online' : 'offline');
                  const dmUnread = (unreadCounts || {})[`dm_${m.id}`] || 0;
                  return (
                    <div
                      key={m.id}
                      className="chat-fp-row"
                      data-active={dmWith === m.id}
                      onClick={() => openDm(m.id)}
                    >
                      <div style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
                        <Avatar member={m} size="sm" />
                        <span style={{ position: 'absolute', bottom: -1, right: -1 }}>
                          <StatusDot status={mStatus} />
                        </span>
                      </div>
                      <div className="chat-fp-row-body">
                        <div className="chat-fp-row-name">{m.name}</div>
                        <div className="chat-fp-row-preview">
                          {typingUsers.has(m.id) ? <em>{window.t?.('chat_typing')||'yazıyor…'}</em> : _statusLabel(mStatus)}
                        </div>
                      </div>
                      <div className="chat-fp-row-right">
                        {dmUnread > 0 && <div className="chat-fp-row-unread">+{dmUnread > 99 ? 99 : dmUnread}</div>}
                      </div>
                    </div>
                  );
                })
              )}
              {leftListTab === 'dms' && visibleMembers.length === 0 && (
                <div className="chat-empty" style={{ padding: 24 }}>
                  {leftSearch ? (window.t?.('chat_no_result')||'Sonuç yok.') : (window.t?.('chat_no_members_yet')||'Henüz başka üye yok.')}
                </div>
              )}
            </div>
          </aside>

          {/* ─── CENTER COLUMN ─── */}
          <section className="chat-fp-center">
            <div className="chat-fp-conv-head">
              {dmWith ? (
                <>
                  <button className="icon-btn chat-fp-back-btn" onClick={() => { setDmWith(null); setMessages([]); setTab('dm'); }} title={window.t?.('chat_back')||'Geri'}>
                    <Icon name="chevronLeft" size={16} />
                  </button>
                  <div style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
                    <Avatar member={dmUser} size="sm" />
                    <span style={{ position: 'absolute', bottom: -1, right: -1 }}>
                      <StatusDot status={statuses.get(dmWith) || (online.has(dmWith) ? 'online' : 'offline')} />
                    </span>
                  </div>
                  <div className="chat-fp-conv-title-wrap">
                    <div className="chat-fp-conv-title">{dmUser?.name || dmWith}</div>
                    <div className="chat-fp-conv-sub">{_statusLabel(statuses.get(dmWith) || (online.has(dmWith) ? 'online' : 'offline'))}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="chat-fp-channel-icon">
                    <ChannelIconMark channel={_findCh(activeChannel)} slug={activeChannel} size={12} />
                  </div>
                  <div className="chat-fp-conv-title-wrap">
                    <div className="chat-fp-conv-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(_findCh(activeChannel)?.name) || activeChannel || 'genel'}
                      {currentChannelDetail && (
                        <button
                          className="icon-btn"
                          title={window.t?.('chat_channel_settings_btn')||'Kanal ayarları'}
                          onClick={() => setChannelSettingsOpen(true)}
                          style={{ padding: 2, color: 'var(--ink-faint)' }}
                        >
                          <Icon name="settings" size={12} />
                        </button>
                      )}
                    </div>
                    <div className="chat-fp-conv-sub">
                      {DATA.WORKSPACE?.name || 'Atlas'} · {currentChannelDetail?.member_count ?? allMembers.length} {window.t?.('chat_members_count')||'üye'}
                      {currentChannelDetail?.description ? ` · ${currentChannelDetail.description}` : ''}
                    </div>
                  </div>
                </>
              )}
              <div style={{ flex: 1 }} />
              {!dmWith && recentParticipants.length > 0 && (
                <AvatarStack members={recentParticipants} size="sm" max={4} />
              )}
              <div style={{ position: 'relative' }}>
                <button
                  className="icon-btn"
                  title="Mesajlarda ara"
                  onClick={() => setHeaderSearchOpen(o => !o)}
                  style={{ color: headerSearchOpen ? 'var(--accent)' : 'var(--ink-muted)' }}
                >
                  <Icon name="search" size={14} />
                </button>
                {headerSearchOpen && (
                  <div className="chat-fp-header-search">
                    <input
                      autoFocus
                      placeholder="Mesajlarda ara..."
                      value={headerSearch}
                      onChange={e => setHeaderSearch(e.target.value)}
                    />
                    {headerSearch && (
                      <div className="chat-fp-header-search-hits">
                        {headerHits.length === 0
                          ? <div style={{ padding: 12, fontSize: 12, color: 'var(--ink-faint)' }}>{window.t?.('chat_no_result_search')||'Sonuç yok.'}</div>
                          : headerHits.slice(0, 8).map(m => {
                              const sender = allMembers.find(u => u.id === m.from);
                              return (
                                <div key={m.id} className="chat-fp-hit"
                                  onClick={() => {
                                    const el = document.querySelector(`[data-msgid="${m.id}"]`);
                                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    setHeaderSearchOpen(false);
                                    setHeaderSearch('');
                                  }}
                                >
                                  <div className="chat-fp-hit-meta">
                                    <strong>{sender?.name || m.from}</strong>
                                    <span>{fmtMsgTime(m)}</span>
                                  </div>
                                  <div className="chat-fp-hit-text">{(m.text || m.file_name || 'Dosya').slice(0, 80)}</div>
                                </div>
                              );
                            })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                className="icon-btn"
                title={rightPanelOpen ? (window.t?.('chat_hide_details')||'Detayları gizle') : (window.t?.('chat_show_details')||'Detayları göster')}
                onClick={() => setRightPanelOpen(o => !o)}
              >
                <Icon name={rightPanelOpen ? 'sidebarOut' : 'sidebarIn'} size={14} />
              </button>
            </div>

            {/* Messages re-uses existing rendering by re-render via existing branch below.
                In fullPage we keep messages rendered as DM/general messages always (never starred/media/dm-list in center). */}
            <div className="chat-messages chat-fp-messages">
              {!pinnedBannerHidden && (
                <PinnedBanner
                  pinned={pinnedMessages}
                  allMembers={allMembers}
                  onJump={scrollToMessage}
                  onUnpin={togglePin}
                  onClose={() => setPinnedBannerHidden(true)}
                />
              )}
              {dmWith && mentionTaskRef && (
                <div className="chat-task-ref-banner">
                  <Icon name="listChecks" size={13} />
                  <span>{window.t?.('chat_mentioned_in')||'Bahsedildi:'} <strong>{mentionTaskRef.title}</strong></span>
                  <button onClick={() => setMentionTaskRef(null)}><Icon name="x" size={12} /></button>
                </div>
              )}
              {messages.length === 0 && (
                <div className="chat-empty">
                  {dmWith ? `${dmUser?.name || dmWith} ${window.t?.('chat_dm_start')||'ile sohbet başlat.'}` : (window.t?.('chat_general_first')||'Genel kanala ilk mesajı gönder.')}
                </div>
              )}
              {messages.map((msg, i) => {
                const isMine = msg.from === me;
                const sender = allMembers.find(m => m.id === msg.from);
                const prevMsg = messages[i - 1];
                const showSender = !isMine && (!prevMsg || prevMsg.from !== msg.from);
                const canDelete = !msg._temp && !msg.deleted;
                const dateKey = msgDateKey(msg);
                const prevDateKey = prevMsg ? msgDateKey(prevMsg) : null;
                const showDateSep = dateKey && dateKey !== prevDateKey;
                const msgKey = String(msg.id);
                const msgReactions = reactions[msgKey] || {};
                const hasReactions = Object.keys(msgReactions).length > 0;
                return (
                  <React.Fragment key={msg.id || i}>
                  {showDateSep && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', margin:'4px 0' }}>
                      <div style={{ flex:1, height:1, background:'var(--line-strong)' }} />
                      <span style={{ fontSize:11, color:'var(--ink-muted)', fontWeight:500, flexShrink:0 }}>{fmtDateSep(dateKey)}</span>
                      <div style={{ flex:1, height:1, background:'var(--line-strong)' }} />
                    </div>
                  )}
                  <div className={`chat-msg ${isMine ? 'mine' : 'theirs'}`} data-msgid={msg.id} style={{ position: 'relative', scrollMarginTop: 60 }}>
                    {!isMine && (
                      <div className="chat-msg-avatar" style={{ visibility: showSender ? 'visible' : 'hidden' }}>
                        <Avatar member={sender} size="sm" />
                      </div>
                    )}
                    <div className="chat-bubble-wrap">
                      {showSender && !isMine && (
                        <div className="chat-sender-name">{sender?.name || msg.from} <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontWeight: 400, marginLeft: 6 }}>{fmtMsgTime(msg)}</span></div>
                      )}
                      <div className="chat-bubble-anchor" style={{ display: 'inline-flex', alignSelf: isMine ? 'flex-end' : 'flex-start' }}>
                        <div className={`chat-bubble ${msg._temp ? 'chat-bubble-sending' : ''} ${msg.deleted ? 'chat-bubble-deleted' : ''}`}>
                          {!msg.deleted && msg.reply_to && (
                            <ReplyPreview reply={msg.reply_to} mine={isMine} compact onJump={scrollToMessage} />
                          )}
                          {msg.deleted
                            ? <span style={{ fontStyle: 'italic', color: 'var(--ink-faint)', fontSize: 12 }}>Bu mesaj silindi</span>
                            : <MsgContent msg={{ ...msg, _onMentionClick: handleMentionClick }} onImageClick={setLightbox} />
                          }
                          {starredMsgs.has(String(msg.id)) && (
                            <span style={{ position: 'absolute', top: 4, right: 6, fontSize: 10, color: 'var(--status-yellow)', pointerEvents: 'none' }}>★</span>
                          )}
                          {!!msg.pinned && (
                            <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 10, color: 'var(--accent)', pointerEvents: 'none' }}>📌</span>
                          )}
                        </div>
                        {canDelete && (() => {
                          const isStarred = starredMsgs.has(String(msg.id));
                          return (
                            <div
                              className="chat-fp-hover-actions"
                              data-mine={isMine}
                            >
                              <button title="Reaksiyon" onClick={(e) => openEmojiPicker(e, msg.id)}>
                                <Icon name="smile" size={14} />
                              </button>
                              <button title="Cevapla" onClick={() => replyToMessage(msg)}>
                                <Icon name="arrowUpRight" size={14} style={{ transform: 'scaleX(-1)' }} />
                              </button>
                              <button
                                title={isStarred ? (window.t?.('chat_unstar')||'Yıldızı kaldır') : (window.t?.('chat_star')||'Yıldızla')}
                                data-active={isStarred}
                                onClick={() => toggleStar(msg)}
                              >
                                <Icon name="star" size={14} />
                              </button>
                              <button
                                title={msg.pinned ? (window.t?.('chat_pinned_remove')||'Sabitlemeyi kaldır') : (window.t?.('chat_pin')||'Sabitle')}
                                data-active={!!msg.pinned}
                                onClick={() => togglePin(msg)}
                              >
                                <Icon name="pin" size={14} />
                              </button>
                              <button
                                title="Daha fazla"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setDeleteMenu({
                                    msgId: msg.id, isMine,
                                    starred: isStarred, pinned: !!msg.pinned, msg,
                                    x: Math.max(8, rect.left - 90),
                                    y: rect.bottom + 6,
                                  });
                                }}
                              ><Icon name="moreH" size={14} /></button>
                            </div>
                          );
                        })()}
                      </div>
                      {hasReactions && (
                        <div className="chat-reactions">
                          {Object.entries(msgReactions).map(([emoji, users]) => (
                            <button key={emoji} className="chat-reaction-btn" data-mine={users.includes(me)}
                              onClick={() => toggleReaction(msgKey, emoji)}
                              title={users.map(u => allMembers.find(m => m.id === u)?.name || u).join(', ')}>
                              {emoji}<span>{users.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!showSender && <div className="chat-msg-time">{fmtMsgTime(msg)}</div>}
                      {isMine && dmWith && msg.id === lastReadSentId && (
                        <div className="chat-read-receipt">
                          <span className="chat-read-label">{window.t?.('chat_seen')||'Görüldü'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
              {typingUsers.size > 0 && dmWith && (
                <div className="chat-typing-indicator">
                  <div className="chat-typing-avatars">
                    {[...typingUsers].map(slug => {
                      const m = allMembers.find(x => x.id === slug);
                      return m ? <Avatar key={slug} member={m} size="sm" /> : null;
                    })}
                  </div>
                  <span className="typing-dots"><span /><span /><span /></span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* pending file preview (reuses styling) */}
            {pendingFile && (
              <div className="chat-pending-file">
                {pendingFile.type === 'image' && <img src={pendingFile.url} alt="" style={{ height: 64, borderRadius: 6, objectFit: 'cover' }} />}
                {pendingFile.type !== 'image' && (
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name={pendingFile.type === 'video' ? 'video' : 'paperclip'} size={14} /> {pendingFile.name}
                  </div>
                )}
                <button className="icon-btn" onClick={() => setPendingFile(null)} style={{ marginLeft: 'auto', color: 'var(--status-rose)' }}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            )}

            {/* @mention dropdown */}
            {mentionOpen && mentionMembers.current.length > 0 && (
              <div className="chat-fp-mention-pop">
                <div className="chat-fp-mention-head">Bahset</div>
                {mentionMembers.current.slice(0, 6).map((m, i) => (
                  <div key={m.id}
                    className="chat-fp-mention-row"
                    data-active={i === mentionIdx}
                    onMouseDown={ev => { ev.preventDefault(); insertMention(m); }}
                    onMouseEnter={() => setMentionIdx(i)}
                  >
                    <Avatar member={m} size="sm" />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>@{m.id}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* composer */}
            <div className="chat-fp-composer">
              <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={handleFileChange}
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" />
              <ReplyPreview reply={replyTo} onClose={() => setReplyTo(null)} onJump={scrollToMessage} />
              <textarea
                ref={inputRef}
                className="chat-fp-input"
                placeholder={pendingFile ? (window.t?.('chat_desc_ph')||'Açıklama ekle (isteğe bağlı)…') : (dmWith ? `${dmUser?.name || dmWith}${window.t?.('chat_write_dm') || ' — mesaj yaz...'}` : (window.t?.('chat_write_general')||'#genel kanala yaz...'))}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <div className="chat-fp-composer-row">
                <button title={window.t?.('chat_fmt_bold')||'Kalın (Ctrl+B)'} data-fmt-active={activeFmtKey === 'bold'} onClick={() => wrapSelection('**', '**', '', 'bold')} className="chat-fmt-btn" style={{ fontWeight: 700 }}>B</button>
                <button title={window.t?.('chat_fmt_italic')||'İtalik (Ctrl+I)'} data-fmt-active={activeFmtKey === 'italic'} onClick={() => wrapSelection('*', '*', '', 'italic')} className="chat-fmt-btn" style={{ fontStyle: 'italic' }}>I</button>
                <button title={window.t?.('chat_fmt_code')||'Kod (Ctrl+E)'} data-fmt-active={activeFmtKey === 'code'} onClick={() => wrapSelection('`', '`', '', 'code')} className="chat-fmt-btn"><Icon name="code" size={12} /></button>
                <span className="chat-fp-composer-sep" />
                <button title="Dosya ekle" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <span style={{ fontSize: 11 }}>⏳</span> : <Icon name="paperclip" size={14} />}
                </button>
                <button title="Emoji" onClick={(e) => {
                  // open emoji picker at composer level - reuse existing picker logic via a fake msgId
                  const rect = e.currentTarget.getBoundingClientRect();
                  setEmojiPicker({ msgId: '__composer__', x: rect.left + rect.width / 2, y: rect.top });
                }}>
                  <Icon name="smile" size={14} />
                </button>
                <button title="Bahset (@)" onClick={() => {
                  setText(text + '@');
                  setMentionOpen(true);
                  setMentionQuery('');
                  setMentionIdx(0);
                  setTimeout(() => inputRef.current?.focus(), 10);
                }}>
                  <Icon name="at" size={14} />
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary chat-fp-send" onClick={sendMessage} disabled={!text.trim() && !pendingFile}>
                  <Icon name="send" size={13} /> {window.t?.('chat_send')||'Gönder'}
                </button>
              </div>
            </div>
          </section>

          {/* ─── RIGHT COLUMN (collapsible) ─── */}
          {rightPanelOpen && (
            <aside className="chat-fp-right">
              <div className="chat-fp-right-head">
                <div className="chat-fp-right-title">{window.t?.('chat_channel_details')||'Kanal detayları'}</div>
                <div className="chat-fp-right-tabs">
                  {[
                    ['members', window.t?.('chat_members')||'Üyeler',    'users'],
                    ['media',   window.t?.('chat_media')||'Medya',        'paperclip'],
                    ['starred', window.t?.('chat_starred_tab')||'Yıldızlı','star'],
                    ['pinned',  window.t?.('chat_pinned_tab')||'Sabitli', 'pin'],
                  ].map(([id, lbl, ic]) => (
                    <button key={id} data-active={rightTab === id} onClick={() => setRightTab(id)}>
                      <Icon name={ic} size={11} /> {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chat-fp-right-body">
                {rightTab === 'members' && (() => {
                  const detail = currentChannelDetail;
                  const channelMembers = detail?.members || [];
                  const myRole = detail?.my_role;
                  const canManage = myRole === 'owner' || myRole === 'admin';
                  const isOwner = myRole === 'owner';
                  const isPrivate = detail?.type === 'private';

                  // DM mode: show self + partner
                  if (dmWith) {
                    const dmPartner = allMembers.find(m => m.id === dmWith);
                    const selfMember = allMembers.find(m => m.id === me);
                    const dmPair = [dmPartner, selfMember].filter(Boolean);
                    return (
                      <div className="chat-fp-members">
                        <div className="chat-fp-section-title">
                          {window.t?.('chat_members')||'Üyeler'} <span>{dmPair.length}</span>
                        </div>
                        {dmPair.map(m => {
                          const mStatus = m.id === me ? 'online' : (statuses.get(m.id) || (online.has(m.id) ? 'online' : 'offline'));
                          return (
                            <div key={m.id} className="chat-fp-member-row" style={{ cursor: 'default' }}>
                              <div style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
                                <Avatar member={m} size="sm" />
                                <span style={{ position: 'absolute', bottom: -1, right: -1 }}>
                                  <StatusDot status={mStatus} />
                                </span>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {m.name}
                                  {m.id === me && <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontWeight: 400 }}>({window.t?.('chat_you')||'siz'})</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  const memberCount = channelMembers.length || (detail?.member_count ?? allMembers.length);
                  // For public channels with no detail loaded yet, fall back to workspace members
                  const fallback = !detail;
                  return (
                    <div className="chat-fp-members">
                      <div className="chat-fp-section-title">
                        {window.t?.('chat_members')||'Üyeler'} <span>{memberCount}</span>
                        {canManage && (
                          <button
                            className="icon-btn"
                            style={{ marginLeft: 'auto', padding: 4, color: 'var(--accent)' }}
                            title={window.t?.('chat_add_member')||'Üye Ekle'}
                            onClick={() => setAddMemberOpen(true)}
                          ><Icon name="plus" size={12} /></button>
                        )}
                      </div>
                      {isPrivate && (
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="lock" size={10} /> {window.t?.('chat_private_label')||'Özel kanal · sadece davetli üyeler'}
                        </div>
                      )}
                      {(fallback ? allMembers.map(m => ({ user_id: m.id, name: m.name, role: m.id === me ? 'member' : 'member' })) : channelMembers).map(cm => {
                        const m = allMembers.find(am => am.id === cm.user_id) || { id: cm.user_id, name: cm.name };
                        const mStatus = m.id === me ? 'online' : (statuses.get(m.id) || (online.has(m.id) ? 'online' : 'offline'));
                        const isSelf = m.id === me;
                        const canActOnRow = !isSelf && canManage && cm.role !== 'owner';
                        return (
                          <div key={m.id} className="chat-fp-member-row" style={{ cursor: 'default' }}>
                            <div style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
                              <Avatar member={m} size="sm" />
                              <span style={{ position: 'absolute', bottom: -1, right: -1 }}>
                                <StatusDot status={mStatus} />
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {m.name}
                                {isSelf && <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontWeight: 400 }}>({window.t?.('chat_you')||'siz'})</span>}
                                {m.ws_role !== 'owner' && <RoleBadge role={cm.role} />}
                              </div>
                              {/* Workspace role subtitle */}
                              {m.ws_role === 'owner' ? (
                                <span style={{
                                  fontSize: 10.5, fontWeight: 600,
                                  background: 'linear-gradient(90deg, oklch(62% 0.18 295), oklch(58% 0.20 320))',
                                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                  backgroundClip: 'text',
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                }}>
                                  {window.t?.('chat_founder') || 'Kurucu'}
                                </span>
                              ) : (m.role_name || m.role) ? (
                                <span style={{
                                  fontSize: 10.5, fontWeight: 500,
                                  color: m.role_color || 'var(--ink-faint)',
                                  background: m.role_color ? `${m.role_color}20` : 'transparent',
                                  padding: m.role_color ? '1px 5px' : '0',
                                  borderRadius: m.role_color ? '4px' : '0',
                                  display: 'inline-block',
                                }}>
                                  {m.role_name || m.role}
                                </span>
                              ) : (
                                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{_statusLabel(mStatus)}</div>
                              )}
                            </div>
                            {!isSelf && (
                              <button
                                className="icon-btn"
                                title="Aksiyonlar"
                                style={{ padding: 4, color: 'var(--ink-muted)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setMemberRowMenu({
                                    x: rect.left - 160,
                                    y: rect.bottom + 4,
                                    cm,
                                    member: m,
                                    canRemove: canActOnRow,
                                    canChangeRole: isOwner && cm.role !== 'owner',
                                  });
                                }}
                              ><Icon name="moreH" size={12} /></button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {rightTab === 'media' && (
                  <MediaGallery allMembers={allMembers} onImageClick={setLightbox} />
                )}
                {rightTab === 'starred' && (() => {
                  const list = starredScope === 'all'
                    ? [...starredData].reverse()
                    : [...starredData].reverse().filter(m => {
                        if (m.to) return false; // skip DM starred when viewing channel
                        return (m.channel || 'general') === (activeChannel || 'general');
                      });
                  return (
                    <div className="chat-fp-pinned">
                      <div className="chat-fp-section-title">{window.t?.('chat_starred_count')||'Yıldızlanmış'} <span>{list.length}</span></div>
                      <div className="chat-scope-toggle">
                        <button data-active={starredScope === 'channel'} onClick={() => setStarredScope('channel')}>{window.t?.('chat_this_channel')||'Bu kanal'}</button>
                        <button data-active={starredScope === 'all'} onClick={() => setStarredScope('all')}>{window.t?.('chat_all_channels')||'Tüm kanallar'}</button>
                      </div>
                      {list.length === 0 ? (
                        <div className="chat-empty" style={{ padding: 16 }}>{window.t?.('chat_no_starred')||'Henüz yıldızlanmış mesaj yok.'}</div>
                      ) : (
                        list.map(msg => {
                          const sender = allMembers.find(m => m.id === msg.from);
                          const msgCh = msg.to ? null : (msg.channel || 'general');
                          const chMeta = msgCh ? (channels.find(c => c.id === msgCh) || { id: msgCh, name: msgCh }) : null;
                          return (
                            <div key={msg.id} className="chat-fp-pinned-item" onClick={() => scrollToMessage(msg)} style={{ cursor: 'pointer' }}>
                              <div className="chat-fp-pinned-head">
                                <Icon name="star" size={11} style={{ color: 'var(--status-yellow)' }} />
                                <strong>{sender?.name || msg.from}</strong>
                                {chMeta && (
                                  <span
                                    className="chat-channel-chip"
                                    data-active={msgCh === activeChannel}
                                    title={`#${chMeta.name} ${window.t?.('chat_go_to_channel')||'kanalına git'}`}
                                    onClick={(e) => { e.stopPropagation(); setDmWith(null); setTab('general'); setActiveChannel(msgCh); }}
                                  >#{chMeta.name}</span>
                                )}
                                <span className="chat-fp-pinned-time">{fmtMsgDateTime(msg)}</span>
                                <button onClick={(e) => { e.stopPropagation(); toggleStar(msg); }} className="icon-btn" style={{ padding: 2, marginLeft: 'auto' }} title={window.t?.('chat_remove')||'Kaldır'}>
                                  <Icon name="x" size={11} />
                                </button>
                              </div>
                              <div className="chat-fp-pinned-body">
                                {msg.deleted
                                  ? <em style={{ color: 'var(--ink-faint)' }}>{window.t?.('chat_deleted_msg')||'Bu mesaj silindi'}</em>
                                  : msg.file_url ? <span>📎 {msg.file_name || (window.t?.('chat_file')||'Dosya')}</span> : msg.text}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })()}
                {rightTab === 'pinned' && (() => {
                  const list = dmWith
                    ? pinnedMessages
                    : (pinnedScope === 'all' ? pinnedAllChannels : pinnedMessages);
                  return (
                    <div className="chat-fp-pinned">
                      <div className="chat-fp-section-title">
                        {pinnedScope === 'all' && !dmWith ? (window.t?.('chat_all_pinned')||'Tüm sabitliler') : (window.t?.('chat_channel_pinned')||'Kanala sabitli')} <span>{list.length}</span>
                      </div>
                      {!dmWith && (
                        <div className="chat-scope-toggle">
                          <button data-active={pinnedScope === 'channel'} onClick={() => setPinnedScope('channel')}>{window.t?.('chat_this_channel')||'Bu kanal'}</button>
                          <button data-active={pinnedScope === 'all'} onClick={() => setPinnedScope('all')}>{window.t?.('chat_all_channels')||'Tüm kanallar'}</button>
                        </div>
                      )}
                      {list.length === 0 ? (
                        <div className="chat-empty" style={{ padding: 16 }}>{window.t?.('chat_no_pinned')||'Henüz sabitlenmiş mesaj yok.'}<br /><span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{window.t?.('chat_pinned_hint')||'Bir mesajda ⋯ menüsünden "Kanala sabitle" seçeneğini kullanın.'}</span></div>
                      ) : (
                        list.map(msg => {
                          const sender = allMembers.find(m => m.id === msg.from);
                          const msgCh = msg.to ? null : (msg.channel || 'general');
                          const chMeta = msgCh ? (channels.find(c => c.id === msgCh) || { id: msgCh, name: msgCh }) : null;
                          return (
                            <div key={msg.id} className="chat-fp-pinned-item" onClick={() => scrollToMessage(msg)} style={{ cursor: 'pointer' }}>
                              <div className="chat-fp-pinned-head">
                                <Icon name="pin" size={11} style={{ color: 'var(--accent)' }} />
                                <strong>{sender?.name || msg.from}</strong>
                                {chMeta && pinnedScope === 'all' && (
                                  <span
                                    className="chat-channel-chip"
                                    data-active={msgCh === activeChannel}
                                    title={`#${chMeta.name} ${window.t?.('chat_go_to_channel')||'kanalına git'}`}
                                    onClick={(e) => { e.stopPropagation(); setDmWith(null); setTab('general'); setActiveChannel(msgCh); }}
                                  >#{chMeta.name}</span>
                                )}
                                <span className="chat-fp-pinned-time">{fmtMsgDateTime(msg)}</span>
                                <button onClick={(e) => { e.stopPropagation(); togglePin(msg); }} className="icon-btn" style={{ padding: 2, marginLeft: 'auto' }} title={window.t?.('chat_remove')||'Kaldır'}>
                                  <Icon name="x" size={11} />
                                </button>
                              </div>
                              <div className="chat-fp-pinned-body">
                                {msg.deleted
                                  ? <em style={{ color: 'var(--ink-faint)' }}>{window.t?.('chat_deleted_msg')||'Bu mesaj silindi'}</em>
                                  : msg.file_url ? <span>📎 {msg.file_name || (window.t?.('chat_file')||'Dosya')}</span> : msg.text}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })()}
              </div>
            </aside>
          )}
        </div>
        );
      })()}

      {/* ═════════════════ SLIDE-OUT (original) ═════════════════ */}
      {!fullPage && (
      <>

        {/* Header */}
        <div className="chat-head">
          {dmWith ? (
            <>
              <button className="icon-btn" onClick={backToGeneral}><Icon name="chevronLeft" size={16} /></button>
              <div style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
                <Avatar member={dmUser} size="sm" />
                <span style={{ position: 'absolute', bottom: -1, right: -1 }}>
                  <StatusDot status={statuses.get(dmWith) || (online.has(dmWith) ? 'online' : 'offline')} />
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="chat-head-title">{dmUser?.name || dmWith}</div>
                <div style={{ fontSize: 11, lineHeight: 1.2, color: 'var(--ink-faint)' }}>
                  {_statusLabel(statuses.get(dmWith) || (online.has(dmWith) ? 'online' : 'offline'))}
                </div>
              </div>
              <button
                className="icon-btn"
                style={{ flexShrink: 0, color: mutedUsers.has(dmWith) ? 'var(--status-rose)' : 'var(--ink-muted)' }}
                title={mutedUsers.has(dmWith) ? (window.t?.('chat_unmute')||'Bildirimleri aç') : (window.t?.('chat_mute')||'Bildirimleri sustur')}
                onClick={() => toggleMute(dmWith)}
              >
                <Icon name={mutedUsers.has(dmWith) ? 'bellOff' : 'bell'} size={14} />
              </button>
            </>
          ) : (
            <span className="chat-head-title" style={{ flex: 1 }}>{window.t?.('chat_conversations')||'Sohbetler'}</span>
          )}
          {onExpand && (
            <button
              className="icon-btn"
              style={{ flexShrink: 0 }}
              title={window.t?.('chat_expand')||'Tam ekranda aç'}
              onClick={onExpand}
            >
              <Icon name="expand" size={13} />
            </button>
          )}
          <button className="icon-btn" style={{ flexShrink: 0 }} onClick={onClose} title="Kapat">
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Tabs */}
        {!dmWith && (
          <div className="chat-tabs">
            {(() => {
              const fmtBadge = (n) => n > 99 ? '+99' : `+${n}`;
              const generalCount = (unreadCounts || {})[wsId ? `general_${wsId}` : 'general'] || 0;
              const totalDm = Object.entries(unreadCounts || {}).filter(([k]) => k.startsWith('dm_')).reduce((s, [,v]) => s + v, 0);
              const mediaCount = (unreadCounts || {}).media || 0;
              return (<>
                <button data-active={tab === 'general'} onClick={() => setTab('general')}>
                  <Icon name="users" size={13} /> {window.t?.('chat_tab_general')||'Genel'}
                  {generalCount > 0 && (
                    <span className="chat-tab-count" style={{ background: 'var(--status-rose)' }}>
                      {fmtBadge(generalCount)}
                    </span>
                  )}
                </button>
                <button data-active={tab === 'dm'} onClick={() => setTab('dm')}>
                  <Icon name="msg" size={13} /> {window.t?.('chat_tab_dm')||'Direkt'}
                  {totalDm > 0 && <span className="chat-tab-count" style={{ background: 'var(--status-rose)' }}>{fmtBadge(totalDm)}</span>}
                </button>
                <button data-active={tab === 'media'} onClick={() => setTab('media')}>
                  <Icon name="paperclip" size={13} /> {window.t?.('chat_tab_media')||'Medya'}
                  {mediaCount > 0 && <span className="chat-tab-count" style={{ background: 'var(--status-rose)' }}>{fmtBadge(mediaCount)}</span>}
                </button>
                <button data-active={tab === 'starred'} onClick={() => setTab('starred')}>
                  <Icon name="star" size={13} /> {window.t?.('chat_tab_starred')||'Yıldız'}
                  {starredMsgs.size > 0 && <span className="chat-tab-count">{starredMsgs.size}</span>}
                </button>
              </>);
            })()}
          </div>
        )}

        {/* Media gallery tab */}
        {!dmWith && tab === 'media' ? (
          <MediaGallery allMembers={allMembers} onImageClick={setLightbox} />
        ) : !dmWith && tab === 'starred' ? (
          <div className="chat-starred-list">
            <div className="chat-scope-toggle" style={{ margin: '8px 12px' }}>
              <button data-active={starredScope === 'channel'} onClick={() => setStarredScope('channel')}>{window.t?.('chat_this_channel')||'Bu kanal'}</button>
              <button data-active={starredScope === 'all'} onClick={() => setStarredScope('all')}>{window.t?.('chat_all_channels')||'Tüm kanallar'}</button>
            </div>
            {(() => {
              const list = starredScope === 'all'
                ? [...starredData].reverse()
                : [...starredData].reverse().filter(m => !m.to && (m.channel || 'general') === (activeChannel || 'general'));
              if (list.length === 0) return <div className="chat-empty">{window.t?.('chat_no_starred')||'Henüz yıldızlanmış mesaj yok.'}</div>;
              return list.map(msg => {
                const sender = allMembers.find(m => m.id === msg.from);
                const isMine = msg.from === me;
                const msgCh = msg.to ? null : (msg.channel || 'general');
                const chMeta = msgCh ? (channels.find(c => c.id === msgCh) || { id: msgCh, name: msgCh }) : null;
                return (
                  <div key={msg.id} className="chat-starred-item" onClick={() => scrollToMessage(msg)} style={{ cursor: 'pointer' }}>
                    <div className="chat-starred-meta">
                      <Avatar member={sender} size="sm" />
                      <span className="chat-starred-name">{isMine ? (window.t?.('chat_you_me')||'Sen') : (sender?.name || msg.from)}</span>
                      {chMeta && (
                        <span
                          className="chat-channel-chip"
                          data-active={msgCh === activeChannel}
                          title={`#${chMeta.name} ${window.t?.('chat_go_to_channel')||'kanalına git'}`}
                          onClick={(e) => { e.stopPropagation(); setDmWith(null); setTab('general'); setActiveChannel(msgCh); }}
                        >#{chMeta.name}</span>
                      )}
                      <span className="chat-starred-time">{fmtMsgTime(msg)}</span>
                      <button className="icon-btn" style={{ marginLeft: 'auto', color: 'var(--status-yellow)' }}
                        onClick={(e) => { e.stopPropagation(); toggleStar(msg); }}>
                        <Icon name="star" size={13} />
                      </button>
                    </div>
                    <div className="chat-starred-body">
                      {msg.deleted
                        ? <em style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{window.t?.('chat_deleted_msg')||'Bu mesaj silindi'}</em>
                        : msg.file_url
                          ? <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>📎 {msg.file_name || (window.t?.('chat_file')||'Dosya')}</span>
                          : <span>{msg.text}</span>}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : !dmWith && tab === 'dm' ? (
          /* DM member list */
          <div className="chat-member-list">
            {members.length === 0 ? (
              <div className="chat-empty">{window.t?.('chat_no_members_yet')||'Henüz başka üye yok.'}</div>
            ) : members.map(m => {
              const mStatus = statuses.get(m.id) || (online.has(m.id) ? 'online' : 'offline');
              const dmUnread = (unreadCounts || {})[`dm_${m.id}`] || 0;
              return (
                <div key={m.id} className="chat-member-row" onClick={() => openDm(m.id)}>
                  <div style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
                    <Avatar member={m} size="sm" />
                    <span style={{ position: 'absolute', bottom: -1, right: -1 }}>
                      <StatusDot status={mStatus} />
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: dmUnread > 0 ? 600 : 500 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                      {_statusLabel(mStatus)}
                    </div>
                  </div>
                  {dmUnread > 0 ? (
                    <span style={{
                      minWidth: 18, height: 18, borderRadius: 9,
                      background: 'var(--status-rose)', color: 'white',
                      fontSize: 10, fontWeight: 700, lineHeight: '18px',
                      textAlign: 'center', padding: '0 5px', flexShrink: 0,
                    }}>
                      {dmUnread > 9 ? '9+' : dmUnread}
                    </span>
                  ) : (
                    <Icon name="chevronRight" size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="chat-messages">
              {!pinnedBannerHidden && (
                <PinnedBanner
                  pinned={pinnedMessages}
                  allMembers={allMembers}
                  onJump={scrollToMessage}
                  onUnpin={togglePin}
                  onClose={() => setPinnedBannerHidden(true)}
                />
              )}
              {dmWith && mentionTaskRef && (
                <div className="chat-task-ref-banner">
                  <Icon name="listChecks" size={13} />
                  <span>{window.t?.('chat_mentioned_in')||'Bahsedildi:'} <strong>{mentionTaskRef.title}</strong></span>
                  <button onClick={() => setMentionTaskRef(null)}><Icon name="x" size={12} /></button>
                </div>
              )}
              {messages.length === 0 && (
                <div className="chat-empty">
                  {dmWith ? `${dmUser?.name || dmWith} ${window.t?.('chat_dm_start')||'ile sohbet başlat.'}` : (window.t?.('chat_general_first')||'Genel kanala ilk mesajı gönder.')}
                </div>
              )}
              {messages.map((msg, i) => {
                const isMine = msg.from === me;
                const sender = allMembers.find(m => m.id === msg.from);
                const prevMsg = messages[i - 1];
                const showSender = !isMine && (!prevMsg || prevMsg.from !== msg.from);
                const canDelete = !msg._temp && !msg.deleted;
                const dateKey = msgDateKey(msg);
                const prevDateKey = prevMsg ? msgDateKey(prevMsg) : null;
                const showDateSep = dateKey && dateKey !== prevDateKey;
                const msgKey = String(msg.id);
                const msgReactions = reactions[msgKey] || {};
                const hasReactions = Object.keys(msgReactions).length > 0;
                return (
                  <React.Fragment key={msg.id || i}>
                  {showDateSep && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', margin:'4px 0' }}>
                      <div style={{ flex:1, height:1, background:'var(--line-strong)' }} />
                      <span style={{ fontSize:11, color:'var(--ink-muted)', fontWeight:500, flexShrink:0 }}>{fmtDateSep(dateKey)}</span>
                      <div style={{ flex:1, height:1, background:'var(--line-strong)' }} />
                    </div>
                  )}
                  <div className={`chat-msg ${isMine ? 'mine' : 'theirs'}`}
                    data-msgid={msg.id}
                    style={{ position: 'relative', scrollMarginTop: 60 }}
                  >
                    {!isMine && (
                      <div className="chat-msg-avatar" style={{ visibility: showSender ? 'visible' : 'hidden' }}>
                        <Avatar member={sender} size="sm" />
                      </div>
                    )}
                    <div className="chat-bubble-wrap">
                      {showSender && !isMine && (
                        <div className="chat-sender-name">{sender?.name || msg.from} <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontWeight: 400, marginLeft: 4 }}>{fmtMsgTime(msg)}</span></div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isMine ? 'row-reverse' : 'row' }}>
                        <div className={`chat-bubble ${msg._temp ? 'chat-bubble-sending' : ''} ${msg.deleted ? 'chat-bubble-deleted' : ''}`}>
                          {!msg.deleted && msg.reply_to && (
                            <ReplyPreview reply={msg.reply_to} mine={isMine} compact onJump={scrollToMessage} />
                          )}
                          {msg.deleted
                            ? <span style={{ fontStyle: 'italic', color: 'var(--ink-faint)', fontSize: 12 }}>Bu mesaj silindi</span>
                            : <MsgContent msg={{ ...msg, _onMentionClick: handleMentionClick }} onImageClick={setLightbox} />
                          }
                          {starredMsgs.has(String(msg.id)) && (
                            <span style={{ position: 'absolute', top: 4, right: 6, fontSize: 10, color: 'var(--status-yellow)', pointerEvents: 'none' }}>★</span>
                          )}
                        </div>
                        {canDelete && (
                          <>
                            <button
                              className="chat-msg-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setDeleteMenu({ msgId: msg.id, isMine, starred: starredMsgs.has(String(msg.id)), pinned: !!msg.pinned, msg, x: isMine ? rect.left - 160 : rect.right + 4, y: rect.top });
                              }}
                            >
                              <Icon name="chevronDown" size={12} />
                            </button>
                            <button
                              className="chat-msg-react-btn"
                              onClick={(e) => openEmojiPicker(e, msg.id)}
                              title="Reaksiyon ekle"
                            >
                              😊
                            </button>
                          </>
                        )}
                      </div>
                      {hasReactions && (
                        <div className="chat-reactions">
                          {Object.entries(msgReactions).map(([emoji, users]) => (
                            <button
                              key={emoji}
                              className="chat-reaction-btn"
                              data-mine={users.includes(me)}
                              onClick={() => toggleReaction(msgKey, emoji)}
                              title={users.map(u => allMembers.find(m => m.id === u)?.name || u).join(', ')}
                            >
                              {emoji}<span>{users.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!showSender && <div className="chat-msg-time">{fmtMsgTime(msg)}</div>}
                      {isMine && dmWith && msg.id === lastReadSentId && (
                        <div className="chat-read-receipt">
                          <span className="chat-read-label">{window.t?.('chat_seen')||'Görüldü'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
              {typingUsers.size > 0 && dmWith && (
                <div className="chat-typing-indicator">
                  <div className="chat-typing-avatars">
                    {[...typingUsers].map(slug => {
                      const m = allMembers.find(x => x.id === slug);
                      return m ? <Avatar key={slug} member={m} size="sm" /> : null;
                    })}
                  </div>
                  <span className="typing-dots"><span /><span /><span /></span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Pending file preview */}
            {pendingFile && (
              <div className="chat-pending-file">
                {pendingFile.type === 'image' && (
                  <img src={pendingFile.url} alt="" style={{ height: 64, borderRadius: 6, objectFit: 'cover' }} />
                )}
                {pendingFile.type === 'video' && (
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="video" size={14} /> {pendingFile.name}
                  </div>
                )}
                {pendingFile.type === 'file' && (
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="paperclip" size={14} /> {pendingFile.name} ({fmtSize(pendingFile.size)})
                  </div>
                )}
                <button className="icon-btn" onClick={() => setPendingFile(null)} style={{ marginLeft: 'auto', color: 'var(--status-rose)' }}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            )}

            {/* @mention autocomplete dropdown */}
            {mentionOpen && mentionMembers.current.length > 0 && (
              <div style={{
                position: 'relative', margin: '0 12px 4px',
                background: 'var(--bg-raised)', border: '1px solid var(--line)',
                borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px oklch(0% 0 0 / 0.12)',
                zIndex: 10,
              }}>
                <div style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)' }}>
                  Bahset
                </div>
                {mentionMembers.current.slice(0, 6).map((m, i) => (
                  <div key={m.id}
                    onMouseDown={ev => { ev.preventDefault(); insertMention(m); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px', cursor: 'pointer',
                      background: i === mentionIdx ? 'var(--accent-soft)' : 'transparent',
                    }}
                    onMouseEnter={() => setMentionIdx(i)}
                  >
                    <Avatar member={m} size="sm" />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{m.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>@{m.id}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="chat-input-wrap">
              <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={handleFileChange}
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" />
              <ReplyPreview reply={replyTo} onClose={() => setReplyTo(null)} onJump={scrollToMessage} />
              <button
                className="icon-btn"
                title={window.t?.('chat_attach')||'Dosya / Fotoğraf / Video ekle'}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ flexShrink: 0, color: uploading ? 'var(--accent)' : 'var(--ink-muted)' }}
              >
                {uploading ? <span style={{ fontSize: 11 }}>⏳</span> : <Icon name="paperclip" size={16} />}
              </button>
              <textarea
                ref={inputRef}
                className="chat-input"
                placeholder={pendingFile ? (window.t?.('chat_desc_ph')||'Açıklama ekle (isteğe bağlı)…') : (dmWith ? `${dmUser?.name || dmWith}${window.t?.('chat_write_dm') || ' — mesaj yaz...'}` : (window.t?.('chat_write_general')||'Genel kanala yaz...'))}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                className="btn btn-primary"
                onClick={sendMessage}
                disabled={!text.trim() && !pendingFile}
                style={{ flexShrink: 0, padding: '7px 10px', borderRadius: 8 }}
              >
                <Icon name="send" size={14} />
              </button>
            </div>
          </>
        )}
      </>
      )}
      </div>
    </>
  );
}

function _statusLabel(status) {
  const m = { online: window.t?.('shell_status_online')||'Çevrimiçi', away: window.t?.('shell_status_away')||'Uzakta', dnd: window.t?.('shell_status_dnd')||'Rahatsız Etme', offline: window.t?.('shell_status_offline')||'Çevrimdışı' };
  return m[status] || m.offline;
}

window.ChatPanel = ChatPanel;
window.StatusDot = StatusDot;
window._statusLabel = _statusLabel;
window.ConfirmModal = ConfirmModal;
