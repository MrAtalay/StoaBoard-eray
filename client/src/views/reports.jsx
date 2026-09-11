// Raporlar — kişi, dönem ve akış raporları.
//
// Üç rapor da aynı iki kaynaktan çıkar: kolon geçiş kaydı (süreç zamanı) ve
// süre kaydı (harcanan emek). İkisi ayrı şeydir: bir iş üç haftada bitmiş ama
// altı saat emek almış olabilir.
//
// Çıktı iki biçimde alınır: CSV (yöneticiler veriyi kendi kesip biçer) ve
// yazdırma (tarayıcı PDF'e çevirir). Ayrı bir PDF kütüphanesi bilinçli olarak
// eklenmedi — yazdırma sayfası aynı işi görüyor.

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../icons.jsx';
import { DefaultDropdown } from '../dropdown.jsx';

const T = (k, fb) => (window.t?.(k) !== k && window.t?.(k)) || fb;

// Sunucu hataları { error: 'kod', message: 'Türkçe' } biçiminde geliyor ve
// apiFetch kodu err.code'a koyuyor. Sözlük anahtarları kodlarla aynı adı
// taşıdığı için kod doğrudan çevrilebiliyor; sözlükte yoksa sunucunun
// gönderdiği metin gösteriliyor.
const apiError = (e) => (e?.code && T(e.code, e.message)) || e?.message
  || T('rep_error', 'Rapor alınamadı');

const iso = (d) => d.toISOString().slice(0, 10);

function presetRange(key) {
  const today = new Date();
  const to = iso(today);
  const d = new Date(today);
  switch (key) {
    case 'month':
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to };
    case 'q':
      d.setMonth(d.getMonth() - 3);
      return { from: iso(d), to };
    case 'half':
      d.setMonth(d.getMonth() - 6);
      return { from: iso(d), to };
    case 'year':
      return { from: iso(new Date(today.getFullYear(), 0, 1)), to };
    default:
      d.setDate(d.getDate() - 30);
      return { from: iso(d), to };
  }
}

// Etiketler modül yüklenirken değil, render sırasında çözülüyor: bu tablolar
// bir kez değerlendirilseydi dil değiştiğinde eski dilde kalırlardı. Bu yüzden
// her kayıt çeviri anahtarını ve Türkçe yedeğini taşıyor.
const PRESETS = [
  { key: 'month', k: 'rep_range_month', fb: 'Bu ay' },
  { key: 'q', k: 'rep_range_q', fb: 'Son 3 ay' },
  { key: 'half', k: 'rep_range_half', fb: 'Son 6 ay' },
  { key: 'year', k: 'rep_range_year', fb: 'Bu yıl' },
];

const KINDS = [
  { key: 'person', k: 'rep_kind_person', fb: 'Kişi raporu', subK: 'rep_sub_person', subFb: 'Kim, hangi işte, ne kadar süre' },
  { key: 'period', k: 'rep_kind_period', fb: 'Dönem raporu', subK: 'rep_sub_period', subFb: 'Ne açıldı, ne bitti, ne bekliyor' },
  { key: 'flow', k: 'rep_kind_flow', fb: 'Akış raporu', subK: 'rep_sub_flow', subFb: 'İşler kaç günde bitiyor' },
  // Denetim kaydı yalnızca çalışma alanını yönetenlere gösterilir; sunucu
  // tarafında da aynı kontrol var, buradaki gizleme yalnızca arayüz kolaylığı.
  { key: 'audit', k: 'rep_kind_audit', fb: 'Denetim kaydı', subK: 'rep_sub_audit', subFb: 'Veriyi kim dışarı çıkardı', admin: true },
];

// Eylem adlarının okunabilir karşılığı: [anahtar, Türkçe yedek].
const ACTION_LABEL = {
  'report.export': ['rep_act_export', 'Rapor dışa aktarıldı'],
  'member.removed': ['rep_act_member_removed', 'Üye çıkarıldı'],
  'member.role_changed': ['rep_act_role_changed', 'Üye rolü değişti'],
  'invite.code_viewed': ['rep_act_invite_viewed', 'Davet kodu görüntülendi'],
  'workspace.trash_emptied': ['rep_act_trash_emptied', 'Çöp kutusu boşaltıldı'],
  // Claude'un MCP üzerinden yaptığı yazmalar (0.4.0); satırdaki kişi, anahtarın sahibi.
  'mcp.task_created': ['rep_act_mcp_created', 'Kart açıldı — MCP'],
  'mcp.task_updated': ['rep_act_mcp_updated', 'Kart düzenlendi — MCP'],
  'mcp.task_moved': ['rep_act_mcp_moved', 'Kart taşındı — MCP'],
};

