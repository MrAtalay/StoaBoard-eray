// Task detail drawer — API-backed

const { useState: useDrawerState, useEffect: useDrawerEffect, useRef: useDrawerRef } = React;

function TaskDrawer({ open, task, onClose, onMoveTask, onTaskUpdate, onDelete, onCreateTask, canManageTasks = true, pageMode = false, onOpenPage }) {
  const [detail, setDetail]             = useDrawerState(null);
  const [newComment, setNewComment]     = useDrawerState('');
  const [submitting, setSubmitting]     = useDrawerState(false);
  const [loadingDetail, setLoadingDetail] = useDrawerState(false);
  const [linkedNotes, setLinkedNotes]   = useDrawerState([]);
  const [loadingLinkedNotes, setLoadingLinkedNotes] = useDrawerState(false);
  const [statusOpen, setStatusOpen]     = useDrawerState(false);
  const [priorityOpen, setPriorityOpen] = useDrawerState(false);
  const [labelOpen, setLabelOpen]       = useDrawerState(false);
  const [assigneeOpen, setAssigneeOpen] = useDrawerState(false);
  const [confirmDelete, setConfirmDelete] = useDrawerState(false);
  const [mentionQuery, setMentionQuery] = useDrawerState(null);
  const [mentionIdx, setMentionIdx]     = useDrawerState(0);
  const [duplicating, setDuplicating]   = useDrawerState(false);

  // ── Checklist ────────────────────────────────────────────────────────────
  const [checklist, setChecklist]       = useDrawerState([]);
  const [checkInput, setCheckInput]     = useDrawerState('');
  const [checkSaving, setCheckSaving]   = useDrawerState(false);
  const [editingCheckId, setEditingCheckId] = useDrawerState(null);
  const [editingCheckText, setEditingCheckText] = useDrawerState('');

  // ── Attachments ───────────────────────────────────────────────────────────
  const [attachments, setAttachments]   = useDrawerState([]);
  const [uploading, setUploading]       = useDrawerState(false);
  const [uploadProgress, setUploadProgress] = useDrawerState(0);
  const [imagePreview, setImagePreview] = useDrawerState(null); // { url, name }
  const [editingAttId, setEditingAttId] = useDrawerState(null);
  const [editingAttName, setEditingAttName] = useDrawerState('');
  const fileInputRef                    = useDrawerRef(null);

  // ── Doc state for inline editing ─────────────────────────────────────────
  const [docState, setDocState] = useDrawerState(null);

  // ── Note linking ─────────────────────────────────────────────────────────
  const [noteLinkOpen, setNoteLinkOpen] = useDrawerState(false);
  const [allNotes, setAllNotes]         = useDrawerState(null); // null = not loaded yet
  const [noteSearch, setNoteSearch]     = useDrawerState('');
  const noteLinkRef                     = useDrawerRef(null);
  const [dueVal, setDueVal]             = useDrawerState('');
  const [startVal, setStartVal]         = useDrawerState('');
  const [assigneeDatesVal, setAssigneeDatesVal] = useDrawerState({});
  const statusRef   = useDrawerRef(null);
  const priorityRef = useDrawerRef(null);
  const labelRef    = useDrawerRef(null);
  const assigneeRef = useDrawerRef(null);
  const textareaRef = useDrawerRef(null);

  useDrawerEffect(() => {
    setDueVal(task?.due || '');
    setStartVal(task?.start || '');
    setAssigneeDatesVal(task?.assignee_dates || {});
  }, [task?.id, task?.due, task?.start]);

  // Fetch full task detail (doc + comments + subtasks) when drawer opens
  useDrawerEffect(() => {
    if (!open || !task) { setDetail(null); setStatusOpen(false); return; }
    setLoadingDetail(true);
    API.getTaskDetail(task.id)
      .then(d => { setDetail(d); setDocState(d?.doc || null); setLoadingDetail(false); })
      .catch(() => { setDetail(null); setDocState(null); setLoadingDetail(false); });
  }, [open, task?.id]);

  // Fetch linked notes for this task
  useDrawerEffect(() => {
    if (!open || !task) { setLinkedNotes([]); return; }
    setLoadingLinkedNotes(true);
    API.taskLinkedNotes(task.id)
      .then(rows => { setLinkedNotes(rows || []); setLoadingLinkedNotes(false); })
      .catch(() => { setLinkedNotes([]); setLoadingLinkedNotes(false); });
  }, [open, task?.id]);

  // Fetch attachments
  useDrawerEffect(() => {
    if (!open || !task) { setAttachments([]); return; }
    API.listAttachments(task.id).then(rows => setAttachments(rows || [])).catch(() => {});
  }, [open, task?.id]);

  const handleFileUpload = async (file) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const att = await API.uploadAttachment(task.id, fd);
      setAttachments(prev => [att, ...prev]);
      window.showToast?.(`"${att.file_name}" yüklendi.`, 'success');
    } catch (e) { window.showToast?.(e.message, 'error'); }
    finally { setUploading(false); setUploadProgress(0); }
  };

  const handleDeleteAttachment = async (attId) => {
    try {
      await API.deleteAttachment(attId);
      setAttachments(prev => prev.filter(a => a.id !== attId));
    } catch (e) { window.showToast?.(e.message, 'error'); }
  };

  const handleRenameAttachment = async (attId, newName) => {
    const n = newName.trim();
    if (!n) { setEditingAttId(null); return; }
    try {
      const updated = await API.renameAttachment(attId, n);
      setAttachments(prev => prev.map(a => a.id === attId ? { ...a, display_name: updated.display_name } : a));
    } catch (e) { window.showToast?.(e.message, 'error'); }
    setEditingAttId(null);
  };

  // Live updates: react to note_updated / note_deleted to keep panel fresh
  useDrawerEffect(() => {
    const sock = window.SOCKET;
    if (!sock || !open || !task) return;
    const onUpd = (note) => {
      if (!note) return;
      setLinkedNotes(prev => {
        const isLinkedNow = (note.linked_tasks || []).map(String).includes(String(task.id));
        const had = prev.some(n => n.id === note.id);
        if (isLinkedNow && !had) return [note, ...prev];
        if (!isLinkedNow && had) return prev.filter(n => n.id !== note.id);
        return prev.map(n => n.id === note.id ? { ...n, ...note } : n);
      });
    };
    const onDel = ({ id }) => setLinkedNotes(prev => prev.filter(n => n.id !== id));
    sock.on('note_updated', onUpd);
    sock.on('note_deleted', onDel);
    return () => {
      sock.off('note_updated', onUpd);
      sock.off('note_deleted', onDel);
    };
  }, [open, task?.id]);

  useDrawerEffect(() => {
    const handleClick = (e) => {
      if (statusOpen   && statusRef.current   && !statusRef.current.contains(e.target))   setStatusOpen(false);
      if (priorityOpen && priorityRef.current && !priorityRef.current.contains(e.target)) setPriorityOpen(false);
      if (labelOpen    && labelRef.current    && !labelRef.current.contains(e.target))    setLabelOpen(false);
      if (assigneeOpen && assigneeRef.current && !assigneeRef.current.contains(e.target)) setAssigneeOpen(false);
      if (noteLinkOpen && noteLinkRef.current && !noteLinkRef.current.contains(e.target)) setNoteLinkOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statusOpen, priorityOpen, labelOpen, assigneeOpen, noteLinkOpen]);

  // Load checklist from doc when detail arrives
  useDrawerEffect(() => {
    if (!detail) return;
    const doc = detail.doc || [];
    const block = doc.find(b => b.kind === 'checklist' && !b._subtask);
    if (block && block.items) {
      setChecklist(block.items.map((it, i) => ({ id: i, text: typeof it === 'string' ? it : it.text, done: !!it.done })));
    } else {
      setChecklist([]);
    }
  }, [detail?.doc]);

  // Save checklist back to doc
  const saveChecklist = async (items) => {
    if (!task) return;
    const existingDoc = (detail?.doc || []).filter(b => !(b.kind === 'checklist' && !b._subtask));
    const newDoc = items.length > 0
      ? [...existingDoc, { kind: 'checklist', items: items.map(it => ({ text: it.text, done: it.done })) }]
      : existingDoc;
    const done  = items.filter(i => i.done).length;
    const total = items.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : (task.progress || 0);
    setCheckSaving(true);
    try {
      await API.updateTask(task.id, { doc: newDoc, progress });
      onTaskUpdate && onTaskUpdate({ id: task.id, progress });
    } catch (e) { window.showToast?.('Checklist kaydedilemedi: ' + e.message, 'error'); }
    finally { setCheckSaving(false); }
  };

  const toggleCheckItem = (id) => {
    const updated = checklist.map(it => it.id === id ? { ...it, done: !it.done } : it);
    setChecklist(updated);
    saveChecklist(updated);
  };

  const addCheckItem = () => {
    const text = checkInput.trim();
    if (!text) return;
    const updated = [...checklist, { id: Date.now(), text, done: false }];
    setChecklist(updated);
    setCheckInput('');
    saveChecklist(updated);
  };

  const deleteCheckItem = (id) => {
    const updated = checklist.filter(it => it.id !== id);
    setChecklist(updated);
    saveChecklist(updated);
  };

  const renameCheckItem = (id, newText) => {
    const t = newText.trim();
    if (!t) return;
    const updated = checklist.map(it => it.id === id ? { ...it, text: t } : it);
    setChecklist(updated);
    saveChecklist(updated);
    setEditingCheckId(null);
  };

  const patchTask = async (fields) => {
    onTaskUpdate && onTaskUpdate({ id: task.id, ...task, ...fields });
    try {
      const updated = await API.updateTask(task.id, fields);
      onTaskUpdate && onTaskUpdate({ id: task.id, ...updated });
    } catch (e) {
      console.error('patchTask:', e);
      onTaskUpdate && onTaskUpdate({ id: task.id, ...task });
    }
  };

  // ── Duplicate task ──────────────────────────────────────────────────────
  const handleDuplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const newTask = await API.createTask(task.project_id, {
        title: task.title + ' (' + (window.t('drawer_copy_suffix') || 'kopya') + ')',
        desc: task.desc,
        col: task.col,
        priority: task.priority,
        start: task.start || null,
        due: task.due || null,
        labels: task.labels || [],
        assignees: task.assignees || [],
        assignee_dates: task.assignee_dates || null,
      });
      if (onCreateTask) onCreateTask(newTask);
      onClose();
    } catch (e) {
      window.showToast?.(window.t('drawer_err_duplicate') + e.message, 'error');
    } finally {
      setDuplicating(false);
    }
  };

  if (!task) return null;

  const members = (task.assignees || [])
    .map(id => DATA.MEMBERS.find(m => m.id === id))
    .filter(Boolean);
  const col = DATA.COLUMNS.find(c => c.id === task.col) || { title_tr: task.col };

  const doc        = docState || detail?.doc || _basicDoc(task);
  const comments   = detail?.comments_list || [];
  const subsDetail = detail?.subtasks_detail || [];

  const saveDocBlock = async (index, newText) => {
    const newDoc = doc.map((b, i) => i === index ? { ...b, text: newText } : b);
    setDocState(newDoc);
    try { await API.updateTask(task.id, { doc: newDoc }); }
    catch (e) { window.showToast?.('Kaydedilemedi: ' + e.message, 'error'); }
  };

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
      window.showToast?.(window.t('drawer_err_comment') + e.message, 'error');
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

  const bodyContent = (
    <>
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
        <div className="prop-label"><Icon name="circleHalf" size={13} /> {window.t('drawer_status')}</div>
        <div className="prop-value custom-dropdown" ref={statusRef}>
          <button type="button" className="custom-dropdown-btn" disabled={!canManageTasks} onClick={() => canManageTasks && setStatusOpen(o => !o)}>
            <span className="dropdown-label">{col.title_tr}</span>
            <Icon name="chevronDown" size={12} />
          </button>
          {statusOpen && canManageTasks && (
            <div className="custom-dropdown-menu">
              {DATA.COLUMNS.map(c => (
                <button key={c.id} type="button" className={"custom-dropdown-item" + (c.id === task.col ? ' active' : '')}
                  onClick={() => { onMoveTask(task.id, c.id); setStatusOpen(false); }}>
                  {c.title_tr}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="prop-label"><Icon name="flag" size={13} /> {window.t('drawer_priority')}</div>
        <div className="prop-value custom-dropdown" ref={priorityRef}>
          <button type="button" className="custom-dropdown-btn" disabled={!canManageTasks}
            onClick={() => canManageTasks && setPriorityOpen(o => !o)}>
            <span className="priority-dot" data-p={task.priority} />
            <span className="dropdown-label">{task.priority === 'high' ? window.t('board_priority_high') : task.priority === 'mid' ? window.t('board_priority_mid') : window.t('board_priority_low')}</span>
            {canManageTasks && <Icon name="chevronDown" size={12} />}
          </button>
          {priorityOpen && canManageTasks && (
            <div className="custom-dropdown-menu">
              {[['high', window.t('board_priority_high')],['mid', window.t('board_priority_mid')],['low', window.t('board_priority_low')]].map(([p, label]) => (
                <button key={p} type="button" className={'custom-dropdown-item' + (task.priority === p ? ' active' : '')}
                  onClick={() => { patchTask({ priority: p }); setPriorityOpen(false); }}>
                  <span className="priority-dot" data-p={p} /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="prop-label"><Icon name="users" size={13} /> {window.t('drawer_assignee')}</div>
        <div className="prop-value custom-dropdown" ref={assigneeRef}>
          <button type="button" className="custom-dropdown-btn" disabled={!canManageTasks}
            onClick={() => canManageTasks && setAssigneeOpen(o => !o)}>
            {members.length > 0
              ? <><AvatarStack members={members} size="sm" max={3} /><span style={{ color:'var(--ink-muted)', fontSize:12 }}>{members.map(m => m.name.split(' ')[0]).join(', ')}</span></>
              : <span style={{ color:'var(--ink-muted)' }}>{window.t('drawer_assign_placeholder')}</span>
            }
            {canManageTasks && <Icon name="chevronDown" size={12} />}
          </button>
          {assigneeOpen && canManageTasks && (
            <div className="custom-dropdown-menu" style={{ minWidth: 180 }}>
              {DATA.MEMBERS.map(m => {
                const assigned = (task.assignees || []).includes(m.id);
                return (
                  <button key={m.id} type="button" className="custom-dropdown-item"
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => {
                      const cur = task.assignees || [];
                      const next = assigned ? cur.filter(a => a !== m.id) : [...cur, m.id];
                      patchTask({ assignees: next });
                    }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <Avatar member={m} size="sm" /> {m.name.split(' ')[0]}
                    </span>
                    {assigned && <Icon name="check" size={12} strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="prop-label"><Icon name="calendar" size={13} /> {window.t('drawer_dates')}</div>
        <div className="prop-value" style={{ gap: 4, flexDirection: 'column', alignItems: 'stretch' }}>
          {canManageTasks ? (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <DatePicker value={startVal} onChange={(v) => { setStartVal(v || ''); patchTask({ start: v || null }); }} />
              <span style={{ color:'var(--ink-muted)', fontSize:12, flexShrink:0 }}>–</span>
              <DatePicker value={dueVal} onChange={(v) => { setDueVal(v || ''); patchTask({ due: v || null }); }} />
            </div>
          ) : (
            <span style={{ fontSize:13, color: dueVal && DATA.isOverdue(dueVal, task.col) ? 'var(--status-rose)' : 'var(--ink)' }}>
              {startVal && dueVal ? `${DATA.fmtDate(startVal)} – ${DATA.fmtDate(dueVal)}`
                : dueVal ? DATA.fmtDate(dueVal)
                : startVal ? DATA.fmtDate(startVal)
                : '—'}
            </span>
          )}
          {members.filter(m => assigneeDatesVal[m.id]?.start || assigneeDatesVal[m.id]?.end).map(m => {
            const d = assigneeDatesVal[m.id] || {};
            const patchAd = (field, val) => {
              const next = { ...assigneeDatesVal, [m.id]: { ...(assigneeDatesVal[m.id] || {}), [field]: val || null } };
              setAssigneeDatesVal(next);
              patchTask({ assignee_dates: next });
            };
            return (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:m.color, flexShrink:0 }} />
                <span style={{ fontSize:11, color:'var(--ink-muted)', minWidth:44 }}>{m.name.split(' ')[0]}</span>
                {canManageTasks ? (
                  <div style={{ display:'flex', gap:4, flex:1 }}>
                    <DatePicker value={d.start || ''} onChange={(v) => patchAd('start', v)} />
                    <DatePicker value={d.end   || ''} onChange={(v) => patchAd('end',   v)} />
                  </div>
                ) : (
                  <span style={{ fontSize:11, color:'var(--ink)' }}>
                    {d.start && d.end ? `${DATA.fmtDate(d.start)} – ${DATA.fmtDate(d.end)}`
                      : DATA.fmtDate(d.start || d.end)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="prop-label"><Icon name="tag" size={13} /> {window.t('drawer_labels')}</div>
        <div className="prop-value" style={{ gap: 4, flexWrap: 'wrap' }} ref={labelRef}>
          {(task.labels || []).map(l => {
            const lab = DATA.LABELS[l];
            return lab && (
              <span key={l} className="tag" data-tone={lab.tone}
                style={{ cursor: canManageTasks ? 'pointer' : 'default' }}
                onClick={() => {
                  if (!canManageTasks) return;
                  patchTask({ labels: (task.labels || []).filter(x => x !== l) });
                }}
                title={canManageTasks ? window.t('drawer_label_remove_hint') : undefined}>
                {lab.tr}
              </span>
            );
          })}
          {canManageTasks && (
            <>
              <button className="tag" style={{ cursor:'pointer', borderStyle:'dashed' }}
                onClick={(e) => { e.stopPropagation(); setLabelOpen(o => !o); }}>
                <Icon name="plus" size={10} strokeWidth={2} />
              </button>
              {labelOpen && (
                <div className="custom-dropdown-menu" style={{ minWidth: 180 }}>
                  {Object.entries(DATA.LABELS).map(([slug, lab]) => {
                    const active = (task.labels || []).includes(slug);
                    return (
                      <button key={slug} type="button" className="custom-dropdown-item"
                        style={{ justifyContent:'space-between' }}
                        onClick={() => {
                          const cur = task.labels || [];
                          patchTask({ labels: active ? cur.filter(x => x !== slug) : [...cur, slug] });
                        }}>
                        <span className="tag" data-tone={lab.tone}>{lab.tr}</span>
                        {active && <Icon name="check" size={12} strokeWidth={2.5} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Document content */}
      {loadingDetail ? (
        <div style={{ padding: '24px 0', color: 'var(--ink-muted)', fontSize: 13 }}>{window.t('drawer_loading')}</div>
      ) : (
        <div className="doc-content">
          {doc.map((b, i) => (
            <DrawerDocBlock key={i} block={b} subsDetail={subsDetail} onSubtaskToggle={handleSubtaskToggle} canManageTasks={canManageTasks}
              onUpdate={canManageTasks ? (newText) => saveDocBlock(i, newText) : undefined} />
          ))}
        </div>
      )}

      {/* ── Checklist ── */}
      <div className="comments-section" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.005em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          Yapılacaklar
          {checklist.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'var(--font-ui)', fontWeight: 400 }}>
              {checklist.filter(i => i.done).length}/{checklist.length}
            </span>
          )}
          {checkSaving && <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-ui)', fontWeight: 400 }}>kaydediliyor…</span>}
        </h3>
        {checklist.length > 0 && (
          <div className="checklist-progress-bar" style={{ marginBottom: 10 }}>
            <div className="checklist-progress-fill" style={{ width: `${Math.round(checklist.filter(i => i.done).length / checklist.length * 100)}%` }} />
          </div>
        )}
        <div className="drawer-checklist">
          {checklist.map(it => (
            <div key={it.id} className="drawer-check-row" data-done={it.done}>
              <div
                className="drawer-check-box"
                data-done={it.done}
                onClick={() => canManageTasks && editingCheckId !== it.id && toggleCheckItem(it.id)}
              >
                {it.done && <Icon name="check" size={10} />}
              </div>
              {editingCheckId === it.id ? (
                <div style={{ display: 'flex', flex: 1, gap: 4, alignItems: 'center' }}>
                  <input
                    autoFocus
                    className="drawer-check-edit-input"
                    value={editingCheckText}
                    onChange={e => setEditingCheckText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameCheckItem(it.id, editingCheckText || it.text);
                      if (e.key === 'Escape') setEditingCheckId(null);
                    }}
                  />
                  <button
                    className="drawer-check-action save"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => renameCheckItem(it.id, editingCheckText || it.text)}
                    title="Kaydet"
                  >
                    <Icon name="check" size={11} />
                  </button>
                  <button
                    className="drawer-check-action cancel"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setEditingCheckId(null)}
                    title="İptal"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ) : (
                <span className="drawer-check-text">{it.text}</span>
              )}
              {canManageTasks && editingCheckId !== it.id && (
                <button className="drawer-check-del" onClick={() => { setEditingCheckId(it.id); setEditingCheckText(it.text); }} title="Düzenle">
                  <Icon name="pen" size={10} />
                </button>
              )}
              {canManageTasks && editingCheckId !== it.id && (
                <button className="drawer-check-del" onClick={() => deleteCheckItem(it.id)} title="Kaldır">
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
          ))}
          {canManageTasks && (
            <div className="drawer-check-add">
              <input
                placeholder="Yeni madde ekle…"
                value={checkInput}
                onChange={e => setCheckInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCheckItem(); }}
              />
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addCheckItem} disabled={!checkInput.trim()}>
                + Ekle
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Linked notes ── */}
      <div className="comments-section" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.005em', margin: 0, flex: 1 }}>
            {window.t('drawer_linked_notes')} <span style={{ color: 'var(--ink-muted)', fontSize: 13, fontFamily: 'var(--font-ui)' }}>· {linkedNotes.length}</span>
          </h3>
          {canManageTasks && (
            <div style={{ position: 'relative' }} ref={noteLinkRef}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '3px 9px' }}
                onClick={() => {
                  setNoteLinkOpen(o => !o);
                  setNoteSearch('');
                  if (!allNotes) API.listNotes().then(setAllNotes).catch(() => setAllNotes([]));
                }}
              >
                <Icon name="plus" size={11} /> Not bağla
              </button>
              {noteLinkOpen && (
                <div className="note-link-dropdown">
                  <input
                    autoFocus
                    placeholder="Not ara…"
                    value={noteSearch}
                    onChange={e => setNoteSearch(e.target.value)}
                    className="note-link-search"
                  />
                  <div className="note-link-list">
                    {allNotes === null
                      ? <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--ink-faint)' }}>Yükleniyor…</div>
                      : (allNotes || [])
                          .filter(n => !linkedNotes.some(ln => ln.id === n.id))
                          .filter(n => !noteSearch || (n.title || '').toLowerCase().includes(noteSearch.toLowerCase()))
                          .slice(0, 12)
                          .map(n => (
                            <button
                              key={n.id}
                              className="note-link-item"
                              onClick={async () => {
                                try {
                                  await API.linkNoteTask(n.id, task.id);
                                  setLinkedNotes(prev => [n, ...prev]);
                                  setNoteLinkOpen(false);
                                  window.showToast?.('Not bağlandı.', 'success');
                                } catch (e) { window.showToast?.(e.message, 'error'); }
                              }}
                            >
                              <Icon name="note" size={12} />
                              <span>{n.title || '(başlıksız)'}</span>
                            </button>
                          ))
                    }
                    {allNotes !== null && (allNotes || []).filter(n => !linkedNotes.some(ln => ln.id === n.id)).length === 0 && (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--ink-faint)' }}>Bağlanacak not yok.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {loadingLinkedNotes ? (
          <div style={{ fontSize: 12, color: 'var(--ink-faint)', padding: '8px 0' }}>{window.t('drawer_loading')}</div>
        ) : linkedNotes.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', padding: '8px 0' }}>{window.t('drawer_no_linked_notes')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {linkedNotes.map(n => {
              const author = DATA.MEMBERS.find(m => m.id === n.author);
              return (
                <div key={n.id} className="note-linked-item"
                  onClick={() => {
                    onClose && onClose();
                    if (window.__SWITCH_VIEW__) window.__SWITCH_VIEW__('notes');
                    setTimeout(() => { window.__NOTES_OPEN__ && window.__NOTES_OPEN__(n.id); }, 30);
                  }}>
                  <Icon name="note" size={12} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title || window.t('drawer_untitled_note')}</span>
                  {author && <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{author.name?.split(' ')[0]}</span>}
                  <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{fmtTimeAgo(n.updated_ago)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attachments */}
      <div className="comments-section" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.005em', margin: 0, flex: 1 }}>
            {window.t?.('drawer_attachments') || 'Dosyalar'}
            {attachments.length > 0 && <span style={{ color: 'var(--ink-muted)', fontSize: 13, fontFamily: 'var(--font-ui)', marginLeft: 6 }}>· {attachments.length}</span>}
          </h3>
          {canManageTasks && (
            <>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 9px' }}
                onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Icon name="paperclip" size={11} /> {uploading ? (window.t?.('drawer_uploading') || 'Yükleniyor…') : (window.t?.('drawer_attach') || '+ Ekle')}
              </button>
            </>
          )}
        </div>
        {/* Drop zone */}
        {canManageTasks && (
          <div className="attachment-drop-zone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over');
              const file = e.dataTransfer.files[0];
              if (file) handleFileUpload(file);
            }}>
            <Icon name="upload" size={14} />
            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{window.t?.('drawer_drop_files') || 'Dosyayı buraya sürükle veya tıkla'}</span>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="attachment-list">
            {attachments.map(att => {
              const isImage = att.file_type.startsWith('image/');
              const isVideo = att.file_type.startsWith('video/');
              const displayName = att.display_name || att.file_name.replace(/\.[^/.]+$/, '');
              const isEditingThis = editingAttId === att.id;
              return (
                <div key={att.id} className="attachment-item">
                  {isImage ? (
                    <div
                      className="attachment-thumb"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setImagePreview({ url: att.url, name: displayName })}
                    >
                      <img src={att.url} alt={displayName} />
                    </div>
                  ) : (
                    <a href={att.url} download={att.file_name} className="attachment-icon-wrap">
                      <Icon name={isVideo ? 'video' : 'file'} size={18} />
                    </a>
                  )}
                  <div className="attachment-meta">
                    {isEditingThis ? (
                      <input
                        autoFocus
                        className="attachment-name-input"
                        value={editingAttName}
                        onChange={e => setEditingAttName(e.target.value)}
                        onBlur={() => handleRenameAttachment(att.id, editingAttName || displayName)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameAttachment(att.id, editingAttName || displayName);
                          if (e.key === 'Escape') setEditingAttId(null);
                        }}
                      />
                    ) : isImage ? (
                      <span className="attachment-name" style={{ cursor: 'pointer' }}
                        onClick={() => setImagePreview({ url: att.url, name: displayName })}
                        onDoubleClick={canManageTasks ? () => { setEditingAttId(att.id); setEditingAttName(displayName); } : undefined}
                        title={canManageTasks ? 'Yeniden adlandırmak için çift tıkla' : undefined}>
                        {displayName}
                      </span>
                    ) : (
                      <a href={att.url} download={att.file_name} className="attachment-name"
                        onDoubleClick={canManageTasks ? (e) => { e.preventDefault(); setEditingAttId(att.id); setEditingAttName(displayName); } : undefined}
                        title={canManageTasks ? 'Yeniden adlandırmak için çift tıkla' : undefined}>
                        {displayName}
                      </a>
                    )}
                    <span className="attachment-sub">{DATA.MEMBERS.find(m => m.id === att.uploader)?.name?.split(' ')[0] || ''} · {fmtTimeAgo(att.created_at)}</span>
                  </div>
                  {canManageTasks && !isEditingThis && (
                    <button className="drawer-check-del" style={{ opacity: 0.6 }}
                      onClick={() => { setEditingAttId(att.id); setEditingAttName(displayName); }} title="Yeniden adlandır">
                      <Icon name="pen" size={11} />
                    </button>
                  )}
                  {canManageTasks && !isEditingThis && (
                    <button className="drawer-check-del" style={{ opacity: 1 }} onClick={() => handleDeleteAttachment(att.id)} title="Sil">
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Image preview lightbox */}
        {imagePreview && ReactDOM.createPortal(
          <div className="img-preview-overlay" onClick={() => setImagePreview(null)}>
            <div className="img-preview-box" onClick={e => e.stopPropagation()}>
              <button className="img-preview-close" onClick={() => setImagePreview(null)}>
                <Icon name="x" size={16} />
              </button>
              <img src={imagePreview.url} alt={imagePreview.name} className="img-preview-img" />
              <div className="img-preview-name">{imagePreview.name}</div>
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* Comments */}
      <div className="comments-section">
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.005em', marginBottom: 6 }}>
          {window.t('drawer_comments')} <span style={{ color: 'var(--ink-muted)', fontSize: 13, fontFamily: 'var(--font-ui)' }}>· {comments.length}</span>
        </h3>
        {comments.map((c, i) => {
          const m = DATA.MEMBERS.find(mm => mm.id === c.author);
          return (
            <div className="comment-row" key={i}>
              <Avatar member={m || { initials: '?', color: 'var(--ink-faint)' }} size="sm" />
              <div className="comment-body">
                <div className="comment-head">
                  <span className="comment-name">{m?.name || c.author}</span>
                  <span className="comment-time">{fmtTimeAgo(c.time)}</span>
                </div>
                <div className="comment-text">
                  {c.text.split(/(@[\w\-çğışöüÇĞİŞÖÜ]+)/g).map((part, pi) => {
                    if (part.startsWith('@')) {
                      const slug = part.slice(1);
                      const mentioned = DATA.MEMBERS.find(mm => mm.id === slug || mm.name.toLowerCase() === slug.toLowerCase());
                      if (mentioned) {
                        return (
                          <span key={pi} className="comment-mention"
                            onClick={() => {
                              window.__CHAT_MENTION_TASK__ = { id: task.id, title: task.title };
                              if (window.__OPEN_CHAT__) window.__OPEN_CHAT__(mentioned.id);
                            }}>
                            @{mentioned.name.split(' ')[0]}
                          </span>
                        );
                      }
                    }
                    return part;
                  })}
                </div>
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
                  <button key={m.id} className="mention-item"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}>
                    <Avatar member={m} size="sm" />
                    <span className="mention-name">{m.name}</span>
                    <span className="mention-role">{m.role}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              placeholder={window.t('drawer_comment_placeholder')}
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
          <button className="btn btn-ghost" onClick={onClose}>{window.t('app_cancel')}</button>
          <button className="btn btn-primary" onClick={handleCommentSubmit} disabled={submitting || !newComment.trim()}>
            {submitting ? window.t('drawer_sending') : window.t('drawer_send')}
          </button>
        </div>
      </div>
    </>
  );

  const deleteBtn = onDelete && canManageTasks && (
    confirmDelete ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--status-rose)', borderColor: 'var(--status-rose)' }}
          onClick={() => { onDelete(task.id); setConfirmDelete(false); }}>
          {window.t('drawer_delete')}
        </button>
        <button className="icon-btn" title={window.t('drawer_cancel')} onClick={() => setConfirmDelete(false)}>
          <Icon name="x" size={13} />
        </button>
      </div>
    ) : (
      <button className="icon-btn" title={window.t('drawer_delete')} onClick={() => setConfirmDelete(true)}>
        <Icon name="trash" size={14} />
      </button>
    )
  );

  if (pageMode) {
    return (
      <div className="task-page">
        <div className="task-page-head">
          <button className="task-page-back" onClick={onClose}>
            <Icon name="chevronLeft" size={14} />
            {window.t('board_view_kanban') || 'Board'}
          </button>
          <div className="task-page-crumbs">
            <Icon name="chevronRight" size={11} style={{ color: 'var(--ink-faint)' }} />
            <span>{col.title_tr}</span>
          </div>
          <div className="task-page-head-actions">
            <button className="icon-btn" title={window.t('drawer_duplicate')} onClick={handleDuplicate} disabled={duplicating}>
              <Icon name="copy" size={15} />
            </button>
            {deleteBtn}
          </div>
        </div>
        <div className="task-page-body">
          {bodyContent}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="drawer-overlay" data-open={open} onClick={onClose} />
      <div className="drawer" data-open={open}>
        <div className="drawer-head">
          <div className="drawer-crumbs">
            <span>StoaBoard Web</span>
            <span className="sep"><Icon name="chevronRight" size={11} /></span>
            <span style={{ color: 'var(--ink)' }}>{col.title_tr}</span>
          </div>
          <div className="drawer-head-actions">
            <button className="icon-btn" title={window.t('drawer_duplicate')} onClick={handleDuplicate} disabled={duplicating}>
              <Icon name="copy" size={15} />
            </button>
            {onOpenPage && (
              <button className="icon-btn drawer-fullscreen-btn" title={window.t('drawer_fullscreen')} onClick={() => onOpenPage(task)}>
                <Icon name="expand" size={14} />
              </button>
            )}
            {deleteBtn}
            <button className="icon-btn" title={window.t('drawer_close')} onClick={onClose}><Icon name="x" size={15} /></button>
          </div>
        </div>

        <div className="drawer-body">{bodyContent}</div>
      </div>
    </>
  );
}

// ── Doc block renderer ──────────────────────────────────────────────────────

function DrawerDocBlock({ block, subsDetail, onSubtaskToggle, canManageTasks = true, onUpdate }) {
  const [localChecks, setLocalChecks] = useDrawerState(null);
  const [pEditing, setPEditing] = useDrawerState(false);
  const [pDirty, setPDirty] = useDrawerState(false);
  const pRef = useDrawerRef(null);

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
    case 'p':     return (
      <div style={{ position: 'relative' }}>
        {pEditing && onUpdate && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onMouseDown={(e) => {
                e.preventDefault();
                const t = pRef.current?.textContent?.trim() || '';
                if (t !== block.text) onUpdate(t);
                setPEditing(false); setPDirty(false);
                if (pRef.current) { pRef.current.style.background = ''; pRef.current.style.boxShadow = ''; }
              }}
            >
              {window.t?.('set_lbl_save') || 'Kaydet'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '3px 8px' }}
              onMouseDown={(e) => {
                e.preventDefault();
                if (pRef.current) { pRef.current.textContent = block.text; pRef.current.style.background = ''; pRef.current.style.boxShadow = ''; }
                setPEditing(false); setPDirty(false);
              }}
            >
              {window.t?.('set_lbl_cancel') || 'İptal'}
            </button>
          </div>
        )}
        <p ref={pRef} contentEditable={!!onUpdate} suppressContentEditableWarning
          data-editable={!!onUpdate}
          onInput={onUpdate ? () => setPDirty(true) : undefined}
          onFocus={onUpdate ? (e) => {
            setPEditing(true);
            e.currentTarget.style.background = 'var(--bg-subtle)';
            e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)';
          } : undefined}
          onBlur={onUpdate ? (e) => {
            e.currentTarget.style.background = '';
            e.currentTarget.style.boxShadow = '';
            const t = e.currentTarget.textContent?.trim();
            if (pDirty && t !== block.text) onUpdate(t);
            setPEditing(false); setPDirty(false);
          } : undefined}
          style={onUpdate ? { outline: 'none', borderRadius: 4, padding: '2px 4px', margin: '-2px -4px', cursor: 'text' } : {}}
        >{block.text}</p>
      </div>
    );
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
    doc.push({ kind: 'h2', text: window.t?.('drawer_description') || 'Açıklama' });
    doc.push({ kind: 'p', text: task.desc });
  }
  if (!doc.length) {
    doc.push({ kind: 'p', text: window.t?.('drawer_no_description') || 'Bu kart için henüz detaylı açıklama eklenmedi.' });
  }
  return doc;
}

window.TaskDrawer = TaskDrawer;
