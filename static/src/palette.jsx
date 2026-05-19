// Command palette

const { useState: useP, useEffect: useE, useMemo: useM, useRef: useR } = React;

function CommandPalette({ open, onClose, onAction }) {
  const [q, setQ] = useP('');
  const [idx, setIdx] = useP(0);
  const inputRef = useR(null);

  useE(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 40); }
  }, [open]);

  const flat = useM(() => {
    const all = [];
    DATA.COMMANDS.forEach(g => g.items.forEach(it => all.push({ ...it, group: g.group })));
    let base = all;
    if (q) {
      const ql = q.toLowerCase();
      base = all.filter(it => it.label.toLowerCase().includes(ql));
    }
    if (q && (DATA.NOTES || []).length) {
      const ql = q.toLowerCase();
      const noteHits = (DATA.NOTES || [])
        .filter(n => !n.archived)
        .filter(n => (n.title || '').toLowerCase().includes(ql) || (n.preview || '').toLowerCase().includes(ql))
        .slice(0, 6)
        .map(n => ({
          label: n.title || (window.t?.('notes_untitled')||'Başlıksız Not'),
          icon: 'note',
          action: 'open:note:' + n.id,
          group: window.t?.('notes_title')||'Notlar',
          sub: n.preview ? n.preview.slice(0, 60) : null,
        }));
      base = [...base, ...noteHits];
    }
    return base;
  }, [q]);

  const grouped = useM(() => {
    const m = {};
    flat.forEach(it => { (m[it.group] = m[it.group] || []).push(it); });
    return m;
  }, [flat]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((idx + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((idx - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter' && flat[idx]) { e.preventDefault(); onAction(flat[idx].action); onClose(); }
    else if (e.key === 'Escape') onClose();
  };

  let counter = 0;
  return (
    <div className="palette-overlay" data-open={open} onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            placeholder={window.t?.('palette_ph') || 'Komut, görev veya sayfa ara...'}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={onKey}
          />
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: '2px 6px', background: 'var(--bg-subtle)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--ink-muted)' }}>Esc</kbd>
        </div>
        <div className="palette-list">
          {Object.keys(grouped).length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              {window.t?.('palette_no_result')||'Sonuç yok. Başka bir ifade dene.'}
            </div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="palette-group-title">{group}</div>
              {items.map(it => {
                const myIdx = counter++;
                return (
                  <div
                    key={`${it.group}-${it.label}-${myIdx}`}
                    className="palette-item"
                    data-active={myIdx === idx}
                    onMouseEnter={() => setIdx(myIdx)}
                    onClick={() => { onAction(it.action); onClose(); }}
                  >
                    <Icon name={it.icon} size={14} />
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                      {it.sub && <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</span>}
                    </span>
                    {it.shortcut && <kbd>{it.shortcut}</kbd>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="palette-hint">
          <span><kbd>↑</kbd><kbd>↓</kbd> {window.t?.('palette_navigate') || 'gez'}</span>
          <span><kbd>↵</kbd> {window.t?.('palette_select') || 'seç'}</span>
          <span><kbd>esc</kbd> {window.t?.('palette_close') || 'kapat'}</span>
        </div>
      </div>
    </div>
  );
}

window.CommandPalette = CommandPalette;
