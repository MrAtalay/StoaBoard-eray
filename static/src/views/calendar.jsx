// Calendar view — month / week / agenda

const { useState: useCalState } = React;

const CAL_MONTHS   = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const CAL_DAYS_SHORT = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

function CalendarView({ tasks, onOpenTask }) {
  const [cursor, setCursor]   = useCalState(() => new Date());
  const [calView, setCalView] = useCalState('month');

  const today    = new Date().toISOString().slice(0, 10);
  const year     = cursor.getFullYear();
  const month    = cursor.getMonth();
  const monthName = CAL_MONTHS[month];

  // ── Month grid ────────────────────────────────────────────────────────────
  const firstDay     = new Date(year, month, 1);
  const startDOW     = (firstDay.getDay() + 6) % 7;
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
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
  const tasksFor = (ds) => tasks.filter(t => t.due === ds);
  const overdue  = tasks.filter(t => DATA.isOverdue(t.due, t.col)).length;

  // ── Chip tone ─────────────────────────────────────────────────────────────
  const chipTone = (t) => DATA.LABELS[(t.labels || [])[0]]?.tone || 'slate';
  const dateStr  = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  return (
    <div className="cal-wrap">

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
        </div>
      </div>

      {/* ── Month view ── */}
      {calView === 'month' && (
        <div className="cal-grid">
          {CAL_DAYS_SHORT.map(w => <div key={w} className="cal-weekday">{w}</div>)}
          {cells.map((c, i) => {
            const dayTasks = c.dateStr ? tasksFor(c.dateStr) : [];
            const visible = dayTasks.slice(0, 3);
            const rest    = dayTasks.length - 3;
            return (
              <div key={i} className="cal-day" data-other={c.other} data-today={c.isToday}>
                <div className="day-num">{c.day}</div>
                {visible.map(t => (
                  <div key={t.id} className="cal-chip" data-tone={chipTone(t)} onClick={() => onOpenTask(t)} title={t.title}>
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
        <div className="cal-week-grid">
          {weekDays.map((d, idx) => {
            const ds        = dateStr(d);
            const dayTasks  = tasksFor(ds);
            const isToday   = ds === today;
            const isWeekend = idx >= 5;
            return (
              <div key={ds} className="cal-week-col" data-today={isToday} data-weekend={isWeekend}>
                <div className="cal-week-head">
                  <span className="cal-week-dow">{CAL_DAYS_SHORT[idx]}</span>
                  <span className="cal-week-date" data-today={isToday}>{d.getDate()}</span>
                </div>
                <div className="cal-week-body">
                  {dayTasks.map(t => {
                    const overdueT = DATA.isOverdue(t.due, t.col);
                    return (
                      <div key={t.id} className="cal-week-chip" data-tone={chipTone(t)} data-overdue={overdueT} onClick={() => onOpenTask(t)}>
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
                    <span className="agenda-task-count">{g.tasks.length} görev</span>
                  </div>
                  {g.tasks.map(t => {
                    const colObj     = DATA.COLUMNS.find(c => c.id === t.col);
                    const rowMembers = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                    return (
                      <div key={t.id} className="agenda-item" data-tone={chipTone(t)} onClick={() => onOpenTask(t)}>
                        <div className="agenda-item-bar" />
                        <div className="agenda-item-body">
                          <div className="agenda-item-title">{t.title}</div>
                          <div className="agenda-item-meta">
                            <span className="status-pill">{colObj?.title_tr || t.col}</span>
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
