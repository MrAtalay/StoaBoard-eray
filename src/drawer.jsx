// Task detail drawer — Notion-style rich doc

const { useState: useDrawerState, useEffect: useDrawerEffect, useRef: useDrawerRef } = React;

function TaskDrawer({ open, task, onClose, onMoveTask, onTaskUpdate, onDelete }) {
  if (!task) return null;

  const members = task.assignees.map(id => DATA.MEMBERS.find(m => m.id === id)).filter(Boolean);
  const col = DATA.COLUMNS.find(c => c.id === task.col) || {};
  const [statusOpen, setStatusOpen] = useDrawerState(false);
  const [priorityOpen, setPriorityOpen] = useDrawerState(false);
  const [assigneeOpen, setAssigneeOpen] = useDrawerState(false);
  const [labelOpen, setLabelOpen] = useDrawerState(false);
  const [dueVal, setDueVal] = useDrawerState(task.due || '');
  const [saving, setSaving] = useDrawerState(false);
  const statusRef = useDrawerRef(null);
  const priorityRef = useDrawerRef(null);
  const assigneeRef = useDrawerRef(null);
  const labelRef = useDrawerRef(null);
  const titleRef = useDrawerRef(null);

  useDrawerEffect(() => {
    setDueVal(task.due || '');
  }, [task.id, task.due]);

  useDrawerEffect(() => {
    const handler = (e) => {
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false);
      if (priorityOpen && priorityRef.current && !priorityRef.current.contains(e.target)) setPriorityOpen(false);
      if (assigneeOpen && assigneeRef.current && !assigneeRef.current.contains(e.target)) setAssigneeOpen(false);
      if (labelOpen && labelRef.current && !labelRef.current.contains(e.target)) setLabelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusOpen, priorityOpen, assigneeOpen, labelOpen]);

  const patch = async (fields) => {
    setSaving(true);
    try {
      const updated = await API.updateTask(task.id, fields);
      onTaskUpdate && onTaskUpdate({ ...task, ...updated });
    } catch (e) {
      alert('Güncelleme başarısız: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTitleBlur = () => {
    const newText = titleRef.current?.textContent?.trim();
    if (newText && newText !== task.title) patch({ title: newText });
  };

  const handleTitleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titleRef.current?.blur(); }
    if (e.key === 'Escape') { titleRef.current.textContent = task.title; titleRef.current?.blur(); }
  };

  const handlePriorityChange = (p) => {
    setPriorityOpen(false);
    if (p !== task.priority) patch({ priority: p });
  };

  const handleDueChange = (val) => {
    setDueVal(val);
    patch({ due: val || null });
  };

  const handleToggleLabel = (slug) => {
    const current = task.labels || [];
    const next = current.includes(slug) ? current.filter(l => l !== slug) : [...current, slug];
    patch({ labels: next });
  };

  const handleToggleAssignee = (slug) => {
    const current = task.assignees || [];
    const next = current.includes(slug) ? current.filter(a => a !== slug) : [...current, slug];
    patch({ assignees: next });
  };

  const handleDelete = async () => {
    if (!confirm(`"${task.title}" görevini silmek istediğinizden emin misiniz?`)) return;
    onDelete && onDelete(task.id);
    onClose();
  };

  const priorityLabels = { high: 'Yüksek', mid: 'Orta', low: 'Düşük' };

  // Use rich doc if it's the detailed task, else generate basic
  const detail = {
    doc: [
      { kind: 'h2', text: 'Açıklama' },
      { kind: 'p', text: task.desc || 'Bu kart için henüz detaylı açıklama eklenmedi.' },
      task.subtasks ? { kind: 'h2', text: 'Alt görevler' } : null,
      task.subtasks ? { kind: 'checklist', items: [
        { done: true, text: 'Başlangıç gereksinimleri toplandı' },
        { done: false, text: 'İmplementasyon' },
        { done: false, text: 'Test ve kabul' },
      ]} : null,
    ].filter(Boolean),
    comments: [],
  };

  return (
    <>
      <div className="drawer-overlay" data-open={open} onClick={onClose} />
      <div className="drawer" data-open={open}>
        <div className="drawer-head">
          <div className="drawer-crumbs">
            <span>StoaBoard</span>
            <span className="sep"><Icon name="chevronRight" size={11} /></span>
            <span style={{ color: 'var(--ink)' }}>{col.title_tr || col.title || '—'}</span>
          </div>
          <div className="drawer-head-actions">
            {saving && <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Kaydediliyor…</span>}
            <button className="icon-btn" title="Sil" onClick={handleDelete} style={{ color: 'var(--status-rose)' }}>
              <Icon name="trash" size={14} />
            </button>
            <button className="icon-btn" title="Kapat" onClick={onClose}><Icon name="x" size={15} /></button>
          </div>
        </div>

        <div className="drawer-body">
          <div
            ref={titleRef}
            className="doc-title"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKey}
          >
            {task.title}
          </div>

          <div className="props-grid">
            {/* Status */}
            <div className="prop-label"><Icon name="circleHalf" size={13} /> Durum</div>
            <div className="prop-value">
              <div className="custom-dropdown" ref={statusRef}>
                <button className="custom-dropdown-btn" type="button" onClick={() => setStatusOpen(!statusOpen)}>
                  <span>{col.title_tr || col.title}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                {statusOpen && (
                  <div className="custom-dropdown-menu">
                    {DATA.COLUMNS.map(c => (
                      <button key={c.id} type="button" className="custom-dropdown-item"
                        onClick={() => { onMoveTask(task.id, c.id); setStatusOpen(false); }}>
                        <span className="col-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: c.is_done ? 'var(--status-green)' : c.color, display: 'inline-block', flexShrink: 0 }} />
                        {c.title_tr || c.title}
                        {c.is_done && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--status-green)' }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Priority */}
            <div className="prop-label"><Icon name="flag" size={13} /> Öncelik</div>
            <div className="prop-value">
              <div className="custom-dropdown" ref={priorityRef}>
                <button className="custom-dropdown-btn" type="button" onClick={() => setPriorityOpen(!priorityOpen)}>
                  <span className="priority-dot" data-p={task.priority} />
                  <span>{priorityLabels[task.priority] || task.priority}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                {priorityOpen && (
                  <div className="custom-dropdown-menu">
                    {['high', 'mid', 'low'].map(p => (
                      <button key={p} type="button" className="custom-dropdown-item" onClick={() => handlePriorityChange(p)}>
                        <span className="priority-dot" data-p={p} />
                        {priorityLabels[p]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Assignees */}
            <div className="prop-label"><Icon name="users" size={13} /> Atanan</div>
            <div className="prop-value" style={{ flexWrap: 'wrap', gap: 4 }}>
              <div className="custom-dropdown" ref={assigneeRef}>
                <button className="custom-dropdown-btn" type="button" onClick={() => setAssigneeOpen(!assigneeOpen)}
                  style={{ gap: 4 }}>
                  {members.length > 0
                    ? <><AvatarStack members={members} size="sm" max={3} /><span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>{members.map(m => m.name.split(' ')[0]).join(', ')}</span></>
                    : <span style={{ color: 'var(--ink-muted)' }}>Ata…</span>
                  }
                  <Icon name="chevronDown" size={12} />
                </button>
                {assigneeOpen && (
                  <div className="custom-dropdown-menu" style={{ minWidth: 180 }}>
                    {DATA.MEMBERS.map(m => {
                      const assigned = (task.assignees || []).includes(m.id);
                      return (
                        <button key={m.id} type="button" className="custom-dropdown-item"
                          onClick={() => handleToggleAssignee(m.id)}
                          style={{ justifyContent: 'space-between' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Avatar member={m} size="sm" />
                            {m.name.split(' ')[0]}
                          </span>
                          {assigned && <Icon name="check" size={12} strokeWidth={2.5} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Due date */}
            <div className="prop-label"><Icon name="calendar" size={13} /> Bitiş</div>
            <div className="prop-value">
              <input
                type="date"
                value={dueVal}
                onChange={e => handleDueChange(e.target.value)}
                style={{
                  background: 'transparent', border: '1px solid var(--line)', borderRadius: 6,
                  padding: '2px 6px', fontSize: 13, color: dueVal && DATA.isOverdue(dueVal, task.col) ? 'var(--status-rose)' : 'var(--ink)',
                  cursor: 'pointer',
                }}
              />
              {dueVal && <button onClick={() => handleDueChange('')} className="icon-btn" title="Tarihi kaldır" style={{ marginLeft: 2 }}><Icon name="x" size={11} /></button>}
            </div>

            {/* Labels */}
            <div className="prop-label"><Icon name="tag" size={13} /> Etiketler</div>
            <div className="prop-value" style={{ gap: 4, flexWrap: 'wrap' }}>
              <div className="custom-dropdown" ref={labelRef} style={{ display: 'contents' }}>
                {(task.labels || []).map(l => {
                  const lab = DATA.LABELS[l];
                  return lab && (
                    <span key={l} className="tag" data-tone={lab.tone}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleToggleLabel(l)}
                      title="Kaldırmak için tıkla">
                      {lab.tr} <span style={{ opacity: 0.5, fontSize: 9 }}>✕</span>
                    </span>
                  );
                })}
                <button className="tag" style={{ cursor: 'pointer', borderStyle: 'dashed' }}
                  onClick={() => setLabelOpen(!labelOpen)}>
                  <Icon name="plus" size={10} strokeWidth={2} />
                </button>
                {labelOpen && (
                  <div className="custom-dropdown-menu" style={{ position: 'absolute', zIndex: 50, marginTop: 4 }}>
                    {Object.entries(DATA.LABELS).map(([slug, lab]) => {
                      const active = (task.labels || []).includes(slug);
                      return (
                        <button key={slug} type="button" className="custom-dropdown-item"
                          onClick={() => handleToggleLabel(slug)}
                          style={{ justifyContent: 'space-between' }}>
                          <span className="tag" data-tone={lab.tone}>{lab.tr}</span>
                          {active && <Icon name="check" size={12} strokeWidth={2.5} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="doc-content">
            {detail.doc.map((b, i) => <DocBlock key={i} block={b} />)}
          </div>

          <div className="comments-section">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.005em', marginBottom: 6 }}>
              Yorumlar
            </h3>
            <div className="comment-compose">
              <Avatar member={DATA.MEMBERS[0]} size="sm" />
              <textarea placeholder="Yorum yaz…" />
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost">İptal</button>
              <button className="btn btn-primary">Gönder</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DocBlock({ block }) {
  const [checks, setChecks] = useDrawerState(() => (block.items || []).map(i => !!i.done));

  switch (block.kind) {
    case 'h2': return <h2>{block.text}</h2>;
    case 'h3': return <h3>{block.text}</h3>;
    case 'p':  return <p>{block.text}</p>;
    case 'ul': return <ul>{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
    case 'pre': return <pre>{block.text}</pre>;
    case 'quote': return <blockquote>{block.text}</blockquote>;
    case 'checklist':
      return (
        <div className="checklist">
          {block.items.map((it, i) => (
            <div
              key={i}
              className="check-row"
              data-checked={checks[i]}
              onClick={() => setChecks(checks.map((c, j) => j === i ? !c : c))}
            >
              <div className="list-check" data-checked={checks[i]}>
                {checks[i] && <Icon name="check" size={10} strokeWidth={2.5} />}
              </div>
              <span className="check-text" style={{ fontSize: 14, lineHeight: 1.5 }}>{it.text}</span>
            </div>
          ))}
        </div>
      );
    default: return null;
  }
}

window.TaskDrawer = TaskDrawer;
