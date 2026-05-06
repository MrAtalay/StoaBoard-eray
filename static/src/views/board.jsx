// Kanban board view

const { useState: useBoardState, useRef: useBoardRef, useEffect: useBoardEf } = React;

const COL_NAME_MAX = 30;

function FilterBar({ activeLabels, activePriority, onToggleLabel, onTogglePriority, onClear }) {
  const labelEntries = Object.entries(DATA.LABELS || {});
  const hasFilters = activeLabels.size > 0 || activePriority !== null;
  const priorities = [
    { id: 'high', label: 'Yüksek' },
    { id: 'mid',  label: 'Orta'   },
    { id: 'low',  label: 'Düşük'  },
  ];

  return (
    <div className="filter-bar">
      <Icon name="filter" size={13} />
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
      </div>
      {hasFilters && (
        <button className="filter-clear-btn" onClick={onClear}>
          <Icon name="x" size={11} /> Temizle
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
      data-show-progress={tweaks.showProgress}
      data-show-tags={tweaks.showTags}
      onClick={() => !editing && onOpen(task)}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onTouchStart={canManageTasks ? handleTouchStart : undefined}
      onTouchMove={canManageTasks ? handleTouchMove : undefined}
      onTouchEnd={handleTouchEnd}
    >
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
            {task.priority === 'high' ? 'Yüksek' : task.priority === 'mid' ? 'Orta' : 'Düşük'}
          </span>
        </div>
        {task.due && (
          <div className="meta-item" data-warn={overdue} data-done={isDone}>
            <Icon name="calendar" size={12} />
            {DATA.fmtDate(task.due)}
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

function Column({ col, tasks, onOpenTask, onDropCard, onDragStart, onDragEnd, dragging, tweaks, onOpenModal, onTitleChange, canManageTasks, canManageProjects, onDeleteColumn, onUpdateColumn, onTouchLongPress, onToggleDone }) {
  const [dragOver, setDragOver] = useBoardState(false);
  const [menuOpen, setMenuOpen] = useBoardState(false);
  const [renaming, setRenaming] = useBoardState(false);
  const [renameVal, setRenameVal] = useBoardState(col.title_tr || col.title || '');
  const [columnDragging, setColumnDragging] = useBoardState(false);
  const menuRef = useBoardRef(null);
  const moreRef = useBoardRef(null);
  const headerRef = useBoardRef(null);
  const touchState = useBoardRef({ timer: null, startX: 0, startY: 0, moved: false });

  useBoardEf(() => {
    if (!menuOpen) return;
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
    <div className="column">
      <div 
        className="col-header"
        ref={headerRef}
        data-dragging={columnDragging}
        onTouchStart={handleColumnTouchStart}
        onTouchMove={handleColumnTouchMove}
        onTouchEnd={handleColumnTouchEnd}
        onTouchCancel={handleColumnTouchEnd}
      >
        <div className="col-dot" style={{ background: col.is_done ? 'var(--status-green)' : col.color }} />
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
          <span className="col-title">{col.title_tr}</span>
        )}
        <span className="col-count">{tasks.length}</span>
        <div className="col-actions">
          {canManageTasks && <button onClick={() => onOpenModal(col.id)} title="Yeni görev"><Icon name="plus" size={14} /></button>}
          <div style={{ position: 'relative' }}>
            <button ref={moreRef} title="Daha fazla" onClick={() => setMenuOpen(v => !v)}>
              <Icon name="moreH" size={14} />
            </button>
            {menuOpen && (
              <div ref={menuRef} className="col-menu">
                <div className="col-menu-info">{tasks.length} görev · {col.title_tr}</div>
                {canManageProjects && (
                  <>
                    <div className="col-menu-divider" />
                    <button className="col-menu-item" onClick={() => { setMenuOpen(false); onToggleDone?.(col); }}>
                      <Icon name={col.is_done ? 'minus' : 'check'} size={13} />
                      {col.is_done ? 'Bitti işaretini kaldır' : 'Bitti kolonu olarak işaretle'}
                    </button>
                    <button className="col-menu-item" onClick={() => { setMenuOpen(false); setRenaming(true); setRenameVal(col.title_tr || col.title || ''); }}>
                      <Icon name="edit" size={13} /> Yeniden adlandır
                    </button>
                    <button className="col-menu-item col-menu-item-danger" onClick={() => { setMenuOpen(false); onDeleteColumn?.(col.db_id, col.id); }}>
                      <Icon name="trash" size={13} /> Kolonu sil
                    </button>
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
            <Icon name="plus" size={13} /> Görev ekle
          </button>
        )}
      </div>
    </div>
  );
}

function BoardView({ tasks, onOpenTask, onMoveTask, onDeleteTask, tweaks, onOpenModal, onTitleChange, canManageTasks, canManageProjects }) {
  const [draggingId, setDraggingId] = useBoardState(null);
  const [trashHover, setTrashHover] = useBoardState(false);
  const [activeLabels, setActiveLabels] = useBoardState(new Set());
  const [activePriority, setActivePriority] = useBoardState(null);
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
  const [addingColumnBusy, setAddingColumnBusy] = useBoardState(false);
  const initialColumnsSet = useBoardRef(false);

  const trashZoneRef = useBoardRef(null);
  const touchGhostRef = useBoardRef(null);
  const boardRef = useBoardRef(null);
  const scrollRafRef = useBoardRef(null);

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
    };

    const onEnd = (e) => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      touchGhostRef.current?.remove();
      touchGhostRef.current = null;
      const t = e.changedTouches[0];
      const shouldDelete = isOverTrash(t.clientX, t.clientY);
      setDraggingId(null);
      setTrashHover(false);
      if (shouldDelete) onDeleteTask?.(taskId);
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
  const clearFilters = () => { setActiveLabels(new Set()); setActivePriority(null); };

  const visibleTasks = tasks.filter(t => {
    if (activePriority && t.priority !== activePriority) return false;
    if (activeLabels.size > 0 && !(t.labels || []).some(l => activeLabels.has(l))) return false;
    return true;
  });

  const handleToggleDone = async (col) => {
    const newIsDone = !col.is_done;
    const updatedCols = columns.map(c => c.id === col.id ? { ...c, is_done: newIsDone } : c);
    setColumns(updatedCols);
    window.DATA.COLUMNS = DATA.COLUMNS.map(c => c.id === col.id ? { ...c, is_done: newIsDone } : c);
    try { await API.updateColumn(col.db_id, { is_done: newIsDone }); }
    catch (e) { console.error('toggleDone error:', e); }
  };

  const handleDeleteColumn = async (dbId, slugId) => {
    if (!confirm('Bu kolonu silmek istediğinize emin misiniz?')) return;
    
    // Optimistic update — remove immediately from state
    const prevColumns = columns;
    const nextColumns = columns.filter(c => c.id !== slugId);
    setColumns(nextColumns);
    window.DATA.COLUMNS = nextColumns;
    
    try {
      await API.deleteColumn(dbId);
    } catch (e) {
      // Revert on error
      setColumns(prevColumns);
      window.DATA.COLUMNS = prevColumns;
      alert('Kolon silinemedi: ' + e.message);
    }
  };

  const handleUpdateColumn = async (dbId, data) => {
    // Optimistic update
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
      // Revert on error
      setColumns(prevColumns);
      window.DATA.COLUMNS = prevColumns;
      alert('Kolon güncellenemedi: ' + e.message);
    }
  };

  const handleAddColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title || addingColumnBusy) return;

    const projectId = window.CURRENT_PROJECT_ID || DATA.currentProject?.id;
    if (!projectId) {
      alert('Proje seçili değil.');
      return;
    }

    setAddingColumnBusy(true);
    try {
      const created = await API.createColumn(projectId, { title });
      // Optimistic update - add to state immediately
      const nextColumns = [...columns, created];
      setColumns(nextColumns);
      window.DATA.COLUMNS = nextColumns;
      setNewColumnTitle("");
      setIsAddingColumn(false);
    } catch (e) {
      alert('Kolon oluşturulamadı: ' + e.message);
    } finally {
      setAddingColumnBusy(false);
    }
  };

  return (
    <>
    <FilterBar
      activeLabels={activeLabels}
      activePriority={activePriority}
      onToggleLabel={toggleLabel}
      onTogglePriority={togglePriority}
      onClear={clearFilters}
    />
    <div className="board" ref={boardRef} onDragOver={handleBoardDragOver} onDragEnd={stopAutoScroll}>
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
        />
      ))}
      {canManageProjects && (isAddingColumn ? (
        <div className="add-column-form">
          <div>
            <input
              autoFocus
              className="add-column-input"
              placeholder="Kolon başlığı yazın..."
              maxLength={COL_NAME_MAX}
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddColumn();
                if (e.key === 'Escape') setIsAddingColumn(false);
              }}
              style={newColumnTitle.length >= COL_NAME_MAX ? { borderColor: 'var(--status-rose)' } : {}}
            />
            {newColumnTitle.length >= COL_NAME_MAX - 5 && (
              <div style={{ textAlign: 'right', fontSize: 10, marginTop: 4, color: newColumnTitle.length >= COL_NAME_MAX ? 'var(--status-rose)' : 'var(--ink-muted)' }}>
                {newColumnTitle.length}/{COL_NAME_MAX}
              </div>
            )}
          </div>
          <div className="add-column-actions">
            <button className="btn-save" onClick={handleAddColumn} disabled={addingColumnBusy || !newColumnTitle.trim()}>
              {addingColumnBusy ? 'Ekleniyor…' : 'Ekle'}
            </button>
            <button className="btn-cancel" onClick={() => { setIsAddingColumn(false); setNewColumnTitle(''); }} disabled={addingColumnBusy}>İptal</button>
          </div>
        </div>
      ) : (
        <button className="add-column-btn" onClick={() => setIsAddingColumn(true)}>
          <Icon name="plus" size={14} /> Kolon ekle
        </button>
      ))}
    </div>
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
        <span>{trashHover ? 'Bırak ve sil' : 'Silmek için buraya sürükle'}</span>
      </div>
    )}
    </>
  );
}

Object.assign(window, { Card, Column, BoardView, FilterBar });
