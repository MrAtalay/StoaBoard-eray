// Calendar view — month / week / agenda with date-range bars & Turkish holidays

const { useState: useCalState, useMemo: useCalMemo, useCallback: useCalCb } = React;

const CAL_MONTHS     = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const CAL_DAYS_SHORT = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

// ── Turkish national holidays ─────────────────────────────────────────────────
const TR_FIXED_HOL = [
  [1,  1,  'Yılbaşı'],
  [4,  23, 'Ulusal Egemenlik ve Çocuk Bayramı'],
  [5,  1,  'Emek ve Dayanışma Günü'],
  [5,  19, 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı'],
  [7,  15, 'Demokrasi ve Millî Birlik Günü'],
  [8,  30, 'Zafer Bayramı'],
  [10, 28, 'Cumhuriyet Bayramı'],
  [10, 29, 'Cumhuriyet Bayramı'],
];

const TR_VAR_HOL = {
  2024: ['2024-04-10','2024-04-11','2024-04-12','2024-06-17','2024-06-18','2024-06-19','2024-06-20'],
  2025: ['2025-03-30','2025-03-31','2025-04-01','2025-06-06','2025-06-07','2025-06-08','2025-06-09'],
  2026: ['2026-03-20','2026-03-21','2026-03-22','2026-05-27','2026-05-28','2026-05-29','2026-05-30'],
  2027: ['2027-03-09','2027-03-10','2027-03-11','2027-05-16','2027-05-17','2027-05-18','2027-05-19'],
};
const TR_VAR_HOL_NAMES = {
  2024: { '2024-04-10':'Ramazan Bayramı','2024-04-11':'Ramazan Bayramı','2024-04-12':'Ramazan Bayramı',
          '2024-06-17':'Kurban Bayramı','2024-06-18':'Kurban Bayramı','2024-06-19':'Kurban Bayramı','2024-06-20':'Kurban Bayramı' },
  2025: { '2025-03-30':'Ramazan Bayramı','2025-03-31':'Ramazan Bayramı','2025-04-01':'Ramazan Bayramı',
          '2025-06-06':'Kurban Bayramı','2025-06-07':'Kurban Bayramı','2025-06-08':'Kurban Bayramı','2025-06-09':'Kurban Bayramı' },
  2026: { '2026-03-20':'Ramazan Bayramı','2026-03-21':'Ramazan Bayramı','2026-03-22':'Ramazan Bayramı',
          '2026-05-27':'Kurban Bayramı','2026-05-28':'Kurban Bayramı','2026-05-29':'Kurban Bayramı','2026-05-30':'Kurban Bayramı' },
  2027: { '2027-03-09':'Ramazan Bayramı','2027-03-10':'Ramazan Bayramı','2027-03-11':'Ramazan Bayramı',
          '2027-05-16':'Kurban Bayramı','2027-05-17':'Kurban Bayramı','2027-05-18':'Kurban Bayramı','2027-05-19':'Kurban Bayramı' },
};

function getHoliday(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  for (const [fm, fd, name] of TR_FIXED_HOL) {
    if (fm === m && fd === d) return name;
  }
  return (TR_VAR_HOL_NAMES[y] || {})[dateStr] || null;
}

function fmtDateRange(s, e) {
  if (!s && !e) return '';
  if (s === e || !e) return DATA.fmtDate(s || e);
  if (!s) return DATA.fmtDate(e);
  return `${DATA.fmtDate(s)} – ${DATA.fmtDate(e)}`;
}

function CalendarView({ tasks, onOpenTask, onOpenModal, canCreateTasks }) {
  const [cursor, setCursor]     = useCalState(() => new Date());
  const [calView, setCalView]   = useCalState('month');
  const [rangeStart, setRangeStart] = useCalState(null);
  const [hoverDate, setHoverDate]   = useCalState(null);
  const [barTooltip, setBarTooltip] = useCalState(null); // {text, x, y}

  const today    = new Date().toISOString().slice(0, 10);
  const myId     = window.CURRENT_USER?.id;
  const year     = cursor.getFullYear();
  const month    = cursor.getMonth();
  const monthName = CAL_MONTHS[month];

  // ── Month grid cells ──────────────────────────────────────────────────────
  const firstDay    = new Date(year, month, 1);
  const startDOW    = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startDOW - 1; i >= 0; i--)
    cells.push({ day: prevMonthDays - i, other: true, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({ day: d, other: false, dateStr, isToday: dateStr === today });
  }
  while (cells.length < 42)
    cells.push({ day: cells.length - daysInMonth - startDOW + 1, other: true, dateStr: null });

  // ── Week grid ─────────────────────────────────────────────────────────────
  const weekStart = new Date(cursor);
  weekStart.setDate(cursor.getDate() - (cursor.getDay() + 6) % 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const wEnd = weekDays[6];
  const weekTitle = weekStart.getMonth() === wEnd.getMonth()
    ? `${weekStart.getDate()}–${wEnd.getDate()} ${CAL_MONTHS[wEnd.getMonth()]} ${wEnd.getFullYear()}`
    : `${weekStart.getDate()} ${CAL_MONTHS[weekStart.getMonth()]} – ${wEnd.getDate()} ${CAL_MONTHS[wEnd.getMonth()]} ${wEnd.getFullYear()}`;

  // ── Agenda groups ─────────────────────────────────────────────────────────
  const agendaGroups = [];
  const sorted = [...tasks].filter(t => t.due).sort((a, b) => a.due.localeCompare(b.due));
  for (const t of sorted) {
    const last = agendaGroups[agendaGroups.length - 1];
    if (!last || last.date !== t.due) agendaGroups.push({ date: t.due, tasks: [t] });
    else last.tasks.push(t);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  const moveMonth = (d) => setCursor(new Date(year, month + d, 1));
  const moveWeek  = (d) => { const n = new Date(cursor); n.setDate(n.getDate() + d * 7); setCursor(n); };
  const nav = (d) => calView === 'week' ? moveWeek(d) : moveMonth(d);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const tasksFor = (ds) => tasks.filter(t => t.due === ds && !t.start);
  const overdue  = tasks.filter(t => DATA.isOverdue(t.due, t.col)).length;
  const chipTone = (t) => DATA.LABELS[(t.labels || [])[0]]?.tone || 'slate';
  const dateStr  = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // ── Date range bars ───────────────────────────────────────────────────────
  const dateRangeBars = useCalMemo(() => {
    const bars = [];
    for (const t of tasks) {
      const ad = t.assignee_dates;
      const hasAd = ad && Object.keys(ad).length > 0;
      if (hasAd) {
        for (const [slug, d] of Object.entries(ad)) {
          if (!d || (!d.start && !d.end)) continue;
          const s = d.start || d.end;
          const e = d.end   || d.start;
          const member = DATA.MEMBERS.find(m => m.id === slug);
          bars.push({
            id: `${t.id}_${slug}`,
            task: t,
            start: s <= e ? s : e,
            end:   s <= e ? e : s,
            color: member?.color || 'var(--accent)',
            tooltip: `${member?.name || slug}: ${fmtDateRange(s, e)}`,
          });
        }
      } else if (t.start) {
        const s = t.start;
        const e = t.due || t.start;
        const start = s <= e ? s : e;
        const end   = s <= e ? e : s;
        const firstSlug = (t.assignees || [])[0];
        const member = firstSlug ? DATA.MEMBERS.find(m => m.id === firstSlug) : null;
        bars.push({
          id: String(t.id),
          task: t,
          start, end,
          color: member?.color || 'var(--accent)',
          tooltip: `${t.title}: ${fmtDateRange(start, end)}`,
        });
      }
    }
    return bars;
  }, [tasks]);

  const barsFor = (ds) => dateRangeBars.filter(b => b.start <= ds && b.end >= ds);

  // ── Range selection logic ─────────────────────────────────────────────────
  const rangeEnd = rangeStart && hoverDate && hoverDate >= rangeStart ? hoverDate : null;

  const handleDayClick = useCalCb((ds, e) => {
    if (!ds) return;
    if (e.target.closest('.cal-chip') || e.target.closest('.cal-bar')) return;

    if (!rangeStart) {
      setRangeStart(ds);
    } else if (ds === rangeStart) {
      setRangeStart(null);
      if (onOpenModal && canCreateTasks) onOpenModal('todo', { start: ds, end: ds });
    } else if (ds > rangeStart) {
      const s = rangeStart;
      setRangeStart(null);
      if (onOpenModal && canCreateTasks) onOpenModal('todo', { start: s, end: ds });
    } else {
      setRangeStart(ds);
    }
  }, [rangeStart, onOpenModal, canCreateTasks]);

  const isInRange = (ds) => {
    if (!ds || !rangeStart) return false;
    const end = rangeEnd || hoverDate;
    if (!end || end < rangeStart) return false;
    return ds >= rangeStart && ds <= end;
  };

  // ── Render bar segment for a single cell ─────────────────────────────────
  const renderBars = (ds) => {
    if (!ds) return null;
    const bars = barsFor(ds);
    if (bars.length === 0) return null;
    // Limit to 3 bars per cell, show "+N" if more
    const visible = bars.slice(0, 3);
    const extra = bars.length - 3;
    return (
      <>
        {visible.map(b => {
          const isStart = b.start === ds;
          const isEnd   = b.end   === ds;
          return (
            <div
              key={b.id}
              className="cal-bar"
              data-start={isStart}
              data-end={isEnd}
              data-mine={!!(myId && (b.task.assignees||[]).includes(myId))}
              style={{ background: b.color }}
              title={b.tooltip}
              onMouseEnter={(e) => setBarTooltip({ text: b.tooltip, x: e.clientX, y: e.clientY })}
              onMouseMove={(e)  => setBarTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={()  => setBarTooltip(null)}
              onClick={(ev) => { ev.stopPropagation(); onOpenTask(b.task); }}
            />
          );
        })}
        {extra > 0 && <div style={{ fontSize:9, color:'var(--ink-faint)', paddingLeft:2 }}>+{extra}</div>}
      </>
    );
  };

  // ── Holiday marker ────────────────────────────────────────────────────────
  const renderHoliday = (ds) => {
    const name = getHoliday(ds);
    if (!name) return null;
    return (
      <div
        className="cal-holiday-dot"
        title={name}
        onMouseEnter={(e) => setBarTooltip({ text: name, x: e.clientX, y: e.clientY })}
        onMouseMove={(e)  => setBarTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
        onMouseLeave={()  => setBarTooltip(null)}
      />
    );
  };

  return (
    <div className="cal-wrap" onClick={() => { if (rangeStart) setRangeStart(null); }}>

      {/* ── Tooltip portal ── */}
      {barTooltip && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', left: barTooltip.x + 10, top: barTooltip.y - 28,
          background: 'var(--ink)', color: 'white', borderRadius: 6, padding: '4px 10px',
          fontSize: 11, pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px oklch(0% 0 0 / 0.25)',
        }}>
          {barTooltip.text}
        </div>,
        document.body
      )}

      {/* ── Header ── */}
      <div className="cal-header">
        <div>
          <div className="cal-title">TAKVİM</div>
          <div className="cal-month">
            {calView === 'week' ? weekTitle : <>{monthName} <em>{year}</em></>}
          </div>
        </div>
        <div className="cal-header-actions">
          {calView !== 'agenda' && (
            <div className="cal-nav">
              <button className="icon-btn" onClick={() => nav(-1)}><Icon name="chevronLeft" size={15} /></button>
              <button className="icon-btn" onClick={() => nav(1)}><Icon name="chevronRight" size={15} /></button>
            </div>
          )}
          <button className="btn btn-ghost" onClick={() => setCursor(new Date())}>Bugün</button>
        </div>
      </div>

      {/* ── Stats + view tabs ── */}
      <div className="cal-panels">
        <div className="cal-summary">
          <div className="cal-stat"><span>Toplam görev</span><strong>{tasks.length}</strong></div>
          <div className="cal-stat"><span>Bugün</span><strong>{tasksFor(today).length}</strong></div>
          <div className="cal-stat"><span>Gecikmiş</span><strong>{overdue}</strong></div>
        </div>
        <div className="cal-filter-row">
          <span>Görünüm:</span>
          {[['month','Ay'],['week','Hafta'],['agenda','Ajanda']].map(([v, label]) => (
            <button key={v} className="filter-chip" data-active={calView === v} onClick={() => setCalView(v)}>
              {label}
            </button>
          ))}
          {rangeStart && (
            <span style={{ fontSize:12, color:'var(--accent)', marginLeft:8 }}>
              Başlangıç: {DATA.fmtDate(rangeStart)} · ikinci gün seç
              <button style={{ marginLeft:6, fontSize:11, color:'var(--ink-muted)' }} onClick={(e) => { e.stopPropagation(); setRangeStart(null); }}>
                ✕
              </button>
            </span>
          )}
        </div>
      </div>

      {/* ── Month view ── */}
      {calView === 'month' && (
        <div className="cal-grid" onClick={(e) => e.stopPropagation()}>
          {CAL_DAYS_SHORT.map(w => <div key={w} className="cal-weekday">{w}</div>)}
          {cells.map((c, i) => {
            const dayTasks = c.dateStr ? tasksFor(c.dateStr) : [];
            const MAX_VISIBLE = 2;
            const visible = dayTasks.slice(0, MAX_VISIBLE);
            const rest    = dayTasks.length - MAX_VISIBLE;
            const holiday = c.dateStr ? getHoliday(c.dateStr) : null;
            const inRange = c.dateStr && isInRange(c.dateStr);
            const isRS    = c.dateStr === rangeStart;
            return (
              <div
                key={i}
                className="cal-day"
                data-other={c.other}
                data-today={c.isToday}
                data-range-start={isRS || undefined}
                data-in-range={inRange || undefined}
                style={canCreateTasks && c.dateStr ? { cursor: 'pointer' } : undefined}
                onClick={(e) => c.dateStr && handleDayClick(c.dateStr, e)}
                onMouseEnter={() => c.dateStr && setHoverDate(c.dateStr)}
                onMouseLeave={() => setHoverDate(null)}
              >
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div className="day-num">{c.day}</div>
                  {holiday && renderHoliday(c.dateStr)}
                </div>
                {c.dateStr && renderBars(c.dateStr)}
                {visible.map(t => (
                  <div key={t.id} className="cal-chip" data-tone={chipTone(t)} data-mine={myId && (t.assignees||[]).includes(myId)} onClick={(e) => { e.stopPropagation(); onOpenTask(t); }} title={t.title}>
                    {t.title}
                  </div>
                ))}
                {rest > 0 && <div className="cal-more">+{rest} daha</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Week view ── */}
      {calView === 'week' && (
        <div className="cal-week-grid" onClick={(e) => e.stopPropagation()}>
          {weekDays.map((d, idx) => {
            const ds        = dateStr(d);
            const dayTasks  = tasksFor(ds);
            const isToday   = ds === today;
            const isWeekend = idx >= 5;
            const holiday   = getHoliday(ds);
            const inRange   = isInRange(ds);
            const isRS      = ds === rangeStart;
            return (
              <div
                key={ds}
                className="cal-week-col"
                data-today={isToday}
                data-weekend={isWeekend}
                data-range-start={isRS || undefined}
                data-in-range={inRange || undefined}
                style={canCreateTasks ? { cursor: 'pointer' } : undefined}
                onClick={(e) => handleDayClick(ds, e)}
                onMouseEnter={() => setHoverDate(ds)}
                onMouseLeave={() => setHoverDate(null)}
              >
                <div className="cal-week-head">
                  <span className="cal-week-dow">{CAL_DAYS_SHORT[idx]}</span>
                  <span className="cal-week-date" data-today={isToday}>{d.getDate()}</span>
                  {holiday && (
                    <div className="cal-holiday-dot"
                      title={holiday}
                      onMouseEnter={(e) => setBarTooltip({ text: holiday, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setBarTooltip(null)}
                    />
                  )}
                </div>
                {/* Bars */}
                <div style={{ padding:'2px 4px' }}>
                  {barsFor(ds).slice(0, 4).map(b => {
                    const isStart = b.start === ds;
                    const isEnd   = b.end   === ds;
                    return (
                      <div
                        key={b.id}
                        className="cal-bar"
                        data-start={isStart}
                        data-end={isEnd}
                        data-mine={!!(myId && (b.task.assignees||[]).includes(myId))}
                        style={{ background: b.color }}
                        onMouseEnter={(e) => setBarTooltip({ text: b.tooltip, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e)  => setBarTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                        onMouseLeave={()  => setBarTooltip(null)}
                        onClick={(ev) => { ev.stopPropagation(); onOpenTask(b.task); }}
                      />
                    );
                  })}
                </div>
                <div className="cal-week-body">
                  {dayTasks.map(t => {
                    const overdueT = DATA.isOverdue(t.due, t.col);
                    return (
                      <div key={t.id} className="cal-week-chip" data-tone={chipTone(t)} data-overdue={overdueT} data-mine={myId && (t.assignees||[]).includes(myId)} onClick={(e) => { e.stopPropagation(); onOpenTask(t); }}>
                        <span className="cal-week-chip-title">{t.title}</span>
                        {t.priority === 'high' && <Icon name="arrowUp" size={10} style={{ color:'var(--status-rose)', flexShrink:0 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Agenda view ── */}
      {calView === 'agenda' && (
        <div className="cal-agenda">
          {agendaGroups.length === 0
            ? <div className="cal-empty">Son tarihi olan görev yok.</div>
            : agendaGroups.map(g => {
              const isPast  = g.date < today;
              const isTodayG = g.date === today;
              return (
                <div key={g.date} className="agenda-group">
                  <div className="agenda-date-header" data-past={isPast} data-today={isTodayG}>
                    <span className="agenda-date-label">
                      {isTodayG ? 'Bugün' : DATA.fmtDate(g.date)}
                    </span>
                    {isPast && !isTodayG && <span className="agenda-badge agenda-badge-late">Geçmiş</span>}
                    {isTodayG           && <span className="agenda-badge agenda-badge-today">Bugün</span>}
                    {getHoliday(g.date) && <span className="agenda-badge" style={{ background:'oklch(62% 0.15 30 / 0.15)', color:'oklch(52% 0.15 30)' }}>{getHoliday(g.date)}</span>}
                    <span className="agenda-task-count">{g.tasks.length} görev</span>
                  </div>
                  {g.tasks.map(t => {
                    const colObj     = DATA.COLUMNS.find(c => c.id === t.col);
                    const rowMembers = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                    return (
                      <div key={t.id} className="agenda-item" data-tone={chipTone(t)} data-mine={myId && (t.assignees||[]).includes(myId)} onClick={() => onOpenTask(t)}>
                        <div className="agenda-item-bar" />
                        <div className="agenda-item-body">
                          <div className="agenda-item-title">{t.title}</div>
                          <div className="agenda-item-meta">
                            <span className="status-pill">{colObj?.title_tr || t.col}</span>
                            {t.start && <span style={{ fontSize:11, color:'var(--ink-muted)' }}>{DATA.fmtDate(t.start)} – {DATA.fmtDate(t.due)}</span>}
                            {rowMembers.length > 0 && <AvatarStack members={rowMembers} size="sm" max={3} />}
                          </div>
                        </div>
                        <Icon name="chevronRight" size={13} style={{ color:'var(--ink-faint)', flexShrink:0 }} />
                      </div>
                    );
                  })}
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
}

window.CalendarView = CalendarView;
