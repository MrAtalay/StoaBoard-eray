// Calendar view — month / week / agenda with date-range bars & Turkish holidays

const { useState: useCalState, useMemo: useCalMemo, useCallback: useCalCb } = React;

const CAL_MONTHS     = () => (window.t?.('cal_months') || 'Ocak,Şubat,Mart,Nisan,Mayıs,Haziran,Temmuz,Ağustos,Eylül,Ekim,Kasım,Aralık').split(',');
const CAL_DAYS_SHORT = () => (window.t?.('cal_days_short') || 'Pzt,Sal,Çar,Per,Cum,Cmt,Paz').split(',');

// Color palette for overlapping bar rotation
const CAL_COLOR_PALETTE = ['#2e7d32','#c62828','#1565c0','#e65100','#37474f','#6a1b9a','#00838f','#558b2f'];

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

// ISO date string from a Date object
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function CalendarView({ tasks: rawTasks, onOpenTask, onOpenModal, canCreateTasks }) {
  const [cursor, setCursor]         = useCalState(() => new Date());
  const [calView, setCalView]       = useCalState('month');
  const [rangeStart, setRangeStart] = useCalState(null);
  const [hoverDate, setHoverDate]   = useCalState(null);
  const [barTooltip, setBarTooltip] = useCalState(null);
  const [onlyMine, setOnlyMine]     = useCalState(() => localStorage.getItem('stoa.calMine') === 'true');
  const [selectedDate, setSelectedDate] = useCalState(null);

  React.useEffect(() => { localStorage.setItem('stoa.calMine', onlyMine ? 'true' : 'false'); }, [onlyMine]);

  const meId  = window.CURRENT_USER?.id;
  const myId  = meId;
  const tasks = onlyMine && meId
    ? rawTasks.filter(t => (t.assignees || []).includes(meId))
    : rawTasks;

  const today     = new Date().toISOString().slice(0, 10);
  const year      = cursor.getFullYear();
  const month     = cursor.getMonth();
  const monthName = CAL_MONTHS()[month];

  // ── Month grid cells ──────────────────────────────────────────────────────
  const firstDay      = new Date(year, month, 1);
  const startDOW      = (firstDay.getDay() + 6) % 7;
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startDOW - 1; i >= 0; i--)
    cells.push({ day: prevMonthDays - i, other: true, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({ day: d, other: false, dateStr: ds, isToday: ds === today });
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
  const wEnd      = weekDays[6];
  const weekTitle = weekStart.getMonth() === wEnd.getMonth()
    ? `${weekStart.getDate()}–${wEnd.getDate()} ${CAL_MONTHS()[wEnd.getMonth()]} ${wEnd.getFullYear()}`
    : `${weekStart.getDate()} ${CAL_MONTHS()[weekStart.getMonth()]} – ${wEnd.getDate()} ${CAL_MONTHS()[wEnd.getMonth()]} ${wEnd.getFullYear()}`;

  // ── Agenda groups ─────────────────────────────────────────────────────────
  const agendaGroups = [];
  const sorted = [...tasks].filter(t => t.due).sort((a, b) => a.due.localeCompare(b.due));
  for (const t of sorted) {
    const last = agendaGroups[agendaGroups.length - 1];
    if (!last || last.date !== t.due) agendaGroups.push({ date: t.due, tasks: [t] });
    else last.tasks.push(t);
  }

  // ── Navigation — stopPropagation so rangeStart survives month changes ─────
  const moveMonth = (d, e) => { e?.stopPropagation(); setCursor(new Date(year, month + d, 1)); };
  const moveWeek  = (d, e) => { e?.stopPropagation(); const n = new Date(cursor); n.setDate(n.getDate() + d * 7); setCursor(n); };
  const nav       = (d, e) => calView === 'week' ? moveWeek(d, e) : moveMonth(d, e);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const tasksFor = (ds) => tasks.filter(t => t.due === ds && !t.start);
  const overdue  = tasks.filter(t => DATA.isOverdue(t.due, t.col)).length;
  const chipTone = (t) => DATA.LABELS[(t.labels || [])[0]]?.tone || 'slate';

  // ── Date range bars with palette color rotation ───────────────────────────
  const dateRangeBars = useCalMemo(() => {
    const bars = [];
    for (const t of tasks) {
      const ad    = t.assignee_dates;
      const hasAd = ad && Object.keys(ad).length > 0;
      if (hasAd) {
        for (const [slug, d] of Object.entries(ad)) {
          if (!d || (!d.start && !d.end)) continue;
          const s      = d.start || d.end;
          const e      = d.end   || d.start;
          const member = DATA.MEMBERS.find(m => m.id === slug);
          bars.push({
            id: `${t.id}_${slug}`,
            task: t,
            start: s <= e ? s : e,
            end:   s <= e ? e : s,
            tooltip: `${member?.name || slug}: ${fmtDateRange(s, e)}`,
          });
        }
      } else if (t.start) {
        const s     = t.start;
        const e     = t.due || t.start;
        const start = s <= e ? s : e;
        const end   = s <= e ? e : s;
        bars.push({
          id: String(t.id),
          task: t,
          start, end,
          tooltip: `${t.title}: ${fmtDateRange(start, end)}`,
        });
      }
    }

    // Assign palette colors so overlapping bars on the same day get different colors
    bars.sort((a, b) => a.start.localeCompare(b.start));
    for (const bar of bars) {
      const usedColors = new Set(
        bars
          .filter(b => b !== bar && b.paletteColor && b.start <= bar.end && b.end >= bar.start)
          .map(b => b.paletteColor)
      );
      bar.paletteColor = CAL_COLOR_PALETTE.find(c => !usedColors.has(c)) || CAL_COLOR_PALETTE[0];
    }
    return bars;
  }, [tasks]);

  const barsFor = (ds) => dateRangeBars.filter(b => b.start <= ds && b.end >= ds);

  // ── Max-5 validation ──────────────────────────────────────────────────────
  const countTasksOnDay = (ds) =>
    tasks.filter(t => t.due === ds && !t.start).length +
    dateRangeBars.filter(b => b.start <= ds && b.end >= ds).length;

  const validateRange = (start, end) => {
    let d = new Date(start + 'T00:00:00');
    const endD = new Date(end + 'T00:00:00');
    let safety = 0;
    while (d <= endD && safety < 400) {
      if (countTasksOnDay(toDateStr(d)) >= 5) {
        window.showToast?.('Maksimum limite geldiniz! Aynı tarihler arasında en fazla 5 görev atanabilir.', 'error');
        return false;
      }
      d.setDate(d.getDate() + 1);
      safety++;
    }
    return true;
  };

  // ── Range selection ───────────────────────────────────────────────────────
  const rangeEnd = rangeStart && hoverDate && hoverDate >= rangeStart ? hoverDate : null;

  const handleDayClick = useCalCb((ds, e) => {
    if (!ds) return;
    if (e.target.closest('.cal-chip') || e.target.closest('.cal-bar')) return;

    setSelectedDate(ds);

    if (!rangeStart) {
      setRangeStart(ds);
    } else if (ds === rangeStart) {
      setRangeStart(null);
      if (onOpenModal && canCreateTasks && validateRange(ds, ds))
        onOpenModal('todo', { start: ds, end: ds });
    } else if (ds > rangeStart) {
      const s = rangeStart;
      setRangeStart(null);
      if (onOpenModal && canCreateTasks && validateRange(s, ds))
        onOpenModal('todo', { start: s, end: ds });
    } else {
      // Clicked a date before rangeStart → reset start to new date
      setRangeStart(ds);
    }
  }, [rangeStart, onOpenModal, canCreateTasks, tasks, dateRangeBars]);

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
    const visible = bars.slice(0, 3);
    const extra   = bars.length - 3;
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
              style={{ background: b.paletteColor }}
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

  // ── Mini calendar ─────────────────────────────────────────────────────────
  const [miniCursor, setMiniCursor] = useCalState(() => new Date());
  React.useEffect(() => { setMiniCursor(new Date(year, month, 1)); }, [year, month]);

  const miniY        = miniCursor.getFullYear();
  const miniM        = miniCursor.getMonth();
  const miniFirstDOW = (new Date(miniY, miniM, 1).getDay() + 6) % 7;
  const miniDaysIn   = new Date(miniY, miniM + 1, 0).getDate();
  const miniPrevDays = new Date(miniY, miniM, 0).getDate();

  const miniCells = [];
  for (let i = miniFirstDOW - 1; i >= 0; i--)
    miniCells.push({ day: miniPrevDays - i, other: true, dateStr: null });
  for (let d = 1; d <= miniDaysIn; d++) {
    const ds = `${miniY}-${String(miniM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    miniCells.push({ day: d, other: false, dateStr: ds });
  }
  while (miniCells.length < 42)
    miniCells.push({ day: miniCells.length - miniDaysIn - miniFirstDOW + 1, other: true, dateStr: null });

  // Pre-compute all dates that have at least one task (for mini calendar dots)
  const allTaskDates = useCalMemo(() => {
    const set = new Set();
    for (const t of tasks) {
      if (t.due) set.add(t.due);
      if (t.start) set.add(t.start);
      // Fill every day inside a range
      if (t.start && t.due && t.due !== t.start) {
        let d = new Date(t.start + 'T00:00:00');
        const endD = new Date(t.due + 'T00:00:00');
        let guard = 0;
        while (d <= endD && guard < 400) {
          set.add(toDateStr(d));
          d.setDate(d.getDate() + 1);
          guard++;
        }
      }
      // Assignee date ranges
      if (t.assignee_dates) {
        for (const ad of Object.values(t.assignee_dates)) {
          if (!ad) continue;
          const s = ad.start || ad.end;
          const e = ad.end   || ad.start;
          if (!s) continue;
          let d = new Date(s + 'T00:00:00');
          const endD = new Date(e + 'T00:00:00');
          let guard = 0;
          while (d <= endD && guard < 400) {
            set.add(toDateStr(d));
            d.setDate(d.getDate() + 1);
            guard++;
          }
        }
      }
    }
    return set;
  }, [tasks]);

  // ── Right panel: tasks for the whole week the cursor sits in ──────────────
  const cursorWeekMon = new Date(cursor);
  cursorWeekMon.setDate(cursor.getDate() - (cursor.getDay() + 6) % 7);
  const cursorWeekSun = new Date(cursorWeekMon);
  cursorWeekSun.setDate(cursorWeekMon.getDate() + 6);
  const weekPanelStart = toDateStr(cursorWeekMon);
  const weekPanelEnd   = toDateStr(cursorWeekSun);

  const contextTasksList = useCalMemo(() => {
    return tasks
      .filter(t => {
        const due   = t.due   || '';
        const start = t.start || due;
        if (!due && !start) return false;
        return (due >= weekPanelStart && due <= weekPanelEnd)
            || (start >= weekPanelStart && start <= weekPanelEnd)
            || (start < weekPanelStart && due > weekPanelEnd);
      })
      .sort((a, b) => ((a.start || a.due) || '').localeCompare((b.start || b.due) || ''));
  }, [tasks, weekPanelStart, weekPanelEnd]);

  // ── Tasks for the specifically selected date ──────────────────────────────
  const selectedDateTasks = useCalMemo(() => {
    if (!selectedDate) return [];
    return tasks.filter(t => {
      const due   = t.due || '';
      const start = t.start || due;
      if (!due && !start) return false;
      // Task range spans the selected date
      if (start && due && start <= selectedDate && due >= selectedDate) return true;
      if (!start && due === selectedDate) return true;
      // Assignee date ranges
      const adVals = t.assignee_dates ? Object.values(t.assignee_dates) : [];
      return adVals.some(d => {
        if (!d) return false;
        const s = d.start || d.end;
        const e = d.end   || d.start;
        return s && e && s <= selectedDate && e >= selectedDate;
      });
    }).sort((a, b) => ((a.start || a.due) || '').localeCompare((b.start || b.due) || ''));
  }, [tasks, selectedDate]);

  // ── Guidance text (dynamically changes when rangeStart is set) ────────────
  const guidanceText = canCreateTasks
    ? (rangeStart
        ? 'Bitiş tarihini seçin — aynı güne tıklarsanız tek günlük görev oluşturulur.'
        : '+ Yeni görev oluşturmak için takvimde bir başlangıç tarihi seçin.')
    : null;

  // ─────────────────────────────────────────────────────────────────────────
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
          <div className="cal-title">{window.t('cal_title')}</div>
          <div className="cal-month">
            {calView === 'week' ? weekTitle : <>{monthName} <em>{year}</em></>}
          </div>
        </div>
        <div className="cal-header-actions">
          {calView !== 'agenda' && (
            <div className="cal-nav">
              <button className="icon-btn" onClick={(e) => nav(-1, e)}><Icon name="chevronLeft" size={15} /></button>
              <button className="icon-btn" onClick={(e) => nav(1, e)}><Icon name="chevronRight" size={15} /></button>
            </div>
          )}
          <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); setCursor(new Date()); }}>{window.t('cal_today')}</button>
          <button
            className="filter-priority-chip"
            data-active={onlyMine}
            onClick={(e) => { e.stopPropagation(); setOnlyMine(v => !v); }}
          >
            <Icon name="user" size={11} />
            {window.t('cal_only_mine')}
          </button>
          {canCreateTasks && (
            <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onOpenModal?.('todo'); }}>
              <Icon name="plus" size={13} /> {window.t('cal_new_task')}
            </button>
          )}
        </div>
      </div>

      {/* ── Stats + view tabs ── */}
      <div className="cal-panels">
        <div className="cal-summary">
          <div className="cal-stat"><span>{window.t('cal_total')}</span><strong>{tasks.length}</strong></div>
          <div className="cal-stat"><span>{window.t('cal_today')}</span><strong>{tasksFor(today).length}</strong></div>
          <div className="cal-stat"><span>{window.t('cal_overdue')}</span><strong>{overdue}</strong></div>
        </div>
        <div className="cal-filter-row" onClick={(e) => e.stopPropagation()}>
          <span>{window.t('cal_view')}</span>
          {[['month',window.t('cal_month')],['week',window.t('cal_week')],['agenda',window.t('cal_agenda')]].map(([v, label]) => (
            <button key={v} className="filter-chip" data-active={calView === v} onClick={() => setCalView(v)}>
              {label}
            </button>
          ))}
          {guidanceText && (
            <span
              className="cal-guidance-text"
              style={{
                marginLeft: 'auto',
                fontSize: 11.5,
                color: rangeStart ? 'var(--accent)' : 'var(--ink-muted)',
                fontStyle: 'italic',
                transition: 'color 0.25s ease, opacity 0.25s ease',
                opacity: rangeStart ? 1 : 0.75,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {guidanceText}
              {rangeStart && (
                <button
                  style={{ fontSize: 11, color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                  onClick={(e) => { e.stopPropagation(); setRangeStart(null); }}
                >
                  ✕
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Month view ── */}
      {calView === 'month' && (
        <div className="cal-grid" onClick={(e) => e.stopPropagation()}>
          {CAL_DAYS_SHORT().map(w => <div key={w} className="cal-weekday">{w}</div>)}
          {cells.map((c, i) => {
            const dayTasks   = c.dateStr ? tasksFor(c.dateStr) : [];
            const MAX_VISIBLE = 2;
            const visible    = dayTasks.slice(0, MAX_VISIBLE);
            const rest       = dayTasks.length - MAX_VISIBLE;
            const holiday    = c.dateStr ? getHoliday(c.dateStr) : null;
            const inRange    = c.dateStr && isInRange(c.dateStr);
            const isRS       = c.dateStr === rangeStart;
            const dayCount   = c.dateStr ? countTasksOnDay(c.dateStr) : 0;
            return (
              <div
                key={i}
                className="cal-day"
                data-other={c.other}
                data-today={c.isToday}
                data-range-start={isRS || undefined}
                data-in-range={inRange || undefined}
                data-full={dayCount >= 5 || undefined}
                style={canCreateTasks && c.dateStr ? { cursor: 'pointer' } : undefined}
                onClick={(e) => c.dateStr && handleDayClick(c.dateStr, e)}
                onMouseEnter={() => c.dateStr && setHoverDate(c.dateStr)}
                onMouseLeave={() => setHoverDate(null)}
              >
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div className="day-num">{c.day}</div>
                  {holiday && renderHoliday(c.dateStr)}
                  {dayCount >= 5 && (
                    <span title="Bu gün dolu (maks. 5 görev)" style={{ fontSize: 9, color: 'var(--status-rose)', fontWeight: 600, lineHeight: 1 }}>
                      DOLU
                    </span>
                  )}
                </div>
                {c.dateStr && renderBars(c.dateStr)}
                {visible.map(t => (
                  <div
                    key={t.id}
                    className="cal-chip"
                    data-tone={chipTone(t)}
                    data-mine={myId && (t.assignees||[]).includes(myId)}
                    onClick={(e) => { e.stopPropagation(); onOpenTask(t); }}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                ))}
                {rest > 0 && <div className="cal-more">+{rest} {window.t('cal_more')}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Week view ── */}
      {calView === 'week' && (
        <div className="cal-week-grid" onClick={(e) => e.stopPropagation()}>
          {weekDays.map((d, idx) => {
            const ds        = toDateStr(d);
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
                  <span className="cal-week-dow">{CAL_DAYS_SHORT()[idx]}</span>
                  <span className="cal-week-date" data-today={isToday}>{d.getDate()}</span>
                  {holiday && (
                    <div
                      className="cal-holiday-dot"
                      title={holiday}
                      onMouseEnter={(e) => setBarTooltip({ text: holiday, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setBarTooltip(null)}
                    />
                  )}
                </div>
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
                        style={{ background: b.paletteColor }}
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
                      <div
                        key={t.id}
                        className="cal-week-chip"
                        data-tone={chipTone(t)}
                        data-overdue={overdueT}
                        data-mine={myId && (t.assignees||[]).includes(myId)}
                        onClick={(e) => { e.stopPropagation(); onOpenTask(t); }}
                      >
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

      {/* ── Right side panel ── */}
      <aside className="cal-side">

        {/* Mini calendar */}
        <div className="cal-side-card">
          <div className="cal-side-head">
            <button
              className="cal-side-nav"
              onClick={(e) => { e.stopPropagation(); setMiniCursor(new Date(miniY, miniM - 1, 1)); }}
              title={window.t('cal_prev_month')}
            >
              <Icon name="chevronLeft" size={13} />
            </button>
            <div className="cal-side-title">{CAL_MONTHS()[miniM]} {miniY}</div>
            <button
              className="cal-side-nav"
              onClick={(e) => { e.stopPropagation(); setMiniCursor(new Date(miniY, miniM + 1, 1)); }}
              title={window.t('cal_next_month')}
            >
              <Icon name="chevronRight" size={13} />
            </button>
          </div>
          <div className="cal-side-mini">
            {CAL_DAYS_SHORT().map(d => <div key={d} className="cal-side-dow">{d[0]}</div>)}
            {miniCells.map((c, i) => {
              const isToday    = c.dateStr === today;
              const isSelected = c.dateStr && c.dateStr === toDateStr(cursor);
              const hasTasks   = c.dateStr && allTaskDates.has(c.dateStr);
              return (
                <button
                  key={i}
                  className="cal-side-day"
                  data-other={c.other || undefined}
                  data-today={isToday || undefined}
                  data-selected={isSelected || undefined}
                  data-has-tasks={hasTasks || undefined}
                  disabled={!c.dateStr}
                  onClick={(e) => { e.stopPropagation(); if (c.dateStr) { setCursor(new Date(c.dateStr + 'T00:00:00')); setSelectedDate(c.dateStr); } }}
                >
                  {c.day}
                  {hasTasks && !c.other && <span className="mini-task-dot" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Weekly context task list */}
        <div className="cal-side-card">
          <div className="cal-side-card-head">
            <Icon name="clock" size={13} />
            <span style={{ flex: 1 }}>
              {weekPanelStart === weekPanelEnd
                ? DATA.fmtDate(weekPanelStart)
                : `${DATA.fmtDate(weekPanelStart)} – ${DATA.fmtDate(weekPanelEnd)}`}
            </span>
            <span className="cal-side-count">{contextTasksList.length}</span>
          </div>
          <div className="cal-side-list">
            {contextTasksList.length === 0 && (
              <div className="cal-side-empty">{window.t('cal_no_tasks_today')}</div>
            )}
            {contextTasksList.map(t => {
              const col       = DATA.COLUMNS.find(c => c.id === t.col);
              const isMine    = meId && (t.assignees || []).includes(meId);
              const members   = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
              const barColor  = dateRangeBars.find(b => String(b.task.id) === String(t.id))?.paletteColor
                             || members[0]?.color
                             || col?.color
                             || 'var(--accent)';
              return (
                <div key={t.id} className="cal-side-item" data-mine={isMine} onClick={() => onOpenTask(t)}>
                  <div className="cal-side-item-bar" style={{ background: barColor }} />
                  <div className="cal-side-item-body">
                    <div className="cal-side-item-title">{t.title}</div>
                    <div className="cal-side-item-meta">
                      <span>{col?.title_tr || t.col}</span>
                      {t.start && t.due && t.start !== t.due && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                          {DATA.fmtDate(t.start)} – {DATA.fmtDate(t.due)}
                        </span>
                      )}
                      {members.length > 0 && <AvatarStack members={members} size="sm" max={3} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day-specific panel — appears when a date is selected */}
        {selectedDate && (
          <div className="cal-side-card cal-day-panel">
            <div className="cal-side-card-head">
              <Icon name="calendar" size={13} />
              <span style={{ flex: 1 }}>{DATA.fmtDate(selectedDate)}</span>
              <span className="cal-side-count">{selectedDateTasks.length}</span>
              <button
                className="cal-side-clear"
                onClick={(e) => { e.stopPropagation(); setSelectedDate(null); }}
                title="Kapat"
              >
                <Icon name="x" size={11} />
              </button>
            </div>
            <div className="cal-side-list">
              {selectedDateTasks.length === 0 && (
                <div className="cal-side-empty">{window.t('cal_no_tasks_today')}</div>
              )}
              {selectedDateTasks.map(t => {
                const col      = DATA.COLUMNS.find(c => c.id === t.col);
                const isMine   = meId && (t.assignees || []).includes(meId);
                const members  = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                const barColor = dateRangeBars.find(b => String(b.task.id) === String(t.id))?.paletteColor
                              || members[0]?.color
                              || col?.color
                              || 'var(--accent)';
                return (
                  <div key={t.id} className="cal-side-item" data-mine={isMine} onClick={() => onOpenTask(t)}>
                    <div className="cal-side-item-bar" style={{ background: barColor }} />
                    <div className="cal-side-item-body">
                      <div className="cal-side-item-title">{t.title}</div>
                      <div className="cal-side-item-meta">
                        <span>{col?.title_tr || t.col}</span>
                        {t.start && t.due && t.start !== t.due && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                            {DATA.fmtDate(t.start)} – {DATA.fmtDate(t.due)}
                          </span>
                        )}
                        {members.length > 0 && <AvatarStack members={members} size="sm" max={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      {/* ── Agenda view ── */}
      {calView === 'agenda' && (
        <div className="cal-agenda">
          {agendaGroups.length === 0
            ? <div className="cal-empty">{window.t('cal_no_tasks_due')}</div>
            : agendaGroups.map(g => {
              const isPast   = g.date < today;
              const isTodayG = g.date === today;
              return (
                <div key={g.date} className="agenda-group">
                  <div className="agenda-date-header" data-past={isPast} data-today={isTodayG}>
                    <span className="agenda-date-label">
                      {isTodayG ? window.t('cal_today') : DATA.fmtDate(g.date)}
                    </span>
                    {isPast && !isTodayG && <span className="agenda-badge agenda-badge-late">{window.t('cal_past')}</span>}
                    {isTodayG           && <span className="agenda-badge agenda-badge-today">{window.t('cal_today')}</span>}
                    {getHoliday(g.date) && (
                      <span className="agenda-badge" style={{ background:'oklch(62% 0.15 30 / 0.15)', color:'oklch(52% 0.15 30)' }}>
                        {getHoliday(g.date)}
                      </span>
                    )}
                    <span className="agenda-task-count">{g.tasks.length} {window.t('cal_task')}</span>
                  </div>
                  {g.tasks.map(t => {
                    const colObj     = DATA.COLUMNS.find(c => c.id === t.col);
                    const rowMembers = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                    return (
                      <div
                        key={t.id}
                        className="agenda-item"
                        data-tone={chipTone(t)}
                        data-mine={myId && (t.assignees||[]).includes(myId)}
                        onClick={() => onOpenTask(t)}
                      >
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
