// Çöp Kutusu — soft-deleted tasks + notes, 30 gün içinde silinir veya geri alınabilir

import React, { useState as useTrashState } from 'react';
import { Icon } from '../icons.jsx';

const DAYS_RETENTION = 30;

function daysLeft(deletedAt) {
  if (!deletedAt) return DAYS_RETENTION;
  const exp = new Date(new Date(deletedAt).getTime() + DAYS_RETENTION * 86400000);
  return Math.max(0, Math.ceil((exp - Date.now()) / 86400000));
}

function TrashActions({ itemKey, confirmId, setConfirmId, busy, onRestore, onPermDelete, canDelete = true }) {
  return (
    <div className="trash-item-actions">
      <button
        className="trash-restore-btn"
        onClick={() => onRestore()}
        disabled={busy.has(`r-${itemKey}`)}
        title={window.t?.('trash_restore') || 'Geri Al'}
      >
        <Icon name="undo" size={13} />
        {window.t?.('trash_restore') || 'Geri Al'}
      </button>
      {canDelete && (
        confirmId === itemKey ? (
          <div className="trash-confirm">
            <span>{window.t?.('trash_confirm') || 'Kalıcı silinsin mi?'}</span>
            <button className="trash-confirm-yes" onClick={() => onPermDelete()} disabled={busy.has(`d-${itemKey}`)}>
              {window.t?.('trash_confirm_yes') || 'Evet, sil'}
            </button>
            <button className="trash-confirm-no" onClick={() => setConfirmId(null)}>
              {window.t?.('trash_confirm_no') || 'İptal'}
            </button>
          </div>
        ) : (
          <button className="trash-delete-btn" onClick={() => setConfirmId(itemKey)} title={window.t?.('trash_permanent_delete') || 'Kalıcı Sil'}>
            <Icon name="trash" size={13} />
          </button>
        )
      )}
    </div>
  );
}

