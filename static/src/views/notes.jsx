// Notes view — workspace-scoped notes with markdown editor, labels, link-to-task.
// Backend-backed via API.listNotes / API.createNote / API.updateNote / API.deleteNote.

const {
  useState: useNS,
  useEffect: useNE,
  useMemo: useNM,
  useRef: useNR,
  useCallback: useNCB,
} = React;

// Tones reused from settings.jsx — kept local to avoid module reference issue.
const NOTE_LABEL_TONES = () => {
  const _t = (k, fb) => window.t?.(k) || fb;
  return [
    { id: 'blue',   label: _t('notes_tone_blue',   'Mavi')       },
    { id: 'rose',   label: _t('notes_tone_rose',   'Kırmızı')    },
    { id: 'amber',  label: _t('notes_tone_amber',  'Sarı')       },
    { id: 'green',  label: _t('notes_tone_green',  'Yeşil')      },
    { id: 'purple', label: _t('notes_tone_purple', 'Mor')        },
    { id: 'teal',   label: _t('notes_tone_teal',   'Turkuaz')    },
    { id: 'orange', label: _t('notes_tone_orange', 'Turuncu')    },
    { id: 'cyan',   label: _t('notes_tone_cyan',   'Camgöbeği') },
    { id: 'pink',   label: _t('notes_tone_pink',   'Pembe')      },
  ];
};

function noteSlugify(s) {
  return (s || '').toLowerCase()
    .replace(/[çÇ]/g,'c').replace(/[ğĞ]/g,'g').replace(/[ıİ]/g,'i')
    .replace(/[öÖ]/g,'o').replace(/[şŞ]/g,'s').replace(/[üÜ]/g,'u')
    .replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
}

function useNoteDebounce(fn, delay) {
  const fnRef = useNR(fn);
  const tRef  = useNR(null);
  useNE(() => { fnRef.current = fn; }, [fn]);
  useNE(() => () => { if (tRef.current) clearTimeout(tRef.current); }, []);
  return useNCB((...args) => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => fnRef.current(...args), delay);
  }, [delay]);
}

// ── Markdown render (inline + block) ─────────────────────────────────────────

function _mdInline(text) {
  if (!text) return null;
  const out = [];
  const RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const s = m[0];
    if (s.startsWith('**')) out.push(<strong key={k++}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith('__')) out.push(<strong key={k++}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith('*')) out.push(<em key={k++}>{s.slice(1, -1)}</em>);
    else if (s.startsWith('`')) out.push(<code key={k++} className="md-inline-code">{s.slice(1, -1)}</code>);
    else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(s);
      if (lm) {
        const safe = /^(https?:\/\/|mailto:|\/)/.test(lm[2]) ? lm[2] : '#';
        out.push(<a key={k++} href={safe} target={safe.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{lm[1]}</a>);
      } else {
        out.push(s);
      }
    }
    last = RE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MarkdownRender({ body }) {
  if (!body || !body.trim()) {
    return <div className="md-empty">{window.t?.('notes_empty') || 'Bu not henüz boş. Yazmaya başla veya editöre geç.'}</div>;
  }
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const start = i + 1;
      let end = start;
      while (end < lines.length && !/^```/.test(lines[end])) end++;
      out.push(<pre key={k++} className="md-code"><code>{lines.slice(start, end).join('\n')}</code></pre>);
      i = end + 1; continue;
    }
    const hm = /^(#{1,3})\s+(.+)$/.exec(line);
    if (hm) {
      const level = hm[1].length;
      const Tag = ['h1','h2','h3'][level - 1];
      out.push(React.createElement(Tag, { key: k++, className: `md-h${level}` }, _mdInline(hm[2])));
      i++; continue;
    }
    if (/^\s*---\s*$/.test(line) || /^\s*\*\*\*\s*$/.test(line)) {
      out.push(<hr key={k++} className="md-hr" />);
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(<blockquote key={k++} className="md-quote">{_mdInline(buf.join(' '))}</blockquote>);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const li = lines[i].replace(/^\s*[-*+]\s+/, '');
        const tm = /^\[([ xX])\]\s+(.*)$/.exec(li);
        if (tm) {
          const done = tm[1].toLowerCase() === 'x';
          items.push(
            <li key={items.length} className="md-todo" data-done={done}>
              <span className="md-todo-box" aria-hidden>{done ? '✓' : ''}</span>
              <span>{_mdInline(tm[2])}</span>
            </li>
          );
        } else {
          items.push(<li key={items.length}>{_mdInline(li)}</li>);
        }
        i++;
      }
      out.push(<ul key={k++} className="md-list">{items}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(<li key={items.length}>{_mdInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>);
        i++;
      }
      out.push(<ol key={k++} className="md-list">{items}</ol>);
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s|>|\s*---\s*$|\s*\*\*\*\s*$|\s*[-*+]\s|\s*\d+\.\s|```)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(<p key={k++} className="md-p">{_mdInline(buf.join(' '))}</p>);
  }
  return <div className="md-body">{out}</div>;
}

// ── Markdown editor (textarea + toolbar) ────────────────────────────────────

function _wrapAtCursor(ta, before, after, placeholder) {
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const val   = ta.value;
  const selected = val.slice(start, end) || placeholder || '';
  const next = val.slice(0, start) + before + selected + after + val.slice(end);
  return { next, newStart: start + before.length, newEnd: start + before.length + selected.length };
}

function _prefixLines(ta, prefix) {
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const val   = ta.value;
  // Expand to whole lines
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const lineEnd   = end + (val.slice(end).indexOf('\n') === -1 ? val.length - end : val.slice(end).indexOf('\n'));
  const block = val.slice(lineStart, lineEnd);
  const lines = block.split('\n').map(l => prefix + l);
  const replaced = lines.join('\n');
  const next = val.slice(0, lineStart) + replaced + val.slice(lineEnd);
  return { next, newStart: lineStart, newEnd: lineStart + replaced.length };
}

