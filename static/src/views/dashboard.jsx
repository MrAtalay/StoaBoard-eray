// Dashboard — uses CURRENT_USER for greeting

const { useState: useDashState, useEffect: useDashEffect, useRef: useDashRef } = React;

function DashboardView({ tasks, onOpenTask, onView }) {
  const [chartPeriod, setChartPeriod] = useDashState('week');
  const [teamSort, setTeamSort]       = useDashState('open');
  const [teamSortOpen, setTeamSortOpen] = useDashState(false);
  const teamSortRef = useDashRef(null);

  useDashEffect(() => {
    if (!teamSortOpen) return;
    const handler = (e) => {
      if (teamSortRef.current && !teamSortRef.current.contains(e.target)) setTeamSortOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [teamSortOpen]);
  const total      = tasks.length;
  const done       = tasks.filter(t => t.col === 'done').length;
  const overdue    = tasks.filter(t => DATA.isOverdue(t.due, t.col)).length;
  const inProgress = tasks.filter(t => t.col === 'doing').length;

  const throughput = DATA.THROUGHPUT || [];

  // Monthly view: 4 weeks derived from weekly aggregate
  const wkTot = throughput.reduce(
    (s, d) => ({ done: s.done + d.done, review: s.review + d.review, progress: s.progress + d.progress }),
    { done: 0, review: 0, progress: 0 }
  );
  const monthData = [
    { day: 'H1', done: Math.round(wkTot.done * 0.9),  review: Math.round(wkTot.review * 1.1), progress: Math.round(wkTot.progress * 0.8) },
    { day: 'H2', done: Math.round(wkTot.done * 1.2),  review: Math.round(wkTot.review * 0.9), progress: Math.round(wkTot.progress * 1.3) },
    { day: 'H3', done: Math.round(wkTot.done * 0.8),  review: Math.round(wkTot.review * 1.2), progress: Math.round(wkTot.progress * 1.0) },
    { day: 'H4', done: wkTot.done, review: wkTot.review, progress: wkTot.progress },
  ];

  const chartData = chartPeriod === 'week' ? throughput : monthData;
  const maxBar    = Math.max(...chartData.map(d => d.done + d.review + d.progress), 1);

  // Little's Law
  const wip        = tasks.filter(t => !['done', 'backlog'].includes(t.col)).length;
  const weeklyDone = throughput.reduce((s, d) => s + d.done, 0);
  const dailyRate  = weeklyDone / Math.max(throughput.length, 1);
  const cycleDays  = dailyRate > 0 ? (wip / dailyRate).toFixed(1) : null;
  const halfLen    = Math.floor(throughput.length / 2);
  const rateFirst  = halfLen > 0 ? throughput.slice(0, halfLen).reduce((s, d) => s + d.done, 0) / halfLen : 0;
  const rateLast   = halfLen > 0 ? throughput.slice(-halfLen).reduce((s, d) => s + d.done, 0) / halfLen : 0;
  const cycleFirst = rateFirst > 0 ? wip / rateFirst : null;
  const cycleLast  = rateLast  > 0 ? wip / rateLast  : null;
  const cycleDelta = (cycleFirst !== null && cycleLast !== null)
    ? (cycleLast - cycleFirst).toFixed(1)
    : null;

  const currentFirstName = (window.CURRENT_USER?.name || DATA.MEMBERS[0]?.name || 'Kullanıcı').split(' ')[0];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h >= 5  && h < 12) return 'Günaydın';
    if (h >= 12 && h < 18) return 'İyi günler';
    if (h >= 18 && h < 21) return 'İyi akşamlar';
    return 'İyi geceler';
  })();

  const SORT_OPTIONS = [
    { key: 'open',  label: 'En fazla açık' },
    { key: 'done',  label: 'En fazla tamamlanan' },
    { key: 'alpha', label: 'Alfabetik' },
  ];
  const peopleStats = DATA.MEMBERS.map(m => {
    const owned = tasks.filter(t => (t.assignees || []).includes(m.id));
    const doneC = owned.filter(t => t.col === 'done').length;
    const openC = owned.length - doneC;
    return { ...m, total: owned.length, done: doneC, open: openC };
  });

  const sortedPeople = [...peopleStats].sort((a, b) => {
    if (teamSort === 'done')  return b.done - a.done;
    if (teamSort === 'alpha') return a.name.localeCompare(b.name, 'tr');
    return b.open - a.open;
  }).slice(0, 6);

  return (
    <div className="dash">
      <h1 className="dash-h1">{greeting}, <em>{currentFirstName}</em>.</h1>
      <p className="dash-sub">
        Takımında <strong style={{ color: 'var(--ink)' }}>{inProgress}</strong> kart aktif olarak ilerliyor
        {overdue > 0 && <>; <strong style={{ color: 'var(--status-rose)' }}>{overdue}</strong> kart geçmiş son tarih — bugün mümkünse temizle.</>}
        {overdue === 0 && ' — harika gidiyor!'}
      </p>

      <div className="dash-grid">
        <div className="stat-card">
          <div className="stat-label">Aktif kartlar</div>
          <div className="stat-value">{total - done}</div>
          <div className="stat-delta" data-up="true"><Icon name="arrowUp" size={11} strokeWidth={2} /> bu hafta +4</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tamamlanan</div>
          <div className="stat-value">{done}</div>
          <div className="stat-delta" data-up="true"><Icon name="arrowUp" size={11} strokeWidth={2} /> bu hafta +3</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Son tarih geçmiş</div>
          <div className="stat-value">{overdue}</div>
          <div className="stat-delta" data-down={overdue > 0}>
            {overdue > 0
              ? <><Icon name="arrowUp" size={11} strokeWidth={2} /> dikkat</>
              : <><Icon name="check" size={11} strokeWidth={2} /> hepsi zamanında</>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ortalama döngü</div>
          <div className="stat-value">
            {cycleDays !== null
              ? <>{cycleDays}<span style={{ fontSize: 18, color: 'var(--ink-muted)' }}>gün</span></>
              : <span style={{ fontSize: 18, color: 'var(--ink-muted)' }}>—</span>}
          </div>
          <div className="stat-delta"
            data-up={cycleDelta !== null && parseFloat(cycleDelta) < 0}
            data-down={cycleDelta !== null && parseFloat(cycleDelta) > 0}>
            {cycleDelta !== null
              ? <><Icon name={parseFloat(cycleDelta) <= 0 ? 'arrowDown' : 'arrowUp'} size={11} strokeWidth={2} /> {parseFloat(cycleDelta) > 0 ? '+' : ''}{cycleDelta} gün</>
              : <span style={{ color: 'var(--ink-dim)' }}>veri yok</span>}
          </div>
        </div>
      </div>

      <div className="dash-row">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">
                {chartPeriod === 'week' ? 'Bu hafta ilerleme' : 'Bu ay ilerleme'}
              </div>
              <div className="panel-sub">
                {chartPeriod === 'week'
                  ? 'Tamamlanan, incelemedeki ve devam eden kartlar'
                  : 'Haftalık tamamlanan, incelemedeki ve devam eden kartlar'}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button className="filter-chip" data-active={chartPeriod === 'week'} onClick={() => setChartPeriod('week')}>Hafta</button>
              <button className="filter-chip" data-active={chartPeriod === 'month'} onClick={() => setChartPeriod('month')}>Ay</button>
            </div>
          </div>
          <div className="panel-body">
            <div className="chart">
              {chartData.map(d => {
                const totalD = d.done + d.review + d.progress;
                const h = totalD ? (totalD / maxBar) * 160 : 0;
                return (
                  <div className="bar" key={d.day}>
                    <div className="bar-tooltip">
                      {d.day}: <b>{d.done}</b> tamamlandı · <b>{d.review}</b> incele · <b>{d.progress}</b> devam
                    </div>
                    <div className="bar-stack" style={{ height: h }}>
                      <div className="bar-seg" data-t="progress" style={{ height: `${totalD ? (d.progress/totalD)*100 : 0}%` }} />
                      <div className="bar-seg" data-t="review"   style={{ height: `${totalD ? (d.review/totalD)*100 : 0}%` }} />
                      <div className="bar-seg" data-t="done"     style={{ height: `${totalD ? (d.done/totalD)*100 : 0}%` }} />
                    </div>
                    <div className="bar-label">{d.day}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="legend">
            <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--ink)' }} /> Tamamlandı</div>
            <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--ink-muted)' }} /> İncelemede</div>
            <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--ink-faint)' }} /> Devam eden</div>
          </div>
        </div>

        {/* Team load */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Takım yükü</div>
            <div className="team-sort-wrap" ref={teamSortRef}>
              <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setTeamSortOpen(o => !o)}>
                <Icon name="moreH" size={15} />
              </button>
              {teamSortOpen && (
                <div className="team-sort-menu">
                  <div className="team-sort-label">Sırala</div>
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      className="team-sort-item"
                      data-active={teamSort === opt.key}
                      onClick={() => { setTeamSort(opt.key); setTeamSortOpen(false); }}
                    >
                      <span>{opt.label}</span>
                      {teamSort === opt.key && <Icon name="check" size={11} strokeWidth={2.5} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="panel-body">
            <div className="people-list">
              {sortedPeople.map(p => (
                <div className="person-row" key={p.id}>
                  <Avatar member={p} size="md" />
                  <div className="person-info">
                    <div className="person-name">{p.name}</div>
                    <div className="person-role">{p.role}</div>
                  </div>
                  <div className="person-stat">
                    <span style={{ color: 'var(--ink)' }}>{p.open}</span> açık · {p.done} tamamlandı
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-row">
        {/* Upcoming deadlines */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Yaklaşan son tarihler</div>
            <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => onView && onView('list')}>Tümünü gör <Icon name="arrowRight" size={12} /></button>
          </div>
          <div className="panel-body" style={{ padding: '0 0 12px' }}>
            <table className="list-table">
              <tbody>
                {tasks
                  .filter(t => t.due && t.col !== 'done')
                  .sort((a, b) => a.due.localeCompare(b.due))
                  .slice(0, 5)
                  .map(t => {
                    const rowMembers = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                    const overdueRow = DATA.isOverdue(t.due, t.col);
                    const colObj = DATA.COLUMNS.find(c => c.id === t.col);
                    return (
                      <tr key={t.id} onClick={() => onOpenTask(t)} style={{ cursor: 'pointer' }}>
                        <td style={{ paddingLeft: 18 }}>
                          <span className="meta-item" data-warn={overdueRow}>
                            <Icon name="calendar" size={12} /> {DATA.fmtDate(t.due)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{t.title}</td>
                        <td style={{ width: 100 }}><AvatarStack members={rowMembers} size="sm" max={3} /></td>
                        <td style={{ width: 90, paddingRight: 18 }}>
                          <span className="status-pill">{colObj?.title_tr || t.col}</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Takım hareketleri</div>
          </div>
          <div className="panel-body">
            {(DATA.ACTIVITY || []).map((a, i) => {
              const m = DATA.MEMBERS.find(m => m.name && m.name.startsWith(a.who));
              return (
                <div className="activity-item" key={i}>
                  <Avatar member={m || { initials: a.who[0], color: 'var(--ink-faint)' }} size="sm" />
                  <div className="activity-body">
                    <div className="activity-text">
                      <strong>{a.who}</strong> <span dangerouslySetInnerHTML={{ __html: a.text }} />
                    </div>
                    <div className="activity-time">{a.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

window.DashboardView = DashboardView;
