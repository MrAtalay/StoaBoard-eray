// Kanban board view

const { useState: useBoardState, useRef: useBoardRef, useEffect: useBoardEf } = React;

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

function Card({ task, onOpen, onDragStart, onDragEnd, dragging, tweaks, onTitleChange }) {
  const members = task.assignees.map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
  const colData = DATA.COLUMNS.find(c => c.id === task.col);
  const isDone = colData?.is_done || false;
  const overdue = DATA.isOverdue(task.due, task.col);
  const titleRef = useBoardRef(null);
  const [editing, setEditing] = useBoardState(false);

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

  return (
    <div
      className="card"
      draggable={!editing}
      data-dragging={dragging}
      data-done={isDone}
      data-show-progress={tweaks.showProgress}
      data-show-tags={tweaks.showTags}
      onClick={() => !editing && onOpen(task)}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
    >
      {task.labels.length > 0 && (
        <div className="card-tags">
          {task.labels.map(l => {
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
        onDoubleClick={handleTitleDblClick}
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

function Column({ col, tasks, onOpenTask, onDropCard, onDragStart, onDragEnd, dragging, tweaks, onOpenModal, onTitleChange, onToggleDone }) {
  const [dragOver, setDragOver] = useBoardState(false);
  const [menuOpen, setMenuOpen] = useBoardState(false);
  const menuRef = useBoardRef(null);

  useBoardEf(() => {
    const handler = (e) => { if (menuOpen && menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="column">
      <div className="col-header">
        <div className="col-dot" style={{ background: col.is_done ? 'var(--status-green)' : col.color }} />
        <span className="col-title">{col.title_tr}</span>
        {col.is_done && <span style={{ fontSize: 10, color: 'var(--status-green)', fontWeight: 600, letterSpacing: '0.04em' }}>BİTTİ</span>}
        <span className="col-count">{tasks.length}</span>
        <div className="col-actions" ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => onOpenModal(col.id)} title="Yeni görev"><Icon name="plus" size={14} /></button>
          <button title="Daha fazla" onClick={() => setMenuOpen(!menuOpen)}><Icon name="moreH" size={14} /></button>
          {menuOpen && (
            <div className="col-menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 50 }}>
              <button className="col-menu-item" onClick={() => { onToggleDone(col); setMenuOpen(false); }}>
                <Icon name={col.is_done ? 'minus' : 'check'} size={13} />
                {col.is_done ? 'Bitti işaretini kaldır' : 'Bitti kolonu olarak işaretle'}
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        className="col-body"
        data-drag-over={dragOver}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onDropCard(col.id); }}
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
          />
        ))}
        <button className="col-add" onClick={() => onOpenModal(col.id)}>
          <Icon name="plus" size={13} /> Görev ekle
        </button>
      </div>
    </div>
  );
}

function BoardView({ tasks, onOpenTask, onMoveTask, tweaks, onOpenModal, onTitleChange }) {
  const [draggingId, setDraggingId] = useBoardState(null);
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
  const initialColumnsSet = useBoardRef(false);

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

  const handleDragStart = (e, task) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    setDraggingId(task.id);
  };

  const handleDragEnd = () => setDraggingId(null);

  const handleDrop = (targetColId) => {
    if (draggingId) {
      onMoveTask(draggingId, targetColId);
      setDraggingId(null);
    }
  };

  const handleToggleDone = async (col) => {
    const newIsDone = !col.is_done;
    setColumns(prev => prev.map(c => c.id === col.id ? { ...c, is_done: newIsDone } : c));
    DATA.COLUMNS = DATA.COLUMNS.map(c => c.id === col.id ? { ...c, is_done: newIsDone } : c);
    try {
      await API.updateColumn(col.db_id, { is_done: newIsDone });
    } catch (e) {
      console.error('toggleDone error:', e);
    }
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
    if (activeLabels.size > 0 && !t.labels.some(l => activeLabels.has(l))) return false;
    return true;
  });

  const handleAddColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title) return;

    const projectId = window.CURRENT_PROJECT_ID || DATA.currentProject?.id;
    if (!projectId) {
      alert('Proje seçili değil.');
      return;
    }

    try {
      const createdColumn = await API.createColumn(projectId, { title });
      // Optimistic update - add to state immediately
      const nextColumns = [...columns, createdColumn];
      setColumns(nextColumns);
      window.DATA.COLUMNS = nextColumns;
      setNewColumnTitle("");
      setIsAddingColumn(false);
    } catch (e) {
      alert('Kolon oluşturulamadı: ' + (e.message || 'Sunucu hatası'));
      console.error('createColumn error:', e);
    }
  };

  return (
    <React.Fragment>
    <FilterBar
      activeLabels={activeLabels}
      activePriority={activePriority}
      onToggleLabel={toggleLabel}
      onTogglePriority={togglePriority}
      onClear={clearFilters}
    />
    <div className="board">
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
          onToggleDone={handleToggleDone}
        />
      ))}

      {isAddingColumn ? (
        <div className="add-column-form">
          <input
            autoFocus
            className="add-column-input"
            placeholder="Kolon başlığı yazın..."
            value={newColumnTitle}
            onChange={(e) => setNewColumnTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddColumn();
              if (e.key === 'Escape') setIsAddingColumn(false);
            }}
          />
          <div className="add-column-actions">
            <button className="btn-save" onClick={handleAddColumn}>Ekle</button>
            <button className="btn-cancel" onClick={() => setIsAddingColumn(false)}>İptal</button>
          </div>
        </div>
      ) : (
        <button className="add-column-btn" onClick={() => setIsAddingColumn(true)}>
          <Icon name="plus" size={14} /> Kolon ekle
        </button>
      )}
    </div>
    </React.Fragment>
  );
}

Object.assign(window, { Card, Column, BoardView, FilterBar });
