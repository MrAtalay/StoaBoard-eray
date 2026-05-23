// List / table view

import React, { useState as useListState } from 'react';
import { Icon } from '../icons.jsx';
import { AvatarStack } from '../shell.jsx';

function ListView({ tasks, onOpenTask, onMoveTask, canManageTasks = true }) {
  const [activeLabels, setActiveLabels] = useListState(new Set());
  const [activePriority, setActivePriority] = useListState(null);
  const [activeOverdue, setActiveOverdue] = useListState(false);
  const [activeMyTasks, setActiveMyTasks] = useListState(() => localStorage.getItem('stoa.filterMyTasks') === 'true');

  const toggleLabel = (slug) => setActiveLabels(prev => {
    const next = new Set(prev);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    return next;
  });
  const togglePriority = (p) => setActivePriority(prev => prev === p ? null : p);
  const toggleOverdue = () => setActiveOverdue(prev => !prev);
  const toggleMyTasks = () => setActiveMyTasks(prev => {
    const next = !prev;
    localStorage.setItem('stoa.filterMyTasks', next ? 'true' : 'false');
    return next;
  });
  const clearFilters = () => {
    setActiveLabels(new Set()); setActivePriority(null); setActiveOverdue(false);
    setActiveMyTasks(false); localStorage.removeItem('stoa.filterMyTasks');
  };

  const myId = window.CURRENT_USER?.id;
  const visibleTasks = tasks.filter(t => {
    if (activePriority && t.priority !== activePriority) return false;
    if (activeLabels.size > 0 && !(t.labels || []).some(l => activeLabels.has(l))) return false;
    if (activeOverdue && !DATA.isOverdue(t.due, t.col)) return false;
    if (activeMyTasks && myId && !(t.assignees || []).includes(myId)) return false;
    return true;
  });

  const groups = DATA.COLUMNS.map(col => ({
    col,
    tasks: visibleTasks.filter(t => t.col === col.id),
  }));

  return (
    <React.Fragment>
    <FilterBar
      activeLabels={activeLabels}
      activePriority={activePriority}
      activeOverdue={activeOverdue}
      activeMyTasks={activeMyTasks}
      onToggleLabel={toggleLabel}
      onTogglePriority={togglePriority}
      onToggleOverdue={toggleOverdue}
      onToggleMyTasks={toggleMyTasks}
      onClear={clearFilters}
    />
    <div className="list-view">
      {groups.map(({ col, tasks }) => (
        <div className="list-group" key={col.id}>
          <div className="list-group-header">
            <div className="col-dot" style={{ background: col.color }} />
            <span style={{ color: 'var(--ink)' }}>{col.title_tr}</span>
            <span className="col-count">{tasks.length}</span>
          </div>
          <table className="list-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>{window.t('list_title')}</th>
                <th style={{ width: 120 }}>{window.t('list_labels')}</th>
                <th style={{ width: 110 }}>{window.t('list_priority')}</th>
                <th style={{ width: 110 }}>{window.t('list_due')}</th>
                <th style={{ width: 120 }}>{window.t('list_assignee')}</th>
                <th style={{ width: 90 }}>{window.t('list_subtasks')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => {
                const members = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                const isDone = DATA.COLUMNS.find(c => c.id === t.col)?.is_done || false;
                const overdue = DATA.isOverdue(t.due, t.col);
                return (
                  <tr key={t.id} data-done={isDone} onClick={() => onOpenTask(t)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div
                        className="list-check"
                        data-checked={isDone}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canManageTasks) {
                            const doneCol = DATA.COLUMNS.find(c => c.is_done);
                            const firstCol = DATA.COLUMNS[0];
                            if (isDone) onMoveTask(t.id, firstCol?.id || 'todo');
                            else if (doneCol) onMoveTask(t.id, doneCol.id);
                          }
                        }}
                      >
                        {isDone && <Icon name="check" size={10} strokeWidth={2.5} />}
                      </div>
                    </td>
                    <td className="title" style={{ fontWeight: 500 }}>{t.title}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(t.labels || []).slice(0, 2).map(l => {
                          const lab = DATA.LABELS[l];
                          return lab && <span key={l} className="tag" data-tone={lab.tone}>{lab.tr}</span>;
                        })}
                      </div>
                    </td>
                    <td>
                      <span className="priority-pill">
                        <span className="priority-dot" data-p={t.priority} />
                        <span style={{ color: 'var(--ink-muted)' }}>
                          {t.priority === 'high' ? window.t('board_priority_high') : t.priority === 'mid' ? window.t('board_priority_mid') : window.t('board_priority_low')}
                        </span>
                      </span>
                    </td>
                    <td>
                      {t.due && (
                        <span className="meta-item" data-warn={overdue}>
                          <Icon name="calendar" size={12} /> {DATA.fmtDate(t.due)}
                        </span>
                      )}
                    </td>
                    <td><AvatarStack members={members} size="sm" max={3} /></td>
                    <td>
                      {t.subtasks ? (() => {
                        const parts = String(t.subtasks).split('/');
                        const done = parseInt(parts[0]) || 0;
                        const total = parts.length > 1 ? (parseInt(parts[1]) || 0) : done;
                        const pct = total > 0 ? Math.round(done / total * 100) : 0;
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="progress-bar" style={{ width: 50 }}>
                              <div className="progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{t.subtasks}</span>
                          </div>
                        );
                      })() : <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
    </React.Fragment>
  );
}

export { ListView };