const REPORT_LABEL = {
  person: ['rep_label_person', 'Kişi'],
  period: ['rep_label_period', 'Dönem'],
  flow: ['rep_label_flow', 'Akış'],
};

// Yazdırma/PDF dosya adı kökü — CSV adlandırmasıyla aynı düzen.
const REPORT_FILE = {
  person: 'kisi-raporu',
  period: 'donem-raporu',
  flow: 'akis-raporu',
  audit: 'denetim-kaydi',
};

function ReportsView({ onOpenTask, canManageWorkspace = false }) {
  const [kind, setKind] = useState('person');
  const [range, setRange] = useState(() => presetRange('month'));
  const [person, setPerson] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [printedAt, setPrintedAt] = useState('');

  const workspaceId = DATA.WORKSPACE?.id;
  // Rapor sürelerinin ve dışa aktarmanın dili UI dilini izler.
  const lang = currentLang();

  // Yazdırma anında iki şey ayarlanıyor, sonra geri alınıyor:
  //   1. Künyedeki "Oluşturulma" damgası — sayfa uzun süre açık kalsa bile
  //      PDF'teki tarih gerçekten çıktının alındığı an olsun.
  //   2. document.title — tarayıcı "PDF olarak kaydet"te bunu dosya adı öneriyor.
  //      Genel "StoaBoard…" yerine rapor türüne göre ad (kisi/donem/akis-raporu
  //      + tarih aralığı), CSV adlandırmasıyla tutarlı.
  useEffect(() => {
    let original = '';
    const onBefore = () => {
      setPrintedAt(new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR'));
      original = document.title;
      const base = REPORT_FILE[kind] || 'rapor';
      document.title = `${base}_${range.from}_${range.to}`;
    };
    const onAfter = () => { if (original) document.title = original; };
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
  }, [kind, range.from, range.to, lang]);

  const params = useCallback(() => {
    const p = { workspace: workspaceId, from: range.from, to: range.to };
    if (kind === 'person' && person) p.user = person;
    return p;
  }, [workspaceId, range.from, range.to, kind, person]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    API.getReport(kind, params())
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(apiError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, params, workspaceId]);

  const visibleKinds = KINDS.filter((k) => !k.admin || canManageWorkspace);
  // Denetim kaydı CSV olarak dışa aktarılmıyor: dışa aktarmayı izleyen kaydın
  // kendisinin tek tıkla dosyaya dönmesi anlamsız olurdu.
  const csvHref = workspaceId && kind !== 'audit' ? API.reportCsvUrl(kind, params()) : null;
  const activeKind = KINDS.find((k) => k.key === kind);

  const rangeLabel = `${range.from} → ${range.to}`;

  return (
    <div className="dash report-view">
      <div className="report-head">
        <div>
          <div className="dash-h1">{T('nav_reports', 'Raporlar')}</div>
          <div className="dash-sub">{activeKind && T(activeKind.subK, activeKind.subFb)}</div>
        </div>
        <div className="report-actions no-print">
          {csvHref && (
            <a
              className="btn btn-ghost"
              href={csvHref}
              download
              title={T('rep_csv_title', 'Excel ile açılabilir CSV indir')}
            >
              <Icon name="download" size={14} /> CSV
            </a>
          )}
          <button className="btn btn-ghost" onClick={() => window.print()} title={T('rep_print_title', 'Yazdır veya PDF olarak kaydet')}>
            <Icon name="file" size={14} /> {T('rep_print', 'Yazdır')}
          </button>
        </div>
      </div>

      {/* Yazdırma çıktısında görünen künye. Kurumsalda rapor faturalama ve
          performans değerlendirmesinde kullanılıyor; bu yüzden markadan öte
          kaynağı belgeleyen alanlar taşıyor: ne zaman, kim tarafından, hangi
          dönem, hangi sistem. GoodData/Resolver/MicroStrategy gibi araçların
          PDF künyesinde standart olan alanlar. */}
      <div className="report-stamp print-only">
        <div className="report-stamp-brand">
          <img src="/static/StoaBoard_symbol.png" width={20} height={20} alt="" />
          <span className="report-stamp-wordmark">Stoa<em>Board</em></span>
        </div>
        <div className="report-stamp-title">
          <strong>{DATA.WORKSPACE?.name || 'StoaBoard'}</strong> — {activeKind && T(activeKind.k, activeKind.fb)}
        </div>
        <div className="report-stamp-meta">
          <span>{T('rep_stamp_period', 'Dönem')}: {rangeLabel}</span>
          <span>{T('rep_stamp_created', 'Oluşturulma')}: {printedAt || new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR')}</span>
          <span>{T('rep_stamp_by', 'Oluşturan')}: {window.CURRENT_USER?.name || '—'}</span>
        </div>
        <div className="report-stamp-conf">
          {T('rep_stamp_conf', 'Gizli — yalnızca yetkili kişiler içindir')} · stoaboard.com
        </div>
      </div>

      <div className="report-controls no-print">
        <div className="report-tabs">
          {visibleKinds.map((k) => (
            <button
              key={k.key}
              className="filter-chip"
              data-active={kind === k.key}
              onClick={() => setKind(k.key)}
            >
              {T(k.k, k.fb)}
            </button>
          ))}
        </div>

        <div className="report-range">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className="filter-chip"
              onClick={() => setRange(presetRange(p.key))}
            >
              {T(p.k, p.fb)}
            </button>
          ))}
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
          <span className="report-range-sep">→</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </div>

        {kind === 'person' && (
          <div className="report-range">
            <DefaultDropdown
              value={person}
              onChange={setPerson}
              ariaLabel={T('rep_person', 'Kişi')}
              options={[
                { value: '', label: T('rep_everyone', 'Herkes') },
                ...(DATA.MEMBERS || []).map((m) => ({ value: String(m.id), label: m.name })),
              ]}
            />
          </div>
        )}
      </div>

      {loading && <div className="dash-empty-state">{T('rep_loading', 'Rapor hazırlanıyor…')}</div>}
      {error && <div className="dash-empty-state">{error}</div>}

      {!loading && !error && data && (
        <>
          {data.scoped_to_self && (
            <div className="report-note">
              {T('rep_scoped_self', 'Yalnızca kendi kayıtlarınız gösteriliyor. Diğer kişilerin raporu için üye yönetimi izni gerekiyor.')}
            </div>
          )}
          {kind === 'person' && <PersonReport data={data} onOpenTask={onOpenTask} />}
          {kind === 'period' && <PeriodReport data={data} onOpenTask={onOpenTask} />}
          {kind === 'flow' && <FlowReport data={data} onOpenTask={onOpenTask} />}
          {kind === 'audit' && <AuditReport data={data} />}
        </>
      )}
    </div>
  );
}

