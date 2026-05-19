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
  const doneColIds  = new Set(DATA.COLUMNS.filter(c => c.is_done).map(c => c.id));
  const total      = tasks.length;
  const done       = tasks.filter(t => doneColIds.has(t.col)).length;
  const overdue    = tasks.filter(t => DATA.isOverdue(t.due, t.col)).length;
  const inProgress = tasks.filter(t => !doneColIds.has(t.col)).length;

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

  const weeklyDone  = throughput.reduce((s, d) => s + d.done, 0);
  const highPriority = tasks.filter(t => t.priority === 'high' && !doneColIds.has(t.col)).length;

  const currentFirstName = (window.CURRENT_USER?.name || DATA.MEMBERS[0]?.name || window.t('dash_user')).split(' ')[0];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h >= 5  && h < 12) return window.t('dash_greeting_morning');
    if (h >= 12 && h < 18) return window.t('dash_greeting_afternoon');
    if (h >= 18 && h < 21) return window.t('dash_greeting_evening');
    return window.t('dash_greeting_night');
  })();

  const SORT_OPTIONS = [
    { key: 'open',  label: window.t('dash_sort_open') },
    { key: 'done',  label: window.t('dash_sort_done') },
    { key: 'alpha', label: window.t('dash_sort_alpha') },
  ];
  const peopleStats = DATA.MEMBERS.map(m => {
    const owned = tasks.filter(t => (t.assignees || []).includes(m.id));
    const doneC = owned.filter(t => doneColIds.has(t.col)).length;
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
        {window.t('dash_sub_prefix')} <strong style={{ color: 'var(--ink)' }}>{inProgress}</strong> {window.t('dash_sub_active')}
        {overdue > 0 && <>; <strong style={{ color: 'var(--status-rose)' }}>{overdue}</strong> {window.t('dash_sub_overdue')}</>}
        {overdue === 0 && ` — ${window.t('dash_sub_great')}`}
      </p>

      <div className="dash-grid">
        <div className="stat-card">
          <div className="stat-label">{window.t('dash_stat_active')}</div>
          <div className="stat-value">{total - done}</div>
          <div className="stat-delta" data-up={weeklyDone > 0}>
            {weeklyDone > 0
              ? <><Icon name="arrowUp" size={11} strokeWidth={2} /> {window.t('dash_stat_weekly_done_prefix')}+{weeklyDone} {window.t('dash_stat_completed')}</>
              : <span style={{ color: 'var(--ink-dim)' }}>{window.t('dash_stat_no_data')}</span>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{window.t('dash_stat_completed')}</div>
          <div className="stat-value">{done}</div>
          <div className="stat-delta" data-up={weeklyDone > 0}>
            {weeklyDone > 0
              ? <><Icon name="check" size={11} strokeWidth={2} /> {window.t('dash_stat_weekly_done_prefix')}{weeklyDone}</>
              : <span style={{ color: 'var(--ink-dim)' }}>{window.t('dash_stat_no_data')}</span>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{window.t('dash_stat_overdue')}</div>
          <div className="stat-value" style={overdue > 0 ? { color: 'var(--status-rose)' } : {}}>{overdue}</div>
          <div className="stat-delta" data-down={overdue > 0}>
            {overdue > 0
              ? <><Icon name="arrowUp" size={11} strokeWidth={2} /> {window.t('dash_stat_overdue_warn')}</>
              : <><Icon name="check" size={11} strokeWidth={2} /> {window.t('dash_stat_on_time')}</>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{window.t('dash_stat_high_priority')}</div>
          <div className="stat-value" style={highPriority > 0 ? { color: 'var(--status-rose)' } : {}}>{highPriority}</div>
          <div className="stat-delta" data-down={highPriority > 0}>
            {highPriority > 0
              ? <><Icon name="arrowUp" size={11} strokeWidth={2} /> {window.t('dash_stat_priority_exist')}</>
              : <><Icon name="check" size={11} strokeWidth={2} /> {window.t('dash_stat_priority_none')}</>}
          </div>
        </div>
      </div>

      <div className="dash-row">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">
                {chartPeriod === 'week' ? window.t('dash_chart_week_title') : window.t('dash_chart_month_title')}
              </div>
              <div className="panel-sub">
                {chartPeriod === 'week'
                  ? window.t('dash_chart_week_sub')
                  : window.t('dash_chart_month_sub')}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button className="filter-chip" data-active={chartPeriod === 'week'} onClick={() => setChartPeriod('week')}>{window.t('dash_week')}</button>
              <button className="filter-chip" data-active={chartPeriod === 'month'} onClick={() => setChartPeriod('month')}>{window.t('dash_month')}</button>
            </div>
          </div>
          <div className="panel-body">
            {chartData.length === 0 || maxBar <= 1 ? (
              <div className="dash-empty-state">
                <Icon name="chart" size={28} />
                <div>{window.t('dash_chart_empty')}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{window.t('dash_chart_empty_sub')}</div>
              </div>
            ) : (
              <div className="chart">
                {chartData.map(d => {
                  const totalD = d.done + d.review + d.progress;
                  const h = totalD ? (totalD / maxBar) * 160 : 0;
                  const lang = localStorage.getItem('stoa.lang') || 'tr';
                  const dayLabel = d.date
                    ? new Date(d.date).toLocaleDateString(lang === 'en' ? 'en-GB' : 'tr-TR', { weekday: 'short' })
                    : (d.day || '');
                  return (
                    <div className="bar" key={d.date || d.day}>
                      <div className="bar-tooltip">
                        {dayLabel}: <b>{d.done}</b> {window.t('dash_chart_done')} · <b>{d.review}</b> {window.t('dash_chart_review')} · <b>{d.progress}</b> {window.t('dash_chart_progress')}
                      </div>
                      <div className="bar-stack" style={{ height: h }}>
                        <div className="bar-seg" data-t="progress" style={{ height: `${totalD ? (d.progress/totalD)*100 : 0}%` }} />
                        <div className="bar-seg" data-t="review"   style={{ height: `${totalD ? (d.review/totalD)*100 : 0}%` }} />
                        <div className="bar-seg" data-t="done"     style={{ height: `${totalD ? (d.done/totalD)*100 : 0}%` }} />
                      </div>
                      <div className="bar-label">{dayLabel}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="legend">
            <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--status-green)' }} /> {window.t('dash_legend_done')}</div>
            <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--status-amber)' }} /> {window.t('dash_legend_review')}</div>
            <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--status-blue)' }} /> {window.t('dash_legend_progress')}</div>
          </div>
        </div>

        {/* Team load */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">{window.t('dash_team_load')}</div>
            <div className="team-sort-wrap" ref={teamSortRef}>
              <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setTeamSortOpen(o => !o)}>
                <Icon name="moreH" size={15} />
              </button>
              {teamSortOpen && (
                <div className="team-sort-menu">
                  <div className="team-sort-label">{window.t('dash_sort_label')}</div>
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
                    <span style={{ color: 'var(--ink)' }}>{p.open}</span> {window.t('dash_person_open')} · {p.done} {window.t('dash_person_done')}
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
            <div className="panel-title">{window.t('dash_upcoming')}</div>
            <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => onView && onView('list')}>{window.t('dash_view_all')} <Icon name="arrowRight" size={12} /></button>
          </div>
          <div className="panel-body" style={{ padding: '0 0 12px' }}>
            {(() => {
              const upcomingTasks = tasks
                .filter(t => t.due && !doneColIds.has(t.col))
                .sort((a, b) => a.due.localeCompare(b.due))
                .slice(0, 5);
              if (upcomingTasks.length === 0) {
                return (
                  <div className="dash-empty-state" style={{ padding: '24px 18px' }}>
                    <Icon name="calendar" size={24} />
                    <div>{window.t('dash_no_deadlines')}</div>
                  </div>
                );
              }
              return (
                <table className="list-table">
                  <tbody>
                    {upcomingTasks.map(t => {
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
              );
            })()}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">{window.t('dash_activity')}</div>
          </div>
          <div className="panel-body">
            {(DATA.ACTIVITY || []).length === 0 ? (
              <div className="dash-empty-state">
                <Icon name="users" size={24} />
                <div>{window.t('dash_no_activity')}</div>
              </div>
            ) : (DATA.ACTIVITY || []).map((a, i) => {
              const m = DATA.MEMBERS.find(m => m.name && m.name.startsWith(a.who));
              return (
                <div className="activity-item" key={i}>
                  <Avatar member={m || { initials: (a.who || '?')[0], color: 'var(--ink-faint)' }} size="sm" />
                  <div className="activity-body">
                    <div className="activity-text">
                      <strong>{a.who}</strong> <span dangerouslySetInnerHTML={{ __html: renderActivityText(a.text) }} />
                    </div>
                    <div className="activity-time">{fmtTimeAgo(a.time)}</div>
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
