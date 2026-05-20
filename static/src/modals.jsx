// Add Task modal — API-backed

const { useState: useModalState, useEffect: useModalEffect, useRef: useModalRef } = React;

// ── Custom Date Picker ─────────────────────────────────────────────────────
function DatePicker({ value, onChange, error }) {
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

  const lang = localStorage.getItem('stoa.lang') || 'tr';
  const TR_MONTHS = lang === 'en'
    ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    : ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const TR_DAYS = lang === 'en' ? ['Mo','Tu','We','Th','Fr','Sa','Su'] : ['Pt','Sa','Ça','Pe','Cu','Ct','Pa'];

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
    : (window.t?.('modal_date_pick') || 'Tarih seç');

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
          {window.t?.('modal_date_clear') || 'Temizle'}
        </button>
        <button type="button" onClick={() => {
          const t = new Date();
          setViewYear(t.getFullYear()); setViewMonth(t.getMonth());
          onChange(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`);
          setOpen(false);
        }} style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, padding: '2px 6px', borderRadius: 5 }}>
          {window.t?.('cal_today') || 'Bugün'}
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
        ...(error ? { borderColor: 'var(--status-rose)', background: 'oklch(58% 0.13 10 / 0.05)' } : {}),
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
function AddTaskModal({ open, onClose, defaultCol, onCreate, initialDates }) {
  const [title, setTitle]         = useModalState('');
  const [desc, setDesc]           = useModalState('');
  const [col, setCol]             = useModalState(defaultCol || 'todo');
  const [priority, setPriority]   = useModalState('mid');
  const [startDate, setStartDate] = useModalState('');
  const [due, setDue]             = useModalState('');
  const [labels, setLabels]       = useModalState([]);
  const [assignees, setAssignees] = useModalState([]);
  const [assigneeDates, setAssigneeDates] = useModalState({});
  const [showPerAssignee, setShowPerAssignee] = useModalState(false);
  const [busy, setBusy]           = useModalState(false);
  const [titleError, setTitleError]   = useModalState(false);
  const [startError, setStartError]   = useModalState(false);
  const [dueError, setDueError]       = useModalState(false);
  const [checklistItems, setChecklistItems] = useModalState([]);
  const [checklistInput, setChecklistInput] = useModalState('');
  const checklistRef = useModalRef(null);

  const addChecklistItem = () => {
    const text = checklistInput.trim();
    if (!text) return;
    setChecklistItems(prev => [...prev, text]);
    setChecklistInput('');
    setTimeout(() => checklistRef.current?.focus(), 0);
  };
  const [colOpen, setColOpen] = useModalState(false);
  const [colPos, setColPos]   = useModalState({ top: 0, left: 0, width: 0 });
  const colBtnRef  = useModalRef(null);
  const colMenuRef = useModalRef(null);

  useModalEffect(() => {
    const handleClick = (e) => {
      if (colOpen && colMenuRef.current && !colMenuRef.current.contains(e.target) &&
          colBtnRef.current && !colBtnRef.current.contains(e.target)) setColOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [colOpen]);

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
    if (!open) {
      setTitle(''); setDesc(''); setLabels([]); setBusy(false); setTitleError(false); setDueError(false);
      setDue(''); setStartDate(''); setAssigneeDates({}); setShowPerAssignee(false);
      setChecklistItems([]); setChecklistInput('');
    }
    if (open) {
      const me = window.CURRENT_USER;
      setAssignees(me ? [me.id] : []);
      if (initialDates?.start) setStartDate(initialDates.start);
      if (initialDates?.end)   setDue(initialDates.end);
    }
  }, [open]);

  const toggleLabel    = (k) => setLabels(ls => ls.includes(k) ? ls.filter(x => x !== k) : [...ls, k]);
  const toggleAssignee = (k) => setAssignees(as => as.includes(k) ? as.filter(x => x !== k) : [...as, k]);

  const setAsgDate = (slug, field, val) => {
    setAssigneeDates(ad => ({ ...ad, [slug]: { ...(ad[slug] || {}), [field]: val || null } }));
  };

  const submit = async () => {
    if (busy) return;
    let hasErr = false;
    if (!title.trim()) { setTitleError(true); hasErr = true; }
    if (!startDate) { setStartError(true); hasErr = true; }
    if (!due) { setDueError(true); hasErr = true; }
    if (hasErr) return;
    setBusy(true);
    const cleanAd = {};
    for (const [slug, d] of Object.entries(assigneeDates)) {
      if (d.start || d.end) cleanAd[slug] = d;
    }
    try {
      const created = await onCreate({
        title: title.trim(), desc, col, priority,
        start: startDate || null, due: due || null,
        labels, assignees,
        assignee_dates: Object.keys(cleanAd).length ? cleanAd : null,
      });
      if (created?.id && checklistItems.length > 0) {
        for (const item of checklistItems) {
          try { await API.addSubtask(created.id, item); } catch (_) {}
        }
      }
      onClose();
    } catch (e) {
      window.showToast?.(window.t('app_err_create_task') + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); };

  return (
    <div className="modal-overlay" data-open={open} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKey}>
        <div className="modal-head">
          <div className="modal-title">{window.t('modal_new_task')}</div>
          <div className="modal-sub">{window.t('modal_new_task_sub')}</div>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>{window.t('modal_title_label')} {titleError && <span style={{ color: 'var(--status-rose)', fontWeight: 400, fontSize: 11 }}>— {window.t('modal_title_required')}</span>}</label>
            <input
              autoFocus
              placeholder={window.t('modal_title_placeholder')}
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError(false); }}
              style={titleError ? { borderColor: 'var(--status-rose)', background: 'oklch(58% 0.13 10 / 0.05)' } : {}}
            />
          </div>
          <div className="field">
            <label>{window.t('modal_desc_label')}</label>
            <textarea rows={3} placeholder={window.t('modal_desc_placeholder')} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>{window.t('modal_col_label')}</label>
              <div className="custom-dropdown">
                <button ref={colBtnRef} type="button" className="custom-dropdown-btn"
                  onClick={() => openDropdown(colBtnRef, setColPos, setColOpen)}>
                  <span className="col-dot" style={{ background: DATA.COLUMNS.find(c => c.id === col)?.color || 'var(--ink-faint)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{DATA.COLUMNS.find(c => c.id === col)?.title_tr || window.t('modal_select')}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                {colOpen && ReactDOM.createPortal(
                  <div ref={colMenuRef} className="custom-dropdown-menu"
                    style={{ position: 'fixed', top: colPos.top, left: colPos.left, minWidth: colPos.width, maxWidth: 320, zIndex: 9999 }}>
                    {DATA.COLUMNS.map(c => (
                      <button key={c.id} type="button"
                        className={`custom-dropdown-item${c.id === col ? ' active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        onClick={() => { setCol(c.id); setColOpen(false); }}>
                        <span className="col-dot" style={{ background: c.is_done ? 'var(--status-green)' : c.color, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title_tr}</span>
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
            </div>
            <div className="field">
              <label>{window.t('modal_priority_label')}</label>
              <div className="priority-pills-select">
                {[{id:'low',label:window.t('board_priority_low')},{id:'mid',label:window.t('board_priority_mid')},{id:'high',label:window.t('board_priority_high')}].map(p => (
                  <button key={p.id} type="button" className="priority-pill-btn"
                    data-active={priority === p.id} data-p={p.id}
                    onClick={() => setPriority(p.id)}>
                    <span className="priority-dot" data-p={p.id} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{window.t('modal_start_label')} {startError && <span style={{ color: 'var(--status-rose)', fontWeight: 400, fontSize: 11 }}>— {window.t('modal_required')}</span>}</label>
              <DatePicker value={startDate} onChange={(v) => { setStartDate(v); setStartError(false); }} error={startError} />
            </div>
            <div className="field">
              <label>{window.t('modal_due_label')} {dueError && <span style={{ color: 'var(--status-rose)', fontWeight: 400, fontSize: 11 }}>— {window.t('modal_required')}</span>}</label>
              <DatePicker value={due} onChange={(v) => { setDue(v); setDueError(false); }} error={dueError} />
            </div>
          </div>
          {assignees.length > 1 && (
            <div className="field">
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', userSelect:'none' }}
                onClick={() => setShowPerAssignee(s => !s)}>
                <Icon name={showPerAssignee ? 'chevronDown' : 'chevronRight'} size={11} />
                {window.t('modal_per_assignee_dates')}
              </label>
              {showPerAssignee && (
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:8 }}>
                  {assignees.map(slug => {
                    const member = DATA.MEMBERS.find(m => m.id === slug);
                    if (!member) return null;
                    const d = assigneeDates[slug] || {};
                    return (
                      <div key={slug} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:80 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:member.color, flexShrink:0 }} />
                          <span style={{ fontSize:12, color:'var(--ink-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {member.name.split(' ')[0]}
                          </span>
                        </div>
                        <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                          <DatePicker value={d.start || ''} onChange={(v) => setAsgDate(slug, 'start', v)} />
                          <DatePicker value={d.end   || ''} onChange={(v) => setAsgDate(slug, 'end',   v)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="field">
            <label>{window.t('modal_labels_label')}</label>
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
            <label>{window.t('modal_assignee_label')}</label>
            <div className="chips">
              {DATA.MEMBERS.map(m => (
                <div key={m.id} className="chip" data-selected={assignees.includes(m.id)} onClick={() => toggleAssignee(m.id)}>
                  <Avatar member={m} size="sm" />
                  {m.name.split(' ')[0]}
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{window.t?.('modal_checklist_label') || 'Yapılacaklar'}</label>
            {checklistItems.length > 0 && (
              <div className="modal-checklist">
                {checklistItems.map((item, i) => (
                  <div key={i} className="modal-checklist-item">
                    <span className="modal-checklist-dot" />
                    <span style={{ flex: 1, fontSize: 13 }}>{item}</span>
                    <button className="modal-checklist-del" onClick={() => setChecklistItems(prev => prev.filter((_, j) => j !== i))}>
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-checklist-input-row">
              <input
                ref={checklistRef}
                placeholder={window.t?.('modal_checklist_placeholder') || 'Madde ekle…'}
                value={checklistInput}
                onChange={e => setChecklistInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
              />
              <button className="btn btn-ghost" onClick={addChecklistItem} disabled={!checklistInput.trim()}>
                {window.t?.('modal_checklist_add') || '+ Ekle'}
              </button>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>{window.t('app_cancel')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="plus" size={13} /> {busy ? window.t('app_creating') : window.t('modal_create_task')}
          </button>
        </div>
      </div>
    </div>
  );
}

window.AddTaskModal = AddTaskModal;