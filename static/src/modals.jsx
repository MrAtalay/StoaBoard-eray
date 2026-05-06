// Add Task modal — API-backed

const { useState: useModalState, useEffect: useModalEffect, useRef: useModalRef } = React;

// ── Custom Date Picker ─────────────────────────────────────────────────────
function DatePicker({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos]   = React.useState({ top: 0, left: 0 });
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const today = new Date();
  const parsed = value ? new Date(value + 'T00:00:00') : null;
  const [viewYear, setViewYear] = React.useState((parsed || today).getFullYear());
  const [viewMonth, setViewMonth] = React.useState((parsed || today).getMonth());

  React.useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 600;

  const handleToggle = () => {
    if (!open && !isMobile && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuH = 320;
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const top = spaceBelow >= menuH ? r.bottom + 8 : r.top - menuH - 8;
      setPos({ top, left: r.left });
    }
    setOpen(o => !o);
  };

  const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const TR_DAYS = ['Pt','Sa','Ça','Pe','Cu','Ct','Pa'];

  const getDays = () => {
    const first = new Date(viewYear, viewMonth, 1);
    let startDow = first.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
    const cells = [];
    for (let i = startDow - 1; i >= 0; i--) cells.push({ day: daysInPrev - i, other: true });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, other: false });
    while (cells.length % 7 !== 0) { cells.push({ day: cells.length - daysInMonth - startDow + 1, other: true }); }
    return cells;
  };

  const selectDay = (day, other) => {
    let m = viewMonth, y = viewYear;
    if (other && day > 15) { m--; if (m < 0) { m = 11; y--; } }
    else if (other && day < 15) { m++; if (m > 11) { m = 0; y++; } }
    onChange(`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
    setOpen(false);
  };

  const isSelected = (day, other) => !other && parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === day;
  const isToday    = (day, other) => !other && today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
  const prevMonth  = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); };
  const nextMonth  = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); };
  const displayVal = parsed
    ? `${String(parsed.getDate()).padStart(2,'0')}.${String(parsed.getMonth()+1).padStart(2,'0')}.${parsed.getFullYear()}`
    : 'Tarih seç';

  const calendarContent = (
    <div ref={menuRef} style={isMobile ? {
      marginTop: 8, background: 'var(--bg-raised)', border: '1px solid var(--line)',
      borderRadius: 14, padding: '14px 16px', width: '100%',
    } : {
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
      background: 'var(--bg-raised)', border: '1px solid var(--line)',
      borderRadius: 14, boxShadow: 'var(--shadow-lg)', padding: '14px 16px', width: 260,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: 'var(--ink)' }}>
          {TR_MONTHS[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={prevMonth} style={{ padding: 4, borderRadius: 6, color: 'var(--ink-muted)' }}>
          <Icon name="arrowUp" size={14} />
        </button>
        <button type="button" onClick={nextMonth} style={{ padding: 4, borderRadius: 6, color: 'var(--ink-muted)', marginLeft: 2 }}>
          <Icon name="arrowDown" size={14} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {TR_DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: 'var(--ink-faint)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {getDays().map((cell, i) => {
          const sel = isSelected(cell.day, cell.other);
          const tod = isToday(cell.day, cell.other);
          return (
            <button key={i} type="button" onClick={() => selectDay(cell.day, cell.other)} style={{
              padding: '5px 2px', borderRadius: 7, fontSize: 12,
              fontWeight: sel || tod ? 600 : 400, textAlign: 'center', cursor: 'pointer',
              color: sel ? 'white' : tod ? 'var(--accent)' : cell.other ? 'var(--ink-dim)' : 'var(--ink)',
              background: sel ? 'var(--accent)' : 'transparent',
              border: tod && !sel ? '1.5px solid var(--accent)' : '1.5px solid transparent',
            }}>
              {cell.day}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <button type="button" onClick={() => { onChange(''); setOpen(false); }}
          style={{ fontSize: 12, color: 'var(--ink-muted)', padding: '2px 6px', borderRadius: 5 }}>
          Temizle
        </button>
        <button type="button" onClick={() => {
          const t = new Date();
          setViewYear(t.getFullYear()); setViewMonth(t.getMonth());
          onChange(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`);
          setOpen(false);
        }} style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, padding: '2px 6px', borderRadius: 5 }}>
          Bugün
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button ref={btnRef} type="button" onClick={handleToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', background: 'var(--bg-raised)', border: '1px solid var(--line)',
        borderRadius: 999, fontSize: 14, color: parsed ? 'var(--ink)' : 'var(--ink-muted)',
        cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <span>{displayVal}</span>
        <Icon name="calendar" size={14} />
      </button>

      {open && (isMobile ? calendarContent : ReactDOM.createPortal(calendarContent, document.body))}
    </div>
  );
}
window.DatePicker = DatePicker;

