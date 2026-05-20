// Kanban board view

const { useState: useBoardState, useRef: useBoardRef, useEffect: useBoardEf } = React;

const COL_NAME_MAX = 30;
const COL_COLORS = ['#6366f1','#3b82f6','#06b6d4','#10b981','#f59e0b','#f97316','#ef4444','#a855f7','#ec4899','#6b7280'];

function FilterBar({ activeLabels, activePriority, activeOverdue, activeMyTasks, onToggleLabel, onTogglePriority, onToggleOverdue, onToggleMyTasks, onClear }) {
  const labelEntries = Object.entries(DATA.LABELS || {});
  const hasFilters = activeLabels.size > 0 || activePriority !== null || activeOverdue || activeMyTasks;
  const priorities = [
    { id: 'high', label: window.t('board_priority_high') },
    { id: 'mid',  label: window.t('board_priority_mid')  },
    { id: 'low',  label: window.t('board_priority_low')  },
  ];

  return (
    <div className="filter-bar">
      {labelEntries.length > 0 && (
        <div className="filter-bar-section">
          {labelEntries.map(([slug, lab]) => (
            <button
              key={slug}
              className="tag filter-tag"
              data-tone={lab.tone}
              data-active={activeLabels.has(slug)}
              style={{ opacity: activeLabels.size === 0 || activeLabels.has(slug) ? 1 : 0.35, cursor: 'pointer' }}
              onClick={() => onToggleLabel(slug)}
            >
              {lab.tr}
            </button>
          ))}
        </div>
      )}
      {labelEntries.length > 0 && <div className="filter-bar-divider" />}
      <div className="filter-bar-section">
        {priorities.map(p => (
          <button key={p.id} className="filter-priority-chip" data-active={activePriority === p.id} onClick={() => onTogglePriority(p.id)}>
            <span className="priority-dot" data-p={p.id} />
            {p.label}
          </button>
        ))}
        <div className="filter-bar-divider" />
        <button className="filter-priority-chip" data-active={activeOverdue} onClick={onToggleOverdue}>
          <Icon name="calendar" size={11} />
          {window.t('board_overdue')}
        </button>
        <div className="filter-bar-divider" />
        <button className="filter-priority-chip" data-active={activeMyTasks} onClick={onToggleMyTasks}>
          <Icon name="user" size={11} />
          {window.t('board_my_tasks')}
        </button>
      </div>
      {hasFilters && (
        <button className="filter-clear-btn" onClick={onClear}>
          <Icon name="x" size={11} /> {window.t('board_clear')}
        </button>
      )}
    </div>
  );
}