const NOTE_EMOJI_CATS = [
  { label: 'Sık Kullanılan', emojis: ['👍','❤️','😂','😮','🔥','🎉','✨','💯','🙌','👏','🤔','😊'] },
  { label: 'Yüzler',         emojis: ['😀','😁','😃','😄','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😎','🥳','🤗','😏','😒','😞','😔','😟','😕','🫤','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤯','😱','😨','😰','😥','😓','🫣','🤫','🤭','🧐','🤓','😴','🥴','🤢','🤧','🥵','🥶','😵','🫠','🤖','👻','💀','👽'] },
  { label: 'El & Vücut',     emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪','🦾','🦿'] },
  { label: 'Nesneler',       emojis: ['🔥','⭐','✨','💫','🌟','🎯','🏆','🥇','🎊','🎉','🎈','🎁','💎','🔑','💡','⚡','🌈','🌺','🍀','🚀','🛸','🎭','🎨','🎵','🎸','🎮','🎲','📌','📎','🔔','🔒','📱','💻','📷','🎬','🔭','🔬','⚙️','🛠️','💊','🧬','🧪','📚','✏️','📝'] },
  { label: 'Yiyecek',        emojis: ['🍕','🍔','🍟','🌮','🌯','🥪','🍣','🍱','🍜','🍝','🍛','🍲','🥗','🥘','🍗','🍖','🥩','🥚','🍳','🧀','🥞','🧇','🥓','🍞','🥐','🥨','🧁','🎂','🍰','🍫','🍬','🍭','🍦','🍧','🍨','☕','🍵','🧃','🥤','🍺','🍻','🥂','🍷','🍸','🍹'] },
  { label: 'Doğa',           emojis: ['🐶','🐱','🦊','🐼','🦁','🐸','🦄','🐉','🌍','🌊','🏔️','🌅','🌃','🏠','🏖️','🌵','🌲','🌳','🌴','🌱','🌿','🍀','🌺','🌸','🌼','🌻','🌞','🌝','🌛','⭐','🌙','☀️','🌤️','⛅','🌧️','⛈️','🌨️','❄️','🌬️','🌪️','🌈'] },
];

function NoteEmojiPicker({ onSelect, onClose }) {
  const [activeTab, setActiveTab] = useNS(0);
  const ref = useNR(null);
  useNE(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div className="note-emoji-picker" ref={ref}>
      <div className="note-emoji-tabs">
        {NOTE_EMOJI_CATS.map((cat, i) => (
          <button key={i} type="button" className="note-emoji-tab" data-active={activeTab === i} onClick={() => setActiveTab(i)} title={cat.label}>
            {cat.emojis[0]}
          </button>
        ))}
      </div>
      <div className="note-emoji-cat-label">{NOTE_EMOJI_CATS[activeTab].label}</div>
      <div className="note-emoji-grid">
        {NOTE_EMOJI_CATS[activeTab].emojis.map((em, i) => (
          <button key={i} type="button" className="note-emoji-btn" onClick={() => { onSelect(em); onClose(); }} title={em}>
            {em}
          </button>
        ))}
      </div>
    </div>
  );
}

function MarkdownEditor({ body, onChange, onBlur, onKeyShortcut, disabled }) {
  const taRef = useNR(null);
  const [emojiOpen, setEmojiOpen] = useNS(false);
  const emojiAnchorRef = useNR(null);

  const apply = (mut) => {
    const ta = taRef.current; if (!ta) return;
    const r = mut(ta);
    if (!r) return;
    onChange(r.next);
    requestAnimationFrame(() => {
      ta.focus();
      try { ta.setSelectionRange(r.newStart, r.newEnd); } catch (_) {}
    });
  };

  const wrap   = (b, a, ph) => apply(ta => _wrapAtCursor(ta, b, a, ph));
  const prefix = (p)         => apply(ta => _prefixLines(ta, p));

  const insertEmoji = (emoji) => {
    const ta = taRef.current;
    if (!ta) { onChange(body + emoji); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next  = body.slice(0, start) + emoji + body.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      try { ta.setSelectionRange(pos, pos); } catch (_) {}
    });
  };

  const handleKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); wrap('**','**','güçlü'); return; }
      if (k === 'i') { e.preventDefault(); wrap('*','*','italik'); return; }
      if (k === 'e') { e.preventDefault(); e.stopPropagation(); wrap('`','`','kod'); return; }
      if (k === 'k') { e.preventDefault(); wrap('[', '](https://)','link'); return; }
      if (k === '1') { e.preventDefault(); prefix('# '); return; }
      if (k === '2') { e.preventDefault(); prefix('## '); return; }
      if (k === '3') { e.preventDefault(); prefix('### '); return; }
    }
    if (e.key === 'Enter') {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const val = ta.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const cur = val.slice(lineStart, start);
      // Continue bullets / todos
      const bm = /^(\s*)([-*+])\s+(\[[ xX]\]\s+)?/.exec(cur);
      const nm = /^(\s*)(\d+)\.\s+/.exec(cur);
      if (bm || nm) {
        const restOfLine = val.slice(start).split('\n')[0];
        const lineHasContent = cur.replace(bm ? /^(\s*)([-*+])\s+(\[[ xX]\]\s+)?/ : /^(\s*)(\d+)\.\s+/, '').trim().length > 0 || restOfLine.trim().length > 0;
        if (!lineHasContent) {
          // Empty list item — break out
          e.preventDefault();
          const next = val.slice(0, lineStart) + '\n' + val.slice(start);
          onChange(next);
          requestAnimationFrame(() => {
            ta.focus();
            try { ta.setSelectionRange(lineStart + 1, lineStart + 1); } catch (_) {}
          });
          return;
        }
        // Inherit prefix
        e.preventDefault();
        let pref = '';
        if (bm) pref = `${bm[1]}${bm[2]} ${bm[3] ? '[ ] ' : ''}`;
        else if (nm) pref = `${nm[1]}${parseInt(nm[2], 10) + 1}. `;
        const next = val.slice(0, start) + '\n' + pref + val.slice(start);
        onChange(next);
        requestAnimationFrame(() => {
          ta.focus();
          try { ta.setSelectionRange(start + 1 + pref.length, start + 1 + pref.length); } catch (_) {}
        });
        return;
      }
    }
    if (onKeyShortcut) onKeyShortcut(e);
  };

  return (
    <div className="md-editor">
      <div className="md-toolbar" role="toolbar" aria-label="Biçimlendirme">
        <button type="button" className="md-tb-btn" title="Başlık 1 (⌘1)" onClick={() => prefix('# ')}><Icon name="heading1" size={14} /></button>
        <button type="button" className="md-tb-btn" title="Başlık 2 (⌘2)" onClick={() => prefix('## ')}><Icon name="heading2" size={14} /></button>
        <button type="button" className="md-tb-btn" title="Başlık 3 (⌘3)" onClick={() => prefix('### ')}><Icon name="heading3" size={14} /></button>
        <div className="md-tb-sep" />
        <button type="button" className="md-tb-btn" title="Kalın (⌘B)" onClick={() => wrap('**','**','metin')}><Icon name="bold" size={14} /></button>
        <button type="button" className="md-tb-btn" title="İtalik (⌘I)" onClick={() => wrap('*','*','metin')}><Icon name="italic" size={14} /></button>
        <button type="button" className="md-tb-btn" title="Satır içi kod (⌘E)" onClick={() => wrap('`','`','kod')}><Icon name="code" size={14} /></button>
        <button type="button" className="md-tb-btn" title="Link (⌘K)" onClick={() => wrap('[', '](https://)','metin')}><Icon name="link" size={14} /></button>
        <div className="md-tb-sep" />
        <button type="button" className="md-tb-btn" title="Madde işareti" onClick={() => prefix('- ')}><Icon name="listBullet" size={14} /></button>
        <button type="button" className="md-tb-btn" title="Yapılacaklar" onClick={() => prefix('- [ ] ')}><Icon name="listChecks" size={14} /></button>
        <button type="button" className="md-tb-btn" title="Alıntı" onClick={() => prefix('> ')}><Icon name="quote" size={14} /></button>
        <button type="button" className="md-tb-btn" title="Ayırıcı" onClick={() => { const ta = taRef.current; if (!ta) return; const v = ta.value; const next = v + (v.endsWith('\n') || v === '' ? '' : '\n') + '\n---\n'; onChange(next); }}><Icon name="divider" size={14} /></button>
        <div className="md-tb-sep" />
        <div style={{ position: 'relative' }} ref={emojiAnchorRef}>
          <button type="button" className="md-tb-btn md-tb-emoji-btn" title="Emoji ekle" disabled={disabled} onClick={() => setEmojiOpen(v => !v)}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>😊</span>
          </button>
          {emojiOpen && !disabled && (
            <NoteEmojiPicker onSelect={insertEmoji} onClose={() => setEmojiOpen(false)} />
          )}
        </div>
      </div>
      <textarea
        ref={taRef}
        className="md-textarea"
        value={body}
        placeholder="Notunu yaz…"
        spellCheck={false}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        onBlur={onBlur}
      />
    </div>
  );
}