// ── Add Task Modal ─────────────────────────────────────────────────────────
function AddTaskModal({ open, onClose, defaultCol, onCreate }) {
  const [title, setTitle]         = useModalState('');
  const [desc, setDesc]           = useModalState('');
  const [col, setCol]             = useModalState(defaultCol || 'todo');
  const [priority, setPriority]   = useModalState('mid');
  const [due, setDue]             = useModalState('');
  const [labels, setLabels]       = useModalState([]);
  const [assignees, setAssignees] = useModalState([]);
  const [busy, setBusy]           = useModalState(false);
  const [titleError, setTitleError] = useModalState(false);
  const [colOpen, setColOpen]           = useModalState(false);
  const [priorityOpen, setPriorityOpen] = useModalState(false);
  const [colPos, setColPos]             = useModalState({ top: 0, left: 0, width: 0 });
  const [priPos, setPriPos]             = useModalState({ top: 0, left: 0, width: 0 });
  const colBtnRef      = useModalRef(null);
  const priBtnRef      = useModalRef(null);
  const colMenuRef     = useModalRef(null);
  const priMenuRef     = useModalRef(null);

  useModalEffect(() => {
    const handleClick = (e) => {
      if (colOpen && colMenuRef.current && !colMenuRef.current.contains(e.target) &&
          colBtnRef.current && !colBtnRef.current.contains(e.target)) setColOpen(false);
      if (priorityOpen && priMenuRef.current && !priMenuRef.current.contains(e.target) &&
          priBtnRef.current && !priBtnRef.current.contains(e.target)) setPriorityOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [colOpen, priorityOpen]);

  const openDropdown = (btnRef, setPos, setOpenFn) => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuH = 200;
      const spaceBelow = window.innerHeight - r.bottom - 16;
      const top = spaceBelow >= menuH ? r.bottom + 6 : r.top - menuH - 6;
      const left = Math.max(8, r.left);
      const width = Math.min(r.width + 8, window.innerWidth - 16);
      setPos({ top, left, width });
    }
    setOpenFn(o => !o);
  };

  React.useEffect(() => { if (defaultCol) setCol(defaultCol); }, [defaultCol, open]);
  React.useEffect(() => {
    if (!open) { setTitle(''); setDesc(''); setLabels([]); setBusy(false); setTitleError(false); }
    if (open) {
      const me = window.CURRENT_USER;
      setAssignees(me ? [me.id] : []);
    }
  }, [open]);

  const toggleLabel    = (k) => setLabels(ls => ls.includes(k) ? ls.filter(x => x !== k) : [...ls, k]);
  const toggleAssignee = (k) => setAssignees(as => as.includes(k) ? as.filter(x => x !== k) : [...as, k]);

  const submit = async () => {
    if (busy) return;
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setBusy(true);
    try {
      await onCreate({ title: title.trim(), desc, col, priority, due: due || null, labels, assignees });
      onClose();
    } catch (e) {
      alert('Görev oluşturulamadı: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); };

  return (
    <div className="modal-overlay" data-open={open} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKey}>
        <div className="modal-head">
          <div className="modal-title">Yeni görev</div>
          <div className="modal-sub">Atama, etiket ve son tarihi sonradan da düzenleyebilirsin.</div>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Başlık {titleError && <span style={{ color: 'var(--status-rose)', fontWeight: 400, fontSize: 11 }}>— başlık gerekli</span>}</label>
            <input
              autoFocus
              placeholder="Ne yapılacak?"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError(false); }}
              style={titleError ? { borderColor: 'var(--status-rose)', background: 'oklch(58% 0.13 10 / 0.05)' } : {}}
            />
          </div>
          <div className="field">
            <label>Açıklama</label>
            <textarea rows={3} placeholder="Daha fazla bağlam ekle..." value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Kolon</label>
              <div className="custom-dropdown">
                <button ref={colBtnRef} type="button" className="custom-dropdown-btn"
                  onClick={() => openDropdown(colBtnRef, setColPos, setColOpen)}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{DATA.COLUMNS.find(c => c.id === col)?.title_tr || 'Seç'}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                {colOpen && ReactDOM.createPortal(
                  <div ref={colMenuRef} className="custom-dropdown-menu"
                    style={{ position: 'fixed', top: colPos.top, left: colPos.left, minWidth: colPos.width, maxWidth: 320, zIndex: 9999 }}>
                    {DATA.COLUMNS.map(c => (
                      <button key={c.id} type="button"
                        className={`custom-dropdown-item${c.id === col ? ' active' : ''}`}
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        onClick={() => { setCol(c.id); setColOpen(false); }}>
                        {c.title_tr}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
            </div>
            <div className="field">
              <label>Öncelik</label>
              <div className="custom-dropdown">
                <button ref={priBtnRef} type="button" className="custom-dropdown-btn"
                  onClick={() => openDropdown(priBtnRef, setPriPos, setPriorityOpen)}>
                  <span>{priority === 'high' ? 'Yüksek' : priority === 'mid' ? 'Orta' : 'Düşük'}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                {priorityOpen && ReactDOM.createPortal(
                  <div ref={priMenuRef} className="custom-dropdown-menu"
                    style={{ position: 'fixed', top: priPos.top, left: priPos.left, minWidth: priPos.width, zIndex: 9999 }}>
                    {[{id:'high',label:'Yüksek'},{id:'mid',label:'Orta'},{id:'low',label:'Düşük'}].map(item => (
                      <button key={item.id} type="button"
                        className={`custom-dropdown-item${item.id === priority ? ' active' : ''}`}
                        onClick={() => { setPriority(item.id); setPriorityOpen(false); }}>
                        {item.label}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
            </div>
            <div className="field">
              <label>Bitiş</label>
              <DatePicker value={due} onChange={setDue} />
            </div>
          </div>
          <div className="field">
            <label>Etiketler</label>
            <div className="chips">
              {Object.entries(DATA.LABELS).map(([k, l]) => (
                <div key={k} className="chip" data-selected={labels.includes(k)} onClick={() => toggleLabel(k)}>
                  <span className="priority-dot" style={{ background: `var(--status-${l.tone === 'accent' ? 'rose' : l.tone})`, width: 6, height: 6, marginLeft: 4 }} />
                  {l.tr}
                </div>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Atanan</label>
            <div className="chips">
              {DATA.MEMBERS.map(m => (
                <div key={m.id} className="chip" data-selected={assignees.includes(m.id)} onClick={() => toggleAssignee(m.id)}>
                  <Avatar member={m} size="sm" />
                  {m.name.split(' ')[0]}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>İptal</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="plus" size={13} /> {busy ? 'Oluşturuluyor…' : 'Görevi oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}

window.AddTaskModal = AddTaskModal;