function Card({ task, onOpen, onDragStart, onDragEnd, dragging, tweaks, onTitleChange, canManageTasks, onTouchLongPress }) {
  const members = (task.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
  const colData = DATA.COLUMNS.find(c => c.id === task.col);
  const isDone = colData?.is_done || false;
  const overdue = DATA.isOverdue(task.due, task.col);
  const me = window.CURRENT_USER?.id;
  const isAssignedToMe = me && (task.assignees || []).includes(me);
  const meMember = isAssignedToMe ? DATA.MEMBERS.find(m => m.id === me) : null;
  const titleRef = useBoardRef(null);
  const [editing, setEditing] = useBoardState(false);
  const touchState = useBoardRef({ timer: null, startX: 0, startY: 0, moved: false });

  const handleTitleDblClick = (e) => {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => {
      titleRef.current?.focus();
      document.execCommand('selectAll', false, null);
    }, 10);
  };

  const handleTitleBlur = () => {
    setEditing(false);
    const newText = titleRef.current?.textContent?.trim();
    if (newText && newText !== task.title) onTitleChange(task.id, newText);
  };

  const handleTitleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titleRef.current?.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); titleRef.current.textContent = task.title; titleRef.current?.blur(); }
  };

  const handleTouchStart = (e) => {
    if (!canManageTasks || editing) return;
    const touch = e.touches[0];
    touchState.current = { timer: null, startX: touch.clientX, startY: touch.clientY, moved: false };
    touchState.current.timer = setTimeout(() => {
      if (!touchState.current.moved) {
        onTouchLongPress?.(task, touchState.current.startX, touchState.current.startY);
      }
    }, 400);
  };

  const handleTouchMove = (e) => {
    const ts = touchState.current;
    if (!ts.timer) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - ts.startX) > 8 || Math.abs(touch.clientY - ts.startY) > 8) {
      ts.moved = true;
      clearTimeout(ts.timer);
      ts.timer = null;
    }
  };

  const handleTouchEnd = () => {
    clearTimeout(touchState.current?.timer);
    touchState.current.timer = null;
  };

  return (
    <div
      className="card"
      draggable={!editing && canManageTasks}
      data-dragging={dragging}
      data-done={isDone}
      data-overdue={overdue && !isDone}
      data-mine={isAssignedToMe && !isDone}
      data-show-progress={tweaks.showProgress}
      data-show-tags={tweaks.showTags}
      style={{ position: 'relative' }}
      onClick={() => !editing && onOpen(task)}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onTouchStart={canManageTasks ? handleTouchStart : undefined}
      onTouchMove={canManageTasks ? handleTouchMove : undefined}
      onTouchEnd={handleTouchEnd}
    >
      {isAssignedToMe && (
        <div style={{
          position: 'absolute', top: 7, right: 8,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
          padding: '1px 5px', borderRadius: 4,
          background: 'var(--accent)', color: 'white',
          lineHeight: 1.6, pointerEvents: 'none',
        }}>BEN</div>
      )}
      {(task.labels || []).length > 0 && (
        <div className="card-tags">
          {(task.labels || []).map(l => {
            const lab = DATA.LABELS[l];
            if (!lab) return null;
            return <span key={l} className="tag" data-tone={lab.tone}>{lab.tr}</span>;
          })}
        </div>
      )}

      <div
        ref={titleRef}
        className="card-title"
        contentEditable={editing}
        suppressContentEditableWarning
        onDoubleClick={canManageTasks ? handleTitleDblClick : undefined}
        onBlur={handleTitleBlur}
        onKeyDown={handleTitleKey}
      >
        {task.title}
      </div>

      {task.desc && <div className="card-desc-preview">{task.desc}</div>}

      <div className="card-meta">
        <div className="priority-pill">
          <span className="priority-dot" data-p={task.priority} />
          <span style={{ color: 'var(--ink-muted)' }}>
            {task.priority === 'high' ? window.t('board_priority_high') : task.priority === 'mid' ? window.t('board_priority_mid') : window.t('board_priority_low')}
          </span>
        </div>
        {(task.start || task.due) && (
          <div className="meta-item" data-warn={overdue} data-done={isDone}>
            <Icon name="calendar" size={12} />
            {task.start ? `${DATA.fmtDate(task.start)} – ${task.due ? DATA.fmtDate(task.due) : '?'}` : DATA.fmtDate(task.due)}
          </div>
        )}
        {task.subtasks && (
          <div className="meta-item" title="Alt görevler">
            <Icon name="circleCheck" size={12} /> {task.subtasks}
          </div>
        )}
      </div>

      {(tweaks.showProgress || task.comments || task.attachments || members.length > 0) && (
        <div className="card-footer">
          {task.comments > 0 && <div className="meta-item"><Icon name="msg" size={12} /> {task.comments}</div>}
          {task.attachments > 0 && <div className="meta-item"><Icon name="paperclip" size={12} /> {task.attachments}</div>}
          {tweaks.showProgress && task.progress > 0 && (
            <div className="progress-row">
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${task.progress}%` }} /></div>
              <span>{task.progress}%</span>
            </div>
          )}
          {members.length > 0 && (
            <div className="card-assignees"><AvatarStack members={members} size="sm" max={3} /></div>
          )}
        </div>
      )}
    </div>
  );
}

function Column({ col, tasks, onOpenTask, onDropCard, onDragStart, onDragEnd, dragging, tweaks, onOpenModal, onTitleChange, canManageTasks, canManageProjects, onDeleteColumn, onUpdateColumn, onTouchLongPress, onToggleDone, onColumnDragStart, onColumnDragOver, onColumnDrop, isColDragOver }) {
  const [dragOver, setDragOver] = useBoardState(false);
  const [menuOpen, setMenuOpen] = useBoardState(false);
  const [menuPos, setMenuPos] = useBoardState(null);
  const [confirmDelete, setConfirmDelete] = useBoardState(false);
  const [renaming, setRenaming] = useBoardState(false);
  const [renameVal, setRenameVal] = useBoardState(col.title_tr || col.title || '');
  const [columnDragging, setColumnDragging] = useBoardState(false);
  const [colorPickerOpen, setColorPickerOpen] = useBoardState(false);
  const menuRef = useBoardRef(null);
  const moreRef = useBoardRef(null);
  const headerRef = useBoardRef(null);
  const touchState = useBoardRef({ timer: null, startX: 0, startY: 0, moved: false });

  useBoardEf(() => {
    if (!menuOpen) { setConfirmDelete(false); return; }
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !moreRef.current?.contains(e.target))
        setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const handleColumnTouchStart = (e) => {
    if (!canManageProjects || renaming || menuOpen) return;
    const touch = e.touches[0];
    touchState.current = { timer: null, startX: touch.clientX, startY: touch.clientY, moved: false };
    touchState.current.timer = setTimeout(() => {
      if (!touchState.current.moved) {
        // Long press detected - start dragging column for deletion
        setColumnDragging(true);
      }
    }, 500);
  };

  const handleColumnTouchMove = (e) => {
    const ts = touchState.current;
    if (!ts.timer) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - ts.startX) > 10 || Math.abs(touch.clientY - ts.startY) > 10) {
      ts.moved = true;
      clearTimeout(ts.timer);
    }
  };

  const handleColumnTouchEnd = () => {
    const ts = touchState.current;
    clearTimeout(ts?.timer);
    setColumnDragging(false);
  };

  const handleRename = async () => {
    const newTitle = renameVal.trim();
    setRenaming(false);
    if (!newTitle || newTitle === col.title_tr) return;
    await onUpdateColumn?.(col.db_id, { title: newTitle, title_tr: newTitle });
  };

  return (
    <div
      className="column"
      data-col-id={col.id}
      data-col-drag-over={isColDragOver}
      style={{ '--col-color': col.is_done ? 'var(--status-green)' : (col.color || 'var(--ink-faint)') }}
      onDragOver={e => { e.preventDefault(); onColumnDragOver?.(col.id); }}
      onDrop={e => { e.preventDefault(); onColumnDrop?.(col.id); }}
    >
      <div
        className="col-header"
        ref={headerRef}
        draggable={!!(canManageProjects && !renaming && !menuOpen)}
        data-dragging={columnDragging}
        onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; onColumnDragStart?.(col.id); }}
        onDragEnd={e => { e.stopPropagation(); }}
        onTouchStart={handleColumnTouchStart}
        onTouchMove={handleColumnTouchMove}
        onTouchEnd={handleColumnTouchEnd}
        onTouchCancel={handleColumnTouchEnd}
        style={canManageProjects && !renaming ? { cursor: 'grab' } : undefined}
      >
        {renaming ? (
          <>
          <input
            value={renameVal}
            maxLength={COL_NAME_MAX}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') { setRenaming(false); setRenameVal(col.title_tr || ''); }
            }}
            autoFocus
            style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1.5px solid ${renameVal.length >= COL_NAME_MAX ? 'var(--status-rose)' : 'var(--accent)'}`, outline: 'none', color: 'var(--ink)', fontSize: 13, fontWeight: 600, padding: '1px 0', minWidth: 0 }}
          />
          {renameVal.length >= COL_NAME_MAX - 5 && (
            <span style={{ fontSize: 10, color: renameVal.length >= COL_NAME_MAX ? 'var(--status-rose)' : 'var(--ink-muted)', flexShrink: 0 }}>
              {renameVal.length}/{COL_NAME_MAX}
            </span>
          )}
          </>
        ) : (
          <span className="col-label-chip">{col.title_tr}</span>
        )}
        <span className="col-count">{tasks.length}</span>
        <div className="col-actions">
          {canManageTasks && <button onClick={() => onOpenModal(col.id)} title={window.t('board_new_task')}><Icon name="plus" size={14} /></button>}
          <div style={{ position: 'relative' }}>
            <button ref={moreRef} title={window.t('board_more')} onClick={() => {
              if (!menuOpen && moreRef.current) {
                const r = moreRef.current.getBoundingClientRect();
                setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
              }
              setMenuOpen(v => !v);
            }}>
              <Icon name="moreH" size={14} />
            </button>
            {menuOpen && menuPos && (
              <div ref={menuRef} className="col-menu" style={{ top: menuPos.top, right: menuPos.right }}>
                <div className="col-menu-info">{tasks.length} görev · {col.title_tr}</div>
                {canManageProjects && (
                  <>
                    <div className="col-menu-divider" />
                    <button className="col-menu-item" onClick={() => { setMenuOpen(false); onToggleDone?.(col); }}>
                      <Icon name={col.is_done ? 'minus' : 'check'} size={13} />
                      {col.is_done ? window.t('board_col_unmark_done') : window.t('board_col_mark_done')}
                    </button>
                    <button className="col-menu-item" onClick={() => { setMenuOpen(false); setRenaming(true); setRenameVal(col.title_tr || col.title || ''); }}>
                      <Icon name="edit" size={13} /> {window.t('board_col_rename')}
                    </button>
                    <button className="col-menu-item" onClick={() => setColorPickerOpen(o => !o)}>
                      <Icon name="palette" size={13} /> Renk değiştir
                    </button>
                    {colorPickerOpen && (
                      <div className="col-menu-colors">
                        {COL_COLORS.map(c => (
                          <button key={c} type="button" className="col-color-swatch"
                            data-active={col.color === c}
                            style={{ background: c }}
                            onClick={() => { onUpdateColumn?.(col.db_id, { color: c }); setColorPickerOpen(false); setMenuOpen(false); }} />
                        ))}
                      </div>
                    )}
                    {confirmDelete ? (
                      <div className="col-menu-item col-menu-item-danger" style={{ cursor: 'default', gap: 6 }}>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>{window.t('board_col_confirm_delete')}</span>
                        <span className="col-menu-confirm-yes" onClick={() => { setConfirmDelete(false); setMenuOpen(false); onDeleteColumn?.(col.db_id, col.id); }}>{window.t('board_col_delete_yes')}</span>
                        <span className="col-menu-confirm-no" onClick={() => setConfirmDelete(false)}>{window.t('board_col_delete_no')}</span>
                      </div>
                    ) : (
                      <button className="col-menu-item col-menu-item-danger" onClick={() => setConfirmDelete(true)}>
                        <Icon name="trash" size={13} /> {window.t('board_col_delete')}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div
        className="col-body"
        data-drag-over={dragOver}
        onDragOver={(e) => { if (!canManageTasks) return; e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { if (!canManageTasks) return; e.preventDefault(); setDragOver(false); onDropCard(col.id); }}
      >
        {tasks.map(t => (
          <Card
            key={t.id}
            task={t}
            onOpen={onOpenTask}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            dragging={dragging === t.id}
            tweaks={tweaks}
            onTitleChange={onTitleChange}
            canManageTasks={canManageTasks}
            onTouchLongPress={onTouchLongPress}
          />
        ))}
        {canManageTasks && (
          <button className="col-add" onClick={() => onOpenModal(col.id)}>
            <Icon name="plus" size={13} /> {window.t('board_add_task')}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Table View ──────────────────────────────────────────────────────────────
function TableView({ tasks, onOpenTask, onMoveTask, canManageTasks }) {
  const [sortKey, setSortKey] = useBoardState('due');
  const [sortDir, setSortDir] = useBoardState('asc');
  const me = window.CURRENT_USER?.id;

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const sorted = [...tasks].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const va = a[sortKey] || ''; const vb = b[sortKey] || '';
    if (sortKey === 'due' || sortKey === 'start') {
      return ((new Date(va || 0)) - (new Date(vb || 0))) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });

  const daysBetween = (s, e) => {
    if (!s && !e) return 0;
    if (!s || !e) return 1;
    const ms = new Date(e) - new Date(s);
    return Math.max(1, Math.round(ms / 86400000) + 1);
  };

  const totals = sorted.reduce((acc, t) => {
    acc.days += daysBetween(t.start, t.due);
    acc.attachments += (t.attachments || 0);
    acc.comments += (t.comments || 0);
    return acc;
  }, { days: 0, attachments: 0, comments: 0 });

  const SortHead = ({ k, children, w }) => (
    <th style={{ width: w, cursor: 'pointer' }} onClick={() => toggleSort(k)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {sortKey === k && <Icon name={sortDir === 'asc' ? 'chevronUp' : 'chevronDown'} size={10} />}
      </span>
    </th>
  );

  return (
    <div className="table-view-wrap">
      <table className="table-view">
        <thead>
          <tr>
            <th style={{ width: 28 }} />
            <SortHead k="id" w={70}>ID</SortHead>
            <SortHead k="title">{window.t('list_title')}</SortHead>
            <SortHead k="col" w={110}>{window.t('list_status')}</SortHead>
            <th style={{ width: 130 }}>{window.t('list_labels')}</th>
            <th style={{ width: 110 }}>{window.t('list_assignee')}</th>
            <SortHead k="start" w={86}>{window.t('list_start')}</SortHead>
            <SortHead k="due" w={86}>{window.t('list_due')}</SortHead>
            <th style={{ width: 56 }}>{window.t('list_days')}</th>
            <th style={{ width: 100 }}>{window.t('list_progress')}</th>
            <SortHead k="priority" w={90}>{window.t('list_priority')}</SortHead>
            <th style={{ width: 40 }} title="Ekler"><Icon name="paperclip" size={11} /></th>
            <th style={{ width: 40 }} title="Yorumlar"><Icon name="msg" size={11} /></th>
            <th style={{ width: 40 }} title="Reaksiyon"><Icon name="smile" size={11} /></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(t => {
            const col = DATA.COLUMNS.find(c => c.id === t.col);
            const isDone = col?.is_done || false;
            const members = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
            const overdue = DATA.isOverdue(t.due, t.col);
            const isMine = me && (t.assignees || []).includes(me);
            return (
              <tr key={t.id} data-done={isDone} data-mine={isMine} onClick={() => onOpenTask(t)} style={{ cursor: 'pointer' }}>
                <td onClick={(e) => {
                  e.stopPropagation();
                  if (!canManageTasks) return;
                  const doneCol = DATA.COLUMNS.find(c => c.is_done);
                  const firstCol = DATA.COLUMNS[0];
                  if (isDone) onMoveTask(t.id, firstCol?.id || 'todo');
                  else if (doneCol) onMoveTask(t.id, doneCol.id);
                }}>
                  <div className="list-check" data-checked={isDone}>
                    {isDone && <Icon name="check" size={10} strokeWidth={2.5} />}
                  </div>
                </td>
                <td className="table-mono">#{String(t.id).padStart(3, '0')}</td>
                <td className="table-title">{t.title}</td>
                <td>
                  <span className="table-status-chip" style={{ '--col-c': col?.color || 'var(--ink-faint)' }}>
                    <span className="col-dot" style={{ background: col?.color || 'var(--ink-faint)' }} />
                    {col?.title_tr || '—'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {(t.labels || []).slice(0, 2).map(l => {
                      const lab = DATA.LABELS[l];
                      return lab && <span key={l} className="tag" data-tone={lab.tone}>{lab.tr}</span>;
                    })}
                  </div>
                </td>
                <td><AvatarStack members={members} size="sm" max={3} /></td>
                <td className="table-mono" data-warn={overdue && !isDone}>{t.start ? DATA.fmtDate(t.start) : '—'}</td>
                <td className="table-mono" data-warn={overdue && !isDone}>{t.due ? DATA.fmtDate(t.due) : '—'}</td>
                <td className="table-mono">{daysBetween(t.start, t.due) || '—'}</td>
                <td>
                  {t.progress > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div className="progress-bar" style={{ width: 50 }}>
                        <div className="progress-fill" style={{ width: `${t.progress}%` }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{t.progress}%</span>
                    </div>
                  ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                </td>
                <td>
                  <span className="priority-pill">
                    <span className="priority-dot" data-p={t.priority} />
                    {t.priority === 'high' ? window.t('board_priority_high') : t.priority === 'mid' ? window.t('board_priority_mid') : window.t('board_priority_low')}
                  </span>
                </td>
                <td className="table-mono">{t.attachments || 0}</td>
                <td className="table-mono">{t.comments || 0}</td>
                <td className="table-mono">{(t.reactions_count || 0)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} />
            <td>{sorted.length} {window.t('board_tasks_count')}</td>
            <td colSpan={4} />
            <td className="table-mono table-total">Σ {totals.days}</td>
            <td colSpan={3} />
            <td className="table-mono table-total">Σ {totals.attachments}</td>
            <td className="table-mono table-total">Σ {totals.comments}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {sorted.length === 0 && (
        <div className="empty-state">
          <Icon name="list" size={28} strokeWidth={1.2} />
          <div>{window.t('board_no_tasks')}</div>
        </div>
      )}
    </div>
  );
}

// ─── Timeline (Gantt) View ───────────────────────────────────────────────────
function TimelineView({ tasks, onOpenTask }) {
  const [zoom, setZoom] = useBoardState(() => localStorage.getItem('stoa.tlZoom') || 'week');
  useBoardEf(() => localStorage.setItem('stoa.tlZoom', zoom), [zoom]);

  const [collapsedTlGroups, setCollapsedTlGroups] = useBoardState(new Set());
  const [tlAssigneeFilter, setTlAssigneeFilter] = useBoardState(new Set());
  const gridRef = useBoardRef(null);

  const dayWidth = { day: 60, week: 36, month: 22, quarter: 12 }[zoom] || 36;
  const lang = localStorage.getItem('stoa.lang') || 'tr';
  const DAYS_SHORT = lang === 'en'
    ? ['Su','Mo','Tu','We','Th','Fr','Sa']
    : ['Pz','Pt','Sa','Çr','Pr','Cu','Ct'];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const taskDates = tasks.filter(t => t.start || t.due)
    .flatMap(t => [t.start, t.due].filter(Boolean).map(d => new Date(d)));
  const rawMin = taskDates.length > 0 ? new Date(Math.min(...taskDates)) : new Date(today);
  const rawMax = taskDates.length > 0 ? new Date(Math.max(...taskDates)) : new Date(today);

  let minDate, maxDate;
  if (zoom === 'day') {
    // ±7 day padding, always include today, minimum 3 weeks
    minDate = new Date(Math.min(rawMin, today)); minDate.setDate(minDate.getDate() - 7);
    maxDate = new Date(rawMax); maxDate.setDate(rawMax.getDate() + 7);
    const minEnd = new Date(minDate); minEnd.setDate(minDate.getDate() + 21);
    if (maxDate < minEnd) maxDate = minEnd;
  } else if (zoom === 'week') {
    // Snap to Mon–Sun week boundaries, minimum 5 weeks
    const toMonday = d => { const r = new Date(d), dow = r.getDay(); r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1)); return r; };
    const toSunday = d => { const r = new Date(d), dow = r.getDay(); r.setDate(r.getDate() + (dow === 0 ? 0 : 7 - dow)); return r; };
    minDate = toMonday(new Date(Math.min(rawMin, today))); minDate.setDate(minDate.getDate() - 7);
    maxDate = toSunday(rawMax); maxDate.setDate(maxDate.getDate() + 7);
    const minEnd = new Date(minDate); minEnd.setDate(minDate.getDate() + 35);
    if (maxDate < minEnd) maxDate = minEnd;
  } else if (zoom === 'month') {
    // Snap to 1st–last of month, include today's month, minimum 3 months
    minDate = new Date(Math.min(
      new Date(rawMin.getFullYear(), rawMin.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth(), 1)
    ));
    maxDate = new Date(rawMax.getFullYear(), rawMax.getMonth() + 1, 0);
    const minEnd = new Date(minDate.getFullYear(), minDate.getMonth() + 3, 0);
    if (maxDate < minEnd) maxDate = minEnd;
  } else {
    // quarter: snap to quarter start/end, include today's quarter, minimum 3 full quarters
    const qStart = d => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    const qEnd   = d => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0);
    minDate = new Date(Math.min(qStart(rawMin), qStart(today)));
    maxDate = qEnd(rawMax);
    const minEnd = new Date(qStart(today).getFullYear(), qStart(today).getMonth() + 9, 0);
    if (maxDate < minEnd) maxDate = minEnd;
  }
  minDate.setHours(0,0,0,0); maxDate.setHours(0,0,0,0);
  const totalDays = Math.max(7, Math.round((maxDate - minDate) / 86400000) + 1);
  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(minDate); d.setDate(minDate.getDate() + i); return d;
  });

  const dayIndex = (iso) => {
    if (!iso) return null;
    const d = new Date(iso); d.setHours(0,0,0,0);
    return Math.round((d - minDate) / 86400000);
  };
  const todayIdx = dayIndex(today.toISOString());

  const SIDE = 220;

  const scrollToToday = () => {
    if (gridRef.current && todayIdx >= 0) {
      const el = gridRef.current;
      const targetLeft = todayIdx * dayWidth - (el.clientWidth - SIDE) / 2;
      el.scrollLeft = Math.max(0, targetLeft);
    }
  };
  useBoardEf(scrollToToday, [zoom]);

  // Header row 1: month or quarter groups
  const headerGroups = (() => {
    const groups = [];
    let cur = null;
    const months = lang === 'en' ? DATA.EN_MONTHS : DATA.TR_MONTHS;
    days.forEach(d => {
      let key, label;
      if (zoom === 'quarter') {
        const q = Math.ceil((d.getMonth() + 1) / 3);
        key = `${q}-${d.getFullYear()}`;
        label = lang === 'en' ? `Q${q} ${d.getFullYear()}` : `Ç${q} ${d.getFullYear()}`;
      } else {
        key = `${d.getMonth()}-${d.getFullYear()}`;
        label = `${months[d.getMonth()]} ${d.getFullYear()}`;
      }
      if (!cur || cur.key !== key) {
        if (cur) groups.push(cur);
        cur = { key, label, count: 0 };
      }
      cur.count++;
    });
    if (cur) groups.push(cur);
    return groups;
  })();

  // Day cell label based on zoom level
  const dayLabel = (d, i) => {
    if (zoom === 'day') return (
      <>
        <div className="tl-day-wd">{DAYS_SHORT[d.getDay()]}</div>
        <div className="tl-day-num">{d.getDate()}</div>
      </>
    );
    if (zoom === 'week') return <div className="tl-day-num">{d.getDate()}</div>;
    if (zoom === 'month') return <div className="tl-day-num">{[1,8,15,22].includes(d.getDate()) ? d.getDate() : ''}</div>;
    // quarter: show abbreviated month name only on 1st of each month
    return <div className="tl-day-num">{d.getDate() === 1 ? (lang === 'en' ? DATA.EN_MONTHS : DATA.TR_MONTHS)[d.getMonth()].slice(0,3) : ''}</div>;
  };

  // Assignee filter
  const allAssignees = (() => {
    const ids = new Set(tasks.flatMap(t => t.assignees || []));
    return [...ids].map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
  })();

  const toggleTlAssignee = (id) => setTlAssigneeFilter(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleTlGroup = (colId) => setCollapsedTlGroups(prev => {
    const next = new Set(prev);
    if (next.has(colId)) next.delete(colId); else next.add(colId);
    return next;
  });

  const filteredTasks = tlAssigneeFilter.size === 0
    ? tasks
    : tasks.filter(t => (t.assignees || []).some(id => tlAssigneeFilter.has(id)));

  const groups = DATA.COLUMNS.map(col => ({
    col,
    tasks: filteredTasks.filter(t => t.col === col.id && (t.start || t.due))
  })).filter(g => g.tasks.length > 0);

  const undatedTasks = filteredTasks.filter(t => !t.start && !t.due);
  const totalW = totalDays * dayWidth;
  const weekendIndices = days.reduce((acc, d, i) => {
    if (d.getDay() === 0 || d.getDay() === 6) acc.push(i);
    return acc;
  }, []);

  const weekendCols = weekendIndices.map(wi => (
    <div key={wi} className="tl-weekend-col" style={{ left: wi * dayWidth, width: dayWidth }} />
  ));
  const todayLine = todayIdx >= 0 && todayIdx < totalDays
    ? <div className="tl-today-line" style={{ left: todayIdx * dayWidth + dayWidth / 2 }} />
    : null;

  return (
    <div className="timeline-view">
      <div className="timeline-toolbar">
        <div className="tl-toolbar-left">
          <button className="tl-today-btn" onClick={scrollToToday}>
            <Icon name="target" size={13} />
            {window.t('board_tl_today')}
          </button>
          {allAssignees.length > 1 && (
            <div className="tl-filter-avatars">
              {allAssignees.map(m => (
                <button key={m.id} className="tl-filter-avatar" data-active={tlAssigneeFilter.has(m.id)}
                  onClick={() => toggleTlAssignee(m.id)} title={m.name}>
                  <Avatar member={m} size="sm" />
                </button>
              ))}
              {tlAssigneeFilter.size > 0 && (
                <button className="tl-filter-clear" onClick={() => setTlAssigneeFilter(new Set())}>×</button>
              )}
            </div>
          )}
        </div>
        <div className="tl-zoom">
          {[['day', window.t('board_tl_day')],['week', window.t('board_tl_week')],['month', window.t('board_tl_month')],['quarter', window.t('board_tl_quarter')]].map(([k,l]) => (
            <button key={k} data-active={zoom === k} onClick={() => setZoom(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="timeline-grid" ref={gridRef} style={{ '--tl-side': `${SIDE}px`, '--tl-cw': `${dayWidth}px` }}>
        <div className="tl-corner">
          <span>{window.t('board_tl_task')}</span>
          {tlAssigneeFilter.size > 0 && <span className="tl-corner-badge">{tlAssigneeFilter.size}</span>}
        </div>

        <div className="tl-header" style={{ width: totalW }}>
          <div className="tl-header-groups">
            {headerGroups.map(g => (
              <div key={g.key} className="tl-header-group" style={{ width: g.count * dayWidth }}>
                {g.label}
              </div>
            ))}
          </div>
          <div className="tl-header-days">
            {days.map((d, i) => (
              <div key={i} className="tl-day" data-today={i === todayIdx} data-weekend={d.getDay() === 0 || d.getDay() === 6}>
                {dayLabel(d, i)}
              </div>
            ))}
          </div>
        </div>

        {groups.map(({ col, tasks: gTasks }) => {
          const isCollapsed = collapsedTlGroups.has(col.id);
          return (
            <React.Fragment key={col.id}>
              <div className="tl-side tl-group" style={{ cursor: 'pointer' }} onClick={() => toggleTlGroup(col.id)}>
                <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={12} strokeWidth={2.5} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                <span className="col-dot" style={{ background: col.color }} />
                {col.title_tr}
                <span className="col-count" style={{ marginLeft: 'auto' }}>{gTasks.length}</span>
              </div>
              <div className="tl-track tl-group-track" style={{ width: totalW }}>
                {weekendCols}{todayLine}
              </div>
              {!isCollapsed && gTasks.map(t => {
                const startIdx = dayIndex(t.start) ?? dayIndex(t.due);
                const endIdx = dayIndex(t.due) ?? dayIndex(t.start);
                const sIdx = Math.max(0, Math.min(startIdx, endIdx));
                const eIdx = Math.min(totalDays - 1, Math.max(startIdx, endIdx));
                const span = Math.max(1, eIdx - sIdx + 1);
                const isDone = col.is_done;
                const offscreenLeft = startIdx < 0;
                const offscreenRight = endIdx > totalDays - 1;
                const members = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                const isMilestone = t.start && t.due && t.start === t.due;
                return (
                  <React.Fragment key={t.id}>
                    <div className="tl-side" onClick={() => onOpenTask(t)}>
                      <div className="tl-side-inner">
                        {t.priority && <span className="priority-dot" data-p={t.priority} style={{ flexShrink: 0 }} />}
                        <div className="tl-side-title" data-done={isDone}>{t.title}</div>
                      </div>
                      {members.length > 0 && <AvatarStack members={members} size="sm" max={3} />}
                    </div>
                    <div className="tl-track" style={{ width: totalW }}>
                      {weekendCols}{todayLine}
                      {isMilestone ? (
                        <div
                          className="tl-milestone"
                          onClick={() => onOpenTask(t)}
                          title={`${t.title} · ${DATA.fmtDate(t.due)}`}
                          style={{ left: sIdx * dayWidth + dayWidth / 2 - 8, background: isDone ? 'var(--ink-faint)' : col.color }}
                        />
                      ) : (
                        <div
                          className="tl-bar"
                          data-done={isDone}
                          data-off-l={offscreenLeft}
                          data-off-r={offscreenRight}
                          onClick={() => onOpenTask(t)}
                          title={`${t.title}${t.start ? ' · ' + DATA.fmtDate(t.start) : ''}${t.due ? ' – ' + DATA.fmtDate(t.due) : ''}`}
                          style={{
                            left: sIdx * dayWidth,
                            width: span * dayWidth - 4,
                            top: 6,
                            background: isDone ? 'var(--bg-sunken)' : col.color,
                            color: isDone ? 'var(--ink-faint)' : 'white',
                          }}
                        >
                          {t.priority === 'high' && !isDone && <span className="tl-bar-priority" />}
                          <span className="tl-bar-text">{t.title}</span>
                          {members.length > 0 && (
                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                              <AvatarStack members={members} size="xs" max={2} />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {groups.length === 0 && (
        <div className="empty-state">
          <Icon name="calendar" size={28} strokeWidth={1.2} />
          <div>{window.t('board_tl_empty')}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{window.t('board_tl_empty_sub')}</div>
        </div>
      )}

      {undatedTasks.length > 0 && (
        <div className="tl-undated">
          <div className="tl-undated-title">
            <Icon name="calendar" size={13} />
            {window.t?.('board_tl_undated') || 'Tarihi belirsiz'} · {undatedTasks.length}
          </div>
          <div className="tl-undated-list">
            {undatedTasks.map(t => {
              const col = DATA.COLUMNS.find(c => c.id === t.col);
              const isDone = col?.is_done;
              const members = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
              return (
                <div key={t.id} className="tl-undated-chip" data-done={isDone} onClick={() => onOpenTask(t)}>
                  <span className="col-dot" style={{ background: col?.color || 'var(--ink-faint)', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  {members.length > 0 && <AvatarStack members={members} size="xs" max={2} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BoardView (with sub-view switcher) ──────────────────────────────────────
function BoardView({ tasks, onOpenTask, onMoveTask, onDeleteTask, tweaks, onOpenModal, onTitleChange, canManageTasks, canManageProjects, switching, initialSubView, onSubViewChange }) {
  const [subView, setSubView] = useBoardState(() => initialSubView || localStorage.getItem('stoa.boardSubView') || 'kanban');
  useBoardEf(() => {
    localStorage.setItem('stoa.boardSubView', subView);
    onSubViewChange?.(subView);
  }, [subView]);
  useBoardEf(() => {
    if (initialSubView && initialSubView !== subView) setSubView(initialSubView);
  }, [initialSubView]);

  const [draggingId, setDraggingId] = useBoardState(null);
  const [draggingColId, setDraggingColId] = useBoardState(null);
  const [overColId, setOverColId] = useBoardState(null);
  const [trashHover, setTrashHover] = useBoardState(false);
  const [filterOpen, setFilterOpen] = useBoardState(false);
  const [listSort, setListSort]     = useBoardState('title');
  const [listSortDir, setListSortDir] = useBoardState('asc');
  const [collapsedGroups, setCollapsedGroups] = useBoardState(new Set());
  const toggleListSort = (k) => {
    if (listSort === k) setListSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setListSort(k); setListSortDir('asc'); }
  };
  const toggleGroupCollapse = (id) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [activeLabels, setActiveLabels] = useBoardState(new Set());
  const [activePriority, setActivePriority] = useBoardState(null);
  const [activeOverdue, setActiveOverdue] = useBoardState(false);
  const [activeMyTasks, setActiveMyTasks] = useBoardState(() => localStorage.getItem('stoa.filterMyTasks') === 'true');
  const [searchQuery, setSearchQuery] = useBoardState('');
  const [columns, setColumns] = useBoardState(() => {
    // Initial load: deduplicate from DATA.COLUMNS
    const cols = DATA.COLUMNS || [];
    const seen = new Set();
    return cols.filter(col => {
      if (seen.has(col.id)) return false;
      seen.add(col.id);
      return true;
    });
  });
  const [isAddingColumn, setIsAddingColumn] = useBoardState(false);
  const [newColumnTitle, setNewColumnTitle] = useBoardState("");
  const [newColumnColor, setNewColumnColor] = useBoardState(COL_COLORS[0]);
  const [addingColumnBusy, setAddingColumnBusy] = useBoardState(false);
  const initialColumnsSet = useBoardRef(false);

  const trashZoneRef = useBoardRef(null);
  const touchGhostRef = useBoardRef(null);
  const boardRef = useBoardRef(null);
  const scrollRafRef = useBoardRef(null);
  const panRef = useBoardRef(null); // { active, startX, startScroll }

  // Listen for sidebar "Görevlerim" shortcut
  useBoardEf(() => {
    const handler = () => setActiveMyTasks(true);
    window.addEventListener('stoa:activateMyTasks', handler);
    return () => window.removeEventListener('stoa:activateMyTasks', handler);
  }, []);

  // Sync columns ONLY on initial load, not on every tasks change
  useBoardEf(() => {
    if (initialColumnsSet.current) return; // Already initialized
    initialColumnsSet.current = true;
    
    const newCols = DATA.COLUMNS || [];
    const seen = new Set();
    const dedupedCols = newCols.filter(col => {
      if (seen.has(col.id)) return false;
      seen.add(col.id);
      return true;
    });
    setColumns(dedupedCols);
  }, []); // Empty dependency — only run once on mount

  const handleBoardDragOver = (e) => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const ZONE = 80;
    const SPEED = 12;
    const x = e.clientX;
    let vel = 0;
    if (x < rect.left + ZONE) vel = -SPEED * (1 - (x - rect.left) / ZONE);
    else if (x > rect.right - ZONE) vel = SPEED * (1 - (rect.right - x) / ZONE);
    cancelAnimationFrame(scrollRafRef.current);
    if (vel !== 0) {
      const step = () => {
        board.scrollLeft += vel;
        scrollRafRef.current = requestAnimationFrame(step);
      };
      scrollRafRef.current = requestAnimationFrame(step);
    }
  };

  const stopAutoScroll = () => cancelAnimationFrame(scrollRafRef.current);

  // ── Board pan (middle-click drag) ─────────────────────────────────────────
  useBoardEf(() => {
    const onMove = (e) => {
      if (!panRef.current?.active || !boardRef.current) return;
      boardRef.current.scrollLeft = panRef.current.startScroll - (e.clientX - panRef.current.startX);
    };
    const onUp = () => { if (panRef.current) panRef.current.active = false; if (boardRef.current) boardRef.current.style.cursor = ''; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const handleBoardMouseDown = (e) => {
    if (e.button !== 1) return; // middle mouse only
    e.preventDefault();
    panRef.current = { active: true, startX: e.clientX, startScroll: boardRef.current?.scrollLeft || 0 };
    if (boardRef.current) boardRef.current.style.cursor = 'grabbing';
  };

  // ── Column drag-to-reorder ────────────────────────────────────────────────
  const handleColumnDragStart = (colId) => {
    if (!canManageProjects) return;
    setDraggingColId(colId);
  };
  const handleColumnDragOver = (colId) => {
    if (!draggingColId || colId === draggingColId) return;
    setOverColId(colId);
  };
  const handleColumnDrop = async (targetColId) => {
    const fromId = draggingColId;
    setDraggingColId(null);
    setOverColId(null);
    if (!fromId || fromId === targetColId) return;
    const fromIdx = columns.findIndex(c => c.id === fromId);
    const toIdx   = columns.findIndex(c => c.id === targetColId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newCols = [...columns];
    const [removed] = newCols.splice(fromIdx, 1);
    newCols.splice(toIdx, 0, removed);
    setColumns(newCols);
    window.DATA.COLUMNS = newCols;
    const projectId = window.CURRENT_PROJECT_ID;
    const orderedIds = newCols.map(c => c.db_id).filter(Boolean);
    try { await API.reorderColumns(projectId, orderedIds); }
    catch (e) { window.showToast?.('Kolon sırası kaydedilemedi', 'error'); }
  };

  const handleDragStart = (e, task) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    setDraggingId(task.id);
  };
  const handleDragEnd = () => { stopAutoScroll(); setDraggingId(null); setTrashHover(false); };
  const handleDrop = (targetColId) => {
    if (draggingId) { onMoveTask(draggingId, targetColId); setDraggingId(null); }
  };

  const handleTouchLongPress = (task, startX, startY) => {
    if (!canManageTasks) return;

    setDraggingId(task.id);

    const ghost = document.createElement('div');
    ghost.className = 'card-touch-ghost';
    ghost.textContent = task.title;
    ghost.style.left = `${startX - 60}px`;
    ghost.style.top  = `${startY - 22}px`;
    document.body.appendChild(ghost);
    touchGhostRef.current = ghost;

    const isOverTrash = (x, y) => {
      const el = trashZoneRef.current;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const taskId = task.id;

    const onMove = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (touchGhostRef.current) {
        touchGhostRef.current.style.left = `${t.clientX - 60}px`;
        touchGhostRef.current.style.top  = `${t.clientY - 22}px`;
      }
      setTrashHover(isOverTrash(t.clientX, t.clientY));
      // Highlight target column
      const ghost = touchGhostRef.current;
      if (ghost) ghost.style.pointerEvents = 'none';
      const dropEl = document.elementFromPoint(t.clientX, t.clientY);
      if (ghost) ghost.style.pointerEvents = '';
      const newColId = dropEl?.closest('[data-col-id]')?.dataset?.colId || null;
      if (newColId !== (touchGhostRef.current?._overColId)) {
        document.querySelectorAll('.column[data-touch-over="true"]').forEach(el => el.removeAttribute('data-touch-over'));
        if (newColId) {
          const colEl = document.querySelector(`.column[data-col-id="${newColId}"]`);
          if (colEl) colEl.setAttribute('data-touch-over', 'true');
        }
        if (touchGhostRef.current) touchGhostRef.current._overColId = newColId;
      }
    };

    const onEnd = (e) => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      document.querySelectorAll('.column[data-touch-over="true"]').forEach(el => el.removeAttribute('data-touch-over'));
      const ghost = touchGhostRef.current;
      if (ghost) ghost.style.display = 'none';
      const t = e.changedTouches[0];
      const { clientX, clientY } = t;
      const shouldDelete = isOverTrash(clientX, clientY);
      const dropEl = document.elementFromPoint(clientX, clientY);
      if (ghost) { ghost.style.display = ''; ghost.remove(); }
      touchGhostRef.current = null;
      setDraggingId(null);
      setTrashHover(false);
      if (shouldDelete) {
        onDeleteTask?.(taskId);
      } else {
        const colEl = dropEl?.closest('[data-col-id]');
        const targetColId = colEl?.dataset?.colId;
        if (targetColId && targetColId !== task.col) {
          onMoveTask(taskId, targetColId);
        }
      }
    };

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  };

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
    setActiveMyTasks(false); localStorage.removeItem('stoa.filterMyTasks'); setSearchQuery('');
  };

  const q = searchQuery.toLowerCase().trim();
  const myId = window.CURRENT_USER?.id;
  const visibleTasks = tasks.filter(t => {
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (activePriority && t.priority !== activePriority) return false;
    if (activeLabels.size > 0 && !(t.labels || []).some(l => activeLabels.has(l))) return false;
    if (activeOverdue && !DATA.isOverdue(t.due, t.col)) return false;
    if (activeMyTasks && myId && !(t.assignees || []).includes(myId)) return false;
    return true;
  });

  const activeFilterCount = (activePriority ? 1 : 0) + activeLabels.size + (activeOverdue ? 1 : 0) + (q ? 1 : 0) + (activeMyTasks ? 1 : 0);

  const handleToggleDone = async (col) => {
    const newIsDone = !col.is_done;
    const updatedCols = columns.map(c => c.id === col.id ? { ...c, is_done: newIsDone } : c);
    setColumns(updatedCols);
    window.DATA.COLUMNS = DATA.COLUMNS.map(c => c.id === col.id ? { ...c, is_done: newIsDone } : c);
    try { await API.updateColumn(col.db_id, { is_done: newIsDone }); }
    catch (e) { console.error('toggleDone error:', e); }
  };

  const handleDeleteColumn = async (dbId, slugId) => {
    const prevColumns = columns;
    const nextColumns = columns.filter(c => c.id !== slugId);
    setColumns(nextColumns);
    window.DATA.COLUMNS = nextColumns;
    try {
      await API.deleteColumn(dbId);
    } catch (e) {
      setColumns(prevColumns);
      window.DATA.COLUMNS = prevColumns;
      window.showToast?.('Kolon silinemedi: ' + e.message, 'error');
    }
  };

  const handleUpdateColumn = async (dbId, data) => {
    const prevColumns = columns;
    const nextColumns = columns.map(c => c.db_id === dbId ? { ...c, ...data } : c);
    setColumns(nextColumns);
    window.DATA.COLUMNS = nextColumns;
    try {
      const updated = await API.updateColumn(dbId, data);
      const finalColumns = columns.map(c => c.db_id === dbId ? { ...c, ...updated } : c);
      setColumns(finalColumns);
      window.DATA.COLUMNS = finalColumns;
    } catch (e) {
      setColumns(prevColumns);
      window.DATA.COLUMNS = prevColumns;
      window.showToast?.('Kolon güncellenemedi: ' + e.message, 'error');
    }
  };

  const handleAddColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title || addingColumnBusy) return;

    const projectId = window.CURRENT_PROJECT_ID || DATA.currentProject?.id;
    if (!projectId) {
      window.showToast?.('Proje seçili değil.', 'error');
      return;
    }

    setAddingColumnBusy(true);
    try {
      const created = await API.createColumn(projectId, { title, color: newColumnColor });
      const nextColumns = [...columns, created];
      setColumns(nextColumns);
      window.DATA.COLUMNS = nextColumns;
      setNewColumnTitle("");
      setNewColumnColor(COL_COLORS[0]);
      setIsAddingColumn(false);
    } catch (e) {
      window.showToast?.('Kolon oluşturulamadı: ' + e.message, 'error');
    } finally {
      setAddingColumnBusy(false);
    }
  };

  const subViews = [
    { id: 'list',     icon: 'list',        label: window.t('board_view_list')     },
    { id: 'kanban',   icon: 'layoutBoard', label: window.t('board_view_kanban')   },
    { id: 'table',    icon: 'table',       label: window.t('board_view_table')    },
    { id: 'timeline', icon: 'calendar',    label: window.t('board_view_timeline') },
  ];

  return (
    <>
    <div className="board-toolbar">
      <div className="view-switcher-tabs" role="tablist">
        {subViews.map(v => (
          <button
            key={v.id}
            role="tab"
            data-active={subView === v.id}
            onClick={() => setSubView(v.id)}
            title={v.label}
          >
            <Icon name={v.icon} size={13} /> {v.label}
          </button>
        ))}
      </div>
      <button
        className="filter-toggle-btn"
        data-active={filterOpen || activeFilterCount > 0}
        onClick={() => setFilterOpen(v => !v)}
      >
        <Icon name="filter" size={13} />
        {window.t('board_filter')}
        {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
      </button>
      <div className="board-search-wrap">
        <Icon name="search" size={13} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
        <input
          className="board-search-input"
          placeholder={window.t('board_search_placeholder')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button style={{ color: 'var(--ink-faint)', display: 'grid', placeItems: 'center', padding: 2 }} onClick={() => setSearchQuery('')}>
            <Icon name="x" size={11} />
          </button>
        )}
      </div>
      {switching && (
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
          {window.t('board_loading_project')}
        </div>
      )}
    </div>
    {filterOpen && (
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
    )}
    {subView === 'kanban' && (
    <div className="board" ref={boardRef} onDragOver={handleBoardDragOver} onDragEnd={stopAutoScroll} onMouseDown={handleBoardMouseDown}>
      {columns.map(col => (
        <Column
          key={col.id}
          col={col}
          tasks={visibleTasks.filter(t => t.col === col.id)}
          onOpenTask={onOpenTask}
          onDropCard={handleDrop}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          dragging={draggingId}
          tweaks={tweaks}
          onOpenModal={onOpenModal}
          onTitleChange={onTitleChange}
          canManageTasks={canManageTasks}
          canManageProjects={canManageProjects}
          onDeleteColumn={handleDeleteColumn}
          onUpdateColumn={handleUpdateColumn}
          onTouchLongPress={handleTouchLongPress}
          onToggleDone={handleToggleDone}
          onColumnDragStart={handleColumnDragStart}
          onColumnDragOver={handleColumnDragOver}
          onColumnDrop={handleColumnDrop}
          isColDragOver={overColId === col.id}
        />
      ))}
      {canManageProjects && (isAddingColumn ? (
        <div className="add-column-form">
          <div className="add-col-preview">
            <span className="col-label-chip" style={{ '--col-color': newColumnColor }}>
              {newColumnTitle || window.t('board_col_title_placeholder')}
            </span>
          </div>
          <div className="col-color-swatches">
            {COL_COLORS.map(c => (
              <button key={c} type="button" className="col-color-swatch" data-active={newColumnColor === c} style={{ background: c }} onClick={() => setNewColumnColor(c)} />
            ))}
          </div>
          <input
            autoFocus
            className="add-column-input"
            placeholder={window.t('board_col_title_placeholder')}
            maxLength={COL_NAME_MAX}
            value={newColumnTitle}
            onChange={(e) => setNewColumnTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddColumn();
              if (e.key === 'Escape') { setIsAddingColumn(false); setNewColumnTitle(''); setNewColumnColor(COL_COLORS[0]); }
            }}
            style={newColumnTitle.length >= COL_NAME_MAX ? { borderColor: 'var(--status-rose)' } : {}}
          />
          {newColumnTitle.length >= COL_NAME_MAX - 5 && (
            <div style={{ textAlign: 'right', fontSize: 10, color: newColumnTitle.length >= COL_NAME_MAX ? 'var(--status-rose)' : 'var(--ink-muted)' }}>
              {newColumnTitle.length}/{COL_NAME_MAX}
            </div>
          )}
          <div className="add-column-actions">
            <button className="btn-save" onClick={handleAddColumn} disabled={addingColumnBusy || !newColumnTitle.trim()}>
              {addingColumnBusy ? window.t('board_col_adding') : window.t('board_col_add')}
            </button>
            <button className="btn-cancel" onClick={() => { setIsAddingColumn(false); setNewColumnTitle(''); setNewColumnColor(COL_COLORS[0]); }} disabled={addingColumnBusy}>{window.t('app_cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="add-column-btn" onClick={() => setIsAddingColumn(true)}>
          <Icon name="plus" size={14} /> {window.t('board_add_col')}
        </button>
      ))}
    </div>
    )}

    {subView === 'list' && (
      <div className="list-view">
        {(() => {
          const SortTh = ({ k, children, w }) => {
            const active = listSort === k;
            return (
              <th style={{ width: w, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onClick={() => toggleListSort(k)}>
                {children}
                {active && <span style={{ marginLeft: 3, fontSize: 9, color: 'var(--accent)' }}>{listSortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            );
          };
          const sortTasks = (arr) => [...arr].sort((a, b) => {
            let va, vb;
            if (listSort === 'title')    { va = a.title?.toLowerCase() || ''; vb = b.title?.toLowerCase() || ''; }
            else if (listSort === 'due') { va = a.due || 'zzz'; vb = b.due || 'zzz'; }
            else if (listSort === 'priority') {
              const P = { high: 0, mid: 1, low: 2 };
              va = P[a.priority] ?? 1; vb = P[b.priority] ?? 1;
            }
            if (va < vb) return listSortDir === 'asc' ? -1 : 1;
            if (va > vb) return listSortDir === 'asc' ? 1 : -1;
            return 0;
          });
          return DATA.COLUMNS.map(col => {
            const colTasks = visibleTasks.filter(t => t.col === col.id);
            const collapsed = collapsedGroups.has(col.id);
            return (
              <div className="list-group" key={col.id}>
                <div className="list-group-header" onClick={() => toggleGroupCollapse(col.id)} style={{ cursor: 'pointer' }}>
                  <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
                  <div className="col-dot" style={{ background: col.color || 'var(--ink-faint)' }} />
                  <span style={{ color: 'var(--ink)' }}>{col.title_tr}</span>
                  <span className="col-count">{colTasks.length}</span>
                  {canManageTasks && !collapsed && (
                    <button className="list-group-add" onClick={(e) => { e.stopPropagation(); onOpenModal(col.id); }}
                      title={window.t('board_add_task')}>
                      <Icon name="plus" size={12} />
                    </button>
                  )}
                </div>
                {!collapsed && (
                  <table className="list-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <SortTh k="title">{window.t('list_title')}</SortTh>
                        <th style={{ width: 130 }}>{window.t('list_labels')}</th>
                        <th style={{ width: 100 }}>{window.t('list_assignee')}</th>
                        <SortTh k="due" w={130}>{window.t('list_date_range')}</SortTh>
                        <th style={{ width: 110 }}>{window.t('list_progress')}</th>
                        <SortTh k="priority" w={90}>{window.t('list_priority')}</SortTh>
                        <th style={{ width: 90 }}>{window.t('list_activity')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortTasks(colTasks).map(t => {
                        const members = (t.assignees || []).map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
                        const isDone = col.is_done;
                        const overdue = DATA.isOverdue(t.due, t.col);
                        const subParts = String(t.subtasks || '0/0').split('/');
                        const sDone = parseInt(subParts[0]) || 0;
                        const sTotal = parseInt(subParts[1]) || 0;
                        const pct = sTotal > 0 ? Math.round(sDone / sTotal * 100) : (t.progress || 0);
                        return (
                          <tr key={t.id} data-done={isDone} onClick={() => onOpenTask(t)} style={{ cursor: 'pointer' }}>
                            <td onClick={(e) => {
                              e.stopPropagation();
                              if (!canManageTasks) return;
                              const doneCol = DATA.COLUMNS.find(c => c.is_done);
                              const firstCol = DATA.COLUMNS[0];
                              if (isDone) onMoveTask(t.id, firstCol?.id || 'todo');
                              else if (doneCol) onMoveTask(t.id, doneCol.id);
                            }}>
                              <div className="list-check" data-checked={isDone}>
                                {isDone && <Icon name="check" size={10} strokeWidth={2.5} />}
                              </div>
                            </td>
                            <td className="title" style={{ fontWeight: 500 }}>
                              {t.title}
                              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                                #{String(t.id).padStart(3,'0')}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {(t.labels || []).slice(0, 2).map(l => {
                                  const lab = DATA.LABELS[l];
                                  return lab && <span key={l} className="tag" data-tone={lab.tone}>{lab.tr}</span>;
                                })}
                              </div>
                            </td>
                            <td><AvatarStack members={members} size="sm" max={3} /></td>
                            <td>
                              {(t.start || t.due) ? (
                                <span className="meta-item" data-warn={overdue && !isDone}>
                                  <Icon name="calendar" size={11} />
                                  {t.start ? `${DATA.fmtDate(t.start)} – ${t.due ? DATA.fmtDate(t.due) : '?'}` : DATA.fmtDate(t.due)}
                                </span>
                              ) : <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>—</span>}
                            </td>
                            <td>
                              {(sTotal > 0 || t.progress > 0) ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div className="progress-bar" style={{ width: 60 }}>
                                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span style={{ fontSize: 10, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                                    {sTotal > 0 ? `${sDone}/${sTotal}` : `${pct}%`}
                                  </span>
                                </div>
                              ) : <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>—</span>}
                            </td>
                            <td>
                              <span className="priority-pill">
                                <span className="priority-dot" data-p={t.priority} />
                                {t.priority === 'high' ? window.t('board_priority_high') : t.priority === 'mid' ? window.t('board_priority_mid') : window.t('board_priority_low')}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                                {t.comments > 0 && <span><Icon name="msg" size={10} /> {t.comments}</span>}
                                {t.attachments > 0 && <span><Icon name="paperclip" size={10} /> {t.attachments}</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          });
        })()}
        {visibleTasks.length === 0 && (
          <div className="empty-state">
            <Icon name="list" size={28} strokeWidth={1.2} />
            <div>{window.t('board_no_tasks')}</div>
          </div>
        )}
      </div>
    )}

    {subView === 'table' && (
      <TableView tasks={visibleTasks} onOpenTask={onOpenTask} onMoveTask={onMoveTask} canManageTasks={canManageTasks} />
    )}

    {subView === 'timeline' && (
      <TimelineView tasks={visibleTasks} onOpenTask={onOpenTask} />
    )}

    {draggingId && canManageTasks && (
      <div
        ref={trashZoneRef}
        className="board-trash-zone"
        data-hover={trashHover}
        onDragOver={(e) => { e.preventDefault(); setTrashHover(true); }}
        onDragLeave={() => setTrashHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setTrashHover(false);
          onDeleteTask?.(draggingId);
          setDraggingId(null);
        }}
      >
        <Icon name="trash" size={16} />
        <span>{trashHover ? window.t('board_trash_drop') : window.t('board_trash_drag')}</span>
      </div>
    )}
    </>
  );
}

Object.assign(window, { Card, Column, BoardView, FilterBar, TableView, TimelineView });
