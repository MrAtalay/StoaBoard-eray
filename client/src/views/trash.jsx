// Çöp Kutusu — soft-deleted tasks, 30 gün içinde silinir veya geri alınabilir

import React, { useState as useTrashState, useEffect as useTrashEf } from 'react';
import { Icon } from '../icons.jsx';
import { API } from '../data.jsx';

const DAYS_RETENTION = 30;

function daysLeft(deletedAt) {
  if (!deletedAt) return DAYS_RETENTION;
  const del = new Date(deletedAt);
  const exp = new Date(del.getTime() + DAYS_RETENTION * 24 * 60 * 60 * 1000);
  const diff = Math.ceil((exp - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

export function TrashView({ tasks, onRestore, onPermanentDelete, canManageTasks }) {
  const [confirmId, setConfirmId] = useTrashState(null);
  const [busy, setBusy] = useTrashState(new Set());

  const handleRestore = async (id) => {
    setBusy(b => new Set([...b, `r-${id}`]));
    await onRestore(id);
    setBusy(b => { const n = new Set(b); n.delete(`r-${id}`); return n; });
  };

  const handlePermDelete = async (id) => {
    setBusy(b => new Set([...b, `d-${id}`]));
    await onPermanentDelete(id);
    setBusy(b => { const n = new Set(b); n.delete(`d-${id}`); return n; });
    setConfirmId(null);
  };

  return (
    <div className="trash-view">
      <div className="trash-header">
        <div className="trash-title">
          <Icon name="trash" size={20} strokeWidth={1.5} />
          {window.t?.('trash_title') || 'Çöp Kutusu'}
        </div>
        <div className="trash-subtitle">
          {window.t?.('trash_subtitle') || `Silinen görevler ${DAYS_RETENTION} gün içinde kalıcı olarak silinir`}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <Icon name="trash" size={32} strokeWidth={1.1} />
          <div>{window.t?.('trash_empty') || 'Çöp kutusu boş'}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
            {window.t?.('trash_empty_sub') || 'Silinen görevler burada görünür'}
          </div>
        </div>
      ) : (
        <div className="trash-list">
          {tasks.map(task => {
            const col = DATA.COLUMNS.find(c => c.id === task.col);
            const days = daysLeft(task.deleted_at);
            const urgent = days <= 3;
            return (
              <div key={task.id} className="trash-item">
                <div className="trash-item-info">
                  <div className="trash-item-title">{task.title}</div>
                  <div className="trash-item-meta">
                    {col && (
                      <span className="trash-item-col">
                        <span className="col-dot" style={{ background: col.color }} />
                        {col.title_tr}
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
                  <div className="trash-item-actions">
                    <button
                      className="trash-restore-btn"
                      onClick={() => handleRestore(task.id)}
                      disabled={busy.has(`r-${task.id}`)}
                      title={window.t?.('trash_restore') || 'Geri Al'}
                    >
                      <Icon name="undo" size={13} />
                      {window.t?.('trash_restore') || 'Geri Al'}
                    </button>
                    {confirmId === task.id ? (
                      <div className="trash-confirm">
                        <span>{window.t?.('trash_confirm') || 'Kalıcı silinsin mi?'}</span>
                        <button
                          className="trash-confirm-yes"
                          onClick={() => handlePermDelete(task.id)}
                          disabled={busy.has(`d-${task.id}`)}
                        >
                          {window.t?.('trash_confirm_yes') || 'Evet, sil'}
                        </button>
                        <button className="trash-confirm-no" onClick={() => setConfirmId(null)}>
                          {window.t?.('trash_confirm_no') || 'İptal'}
                        </button>
                      </div>
                    ) : (
                      <button
                        className="trash-delete-btn"
                        onClick={() => setConfirmId(task.id)}
                        title={window.t?.('trash_permanent_delete') || 'Kalıcı Sil'}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