export function TrashView({ tasks, onRestore, onPermanentDelete, canManageTasks, notes = [], onRestoreNote, onPermanentDeleteNote, onEmptyTrash }) {
  const [confirmId, setConfirmId] = useTrashState(null);
  const [busy, setBusy] = useTrashState(new Set());
  const [search, setSearch] = useTrashState('');
  const [emptyConfirm, setEmptyConfirm] = useTrashState(false);
  const [emptyBusy, setEmptyBusy] = useTrashState(false);

  const q = search.trim().toLowerCase();
  const filteredTasks = q ? tasks.filter(t => t.title?.toLowerCase().includes(q)) : tasks;
  const filteredNotes = q ? notes.filter(n => (n.title || '').toLowerCase().includes(q) || (n.preview || '').toLowerCase().includes(q)) : notes;

  const handleRestore = async (id, type) => {
    const key = `r-${type}-${id}`;
    setBusy(b => new Set([...b, key]));
    try {
      if (type === 'task') await onRestore(id);
      else await onRestoreNote(id);
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(key); return n; });
    }
  };

  const handlePermDelete = async (id, type) => {
    const key = `d-${type}-${id}`;
    setBusy(b => new Set([...b, key]));
    try {
      if (type === 'task') await onPermanentDelete(id);
      else await onPermanentDeleteNote(id);
      setConfirmId(null);
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(key); return n; });
    }
  };

  const handleEmptyTrash = async () => {
    setEmptyBusy(true);
    try {
      await onEmptyTrash?.();
      setEmptyConfirm(false);
    } finally {
      setEmptyBusy(false);
    }
  };

  const isEmpty = tasks.length === 0 && notes.length === 0;
  const hasItems = tasks.length > 0 || notes.length > 0;

  return (
    <div className="trash-view">
      <div className="trash-header">
        <div className="trash-header-top">
          <div>
            <div className="trash-title">
              <Icon name="trash" size={20} strokeWidth={1.5} />
              {window.t?.('trash_title') || 'Çöp Kutusu'}
            </div>
            <div className="trash-subtitle">
              {window.t?.('trash_subtitle') || `Silinen öğeler ${DAYS_RETENTION} gün içinde kalıcı olarak silinir`}
            </div>
          </div>
          {hasItems && canManageTasks && (
            emptyConfirm ? (
              <div className="trash-empty-confirm">
                <span>{window.t?.('trash_empty_all_confirm') || 'Tüm öğeler kalıcı olarak silinsin mi?'}</span>
                <button className="trash-confirm-yes" onClick={handleEmptyTrash} disabled={emptyBusy}>
                  {emptyBusy ? (window.t?.('trash_emptying') || 'Boşaltılıyor...') : (window.t?.('trash_empty_all_yes') || 'Evet, tümünü sil')}
                </button>
                <button className="trash-confirm-no" onClick={() => setEmptyConfirm(false)}>
                  {window.t?.('trash_empty_all_cancel') || 'İptal'}
                </button>
              </div>
            ) : (
              <button className="trash-empty-btn" onClick={() => setEmptyConfirm(true)}>
                <Icon name="trash" size={13} />
                {window.t?.('trash_empty_all') || 'Tümünü boşalt'}
              </button>
            )
          )}
        </div>
        {hasItems && (
          <div className="trash-search-wrap">
            <Icon name="search" size={13} />
            <input
              className="trash-search"
              placeholder={window.t?.('trash_search_placeholder') || 'Çöp kutusunda ara...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="trash-search-clear" onClick={() => setSearch('')} title="Temizle">
                <Icon name="x" size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <Icon name="trash" size={32} strokeWidth={1.1} />
          <div>{window.t?.('trash_empty') || 'Çöp kutusu boş'}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
            {window.t?.('trash_empty_sub') || 'Silinen öğeler burada görünür'}
          </div>
        </div>
      ) : (
        <div className="trash-list">

          {/* ── Görevler ── */}
          {filteredTasks.length > 0 && (
            <>
              <div className="trash-section-head">
                <Icon name="checkSquare" size={13} strokeWidth={1.8} />
                {window.t?.('trash_section_tasks') || 'Görevler'}
                <span className="trash-section-count">{filteredTasks.length}</span>
              </div>
              {filteredTasks.map(task => {
                const col = DATA.COLUMNS?.find(c => c.id === task.col);
                const days = daysLeft(task.deleted_at);
                const urgent = days <= 3;
                const itemKey = `task-${task.id}`;
                return (
                  <div key={task.id} className="trash-item">
                    <div className="trash-item-info">
                      <div className="trash-item-title">{task.title}</div>
                      <div className="trash-item-meta">
                        {task.project_name && (
                          <span className="trash-item-project">
                            <Icon name="folder" size={11} />
                            {task.project_name}
                          </span>
                        )}
                        {col && (
                          <span className="trash-item-col">
                            <span className="col-dot" style={{ background: col.color }} />
                            {(localStorage.getItem('stoa.lang') || 'tr') === 'tr' ? col.title_tr : col.title}
                          </span>
                        )}
                        <span className="trash-item-expiry" data-urgent={urgent}>
                          <Icon name="clock" size={11} />
                          {days === 0
                            ? (window.t?.('trash_expires_today') || 'Bugün silinecek')
                            : `${days} ${window.t?.('trash_days_left') || 'gün kaldı'}`}
                        </span>
                      </div>
                    </div>
                    {canManageTasks && (
                      <TrashActions
                        itemKey={itemKey}
                        confirmId={confirmId}
                        setConfirmId={setConfirmId}
                        busy={busy}
                        onRestore={() => handleRestore(task.id, 'task')}
                        onPermDelete={() => handlePermDelete(task.id, 'task')}
                      />
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* ── Notlar ── */}
          {filteredNotes.length > 0 && (
            <>
              <div className="trash-section-head" style={{ marginTop: filteredTasks.length > 0 ? 20 : 0 }}>
                <Icon name="note" size={13} strokeWidth={1.8} />
                {window.t?.('trash_section_notes') || 'Notlar'}
                <span className="trash-section-count">{filteredNotes.length}</span>
              </div>
              {filteredNotes.map(note => {
                const days = daysLeft(note.deleted_at);
                const urgent = days <= 3;
                const itemKey = `note-${note.id}`;
                return (
                  <div key={note.id} className="trash-item">
                    <div className="trash-item-info">
                      <div className="trash-item-title">{note.title || (window.t?.('notes_untitled') || 'Başlıksız Not')}</div>
                      <div className="trash-item-meta">
                        {note.preview && (
                          <span style={{ fontSize: 11, color: 'var(--ink-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {note.preview}
                          </span>
                        )}
                        <span className="trash-item-expiry" data-urgent={urgent}>
                          <Icon name="clock" size={11} />
                          {days === 0
                            ? (window.t?.('trash_expires_today') || 'Bugün silinecek')
                            : `${days} ${window.t?.('trash_days_left') || 'gün kaldı'}`}
                        </span>
                      </div>
                    </div>
                    <TrashActions
                      itemKey={itemKey}
                      confirmId={confirmId}
                      setConfirmId={setConfirmId}
                      busy={busy}
                      onRestore={() => handleRestore(note.id, 'note')}
                      onPermDelete={() => handlePermDelete(note.id, 'note')}
                    />
                  </div>
                );
              })}
            </>
          )}

          {q && filteredTasks.length === 0 && filteredNotes.length === 0 && (
            <div className="empty-state" style={{ marginTop: 40 }}>
              <Icon name="search" size={24} strokeWidth={1.1} />
              <div style={{ fontSize: 14 }}>"{search}" için sonuç bulunamadı</div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
