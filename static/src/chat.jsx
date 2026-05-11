// Team chat panel — real-time DM + group chat, file/image/video sharing

const { useState: useChatS, useEffect: useChatE, useRef: useChatRef, useCallback: useChatCb } = React;

// ── Lightbox ──────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  useChatE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'oklch(0% 0 0 / 0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'zoom-out',
    }}>
      <img src={src} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
      <button onClick={onClose} style={{
        position: 'absolute', top: 18, right: 22, background: 'oklch(20% 0 0 / 0.6)',
        color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 18,
      }}>✕</button>
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

// ── Time formatter (converts UTC ISO timestamp to local HH:MM) ────────────
function fmtMsgTime(msg) {
  const raw = msg.ts || msg.created_at;
  if (raw) {
    try {
      const iso = (raw.endsWith('Z') || raw.includes('+')) ? raw : raw + 'Z';
      return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch(e) {}
  }
  return msg.time || '';
}
// ── Full date+time formatter for media/links ──────────────────────────────
function fmtMsgDateTime(msg) {
  const raw = msg.ts || msg.created_at;
  if (raw) {
    try {
      const iso = (raw.endsWith('Z') || raw.includes('+')) ? raw : raw + 'Z';
      const d = new Date(iso);
      const TR_MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
      const dateStr = `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
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
  const titles = { online: 'Çevrimiçi', away: 'Uzakta', dnd: 'Rahatsız Etme', offline: 'Çevrimdışı' };
  return (
    <span title={titles[status] || 'Çevrimdışı'} style={{
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
    message: msg.text || msg.file_name || 'Dosya',
    meta: {
      sender: sender?.name || msg.from || 'Yeni mesaj',
      channel: msg.to ? 'Direkt mesaj' : 'Genel kanal',
      time: msg.time || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    },
  };
}

function MsgContent({ msg, onImageClick }) {
  if (msg.file_type === 'image') {
    return (
      <div className="chat-media-wrap">
        <img
          src={msg.file_url} alt={msg.file_name || 'Resim'}
          className="chat-media-img"
          onClick={() => onImageClick(msg.file_url)}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex');
          }}
        />
        <div style={{ display: 'none', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-dim)', color: 'var(--ink-muted)', fontSize: 12 }}>
          <Icon name="eyeOff" size={14} />
          <span>{msg.file_name || 'Görsel bulunamadı'}</span>
        </div>
        {msg.text && <div className="chat-bubble-text">{msg.text}</div>}
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 3 }}>{fmtMsgDateTime(msg)}</div>
      </div>
    );
  }
  if (msg.file_type === 'video') {
    return (
      <div className="chat-media-wrap">
        <video src={msg.file_url} controls className="chat-media-video"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const el = e.currentTarget.nextSibling;
            if (el) el.style.display = 'flex';
          }}
        />
        <div style={{ display: 'none', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-dim)', color: 'var(--ink-muted)', fontSize: 12 }}>
          <Icon name="paperclip" size={14} />
          <span>{msg.file_name || 'Video bulunamadı'}</span>
        </div>
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
  return <span>{msg.text}</span>;
}

// ── Media Gallery Tab ─────────────────────────────────────────────────────
function MediaList({ media, allMembers, onImageClick }) {
  if (media.length === 0) return (
    <div className="chat-empty" style={{ padding: 24 }}>Henüz paylaşılan medya yok.</div>
  );
  const images = media.filter(m => m.file_type === 'image');
  const videos = media.filter(m => m.file_type === 'video');
  const files  = media.filter(m => m.file_type === 'file');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {images.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Fotoğraflar ({images.length})
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
            Videolar ({videos.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {videos.map(m => {
              const sender = allMembers.find(u => u.id === m.from);
              return (
                <div key={m.id} style={{ background: 'var(--bg-dim)', borderRadius: 8, padding: 8 }}>
                  <video src={m.file_url} controls style={{ width: '100%', borderRadius: 6, maxHeight: 180 }} />
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>
                    {sender?.name || m.from} · {fmtMsgDateTime(m)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Dosyalar ({files.length})
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
          ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: 'var(--ink-faint)', fontSize: 13 }}>Yükleniyor…</div>
          : <MediaList media={media} allMembers={allMembers} onImageClick={onImageClick} />
        }
      </div>
    </div>
  );
}

// ── Main Chat Panel ───────────────────────────────────────────────────────
function ChatPanel({ open, onClose, onlineUsers, onlineStatuses, members: membersProp, socket, initialDmWith, unreadCounts, markAsRead, wsId, highlightMsgId }) {
  const [tab, setTab]             = useChatS('general');
  const [dmWith, setDmWith]       = useChatS(null);
  const [messages, setMessages]   = useChatS([]);
  const [text, setText]           = useChatS('');
  const [typingUser, setTypingUser] = useChatS(null);
  const [uploading, setUploading] = useChatS(false);
  const [lightbox, setLightbox]   = useChatS(null);
  const [pendingFile, setPendingFile] = useChatS(null);
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

  const bottomRef   = useChatRef(null);
  const typingTimer = useChatRef(null);
  const inputRef    = useChatRef(null);
  const fileRef     = useChatRef(null);
  const msgIds      = useChatRef(new Set());
  const prevOpenRef = useChatRef(false);

  const me = window.CURRENT_USER?.id;
  const allMembers = membersProp || DATA.MEMBERS || [];
  const members = allMembers.filter(m => m.id !== me);
  const dmUser = dmWith ? allMembers.find(m => m.id === dmWith) : null;
  const online = onlineUsers || new Set();
  const statuses = onlineStatuses || new Map();

  // @mention autocomplete
  const [mentionOpen, setMentionOpen] = useChatS(false);
  const [mentionQuery, setMentionQuery] = useChatS('');
  const [mentionIdx, setMentionIdx]   = useChatS(0);
  const mentionMembers = useChatRef([]);
  mentionMembers.current = mentionQuery
    ? allMembers.filter(m => m.id !== me && (m.name.toLowerCase().includes(mentionQuery.toLowerCase()) || m.id.toLowerCase().includes(mentionQuery.toLowerCase())))
    : allMembers.filter(m => m.id !== me);

  // Handle open/initialDmWith changes
  useChatE(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;
    if (initialDmWith) {
      if (initialDmWith !== dmWith) {
        setDmWith(initialDmWith);
        setMessages([]);
        setTab('dm');
      }
    } else if (!wasOpen) {
      // opened via sidebar chat button without a DM target → reset to general
      setDmWith(null);
      setMessages([]);
      setTab('general');
    }
  }, [open, initialDmWith]);

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
    } else if (tab === 'general') {
      const key = wsId ? `general_${wsId}` : 'general';
      markAsRead(key);
    } else if (tab === 'media') {
      markAsRead('media');
    }
  }, [open, dmWith, tab, wsId]);

  // ── Load history — AbortController prevents stale responses on rapid DM switches ──
  // wsId in deps so general messages reload when workspace switches
  useChatE(() => {
    if (!open) return;
    const controller = new AbortController();
    msgIds.current = new Set();
    const url = dmWith ? `/api/chat/messages?with=${dmWith}` : '/api/chat/messages';
    fetch(url, { signal: controller.signal })
      .then(r => r.json())
      .then(msgs => {
        if (!Array.isArray(msgs)) return;
        msgs.forEach(m => msgIds.current.add(String(m.id)));
        setMessages(msgs);
      })
      .catch(err => { if (err.name !== 'AbortError') setMessages([]); });
    return () => controller.abort();
  }, [open, dmWith, wsId]);

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
      // Check relevance
      let relevant = false;
      if (dmWith) {
        relevant = (msg.from === dmWith && msg.to === me) || (msg.from === me && msg.to === dmWith);
      } else {
        relevant = !msg.to;
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

    };

    const onTyping = ({ user, typing }) => {
      if (user === dmWith) {
        setTypingUser(typing ? user : null);
        if (typing) {
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTypingUser(null), 3000);
        }
      }
    };

    const onMsgDeleted = ({ id, scope }) => {
      if (scope === 'all') {
        setMessages(prev => prev.map(m => String(m.id) === String(id) ? { ...m, deleted: true, text: '', file_url: undefined } : m));
      } else {
        setMessages(prev => prev.filter(m => String(m.id) !== String(id)));
      }
    };

    sock.on('chat_message', onMsg);
    sock.on('typing', onTyping);
    sock.on('message_deleted', onMsgDeleted);
    return () => {
      sock.off('chat_message', onMsg);
      sock.off('typing', onTyping);
      sock.off('message_deleted', onMsgDeleted);
    };
  }, [socket, dmWith, me]);

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

    const tempId  = `temp_${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const tempMsg = {
      id: tempId,
      from: me, to: dmWith || null,
      text: t,
      time: nowTime,
      ts: new Date().toISOString(),
      file_url:  pendingFile?.url  || undefined,
      file_type: pendingFile?.type || undefined,
      file_name: pendingFile?.name || undefined,
      _temp: true,
    };
    setMessages(prev => [...prev, tempMsg]);
    const sentText = t;
    const sentFile = pendingFile;
    setText('');
    setPendingFile(null);
    setMentionOpen(false);

    try {
      const body = { text: sentText, to: dmWith || null };
      if (sentFile) {
        body.file_url  = sentFile.url;
        body.file_type = sentFile.type;
        body.file_name = sentFile.name;
      }
      const saved = await API.sendChatMessage(body);
      msgIds.current.add(String(saved.id));
      setMessages(prev => prev.map(m => m.id === tempId ? saved : m));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      console.error('Mesaj gönderilemedi:', err.message);
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
      if (!res.ok) { window.showToast?.(data.error || 'Yükleme başarısız', 'error'); return; }
      setPendingFile({ url: data.url, type: data.type, name: data.name, size: data.size });
    } catch (err) {
      window.showToast?.('Yükleme sırasında hata: ' + err.message, 'error');
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

  const openDm = (slug) => { setDmWith(slug); setMessages([]); setTypingUser(null); setPendingFile(null); markAsRead?.(`dm_${slug}`); };
  const backToGeneral = () => { setDmWith(null); setMessages([]); setPendingFile(null); };

  const toggleReaction = (msgId, emoji) => {
    const key = String(msgId);
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
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
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
              {deleteMenu.starred ? 'Yıldızı kaldır' : 'Yıldızla'}
            </button>
            <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
              onClick={() => handleDeleteMessage(deleteMenu.msgId, 'self')}
            >
              <Icon name="eyeOff" size={13} style={{ color: 'var(--ink-muted)' }} /> Benden sil
            </button>
            {deleteMenu.isMine && (
              <button className="chat-menu-item" style={{ borderTop: '1px solid var(--line)', color: 'var(--status-rose)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                onClick={() => handleDeleteMessage(deleteMenu.msgId, 'all')}
              >
                <Icon name="trash" size={13} /> Herkesten sil
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
      <div className="chat-overlay" data-open={open} onClick={onClose} />
      <div className="chat-panel" data-open={open}>

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
                title={mutedUsers.has(dmWith) ? 'Bildirimleri aç' : 'Bildirimleri sustur'}
                onClick={() => toggleMute(dmWith)}
              >
                <Icon name={mutedUsers.has(dmWith) ? 'bellOff' : 'bell'} size={14} />
              </button>
            </>
          ) : (
            <span className="chat-head-title" style={{ flex: 1 }}>Takım Sohbeti</span>
          )}
          <button className="icon-btn" style={{ flexShrink: 0 }} onClick={onClose}>
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
                  <Icon name="users" size={13} /> Genel
                  {generalCount > 0 && (
                    <span className="chat-tab-count" style={{ background: 'var(--status-rose)' }}>
                      {fmtBadge(generalCount)}
                    </span>
                  )}
                </button>
                <button data-active={tab === 'dm'} onClick={() => setTab('dm')}>
                  <Icon name="msg" size={13} /> Direkt
                  {totalDm > 0 && <span className="chat-tab-count" style={{ background: 'var(--status-rose)' }}>{fmtBadge(totalDm)}</span>}
                </button>
                <button data-active={tab === 'media'} onClick={() => setTab('media')}>
                  <Icon name="paperclip" size={13} /> Medya
                  {mediaCount > 0 && <span className="chat-tab-count" style={{ background: 'var(--status-rose)' }}>{fmtBadge(mediaCount)}</span>}
                </button>
                <button data-active={tab === 'starred'} onClick={() => setTab('starred')}>
                  <Icon name="star" size={13} /> Yıldız
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
            {starredData.length === 0
              ? <div className="chat-empty">Henüz yıldızlanmış mesaj yok.</div>
              : [...starredData].reverse().map(msg => {
                  const sender = allMembers.find(m => m.id === msg.from);
                  const isMine = msg.from === me;
                  return (
                    <div key={msg.id} className="chat-starred-item">
                      <div className="chat-starred-meta">
                        <Avatar member={sender} size="sm" />
                        <span className="chat-starred-name">{isMine ? 'Sen' : (sender?.name || msg.from)}</span>
                        <span className="chat-starred-time">{fmtMsgTime(msg)}</span>
                        <button className="icon-btn" style={{ marginLeft: 'auto', color: 'var(--status-yellow)' }}
                          onClick={() => toggleStar(msg)}>
                          <Icon name="star" size={13} />
                        </button>
                      </div>
                      <div className="chat-starred-body">
                        {msg.deleted
                          ? <em style={{ color: 'var(--ink-faint)', fontSize: 12 }}>Bu mesaj silindi</em>
                          : msg.file_url
                            ? <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>📎 {msg.file_name || 'Dosya'}</span>
                            : <span>{msg.text}</span>}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        ) : !dmWith && tab === 'dm' ? (
          /* DM member list */
          <div className="chat-member-list">
            {members.length === 0 ? (
              <div className="chat-empty">Henüz başka üye yok.</div>
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
              {messages.length === 0 && (
                <div className="chat-empty">
                  {dmWith ? `${dmUser?.name || dmWith} ile sohbet başlat.` : 'Genel kanala ilk mesajı gönder.'}
                </div>
              )}
              {messages.map((msg, i) => {
                const isMine = dmWith ? msg.to === dmWith : msg.from === me;
                const sender = allMembers.find(m => m.id === msg.from);
                const prevMsg = messages[i - 1];
                const showSender = !isMine && (!prevMsg || prevMsg.from !== msg.from);
                const canDelete = !msg._temp && !msg.deleted;
                const msgKey = String(msg.id);
                const msgReactions = reactions[msgKey] || {};
                const hasReactions = Object.keys(msgReactions).length > 0;
                return (
                  <div key={msg.id || i} className={`chat-msg ${isMine ? 'mine' : 'theirs'}`}
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
                        <div className="chat-sender-name">{sender?.name || msg.from}</div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isMine ? 'row-reverse' : 'row' }}>
                        <div className={`chat-bubble ${msg._temp ? 'chat-bubble-sending' : ''} ${msg.deleted ? 'chat-bubble-deleted' : ''}`}>
                          {msg.deleted
                            ? <span style={{ fontStyle: 'italic', color: 'var(--ink-faint)', fontSize: 12 }}>Bu mesaj silindi</span>
                            : <MsgContent msg={msg} onImageClick={setLightbox} />
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
                                setDeleteMenu({ msgId: msg.id, isMine, starred: starredMsgs.has(String(msg.id)), msg, x: isMine ? rect.left - 160 : rect.right + 4, y: rect.top });
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
                      <div className="chat-msg-time">{fmtMsgTime(msg)}</div>
                    </div>
                  </div>
                );
              })}
              {typingUser && (
                <div className="chat-typing-indicator">
                  <span>{allMembers.find(m => m.id === typingUser)?.name || typingUser} yazıyor</span>
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
              <button
                className="icon-btn"
                title="Dosya / Fotoğraf / Video ekle"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ flexShrink: 0, color: uploading ? 'var(--accent)' : 'var(--ink-muted)' }}
              >
                {uploading ? <span style={{ fontSize: 11 }}>⏳</span> : <Icon name="paperclip" size={16} />}
              </button>
              <textarea
                ref={inputRef}
                className="chat-input"
                placeholder={pendingFile ? 'Açıklama ekle (isteğe bağlı)…' : (dmWith ? `${dmUser?.name || dmWith}'e mesaj yaz...` : 'Genel kanala yaz...')}
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
      </div>
    </>
  );
}

function _statusLabel(status) {
  return { online: 'Çevrimiçi', away: 'Uzakta', dnd: 'Rahatsız Etme', offline: 'Çevrimdışı' }[status] || 'Çevrimdışı';
}

window.ChatPanel = ChatPanel;
window.StatusDot = StatusDot;
window._statusLabel = _statusLabel;
