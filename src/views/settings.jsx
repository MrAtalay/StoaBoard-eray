// Settings view

const LABEL_TONES = [
  { id: 'rose',   label: 'Kırmızı' },
  { id: 'blue',   label: 'Mavi'    },
  { id: 'amber',  label: 'Sarı'    },
  { id: 'green',  label: 'Yeşil'   },
  { id: 'purple', label: 'Mor'     },
];

function LabelsSection({ projectId }) {
  const [labels, setLabels] = React.useState(() => ({ ...DATA.LABELS }));
  const [newName, setNewName] = React.useState('');
  const [newTone, setNewTone] = React.useState('blue');
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleDelete = async (slug) => {
    if (!projectId) return;
    try {
      await API.deleteLabel(projectId, slug);
      const next = { ...labels };
      delete next[slug];
      setLabels(next);
      DATA.LABELS = next;
    } catch (e) {
      alert('Etiket silinemedi: ' + e.message);
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || !projectId) return;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-çğışöüa-z]/gi, '').replace(/[çğışöüÇĞİŞÖÜ]/g, c => ({'ç':'c','ğ':'g','ı':'i','ş':'s','ö':'o','ü':'u','Ç':'c','Ğ':'g','İ':'i','Ş':'s','Ö':'o','Ü':'u'}[c]||c)).replace(/[^a-z0-9-]/g, '');
    if (!slug) { setError('Geçerli bir isim girin'); return; }
    if (labels[slug]) { setError('Bu etiket zaten mevcut'); return; }
    setAdding(true);
    setError('');
    try {
      const result = await API.createLabel(projectId, { slug, name_en: name, name_tr: name, tone: newTone });
      const next = { ...labels, ...result };
      setLabels(next);
      DATA.LABELS = next;
      setNewName('');
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="settings-section">
      <div>
        <h3>Etiketler</h3>
        <p className="desc">Görevleri kategorize etmek için etiketleri yönetin.</p>
      </div>
      <div className="settings-card settings-panel">
        {Object.keys(labels).length === 0 && (
          <div style={{ color: 'var(--ink-muted)', fontSize: 13, padding: '8px 0' }}>Henüz etiket yok.</div>
        )}
        {Object.entries(labels).map(([slug, label]) => (
          <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="tag" data-tone={label.tone}>{label.tr}</span>
            <span style={{ flex: 1, color: 'var(--ink-dim)', fontSize: 12 }}>{slug}</span>
            <button className="icon-btn" title="Sil" onClick={() => handleDelete(slug)}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="Etiket adı…"
            value={newName}
            onChange={e => { setNewName(e.target.value); setError(''); }}
            style={{ flex: 1, minWidth: 140 }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {LABEL_TONES.map(t => (
              <button key={t.id} title={t.label} onClick={() => setNewTone(t.id)} style={{
                width: 18, height: 18, borderRadius: '50%',
                background: `var(--status-${t.id})`,
                outline: newTone === t.id ? '2px solid var(--ink)' : '2px solid transparent',
                outlineOffset: 2,
                cursor: 'pointer', border: 'none', flexShrink: 0,
              }} />
            ))}
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !newName.trim() || !projectId}>
            {adding ? '…' : '+ Ekle'}
          </button>
        </div>
        {error && <div style={{ color: 'var(--status-rose)', fontSize: 12, marginTop: 6 }}>{error}</div>}
        {!projectId && <div style={{ color: 'var(--ink-muted)', fontSize: 12, marginTop: 8 }}>Etiket yönetimi için bir projeye geçin.</div>}
      </div>
    </div>
  );
}

function SettingsView({ tweaks, setTweak, projectId }) {
  return (
    <div className="settings-wrap">
      <h1>Ayarlar<em>.</em></h1>
      <p className="settings-sub">Hesabınızı, çalışma alanınızı ve görünümü yönetin.</p>

      <div className="settings-section">
        <div>
          <h3>Profil</h3>
          <p className="desc">Takım üyelerinin sizi nasıl göreceği.</p>
        </div>
        <div className="settings-card">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
            <Avatar member={DATA.MEMBERS[0]} size="lg" />
            <button className="btn btn-ghost">Fotoğraf yükle</button>
            <button className="btn btn-ghost" style={{ color: 'var(--status-rose)' }}>Kaldır</button>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Ad Soyad</label>
              <input defaultValue="Aliz Kaya" />
            </div>
            <div className="field">
              <label>E-posta</label>
              <input defaultValue="aliz@stoalabs.co" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Başlık</label>
            <input defaultValue="Founder · Product Manager" />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div>
          <h3>Görünüm</h3>
          <p className="desc">Tema, renk ve tipografi tercihlerin.</p>
        </div>
        <div className="settings-card settings-panel">
          <div className="tweak-group">
            <div className="tweak-label">Tema</div>
            <div className="tweak-options">
              {['light','cream','dark'].map(t => (
                <button key={t} className="tweak-opt" data-active={tweaks.theme === t} onClick={() => setTweak('theme', t)}>
                  {t === 'light' ? 'Açık' : t === 'cream' ? 'Krem' : 'Koyu'}
                </button>
              ))}
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">Vurgu rengi</div>
            <div className="swatch-row">
              {[
                ['terracotta','oklch(55% 0.13 25)'],
                ['sage','oklch(55% 0.09 150)'],
                ['slate','oklch(50% 0.04 250)'],
                ['indigo','oklch(52% 0.15 270)'],
                ['plum','oklch(50% 0.14 340)'],
              ].map(([k, v]) => (
                <button key={k} className="swatch" data-active={tweaks.accent === k} style={{ background: v }} onClick={() => setTweak('accent', k)} />
              ))}
            </div>
          </div>
          <div className="tweak-group">
            <div className="tweak-label">Yoğunluk</div>
            <div className="tweak-options">
              {['airy','balanced','compact'].map(d => (
                <button key={d} className="tweak-opt" data-active={tweaks.density === d} onClick={() => setTweak('density', d)}>
                  {d === 'airy' ? 'Ferah' : d === 'balanced' ? 'Dengeli' : 'Kompakt'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div>
          <h3>Bildirimler</h3>
          <p className="desc">E-posta ve uygulama içi bildirim tercihleri.</p>
        </div>
        <div className="settings-card settings-panel">
          {[
            ['Bir kart sana atandığında', true],
            ['Takip ettiğin kartta yorum olduğunda', true],
            ['Bir kart senin son tarihini geçtiğinde', true],
            ['Haftalık özet (Pzt sabahı)', false],
            ['Pazarlama güncellemeleri', false],
          ].map(([label, defaultOn]) => (
            <SettingsToggle key={label} label={label} defaultOn={defaultOn} />
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div>
          <h3>Çalışma alanı</h3>
          <p className="desc">Stoa Labs için takım ayarları (yalnızca yöneticiler).</p>
        </div>
        <div className="settings-card settings-panel">
          <div className="field">
            <label>Çalışma alanı adı</label>
            <input defaultValue="Stoa Labs" />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Slug</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-muted)' }}>
              stoaboard.app/<strong style={{ color: 'var(--ink)' }}>stoa-labs</strong>
            </div>
          </div>
          <div style={{ marginTop: 18, padding: 14, background: 'var(--bg-subtle)', border: '1px solid var(--line)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="globe" size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Çalışma alanını herkese açık yap</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Bağlantıya sahip olan herkes görüntüleyebilir (düzenleyemez).</div>
            </div>
            <SettingsToggle label="" defaultOn={false} inline />
          </div>
        </div>
      </div>

      <LabelsSection projectId={projectId} />

      <div className="settings-section">
        <div>
          <h3 style={{ color: 'var(--status-rose)' }}>Tehlikeli bölge</h3>
          <p className="desc">Geri alınamayan işlemler.</p>
        </div>
        <div className="settings-card settings-panel">
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}><Icon name="archive" size={14} /> Çalışma alanını arşivle</button>
          <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', color: 'var(--status-rose)', borderColor: 'oklch(58% 0.13 10 / 0.3)' }}>
            <Icon name="trash" size={14} /> Hesabı sil
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsToggle({ label, defaultOn, inline }) {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <div className="tweak-toggle" onClick={() => setOn(!on)}>
      {label && <span>{label}</span>}
      <div className="toggle" data-on={on} />
    </div>
  );
}

window.SettingsView = SettingsView;
