// Task detail drawer — API-backed

const { useState: useDrawerState, useEffect: useDrawerEffect, useRef: useDrawerRef } = React;

function TaskDrawer({ open, task, onClose, onMoveTask, onTaskUpdate, onDelete, onCreateTask, canManageTasks = true }) {
  const [detail, setDetail]             = useDrawerState(null);
  const [newComment, setNewComment]     = useDrawerState('');
  const [submitting, setSubmitting]     = useDrawerState(false);
  const [loadingDetail, setLoadingDetail] = useDrawerState(false);
  const [statusOpen, setStatusOpen]     = useDrawerState(false);
  const [confirmDelete, setConfirmDelete] = useDrawerState(false);
  const [mentionQuery, setMentionQuery] = useDrawerState(null);
  const [fullscreen, setFullscreen]     = useDrawerState(false);
  const [duplicating, setDuplicating]   = useDrawerState(false);
  const statusRef   = useDrawerRef(null);
  const textareaRef = useDrawerRef(null);

  // Fetch full task detail (doc + comments + subtasks) when drawer opens
  useDrawerEffect(() => {
    if (!open || !task) { setDetail(null); setStatusOpen(false); return; }
    setLoadingDetail(true);
    API.getTaskDetail(task.id)
      .then(d => { setDetail(d); setLoadingDetail(false); })
      .catch(() => { setDetail(null); setLoadingDetail(false); });
  }, [open, task?.id]);

  useDrawerEffect(() => {
    const handleClick = (e) => {
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target)) {
        setStatusOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statusOpen]);

  // ── Duplicate task ──────────────────────────────────────────────────────
  const handleDuplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const newTask = await API.createTask(task.project_id, {
        title: task.title + ' (kopya)',
        desc: task.desc,
        col: task.col,
        priority: task.priority,
        due: task.due || null,
        labels: task.labels || [],
        assignees: task.assignees || [],
      });
      if (onCreateTask) onCreateTask(newTask);
      onClose();
    } catch (e) {
      alert('Görev kopyalanamadı: ' + e.message);
    } finally {
      setDuplicating(false);
    }
  };

  if (!task) return null;

  const members = (task.assignees || [])
    .map(id => DATA.MEMBERS.find(m => m.id === id))
    .filter(Boolean);
  const col = DATA.COLUMNS.find(c => c.id === task.col) || { title_tr: task.col };

  const doc        = detail?.doc        || _basicDoc(task);
  const comments   = detail?.comments_list || [];
  const subsDetail = detail?.subtasks_detail || [];

  // ── Submit comment ──────────────────────────────────────────────────────
  const handleCommentSubmit = async () => {
    const text = newComment.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const comment = await API.addComment(task.id, text);
      setDetail(d => ({ ...(d || {}), comments_list: [...(d?.comments_list || []), comment] }));
      setNewComment('');
      setMentionQuery(null);
      onTaskUpdate({ id: task.id, comments: (task.comments || 0) + 1 });
    } catch (e) {
      alert('Yorum gönderilemedi: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── @ Mention logic ─────────────────────────────────────────────────────
  const handleCommentChange = (e) => {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match  = before.match(/@([\wçğıöşüÇĞİÖŞÜ]*)$/i);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const insertMention = (member) => {
    const el     = textareaRef.current;
    const cursor = el ? el.selectionStart : newComment.length;
    const before = newComment.slice(0, cursor);
    const after  = newComment.slice(cursor);
    const match  = before.match(/@([\wçğıöşüÇĞİÖŞÜ]*)$/i);
    const firstName = member.name.split(' ')[0];
    const prefix = match ? before.slice(0, before.length - match[0].length) : before;
    setNewComment(prefix + '@' + firstName + ' ' + after);
    setMentionQuery(null);
    setTimeout(() => el && el.focus(), 0);
  };

  const mentionMembers = mentionQuery !== null
    ? DATA.MEMBERS.filter(m => m.name.toLowerCase().includes(mentionQuery))
    : [];

  // ── Toggle subtask ──────────────────────────────────────────────────────
  const handleSubtaskToggle = async (subId, currentDone) => {
    if (!canManageTasks) return;
    const newDone = !currentDone;
    setDetail(d => ({
      ...(d || {}),
      subtasks_detail: (d?.subtasks_detail || []).map(s =>
        s.id === subId ? { ...s, done: newDone } : s
      ),
    }));
    try {
      await API.toggleSubtask(subId, newDone);
    } catch (e) {
      // Rollback
      setDetail(d => ({
        ...(d || {}),
        subtasks_detail: (d?.subtasks_detail || []).map(s =>
          s.id === subId ? { ...s, done: currentDone } : s
        ),
      }));
    }
  };

  return (
    <>
      <div className="drawer-overlay" data-open={open} data-fullscreen={fullscreen} onClick={onClose} />
      <div className="drawer" data-open={open} data-fullscreen={fullscreen}>
        <div className="drawer-head">
          <div className="drawer-crumbs">
            <span>StoaBoard Web</span>
            <span className="sep"><Icon name="chevronRight" size={11} /></span>
            <span style={{ color: 'var(--ink)' }}>{col.title_tr}</span>
          </div>
          <div className="drawer-head-actions">
            <button className="icon-btn" title="Kopyala" onClick={handleDuplicate} disabled={duplicating}>
              <Icon name="copy" size={15} />
            </button>
            <button className="icon-btn" title={fullscreen ? 'Küçült' : 'Tam ekran'} onClick={() => setFullscreen(f => !f)}>
              <Icon name={fullscreen ? 'minimize' : 'expand'} size={14} />
            </button>
            {onDelete && canManageTasks && (
              confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--status-rose)', borderColor: 'var(--status-rose)' }}
                    onClick={() => { onDelete(task.id); setConfirmDelete(false); }}>
                    Sil
                  </button>
                  <button className="icon-btn" title="Vazgeç" onClick={() => setConfirmDelete(false)}>
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ) : (
                <button className="icon-btn" title="Sil" onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={14} />
                </button>
              )
            )}
            <button className="icon-btn" title="Kapat" onClick={onClose}><Icon name="x" size={15} /></button>
          </div>
        </div>

        <div className="drawer-body">
          <div className="doc-title" contentEditable={canManageTasks} suppressContentEditableWarning
            onBlur={(e) => {
              if (!canManageTasks) return;
              const newTitle = e.target.textContent?.trim();
              if (newTitle && newTitle !== task.title) {
                API.updateTask(task.id, { title: newTitle })
                  .then(() => onTaskUpdate({ id: task.id, title: newTitle }))
                  .catch(console.error);
              }
            }}>
            {task.title}
          </div>

          {/* Properties */}
          <div className="props-grid">
            <div className="prop-label"><Icon name="circleHalf" size={13} /> Durum</div>
            <div className="prop-value custom-dropdown" ref={statusRef}>
              <button type="button" className="custom-dropdown-btn" disabled={!canManageTasks} onClick={() => canManageTasks && setStatusOpen(o => !o)}>
                <span>{col.title_tr}</span>
                <Icon name="chevronDown" size={12} />
              </button>
              {statusOpen && canManageTasks && (
                <div className="custom-dropdown-menu">
                  {DATA.COLUMNS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={"custom-dropdown-item" + (c.id === task.col ? ' active' : '')}
                      onClick={() => { onMoveTask(task.id, c.id); setStatusOpen(false); }}
                    >
                      {c.title_tr}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="prop-label"><Icon name="flag" size={13} /> Öncelik</div>
            <div className="prop-value">
              <span className="priority-dot" data-p={task.priority} />
              {task.priority === 'high' ? 'Yüksek' : task.priority === 'mid' ? 'Orta' : 'Düşük'}
            </div>

            <div className="prop-label"><Icon name="users" size={13} /> Atanan</div>
            <div className="prop-value">
              <AvatarStack members={members} size="sm" />
              <span style={{ color: 'var(--ink-muted)', marginLeft: 4 }}>
                {members.map(m => m.name.split(' ')[0]).join(', ')}
              </span>
            </div>

            <div className="prop-label"><Icon name="calendar" size={13} /> Bitiş</div>
            <div className="prop-value">
              {task.due ? (
                <>
                  <span style={{ color: DATA.isOverdue(task.due, task.col) ? 'var(--status-rose)' : 'var(--ink)' }}>
                    {DATA.fmtDate(task.due)}, {new Date(task.due).getFullYear()}
                  </span>
                  {DATA.isOverdue(task.due, task.col) &&
                    <span style={{ color: 'var(--status-rose)', fontSize: 12 }}>· geçti</span>}
                </>
              ) : <span style={{ color: 'var(--ink-muted)' }}>Tarih ekle</span>}
            </div>

            <div className="prop-label"><Icon name="tag" size={13} /> Etiketler</div>
            <div className="prop-value" style={{ gap: 4, flexWrap: 'wrap' }}>
              {(task.labels || []).map(l => {
                const lab = DATA.LABELS[l];
                return lab && <span key={l} className="tag" data-tone={lab.tone}>{lab.tr}</span>;
              })}
            </div>
          </div>

          {/* Document content */}
          {loadingDetail ? (
            <div style={{ padding: '24px 0', color: 'var(--ink-muted)', fontSize: 13 }}>Yükleniyor…</div>
          ) : (
            <div className="doc-content">
              {doc.map((b, i) => (
                <DrawerDocBlock
                  key={i}
                  block={b}
                  subsDetail={subsDetail}
                  onSubtaskToggle={handleSubtaskToggle}
                  canManageTasks={canManageTasks}
                />
              ))}
            </div>
          )}

          {/* Comments */}
          <div className="comments-section">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.005em', marginBottom: 6 }}>
              Yorumlar <span style={{ color: 'var(--ink-muted)', fontSize: 13, fontFamily: 'var(--font-ui)' }}>· {comments.length}</span>
            </h3>
            {comments.map((c, i) => {
              const m = DATA.MEMBERS.find(mm => mm.id === c.author);
              return (
                <div className="comment-row" key={i}>
                  <Avatar member={m || { initials: '?', color: 'var(--ink-faint)' }} size="sm" />
                  <div className="comment-body">
                    <div className="comment-head">
                      <span className="comment-name">{m?.name || c.author}</span>
                      <span className="comment-time">{c.time}</span>
                    </div>
                    <div className="comment-text">{c.text}</div>
                  </div>
                </div>
              );
            })}
            <div className="comment-compose">
              <Avatar member={DATA.MEMBERS.find(m => m.id === window.CURRENT_USER?.id) || DATA.MEMBERS[0]} size="sm" />
              <div className="comment-input-wrap">
                {mentionMembers.length > 0 && (
                  <div className="mention-dropdown">
                    {mentionMembers.map(m => (
                      <button
                        key={m.id}
                        className="mention-item"
                        onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                      >
                        <Avatar member={m} size="sm" />
                        <span className="mention-name">{m.name}</span>
                        <span className="mention-role">{m.role}</span>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  placeholder="Yorum yaz… @ ile bahset"
                  value={newComment}
                  onChange={handleCommentChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setMentionQuery(null); return; }
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCommentSubmit();
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={onClose}>İptal</button>
              <button className="btn btn-primary" onClick={handleCommentSubmit} disabled={submitting || !newComment.trim()}>
                {submitting ? 'Gönderiliyor…' : 'Gönder'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Doc block renderer ──────────────────────────────────────────────────────

function DrawerDocBlock({ block, subsDetail, onSubtaskToggle, canManageTasks = true }) {
  const [localChecks, setLocalChecks] = useDrawerState(null);

  // Build check state from subsDetail or block items
  React.useEffect(() => {
    if (block.kind !== 'checklist') return;
    if (subsDetail && subsDetail.length > 0 && block.items) {
      // Try to match items with subsDetail by position
      setLocalChecks(block.items.map((it, i) => {
        if (it.id) {
          const sub = subsDetail.find(s => s.id === it.id);
          return sub ? sub.done : !!it.done;
        }
        return subsDetail[i] ? subsDetail[i].done : !!it.done;
      }));
    } else if (block.items) {
      setLocalChecks(block.items.map(it => !!it.done));
    }
  }, [subsDetail, block]);

  const checks = localChecks || (block.items || []).map(it => !!it.done);

  switch (block.kind) {
    case 'h2':    return <h2>{block.text}</h2>;
    case 'h3':    return <h3>{block.text}</h3>;
    case 'p':     return <p>{block.text}</p>;
    case 'ul':    return <ul>{(block.items || []).map((it, i) => <li key={i}>{it}</li>)}</ul>;
    case 'pre':   return <pre>{block.text}</pre>;
    case 'quote': return <blockquote>{block.text}</blockquote>;
    case 'checklist':
      return (
        <div className="checklist">
          {(block.items || []).map((it, i) => {
            const checked = checks[i] || false;
            const subId = it.id || (subsDetail?.[i]?.id);
            return (
              <div
                key={i}
                className="check-row"
                data-checked={checked}
                onClick={() => {
                  if (!canManageTasks) return;
                  const newChecks = checks.map((c, j) => j === i ? !c : c);
                  setLocalChecks(newChecks);
                  if (subId && onSubtaskToggle) onSubtaskToggle(subId, checked);
                }}
              >
                <div className="list-check" data-checked={checked}>
                  {checked && <Icon name="check" size={10} strokeWidth={2.5} />}
                </div>
                <span className="check-text" style={{ fontSize: 14, lineHeight: 1.5 }}>{it.text}</span>
              </div>
            );
          })}
        </div>
      );
    default: return null;
  }
}

// Generate basic doc from task description when no stored doc
function _basicDoc(task) {
  const doc = [];
  if (task?.desc) {
    doc.push({ kind: 'h2', text: 'Açıklama' });
    doc.push({ kind: 'p', text: task.desc });
  }
  if (!doc.length) {
    doc.push({ kind: 'p', text: 'Bu kart için henüz detaylı açıklama eklenmedi.' });
  }
  return doc;
}

window.TaskDrawer = TaskDrawer;