// ── Label picker popover ────────────────────────────────────────────────────

function NoteLabelChip({ label, onRemove, compact }) {
  return (
    <span className="tag" data-tone={label.tone || 'blue'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {label.name}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Etiketi çıkar"
          style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', display: 'inline-flex', color: 'inherit', opacity: 0.7 }}>
          <Icon name="x" size={10} />
        </button>
      )}
    </span>
  );
}

function LabelPickerPopover({ value, onChange, onClose }) {
  const [name, setName]   = useNS('');
  const [tone, setTone]   = useNS('blue');
  const popRef = useNR(null);

  useNE(() => {
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (value.some(l => l.name.toLowerCase() === n.toLowerCase())) {
      setName(''); return;
    }
    onChange([...value, { name: n.slice(0, 60), tone }]);
    setName('');
  };

  return (
    <div ref={popRef} className="note-popover" role="dialog" aria-label={window.t?.('notes_add_label') || 'Etiket ekle'}>
      <div className="note-popover-title">{window.t?.('notes_add_label') || 'Etiket ekle'}</div>
      <div className="note-popover-row">
        <input
          autoFocus
          placeholder={window.t?.('notes_label_name_ph') || 'Etiket adı'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
      </div>
      <div className="label-tone-row">
        {NOTE_LABEL_TONES().map(t => (
          <button key={t.id} type="button" title={t.label}
            className="label-tone-dot"
            data-tone={t.id}
            data-selected={tone === t.id}
            onClick={() => setTone(t.id)} />
        ))}
      </div>
      <div className="note-popover-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Kapat</button>
        <button type="button" className="btn btn-primary" onClick={add} disabled={!name.trim()}>Ekle</button>
      </div>
      {value.length > 0 && (
        <div className="note-popover-list">
          <div className="note-popover-sub">Mevcut etiketler</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {value.map((l, i) => (
              <NoteLabelChip key={i} label={l} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Link-task popover ───────────────────────────────────────────────────────

function LinkTaskPopover({ workspaceTasks, linkedIds, onPick, onClose }) {
  const [q, setQ] = useNS('');
  const [loading, setLoading] = useNS(!workspaceTasks);
  const [rows, setRows] = useNS(workspaceTasks || []);
  const popRef = useNR(null);

  useNE(() => {
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // If parent did not pass cached rows, fetch on open
  useNE(() => {
    if (workspaceTasks && workspaceTasks.length) {
      setRows(workspaceTasks);
      return;
    }
    setLoading(true);
    API.workspaceTasks()
      .then(data => { setRows(data || []); setLoading(false); })
      .catch(() => { setRows([]); setLoading(false); });
  }, [workspaceTasks]);

  const list = useNM(() => {
    const ql = q.trim().toLowerCase();
    const linked = new Set((linkedIds || []).map(String));
    return (rows || [])
      .filter(t => !linked.has(String(t.id)))
      .filter(t => !ql || (t.title || '').toLowerCase().includes(ql) || (t.project_name || '').toLowerCase().includes(ql))
      .slice(0, 60);
  }, [q, rows, linkedIds]);

  return (
    <div ref={popRef} className="note-popover" style={{ width: 340 }} role="dialog" aria-label="Görev bağla">
      <div className="note-popover-title">Görev bağla</div>
      <div className="note-popover-row">
        <input autoFocus placeholder="Görev ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '12px 6px', fontSize: 12, color: 'var(--ink-faint)' }}>Yükleniyor…</div>}
        {!loading && list.length === 0 && <div style={{ padding: '12px 6px', fontSize: 12, color: 'var(--ink-faint)' }}>Eşleşen görev yok</div>}
        {!loading && list.map(t => (
          <button key={t.id} type="button" className="note-task-row" onClick={() => onPick(t.id)}>
            <Icon name="layoutBoard" size={12} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              {t.project_name && (
                <span style={{ fontSize: 10, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.project_name}
                </span>
              )}
            </span>
            {t.col_title && <span style={{ fontSize: 10, color: 'var(--ink-faint)', flexShrink: 0 }}>{t.col_title}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Note card (list grid item) ──────────────────────────────────────────────

function NoteCard({ note, author, onOpen, onTogglePin, onArchive, onDelete, canEdit, viewMode }) {
  const [menuOpen, setMenuOpen] = useNS(false);
  const menuRef = useNR(null);
  useNE(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const preview = note.preview || '';
  const labels = note.labels || [];

  return (
    <div
      className={`note-card ${viewMode === 'list' ? 'note-card-list' : ''}`}
      data-pinned={note.pinned ? 'true' : 'false'}
      onClick={() => onOpen(note.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(note.id); } }}
    >
      <div className="note-card-head">
        {labels.length > 0 && (
          <div className="note-card-labels">
            {labels.slice(0, 3).map((l, i) => <NoteLabelChip key={i} label={l} />)}
            {labels.length > 3 && <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>+{labels.length - 3}</span>}
          </div>
        )}
        <div className="note-card-actions" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <button type="button" className="note-card-pin" title={note.pinned ? 'Sabitleme kalksın' : 'Sabitle'}
              data-on={note.pinned ? 'true' : 'false'}
              onClick={() => onTogglePin(note)}>
              <Icon name="pin" size={13} />
            </button>
          )}
          <button type="button" className="note-card-menu-btn" title="Daha fazla" onClick={() => setMenuOpen(v => !v)}>
            <Icon name="moreH" size={14} />
          </button>
          {menuOpen && (
            <div className="note-card-menu">
              <button type="button" onClick={() => { setMenuOpen(false); onOpen(note.id); }}>
                <Icon name="edit" size={12} /> Düzenle
              </button>
              {canEdit && (
                <button type="button" onClick={() => { setMenuOpen(false); onTogglePin(note); }}>
                  <Icon name="pin" size={12} /> {note.pinned ? 'Sabitleme kalksın' : 'Sabitle'}
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={() => { setMenuOpen(false); onArchive(note); }}>
                  <Icon name="archive" size={12} /> {note.archived ? 'Geri al' : 'Arşivle'}
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={() => { setMenuOpen(false); onDelete(note); }} className="note-card-menu-danger">
                  <Icon name="trash" size={12} /> Sil
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <h3 className="note-card-title">{note.title || window.t?.('notes_untitled') || 'Başlıksız Not'}</h3>
      {preview && <div className="note-card-preview">{preview}</div>}
      <div className="note-card-foot">
        {author ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Avatar member={author} size="sm" />
            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{author.name}</span>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>—</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{fmtTimeAgo(note.updated_at)}</span>
        {note.visibility === 'private' && <span title="Sadece sen ve davet ettiklerin" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Özel</span>}
      </div>
    </div>
  );
}

// ── Note detail / editor ────────────────────────────────────────────────────

function NoteDetail({ note, members, tasks, workspaceTasks, currentUserId, isOwner, onBack, onPatch, onDelete, onLinkTask, onUnlinkTask, onOpenTask, canEdit }) {
  const [title, setTitle]   = useNS(note.title || '');
  const [body, setBody]     = useNS(note.body || '');
  const [savedAt, setSavedAt] = useNS(fmtTimeAgo(note.updated_at));
  const [saving, setSaving] = useNS(false);
  const [error, setError]   = useNS('');
  const [labelOpen, setLabelOpen] = useNS(false);
  const [linkTaskOpen, setLinkTaskOpen] = useNS(false);
  const [menuOpen, setMenuOpen] = useNS(false);
  const [mode, setMode]     = useNS('edit'); // 'edit' | 'preview'
  const [collabOpen, setCollabOpen] = useNS(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useNS(false);
  const titleRef = useNR(null);
  const menuRef  = useNR(null);
  const collabRef = useNR(null);
  const lastIncomingUpdateRef = useNR(note.updated_at || '');

  // Sync from incoming socket-pushed update if our local edits aren't newer
  useNE(() => {
    if (note.updated_at && note.updated_at !== lastIncomingUpdateRef.current) {
      lastIncomingUpdateRef.current = note.updated_at;
      setTitle(prev => (prev === (note.title || '') ? prev : note.title || ''));
      // Don't clobber actively typed body — only sync if textarea isn't focused
      if (document.activeElement?.classList?.contains('md-textarea')) return;
      setBody(note.body || '');
    }
    setSavedAt(fmtTimeAgo(note.updated_at));
  }, [note.id, note.updated_at, note.title, note.body]);

  useNE(() => {
    setTitle(note.title || '');
    setBody(note.body || '');
  }, [note.id]);

  useNE(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  useNE(() => {
    if (!collabOpen) return;
    const h = (e) => { if (collabRef.current && !collabRef.current.contains(e.target)) setCollabOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [collabOpen]);

  const doSave = useNCB(async (fields) => {
    if (!canEdit) return;
    setSaving(true); setError('');
    try {
      const updated = await API.updateNote(note.id, fields);
      onPatch(updated);
      setSavedAt(fmtTimeAgo(updated.updated_at));
    } catch (e) {
      setError(e.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }, [note.id, onPatch, canEdit]);

  const isDirty = title !== (note.title || '') || body !== (note.body || '');

  // Auto-save only on blur (when user leaves the field), not on every keystroke
  const handleBodyBlur = useNCB(() => {
    if (canEdit && isDirty) doSave({ title, body });
  }, [canEdit, isDirty, title, body, doSave]);

  // Keyboard: ⌘+S = save now, ⌘+Enter = publish, Esc = back
  useNE(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (canEdit) doSave({ title, body });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canEdit && note.status !== 'published') doSave({ status: 'published', title, body });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setMode(m => m === 'edit' ? 'preview' : 'edit');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [title, body, canEdit, note.status, doSave]);

  const labels = note.labels || [];
  const collaborators = note.collaborators || [];
  const author = members.find(m => m.id === note.author);
  const collabMembers = collaborators.map(s => members.find(m => m.id === s)).filter(Boolean);
  const linkedTaskIdSet = new Set((note.linked_tasks || []).map(String));
  // Prefer workspace-wide task list (has every project's tasks) and fall back to current-project tasks.
  const taskLookup = (workspaceTasks && workspaceTasks.length ? workspaceTasks : (tasks || []));
  const linkedTasks = taskLookup.filter(t => linkedTaskIdSet.has(String(t.id)));

  const handleLabelChange = (next) => {
    onPatch({ ...note, labels: next });
    if (canEdit) doSave({ labels: next });
  };
  const handleVisibility = (v) => {
    onPatch({ ...note, visibility: v });
    if (canEdit) doSave({ visibility: v });
  };
  const handlePin = () => {
    if (!canEdit) return;
    onPatch({ ...note, pinned: !note.pinned });
    doSave({ pinned: !note.pinned });
  };
  const handleArchive = () => {
    if (!canEdit) return;
    onPatch({ ...note, archived: !note.archived });
    doSave({ archived: !note.archived });
    setMenuOpen(false);
  };
  const handlePublish = () => {
    if (!canEdit) return;
    doSave({ status: 'published', title, body });
    setMenuOpen(false);
  };
  const handleDelete = () => {
    if (!canEdit) return;
    setMenuOpen(false);
    setDeleteConfirmOpen(true);
  };
  const handleCollabToggle = (memberId) => {
    if (!canEdit) return;
    const cur = new Set(note.collaborators || []);
    if (cur.has(memberId)) cur.delete(memberId);
    else cur.add(memberId);
    const next = Array.from(cur);
    onPatch({ ...note, collaborators: next });
    doSave({ collaborators: next });
  };

  const linkedTaskIds = (note.linked_tasks || []).map(String);

  return (
    <>
    <div className="note-detail">
      <div className="note-detail-head">
        <button type="button" className="note-back-btn" onClick={onBack}>
          <Icon name="chevronLeft" size={14} /> {window.t?.('notes_back') || 'Notlar'}
        </button>
        <div className="note-status-pill">
          {error
            ? <span style={{ color: 'var(--status-rose)' }}>{error}</span>
            : isDirty
              ? <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>Kaydedilmemiş değişiklikler</span>
              : <><Icon name="check" size={11} /> Kaydedildi · {savedAt}</>
          }
          {note.status === 'draft' && <span className="note-draft-pill">Taslak</span>}
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => doSave({ title, body })}
            disabled={saving || !isDirty}
            title="Kaydet (Ctrl+S)"
          >
            {saving ? <><Icon name="clock" size={11} /> Kaydediliyor…</> : <><Icon name="check" size={11} /> Kaydet</>}
          </button>
        )}
        <div style={{ flex: 1 }} />

        {/* Visibility */}
        <div className="note-visibility-toggle">
          <button type="button" data-active={note.visibility === 'private'} onClick={() => handleVisibility('private')} disabled={!canEdit}>
            <Icon name="lock" size={11} /> Özel
          </button>
          <button type="button" data-active={note.visibility === 'workspace'} onClick={() => handleVisibility('workspace')} disabled={!canEdit}>
            <Icon name="users" size={11} /> Takım
          </button>
        </div>

        {/* Collaborators avatar stack */}
        <div className="note-collab-wrap" ref={collabRef} style={{ position: 'relative' }}>
          <button type="button" className="note-collab-trigger" onClick={() => setCollabOpen(v => !v)} title={window.t?.('notes_collaborators') || 'Ortak yazarlar'}>
            {collabMembers.length > 0 ? <AvatarStack members={collabMembers} max={3} /> : <Icon name="users" size={13} />}
            {canEdit && <Icon name="plus" size={11} style={{ marginLeft: 4 }} />}
          </button>
          {collabOpen && (
            <div className="note-popover" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, left: 'auto', width: 240 }}>
              <div className="note-popover-title">{window.t?.('notes_collaborators') || 'Ortak yazarlar'}</div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {members.filter(m => m.id !== note.author).map(m => {
                  const on = (note.collaborators || []).includes(m.id);
                  return (
                    <button key={m.id} type="button" className="note-collab-row" data-on={on ? 'true' : 'false'}
                      onClick={() => handleCollabToggle(m.id)}
                      disabled={!canEdit}>
                      <Avatar member={m} size="sm" />
                      <span style={{ flex: 1, textAlign: 'left' }}>{m.name}</span>
                      {on && <Icon name="check" size={12} />}
                    </button>
                  );
                })}
                {members.filter(m => m.id !== note.author).length === 0 && (
                  <div style={{ padding: '8px 4px', fontSize: 12, color: 'var(--ink-faint)' }}>Eklenecek üye yok.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="note-mode-toggle">
          <button type="button" data-active={mode === 'edit'} onClick={() => setMode('edit')} title="Düzenle (⌘E)">
            <Icon name="edit" size={12} /> Düzenle
          </button>
          <button type="button" data-active={mode === 'preview'} onClick={() => setMode('preview')} title="Önizle (⌘E)">
            <Icon name="eye" size={12} /> Önizle
          </button>
        </div>

        {/* More menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button type="button" className="icon-btn" onClick={() => setMenuOpen(v => !v)} title="Daha fazla">
            <Icon name="moreH" size={16} />
          </button>
          {menuOpen && (
            <div className="note-card-menu" style={{ right: 0, left: 'auto', top: 'calc(100% + 4px)' }}>
              {canEdit && (
                <button type="button" onClick={() => { handlePin(); setMenuOpen(false); }}>
                  <Icon name="pin" size={12} /> {note.pinned ? 'Sabitleme kalksın' : 'Sabitle'}
                </button>
              )}
              {canEdit && note.status === 'draft' && (
                <button type="button" onClick={handlePublish}>
                  <Icon name="check" size={12} /> Yayımla
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={handleArchive}>
                  <Icon name="archive" size={12} /> {note.archived ? 'Geri al' : 'Arşivle'}
                </button>
              )}
              {canEdit && (
                <button type="button" className="note-card-menu-danger" onClick={handleDelete}>
                  <Icon name="trash" size={12} /> Sil
                </button>
              )}
              {!canEdit && (
                <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--ink-faint)' }}>Yetkin yok</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="note-detail-meta">
        <div className="note-title-wrap">
          <input
            ref={titleRef}
            className="note-title-input"
            placeholder="Başlık ekle…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (canEdit && title !== note.title) doSave({ title }); }}
            disabled={!canEdit}
          />
        </div>
        <div className="note-meta-row">
          <span>{author?.name || window.t?.('unknown') || 'Bilinmiyor'}</span>
          <span className="sep">·</span>
          <span>{fmtTimeAgo(note.updated_at)}</span>
        </div>
        <div className="note-labels-row">
          {labels.length === 0 && canEdit && (
            <button type="button" className="note-add-label" onClick={() => setLabelOpen(true)}>
              <Icon name="tag" size={11} /> Etiket ekle
            </button>
          )}
          {labels.map((l, i) => (
            <NoteLabelChip key={i} label={l}
              onRemove={canEdit ? () => handleLabelChange(labels.filter((_, j) => j !== i)) : null} />
          ))}
          {labels.length > 0 && canEdit && (
            <button type="button" className="note-add-label" onClick={() => setLabelOpen(true)}>
              <Icon name="plus" size={10} />
            </button>
          )}
          {labelOpen && (
            <div style={{ position: 'absolute', zIndex: 50, marginTop: 28 }}>
              <LabelPickerPopover value={labels} onChange={handleLabelChange} onClose={() => setLabelOpen(false)} />
            </div>
          )}
        </div>
      </div>

      <div className="note-detail-body">
        {mode === 'edit' && canEdit
          ? <MarkdownEditor body={body} onChange={setBody} onBlur={handleBodyBlur} disabled={!canEdit} />
          : <MarkdownRender body={body} />
        }
      </div>

      <div className="note-detail-linked">
        <div className="note-linked-head">
          <Icon name="link" size={12} />
          <span>Bağlı görevler</span>
          <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>({linkedTasks.length})</span>
          {canEdit && (
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkTaskOpen(v => !v)}>
                <Icon name="plus" size={11} /> Görev bağla
              </button>
              {linkTaskOpen && (
                <div style={{ position: 'absolute', right: 0, bottom: '100%', marginBottom: 4, zIndex: 50 }}>
                  <LinkTaskPopover
                    workspaceTasks={workspaceTasks}
                    linkedIds={linkedTaskIds}
                    onPick={(taskId) => { setLinkTaskOpen(false); onLinkTask(note.id, taskId); }}
                    onClose={() => setLinkTaskOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {linkedTasks.length === 0 ? (
          <div className="note-linked-empty">Henüz görev bağlanmadı.</div>
        ) : (
          <div className="note-linked-list">
            {linkedTasks.map(t => (
              <div key={t.id} className="note-linked-item" onClick={() => onOpenTask && onOpenTask(t)}>
                <Icon name="layoutBoard" size={12} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                {canEdit && (
                  <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); onUnlinkTask(note.id, t.id); }} title="Bağlantıyı kaldır">
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    {deleteConfirmOpen && (() => {
      const CM = window.ConfirmModal;
      if (!CM) return null;
      return (
        <CM
          open={deleteConfirmOpen}
          title={window.t?.('notes_delete_title') || 'Notu Sil'}
          message={window.t?.('notes_delete_confirm') || 'Bu notu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.'}
          confirmText={window.t?.('notes_delete_btn') || 'Sil'}
          variant="danger"
          onConfirm={() => { setDeleteConfirmOpen(false); onDelete(note); }}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      );
    })()}
    </>
  );
}

// ── List view ───────────────────────────────────────────────────────────────

function NotesView({ socket, tasks, members, currentUserId, isOwner, canManageProjects, onOpenTask, onCountChange }) {
  const [notes, setNotes]   = useNS(() => window.DATA?.NOTES || []);
  const [loading, setLoading] = useNS(() => !(window.DATA?.NOTES?.length));
  const [wsTasks, setWsTasks] = useNS([]);
  const [selectedId, setSelectedId] = useNS(() => {
    const m = /#note=(\d+)/.exec(window.location.hash || '');
    return m ? parseInt(m[1], 10) : null;
  });
  const [q, setQ]           = useNS('');
  const [sort, setSort]     = useNS('updated'); // updated | created | title | author
  const [filterLabel, setFilterLabel] = useNS('');
  const [filterAuthor, setFilterAuthor] = useNS('');
  const [filterPinned, setFilterPinned] = useNS(false);
  const [showArchived, setShowArchived] = useNS(false);
  const [viewMode, setViewMode] = useNS(() => localStorage.getItem('stoa.notesView') || 'grid');
  const [filtersOpen, setFiltersOpen] = useNS(false);
  const [creating, setCreating] = useNS(false);

  useNE(() => { localStorage.setItem('stoa.notesView', viewMode); }, [viewMode]);

  // Keep DATA.NOTES synced so palette + other modules can read latest list
  useNE(() => { window.DATA.NOTES = notes; }, [notes]);

  // Fetch all workspace tasks so link-task picker covers every project, not just the active one
  useNE(() => {
    let cancelled = false;
    API.workspaceTasks()
      .then(rows => { if (!cancelled) setWsTasks(rows || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Initial fetch
  useNE(() => {
    setLoading(true);
    API.listNotes({ archived: showArchived })
      .then(rows => { setNotes(rows || []); setLoading(false); onCountChange?.((rows || []).length); })
      .catch(() => { setNotes([]); setLoading(false); });
  }, [showArchived]);

  // Sync URL hash
  useNE(() => {
    if (selectedId) {
      if (window.location.hash !== `#note=${selectedId}`) {
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#note=${selectedId}`);
      }
    } else if (window.location.hash.startsWith('#note=')) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    }
  }, [selectedId]);

  // Browser back/forward
  useNE(() => {
    const h = () => {
      const m = /#note=(\d+)/.exec(window.location.hash || '');
      setSelectedId(m ? parseInt(m[1], 10) : null);
    };
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

  // Socket listeners
  useNE(() => {
    if (!socket) return;
    const onCreated = (note) => {
      if (!note) return;
      if (note.actor && note.actor === window.CURRENT_USER?.slug) {
        // own creation already added optimistically — still merge in case fields differ
      }
      setNotes(prev => {
        if (prev.some(n => n.id === note.id)) {
          return prev.map(n => n.id === note.id ? { ...n, ...note } : n);
        }
        const next = [note, ...prev];
        onCountChange?.(next.length);
        return next;
      });
    };
    const onUpdated = (note) => {
      if (!note) return;
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...note } : n));
    };
    const onDeleted = ({ id }) => {
      if (!id) return;
      setNotes(prev => {
        const next = prev.filter(n => n.id !== id);
        onCountChange?.(next.length);
        return next;
      });
      setSelectedId(prev => (prev === id ? null : prev));
    };
    socket.on('note_created', onCreated);
    socket.on('note_updated', onUpdated);
    socket.on('note_deleted', onDeleted);
    return () => {
      socket.off('note_created', onCreated);
      socket.off('note_updated', onUpdated);
      socket.off('note_deleted', onDeleted);
    };
  }, [socket]);

  // Keyboard: N inside list creates a new note (when not editing)
  useNE(() => {
    if (selectedId) return;
    const isEditing = () => {
      const ae = document.activeElement;
      return ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    };
    const h = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'n' && !isEditing()) {
        e.preventDefault();
        handleCreate();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedId]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const note = await API.createNote({ title: window.t?.('notes_untitled') || 'Başlıksız Not', body: '', visibility: 'private', status: 'draft' });
      // Dedupe — socket "note_created" echo may already have inserted this row
      setNotes(prev => {
        const exists = prev.some(n => n.id === note.id);
        const next = exists
          ? prev.map(n => n.id === note.id ? { ...n, ...note } : n)
          : [note, ...prev];
        onCountChange?.(next.length);
        return next;
      });
      setSelectedId(note.id);
    } catch (e) {
      window.showToast?.('Not oluşturulamadı: ' + e.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handlePatch = (updated) => {
    setNotes(prev => prev.map(n => n.id === updated.id ? { ...n, ...updated } : n));
  };

  const handleTogglePin = async (note) => {
    handlePatch({ ...note, pinned: !note.pinned });
    try {
      const updated = await API.updateNote(note.id, { pinned: !note.pinned });
      handlePatch(updated);
    } catch (e) { window.showToast?.('Güncellenemedi: ' + e.message, 'error'); }
  };

  const handleArchive = async (note) => {
    handlePatch({ ...note, archived: !note.archived });
    try {
      const updated = await API.updateNote(note.id, { archived: !note.archived });
      handlePatch(updated);
    } catch (e) { window.showToast?.('Güncellenemedi: ' + e.message, 'error'); }
  };

  const handleDelete = async (note) => {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== note.id);
      onCountChange?.(next.length);
      return next;
    });
    setSelectedId(prev => (prev === note.id ? null : prev));
    try { await API.deleteNote(note.id); }
    catch (e) {
      window.showToast?.('Silinemedi: ' + e.message, 'error');
      // Refetch to restore on failure
      API.listNotes({ archived: showArchived }).then(rows => setNotes(rows || []));
    }
  };

  const handleDeleteFromDetail = async (note) => {
    await handleDelete(note);
    setSelectedId(null);
  };

  const handleLinkTask = async (noteId, taskId) => {
    try {
      const updated = await API.linkNoteTask(noteId, taskId);
      handlePatch(updated);
      window.showToast?.('Görev bağlandı', 'success');
    } catch (e) { window.showToast?.('Bağlanamadı: ' + e.message, 'error'); }
  };

  const handleUnlinkTask = async (noteId, taskId) => {
    try {
      const updated = await API.unlinkNoteTask(noteId, taskId);
      handlePatch(updated);
    } catch (e) { window.showToast?.('Kaldırılamadı: ' + e.message, 'error'); }
  };

  // Expose create globally so command palette can trigger
  useNE(() => {
    window.__NOTES_CREATE__ = handleCreate;
    window.__NOTES_OPEN__   = (id) => setSelectedId(id);
    return () => {
      if (window.__NOTES_CREATE__ === handleCreate) window.__NOTES_CREATE__ = null;
      if (window.__NOTES_OPEN__) window.__NOTES_OPEN__ = null;
    };
  }, [creating]);

  const filtered = useNM(() => {
    let list = notes;
    if (!showArchived) list = list.filter(n => !n.archived);
    if (filterPinned) list = list.filter(n => n.pinned);
    if (filterLabel)  list = list.filter(n => (n.labels || []).some(l => l.name.toLowerCase() === filterLabel.toLowerCase()));
    if (filterAuthor) {
      if (filterAuthor === '__me__') list = list.filter(n => n.author === window.CURRENT_USER?.slug);
      else list = list.filter(n => n.author === filterAuthor);
    }
    if (q.trim()) {
      const ql = q.trim().toLowerCase();
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(ql) ||
        (n.preview || '').toLowerCase().includes(ql)
      );
    }
    const collator = new Intl.Collator('tr', { sensitivity: 'base' });
    list = [...list].sort((a, b) => {
      if (sort === 'title')   return collator.compare(a.title || '', b.title || '');
      if (sort === 'author')  return collator.compare(a.author || '', b.author || '');
      if (sort === 'created') return (b.created_at || '').localeCompare(a.created_at || '');
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });
    return list;
  }, [notes, showArchived, filterPinned, filterLabel, filterAuthor, q, sort]);

  const pinned = filtered.filter(n => n.pinned);
  const others = filtered.filter(n => !n.pinned);

  const allLabelNames = useNM(() => {
    const s = new Set();
    notes.forEach(n => (n.labels || []).forEach(l => s.add(l.name)));
    return Array.from(s).sort();
  }, [notes]);

  if (selectedId) {
    const note = notes.find(n => n.id === selectedId);
    if (!note) {
      return (
        <div className="notes-view">
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
            Not bulunamadı. <button type="button" className="btn btn-ghost" onClick={() => setSelectedId(null)}>Listeye dön</button>
          </div>
        </div>
      );
    }
    const isAuthor   = note.author === window.CURRENT_USER?.slug;
    const isCollab   = (note.collaborators || []).includes(window.CURRENT_USER?.slug);
    const canEdit    = isOwner || canManageProjects || isAuthor || isCollab;
    return (
      <div className="notes-view">
        <NoteDetail
          note={note}
          members={members}
          tasks={tasks}
          workspaceTasks={wsTasks}
          currentUserId={currentUserId}
          isOwner={isOwner}
          canEdit={canEdit}
          onBack={() => setSelectedId(null)}
          onPatch={handlePatch}
          onDelete={handleDeleteFromDetail}
          onLinkTask={handleLinkTask}
          onUnlinkTask={handleUnlinkTask}
          onOpenTask={onOpenTask}
        />
      </div>
    );
  }

  return (
    <div className="notes-view">
      <div className="notes-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h1 className="notes-title">{window.t?.('notes_title') || 'Notlar'}</h1>
          {!loading && <span className="notes-count">{filtered.length}</span>}
        </div>
        <div className="notes-toolbar">
          <div className="notes-search-wrap">
            <Icon name="search" size={13} />
            <input
              type="search"
              placeholder={window.t?.('notes_search_ph') || 'Notlarda ara…'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="notes-search-input"
            />
          </div>
          <div className="notes-sort">
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={window.t?.('notes_sort') || 'Sırala'}>
              <option value="updated">{window.t?.('notes_sort_updated') || 'Son güncelleme'}</option>
              <option value="created">{window.t?.('notes_sort_created') || 'Oluşturulma'}</option>
              <option value="title">{window.t?.('notes_sort_title') || 'Başlık (A-Z)'}</option>
              <option value="author">{window.t?.('notes_sort_author') || 'Yazar'}</option>
            </select>
          </div>
          <button type="button" className="icon-btn"
            data-active={filtersOpen ? 'true' : 'false'}
            onClick={() => setFiltersOpen(v => !v)}
            title={window.t?.('notes_filter') || 'Filtre'}
          ><Icon name="filter" size={14} /></button>
          <div className="notes-view-toggle">
            <button type="button" data-active={viewMode === 'grid'}    onClick={() => setViewMode('grid')}    title={window.t?.('notes_view_grid') || 'Izgara'}><Icon name="layoutBoard" size={13} /></button>
            <button type="button" data-active={viewMode === 'list'}    onClick={() => setViewMode('list')}    title={window.t?.('notes_view_list') || 'Liste'}><Icon name="list" size={13} /></button>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            <Icon name="plus" size={13} /> {creating ? (window.t?.('app_creating') || 'Oluşturuluyor…') : (window.t?.('notes_new') || 'Yeni Not')}
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="notes-filters">
          <label>
            <span>{window.t?.('notes_filter_label') || 'Etiket'}</span>
            <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)}>
              <option value="">{window.t?.('notes_filter_all') || 'Tümü'}</option>
              {allLabelNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            <span>{window.t?.('notes_filter_author') || 'Yazar'}</span>
            <select value={filterAuthor} onChange={(e) => setFilterAuthor(e.target.value)}>
              <option value="">{window.t?.('notes_filter_all') || 'Tümü'}</option>
              <option value="__me__">{window.t?.('notes_filter_only_me') || 'Sadece ben'}</option>
              {(members || []).map(m => <option key={m.id} value={m.slug || m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="notes-filter-toggle">
            <input type="checkbox" checked={filterPinned} onChange={(e) => setFilterPinned(e.target.checked)} />
            <span>{window.t?.('notes_filter_pinned') || 'Sadece sabitlenmiş'}</span>
          </label>
          <label className="notes-filter-toggle">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span>{window.t?.('notes_filter_archived') || 'Arşivlenmiş olanları göster'}</span>
          </label>
          {(filterLabel || filterAuthor || filterPinned || showArchived) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              setFilterLabel(''); setFilterAuthor(''); setFilterPinned(false); setShowArchived(false);
            }}>{window.t?.('board_clear') || 'Temizle'}</button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-muted)' }}>{window.t?.('drawer_loading') || 'Yükleniyor…'}</div>
      ) : filtered.length === 0 ? (
        notes.length === 0 ? (
          <div className="notes-empty">
            <div className="notes-empty-icon"><Icon name="note" size={36} strokeWidth={1} /></div>
            <div className="notes-empty-title">{window.t?.('notes_no_notes') || 'Henüz hiç not yok'}</div>
            <div className="notes-empty-sub">{window.t?.('notes_no_notes_sub') || 'Düşüncelerini, toplantı notlarını ve bağlantılı görevlerini buraya kaydet.'}</div>
            <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              <Icon name="plus" size={13} /> {window.t?.('notes_create_first') || 'İlk notunu oluştur'}
            </button>
          </div>
        ) : (
          <div className="notes-empty">
            <div className="notes-empty-title">{window.t?.('notes_no_match') || 'Eşleşen not yok'}</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              setQ(''); setFilterLabel(''); setFilterAuthor(''); setFilterPinned(false); setShowArchived(false);
            }}>{window.t?.('notes_clear_filters') || 'Filtreleri temizle'}</button>
          </div>
        )
      ) : (
        <div className="notes-scroll">
          {pinned.length > 0 && (
            <div className="notes-section">
              <div className="notes-section-head"><Icon name="pin" size={12} /> {window.t?.('notes_pinned') || 'Sabitlenmiş'}</div>
              <div className={`notes-grid notes-grid-${viewMode}`}>
                {pinned.map(n => {
                  const author = members.find(m => m.id === n.author);
                  const isAuthor = n.author === window.CURRENT_USER?.slug;
                  const isCollab = (n.collaborators || []).includes(window.CURRENT_USER?.slug);
                  const canEdit  = isOwner || canManageProjects || isAuthor || isCollab;
                  return (
                    <NoteCard key={n.id} note={n} author={author} viewMode={viewMode}
                      onOpen={(id) => setSelectedId(id)}
                      onTogglePin={handleTogglePin}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                      canEdit={canEdit}
                    />
                  );
                })}
              </div>
            </div>
          )}
          {others.length > 0 && (
            <div className="notes-section">
              {pinned.length > 0 && <div className="notes-section-head"><Icon name="note" size={12} /> {window.t?.('notes_section_notes') || 'Notlar'}</div>}
              <div className={`notes-grid notes-grid-${viewMode}`}>
                {others.map(n => {
                  const author = members.find(m => m.id === n.author);
                  const isAuthor = n.author === window.CURRENT_USER?.slug;
                  const isCollab = (n.collaborators || []).includes(window.CURRENT_USER?.slug);
                  const canEdit  = isOwner || canManageProjects || isAuthor || isCollab;
                  return (
                    <NoteCard key={n.id} note={n} author={author} viewMode={viewMode}
                      onOpen={(id) => setSelectedId(id)}
                      onTogglePin={handleTogglePin}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                      canEdit={canEdit}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

window.NotesView = NotesView;
window.MarkdownRender = MarkdownRender;