// ─── Kişi raporu ────────────────────────────────────────────────────────────

function PersonReport({ data, onOpenTask }) {
  if (!data.people?.length) {
    return <div className="dash-empty-state">{T('rep_empty', 'Bu aralıkta kayıt yok.')}</div>;
  }
  return (
    <div className="report-body">
      {data.people.map((p) => (
        <div className="panel" key={p.user_id ?? p.name}>
          <div className="panel-head">
            <div>
              <div className="panel-title">{p.name}</div>
              <div className="panel-sub">
                {p.tasks.length} {T('rep_meta_tasks', 'görev')} · {p.moves} {T('rep_meta_moves', 'hareket')} · {p.completed} {T('rep_meta_completions', 'tamamlama')}
              </div>
            </div>
            <div className="report-total">{formatDuration(p.minutes)}</div>
          </div>
          <div className="panel-body">
            <table className="list-table">
              <thead>
                <tr>
                  <th>{T('rep_col_task', 'Görev')}</th>
                  <th style={{ width: 90 }}>{T('rep_col_duration', 'Süre')}</th>
                  <th style={{ width: 90 }}>{T('rep_moves', 'Hareket')}</th>
                  <th style={{ width: 110 }}>{T('rep_col_status', 'Durum')}</th>
                </tr>
              </thead>
              <tbody>
                {p.tasks.map((t) => (
                  <tr
                    key={t.task_id ?? t.title}
                    onClick={() => t.task_id && onOpenTask?.(String(t.task_id))}
                  >
                    <td className="title">{t.title}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t.minutes ? formatDuration(t.minutes) : '—'}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{t.moves}</td>
                    <td>{t.completed ? T('rep_status_done', 'Tamamlandı') : T('rep_status_ongoing', 'Devam ediyor')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Dönem raporu ───────────────────────────────────────────────────────────

function PeriodReport({ data, onOpenTask }) {
  return (
    <div className="report-body">
      <div className="report-stats">
        <Stat label={T('rep_stat_created', 'Açılan')} value={data.created} />
        <Stat label={T('rep_stat_completed', 'Tamamlanan')} value={data.completed} />
        <Stat label={T('rep_moves', 'Hareket')} value={data.moves} />
        <Stat label={T('rep_stat_open', 'Açık kalan')} value={data.open} />
        <Stat label={T('rep_stat_effort', 'Toplam emek')} value={formatDuration(data.total_minutes)} />
      </div>

      {data.by_column?.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">{T('rep_column_moves', 'Kolon hareketleri')}</div>
          </div>
          <div className="panel-body">
            <div className="report-bars">
              {(() => {
                const max = Math.max(...data.by_column.map((c) => c.count), 1);
                return data.by_column.map((c) => (
                  <div className="report-bar-row" key={c.label}>
                    <span className="report-bar-label">{c.label}</span>
                    <span className="report-bar-track">
                      <span
                        className="report-bar-fill"
                        style={{ width: `${(c.count / max) * 100}%` }}
                      />
                    </span>
                    <span className="report-bar-value">{c.count}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">{T('rep_completed_tasks', 'Tamamlanan işler')}</div>
            <div className="panel-sub">{data.completed_tasks?.length || 0} {T('rep_records', 'kayıt')}</div>
          </div>
        </div>
        <div className="panel-body">
          {data.completed_tasks?.length ? (
            <table className="list-table">
              <thead>
                <tr>
                  <th>{T('rep_col_task', 'Görev')}</th>
                  <th style={{ width: 100 }}>{T('rep_col_opened', 'Açılış')}</th>
                  <th style={{ width: 110 }}>{T('rep_col_completed_at', 'Tamamlanma')}</th>
                  <th style={{ width: 90 }}>{T('rep_col_cycle', 'Geçen gün')}</th>
                  <th style={{ width: 90 }}>{T('rep_col_effort', 'Emek')}</th>
                </tr>
              </thead>
              <tbody>
                {data.completed_tasks.map((t) => (
                  <tr key={t.task_id} onClick={() => onOpenTask?.(String(t.task_id))}>
                    <td className="title">{t.title}</td>
                    <td>{t.created_at || '—'}</td>
                    <td>{t.completed_at || '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t.cycle_days === null ? '—' : t.cycle_days}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t.minutes ? formatDuration(t.minutes) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="dash-empty-state">{T('rep_empty_completed', 'Bu aralıkta tamamlanan iş yok.')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Akış raporu ────────────────────────────────────────────────────────────

function FlowReport({ data, onOpenTask }) {
  return (
    <div className="report-body">
      <div className="report-stats">
        <Stat label={T('rep_stat_done_count', 'Tamamlanan iş')} value={data.count} />
        <Stat label={T('rep_stat_avg', 'Ortalama süre')} value={`${data.avg_days} ${T('rep_days', 'gün')}`} />
        <Stat label={T('rep_stat_median', 'Ortanca süre')} value={`${data.median_days} ${T('rep_days', 'gün')}`} />
      </div>

      {data.dwell?.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">{T('rep_dwell', 'Kolonlarda bekleme')}</div>
              <div className="panel-sub">{T('rep_dwell_sub', 'İşler en çok nerede bekliyor')}</div>
            </div>
          </div>
          <div className="panel-body">
            <table className="list-table">
              <thead>
                <tr>
                  <th>{T('rep_col_column', 'Kolon')}</th>
                  <th style={{ width: 120 }}>{T('rep_col_avg', 'Ortalama')}</th>
                  <th style={{ width: 120 }}>{T('rep_col_median', 'Ortanca')}</th>
                  <th style={{ width: 90 }}>{T('rep_col_samples', 'Ölçüm')}</th>
                </tr>
              </thead>
              <tbody>
                {data.dwell.map((d) => (
                  <tr key={d.label} style={{ cursor: 'default' }}>
                    <td className="title">{d.label}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(d.avg_hours)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(d.median_hours)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{d.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">{T('rep_slowest', 'En uzun süren işler')}</div>
            <div className="panel-sub">{T('rep_slowest_sub', 'Açılıştan tamamlanmaya')}</div>
          </div>
        </div>
        <div className="panel-body">
          {data.slowest?.length ? (
            <table className="list-table">
              <thead>
                <tr>
                  <th>{T('rep_col_task', 'Görev')}</th>
                  <th style={{ width: 100 }}>{T('rep_col_days', 'Gün')}</th>
                  <th style={{ width: 120 }}>{T('rep_col_completed_at', 'Tamamlanma')}</th>
                </tr>
              </thead>
              <tbody>
                {data.slowest.map((t) => (
                  <tr key={t.task_id} onClick={() => onOpenTask?.(String(t.task_id))}>
                    <td className="title">{t.title}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{t.days}</td>
                    <td>{t.completed_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="dash-empty-state">{T('rep_empty_completed', 'Bu aralıkta tamamlanan iş yok.')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Denetim kaydı ──────────────────────────────────────────────────────────

function AuditReport({ data }) {
  const entries = data.entries || [];
  if (!entries.length) {
    return <div className="dash-empty-state">{T('rep_empty', 'Bu aralıkta kayıt yok.')}</div>;
  }
  const exports = entries.filter((e) => e.action === 'report.export').length;
  return (
    <div className="report-body">
      <div className="report-stats">
        <Stat label={T('rep_stat_events', 'Toplam olay')} value={entries.length} />
        <Stat label={T('rep_stat_exports', 'Dışa aktarma')} value={exports} />
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">{T('rep_events', 'Olaylar')}</div>
            <div className="panel-sub">{T('rep_events_sub', 'En yeniden eskiye')}</div>
          </div>
        </div>
        <div className="panel-body">
          <table className="list-table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>{T('rep_col_time', 'Zaman')}</th>
                <th style={{ width: 140 }}>{T('rep_person', 'Kişi')}</th>
                <th>{T('rep_col_event', 'Olay')}</th>
                <th style={{ width: 130 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ cursor: 'default' }}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {e.at ? new Date(e.at).toLocaleString(currentLang() === 'en' ? 'en-GB' : 'tr-TR') : '—'}
                  </td>
                  <td>{e.user_name}</td>
                  <td className="title">
                    {ACTION_LABEL[e.action] ? T(...ACTION_LABEL[e.action]) : e.action}
                    {e.detail && <AuditDetail detail={e.detail} />}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AuditDetail({ detail }) {
  if (detail.report) {
    return (
      <span className="audit-detail">
        {REPORT_LABEL[detail.report] ? T(...REPORT_LABEL[detail.report]) : detail.report}{' '}
        {T('rep_detail_report', 'raporu')} ·{' '}
        {detail.from} → {detail.to} · {detail.rows} {T('rep_detail_rows', 'satır')}
      </span>
    );
  }
  return null;
}

// ─── Küçük parçalar ─────────────────────────────────────────────────────────

function Stat({ label, value }) {
  return (
    <div className="report-stat">
      <div className="report-stat-value">{value}</div>
      <div className="report-stat-label">{label}</div>
    </div>
  );
}

// Süreyi belirgin ve dile duyarlı biçimde yaz: "1 saat 30 dakika" /
// "1 hour 30 minutes". Eski "1s 30d" biçimi kısaydı ama "s" saat mi saniye mi
// belirsizdi ve İngilizce karşılığı yoktu. Rapor UI dilini izliyor: raporu
// çıkaran kişi kendi dilinde görsün.
// UI dilini tek yerden oku. formatDuration alt bileşenlerden (PersonReport,
// PeriodReport…) de çağrılıyor; dili argümanla geçirmek yerine burada okuyor,
// böylece her çağrı noktasında ayrıca 'lang' değişkeni gerekmiyor.
function currentLang() {
  return (localStorage.getItem('stoa.lang') || 'tr').startsWith('en') ? 'en' : 'tr';
}

function formatDuration(m) {
  const min = Math.max(0, Math.round(m || 0));
  const h = Math.floor(min / 60);
  const r = min % 60;
  const en = currentLang() === 'en';
  const hr = (n) => (en ? `${n} hour${n === 1 ? '' : 's'}` : `${n} saat`);
  const mn = (n) => (en ? `${n} minute${n === 1 ? '' : 's'}` : `${n} dakika`);
  if (!min) return en ? '0 minutes' : '0 dakika';
  if (!h) return mn(r);
  if (!r) return hr(h);
  return `${hr(h)} ${mn(r)}`;
}

function fmtHours(h) {
  if (h == null) return '—';
  if (h < 24) return `${h} ${T('rep_hours_short', 'sa')}`;
  return `${Math.round((h / 24) * 10) / 10} ${T('rep_days', 'gün')}`;
}

export { ReportsView };
export default ReportsView;
