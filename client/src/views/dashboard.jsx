// Dashboard — uses CURRENT_USER for greeting

import { useState as useDashState, useEffect as useDashEffect, useRef as useDashRef } from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, AvatarStack } from '../shell.jsx';
import { fmtTimeAgo, renderActivityText } from '../data.jsx';

function DashboardView({ tasks, onOpenTask, onView }) {
  const [teamSort, setTeamSort] = useDashState('open');
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
  const doneColIds = new Set(DATA.COLUMNS.filter(c => c.is_done).map(c => c.id));
  const total = tasks.length;
  const done = tasks.filter(t => doneColIds.has(t.col)).length;
  const overdue = tasks.filter(t => DATA.isOverdue(t.due, t.col)).length;
  const inProgress = tasks.filter(t => !doneColIds.has(t.col)).length;

  const chartCols = DATA.COLUMNS || [];
  const throughput = DATA.THROUGHPUT || [];

  // Panonun su anki dagilimi: her kolonda kac kart var.
  //
  // Burada eskiden gunluk "kac kart tasindi" grafigi duruyordu ve "Ay"
  // gorunumu UYDURMAYDI: haftalik toplami 0.9 / 1.2 / 0.8 / 1.0 ile carpip
  // dort hafta imal ediyordu. Ekranda "Ay" yaziyor, kullanici gercek
  // saniyordu - bu deponun tekrar eden kusuru olan "yanlis ama makul gorunen
  // sayi" kaliminin ta kendisi (10 Eylul 2026).
  //
  // Yerine gecen olcut kartlarin kendisinden okunuyor: hicbir defter, hicbir
  // ayristirma, hicbir tahmin. Zaman ekseni bilerek birakildi - gercek zaman
  // verisi task_transitions'ta birikiyor ve heniz anlamli bir egri cizecek
  // kadar degil (8 gunde 8 hareket). Grafik veri olmadan degil, veri olunca
  // geri gelir; ayrinti TODO'da.
  const dist = chartCols
    .map(c => ({ col: c, count: tasks.filter(t => t.col === c.id).length }))
    .filter(d => d.count > 0);
  const distTotal = dist.reduce((s, d) => s + d.count, 0);

  // Kolonun slug'i yanitta `id` adiyla duruyor (`columnToDict` → `id: c.slug`),
  // `slug` diye bir alan YOK. `.slug` okumak her zaman undefined donduruyordu,
  // dolayisiyla weeklyDone hep 0 kaliyor ve iki kart da kalici olarak
  // "bu hafta veri yok" yaziyordu — kart bitis kolonuna tasinmis olsa bile.
  // Canlida goruldu (10 Eylul 2026): etkinlik akisi "Roller HK → Tamamlandi,
  // 51 dk once" derken sayaclar veri yok diyordu.
  //
  // Dunku MCP kusurunun tipatip aynisi: sunucu slug'i `id` adiyla veriyor,
  // tuketici `.slug` diye ariyor. Kusur kodun icinde degil, iki sozlesmenin
  // arasinda.
  const doneColSlug = chartCols.find(c => c.is_done)?.id;
  const weeklyDone = throughput.reduce((s, d) => s + (doneColSlug ? ((d.cols || {})[doneColSlug] || 0) : 0), 0);
  const highPriority = tasks.filter(t => t.priority === 'high' && !doneColIds.has(t.col)).length;

  const getColColor = (col) => col?.is_done ? 'var(--status-green)' : (col?.color || 'var(--ink-faint)');

  const todayStr = new Date().toISOString().slice(0, 10);
  const me = window.CURRENT_USER?.id;
  const myActiveTasks = me
    ? tasks.filter(t => !doneColIds.has(t.col) && (t.assignees || []).includes(me))
    : [];
  const myTodayTasks = myActiveTasks.filter(t => t.due && t.due <= todayStr);

  const currentFirstName = (window.CURRENT_USER?.name || DATA.MEMBERS[0]?.name || window.t('dash_user')).split(' ')[0];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return window.t('dash_greeting_morning');
    if (h >= 12 && h < 18) return window.t('dash_greeting_afternoon');
    if (h >= 18 && h < 21) return window.t('dash_greeting_evening');
    return window.t('dash_greeting_night');
  })();

  const SORT_OPTIONS = [
    { key: 'open', label: window.t('dash_sort_open') },
    { key: 'done', label: window.t('dash_sort_done') },
    { key: 'alpha', label: window.t('dash_sort_alpha') },
  ];
  const peopleStats = DATA.MEMBERS.map(m => {
    const owned = tasks.filter(t => (t.assignees || []).includes(m.id));
    const doneC = owned.filter(t => doneColIds.has(t.col)).length;
    const openC = owned.length - doneC;
    return { ...m, total: owned.length, done: doneC, open: openC };
  });

  const sortedPeople = [...peopleStats].sort((a, b) => {
    if (teamSort === 'done') return b.done - a.done;
    if (teamSort === 'alpha') return a.name.localeCompare(b.name, 'tr');
    return b.open - a.open;
  }).slice(0, 6);

  return (
    <div className="dash">
      <h1 className="dash-h1">{greeting}, <em>{currentFirstName}</em>.</h1>
      <p className="dash-sub">
        {window.t('dash_sub_prefix')} <strong style={{ color: 'var(--ink)' }}>{inProgress}</strong> {window.t('dash_sub_active')}
        {overdue > 0 && <>; <strong style={{ color: 'var(--status-rose)' }}>{overdue}</strong> {window.t('dash_sub_overdue')}</>}
        {overdue === 0 && ` ${window.t('dash_sub_great')}`}
      </p>

      <div className="dash-grid">
        <div className="stat-card" data-clickable="true" onClick={() => { localStorage.setItem('stoa.boardSubView', 'list'); onView?.('board'); }}>
          <div className="stat-label">{window.t('dash_stat_active')}</div>
          <div className="stat-value">{total - done}</div>
          <div className="stat-delta" data-up={weeklyDone > 0}>
            {weeklyDone > 0
              ? <><Icon name="arrowUp" size={11} strokeWidth={2} /> {window.t('dash_stat_weekly_done_prefix')}+{weeklyDone} {window.t('dash_stat_completed')}</>
              : <span style={{ color: 'var(--ink-muted)' }}>{window.t('dash_stat_no_data')}</span>}
          </div>
        </div>
        <div className="stat-card" data-clickable="true" onClick={() => onView?.('board')}>
          <div className="stat-label">{window.t('dash_stat_completed')}</div>
          <div className="stat-value">{done}</div>
          <div className="stat-delta" data-up={weeklyDone > 0}>
            {weeklyDone > 0
              ? <><Icon name="check" size={11} strokeWidth={2} /> {window.t('dash_stat_weekly_done_prefix')}{weeklyDone}</>
              : <span style={{ color: 'var(--ink-muted)' }}>{window.t('dash_stat_no_data')}</span>}
          </div>
        </div>
        <div className="stat-card" data-clickable={overdue > 0} onClick={() => { if (overdue > 0) { localStorage.setItem('stoa.boardSubView', 'list'); onView?.('board'); } }}>
          <div className="stat-label">{window.t('dash_stat_overdue')}</div>
          <div className="stat-value" style={overdue > 0 ? { color: 'var(--status-rose)' } : {}}>{overdue}</div>
          <div className="stat-delta" data-down={overdue > 0}>
            {overdue > 0
              ? <><Icon name="arrowUp" size={11} strokeWidth={2} /> {window.t('dash_stat_overdue_warn')}</>
              : <><Icon name="check" size={11} strokeWidth={2} /> {window.t('dash_stat_on_time')}</>}
          </div>
        </div>
        <div className="stat-card" data-clickable={highPriority > 0} onClick={() => highPriority > 0 && onView?.('board')}>
          <div className="stat-label">{window.t('dash_stat_high_priority')}</div>
          <div className="stat-value" style={highPriority > 0 ? { color: 'var(--status-rose)' } : {}}>{highPriority}</div>
          <div className="stat-delta" data-down={highPriority > 0}>
            {highPriority > 0
              ? <><Icon name="arrowUp" size={11} strokeWidth={2} /> {window.t('dash_stat_priority_exist')}</>
              : <><Icon name="check" size={11} strokeWidth={2} /> {window.t('dash_stat_priority_none')}</>}
          </div>
        </div>
      </div>

      {myTodayTasks.length > 0 && (
        <div className="my-tasks-strip">
          <div className="my-tasks-strip-head">
            <Icon name="listChecks" size={14} style={{ color: 'var(--accent)' }} />
            <div className="my-tasks-strip-title">
              {window.t?.('dash_my_today') || 'Bugün benim için'}
              <span style={{ fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 400, color: 'var(--ink-muted)', marginLeft: 6 }}>· {myTodayTasks.length}</span>
            </div>
          </div>
          <div className="my-tasks-strip-list">
            {myTodayTasks.map(t => {
              const isOverdue = DATA.isOverdue(t.due, t.col);
              return (
                <div key={t.id} className="my-task-chip" data-overdue={isOverdue} onClick={() => onOpenTask(t)}>
                  <span className="my-task-chip-title">{t.title}</span>
                  {t.due && <span className="my-task-chip-due">{DATA.fmtDate(t.due)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="dash-row">
        <div className="panel dist-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">{window.t('dash_dist_title')}</div>
              <div className="panel-sub">{window.t('dash_dist_sub')}</div>
            </div>
          </div>
          <div className="panel-body">
            {distTotal === 0 ? (
              <div className="dash-empty-state">
                <Icon name="chart" size={28} />
                <div>{window.t('dash_chart_empty')}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{window.t('dash_chart_empty_sub')}</div>
              </div>
            ) : (
              <div className="dist-chart">
                <div className="dist-bar">
                  {dist.map(({ col, count }) => {
                    const pay = (count / distTotal) * 100;
                    return (
                      <div
                        key={col.id}
                        className="dist-seg"
                        style={{ width: `${pay}%`, background: getColColor(col) }}
                        title={`${col.title_tr || col.title || col.id}: ${count}`}
                      >
                        {/* Dogrudan etiket yalnizca sigdiginda. Her dilime sayi
                            basmak dar dilimlerde ust uste biner; skala zaten
                            asagidaki listede tam olarak yaziyor. */}
                        {pay >= 9 && <span className="dist-seg-val">{count}</span>}
                      </div>
                    );
                  })}
                </div>
                {/* Gosterge hem kimligi renkten bagimsiz kiliyor hem de dar
                    dilimlerin sayisini okunur tutuyor. */}
                <div className="dist-legend">
                  {dist.map(({ col, count }) => (
                    <div key={col.id} className="dist-legend-item">
                      <span className="legend-dot" style={{ background: getColColor(col) }} />
                      <span className="dist-legend-name">{col.title_tr || col.title || col.id}</span>
                      <span className="dist-legend-val">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                  <div className="person-bar-wrap">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="person-name">{p.name}</div>
                        <div className="person-role">{p.role}</div>
                      </div>
                      <div className="person-stat">
                        <span style={{ color: 'var(--ink)' }}>{p.open}</span> {window.t('dash_person_open')} · {p.done} {window.t('dash_person_done')}
                      </div>
                    </div>
                    <div className="person-bar-track">
                      <div className="person-bar-fill" style={{ width: p.total > 0 ? `${Math.round((p.done / p.total) * 100)}%` : '0%' }} />
                    </div>
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
                            <span className="col-chip" style={{ '--chip-color': getColColor(colObj) }}>{colObj?.title_tr || t.col}</span>
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

export { DashboardView };
