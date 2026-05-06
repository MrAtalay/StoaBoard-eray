// Dashboard

function DashboardView({ tasks, onOpenTask }) {
  const doneColIds = new Set(DATA.COLUMNS.filter(c => c.is_done).map(c => c.id));
  const total = tasks.length;
  const done = tasks.filter(t => doneColIds.has(t.col)).length;
  const overdue = tasks.filter(t => DATA.isOverdue(t.due, t.col)).length;
  const inProgress = tasks.filter(t => !doneColIds.has(t.col)).length;

  const maxBar = Math.max(...DATA.THROUGHPUT.map(d => d.done + d.review + d.progress)) || 1;

  // Per-person load
  const peopleStats = DATA.MEMBERS.map(m => {
    const owned = tasks.filter(t => t.assignees.includes(m.id));
    const doneC = owned.filter(t => t.col === 'done').length;
    const openC = owned.length - doneC;
    return { ...m, total: owned.length, done: doneC, open: openC };
  }).sort((a, b) => b.open - a.open).slice(0, 6);

  return (
    <div className="dash">
      <h1 className="dash-h1">Günaydın, <em>Aliz</em>.</h1>
      <p className="dash-sub">
        Takımında <strong style={{ color: 'var(--ink)' }}>{inProgress}</strong> kart aktif olarak ilerliyor;
        {overdue > 0 && <> <strong style={{ color: 'var(--status-rose)' }}>{overdue}</strong> kart geçmiş son tarih — bugün mümkünse temizle.</>}
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
            {overdue > 0 ? <><Icon name="arrowUp" size={11} strokeWidth={2} /> dikkat</> : <><Icon name="check" size={11} strokeWidth={2} /> hepsi zamanında</>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ortalama döngü</div>
          <div className="stat-value">3.4<span style={{ fontSize: 18, color: 'var(--ink-muted)' }}>gün</span></div>
          <div className="stat-delta" data-up="true"><Icon name="arrowDown" size={11} strokeWidth={2} /> -0.8 gün</div>
        </div>
      </div>

      <div className="dash-row">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Bu hafta ilerleme</div>
              <div className="panel-sub">Tamamlanan, incelemedeki ve devam eden kartlar</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button className="filter-chip" data-active="true">Hafta</button>
              <button className="filter-chip">Ay</button>
            </div>
          </div>
          <div className="panel-body">
            <div className="chart">
              {DATA.THROUGHPUT.map(d => {
                const totalD = d.done + d.review + d.progress;
                const h = (totalD / maxBar) * 160;
                return (
                  <div className="bar" key={d.day}>
                    <div className="bar-tooltip">
                      Pzt: <b>{d.done}</b> tamamlandı · <b>{d.review}</b> incele · <b>{d.progress}</b> devam
                    </div>
                    <div className="bar-stack" style={{ height: h }}>
                      <div className="bar-seg" data-t="progress" style={{ height: `${(d.progress/totalD)*100 || 0}%` }} />
                      <div className="bar-seg" data-t="review"   style={{ height: `${(d.review/totalD)*100 || 0}%` }} />
                      <div className="bar-seg" data-t="done"     style={{ height: `${(d.done/totalD)*100 || 0}%` }} />
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

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Takım yükü</div>
            <button className="icon-btn" style={{ marginLeft: 'auto' }}><Icon name="moreH" size={15} /></button>
          </div>
          <div className="panel-body">
            <div className="people-list">
              {peopleStats.map(p => (
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
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Yaklaşan son tarihler</div>
            <button className="btn btn-ghost" style={{ marginLeft: 'auto' }}>Tümünü gör <Icon name="arrowRight" size={12} /></button>
          </div>
          <div className="panel-body" style={{ padding: '0 0 12px' }}>
            <table className="list-table">
              <tbody>
                {tasks.filter(t => t.due && t.col !== 'done')
                  .sort((a, b) => a.due.localeCompare(b.due))
                  .slice(0, 5)
                  .map(t => {
                    const members = t.assignees.map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                    const overdueRow = DATA.isOverdue(t.due, t.col);
                    return (
                      <tr key={t.id} onClick={() => onOpenTask(t)}>
                        <td style={{ paddingLeft: 18 }}>
                          <span className="meta-item" data-warn={overdueRow}>
                            <Icon name="calendar" size={12} /> {DATA.fmtDate(t.due)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{t.title}</td>
                        <td style={{ width: 100 }}><AvatarStack members={members} size="sm" max={3} /></td>
                        <td style={{ width: 90, paddingRight: 18 }}>
                          <span className="status-pill">{DATA.COLUMNS.find(c => c.id === t.col).title_tr}</span>
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
            {DATA.ACTIVITY.map((a, i) => {
              const m = DATA.MEMBERS.find(m => m.name.startsWith(a.who));
              return (
                <div className="activity-item" key={i}>
                  <Avatar member={m} size="sm" />
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
