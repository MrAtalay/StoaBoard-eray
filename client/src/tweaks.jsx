// Tweaks panel

import React from 'react';
import { Icon } from './icons.jsx';

function TweaksPanel({ tweaks, setTweak, visible }) {
  const [open, setOpen] = React.useState(false);
  if (!visible) return null;

  return (
    <>
      <button className="tweaks-fab" onClick={() => setOpen(!open)} title="Tweaks">
        <Icon name={open ? 'x' : 'sparkle'} size={17} />
      </button>
      <div className="tweaks-panel" data-open={open}>
        <div className="tweaks-head">
          <div className="tweaks-title">Tweaks</div>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}><Icon name="x" size={14} /></button>
        </div>
        <div className="tweaks-body">
          <div className="tweak-group">
            <div className="tweak-label">{window.t?.('tweak_theme')||'Tema'}</div>
            <div className="tweak-options">
              {[['light',window.t?.('tweak_light')||'Açık'],['cream',window.t?.('tweak_cream')||'Krem'],['dark',window.t?.('tweak_dark')||'Koyu']].map(([k, label]) => (
                <button key={k} className="tweak-opt" data-active={tweaks.theme === k} onClick={() => setTweak('theme', k)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="tweak-group">
            <div className="tweak-label">{window.t?.('tweak_accent')||'Vurgu rengi'}</div>
            <div className="swatch-row">
              {[
                ['navy','#1a4a70'],
                ['terracotta','oklch(55% 0.13 25)'],
                ['sage','oklch(55% 0.09 150)'],
                ['slate','oklch(50% 0.04 250)'],
                ['indigo','oklch(52% 0.15 270)'],
                ['plum','oklch(50% 0.14 340)'],
              ].map(([k, v]) => (
                <button key={k} className="swatch" data-active={tweaks.accent === k} style={{ background: v }} onClick={() => setTweak('accent', k)} title={k} />
              ))}
              <label
                className="swatch swatch-custom"
                data-active={tweaks.accent === 'custom'}
                title={window.t?.('tweak_accent_custom') || 'Özel renk'}
                style={tweaks.accent === 'custom' && tweaks.accentHex ? { background: tweaks.accentHex } : undefined}
              >
                <input
                  type="color"
                  value={tweaks.accentHex || '#1a4a70'}
                  onChange={(e) => {
                    const hex = e.target.value;
                    setTweak('accentHex', hex);
                    setTweak('accent', 'custom');
                  }}
                />
              </label>
            </div>
          </div>

          <div className="tweak-group">
            <div className="tweak-label">{window.t?.('tweak_typography')||'Tipografi'}</div>
            <div className="tweak-options">
              {[['sans','Sans'],['fraunces','Fraunces']].map(([k, label]) => (
                <button key={k} className="tweak-opt" data-active={tweaks.fontPair === k} onClick={() => setTweak('fontPair', k)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="tweak-group">
            <div className="tweak-label">{window.t?.('tweak_density')||'Yoğunluk'}</div>
            <div className="tweak-options">
              {[['airy',window.t?.('tweak_airy')||'Ferah'],['balanced',window.t?.('tweak_balanced')||'Dengeli'],['compact',window.t?.('tweak_compact')||'Kompakt']].map(([k, label]) => (
                <button key={k} className="tweak-opt" data-active={tweaks.density === k} onClick={() => setTweak('density', k)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="tweak-group" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div className="tweak-toggle" onClick={() => setTweak('showProgress', !tweaks.showProgress)}>
              <span>{window.t?.('tweak_progress')||'İlerleme çubukları'}</span>
              <div className="toggle" data-on={tweaks.showProgress} />
            </div>
            <div className="tweak-toggle" onClick={() => setTweak('showTags', !tweaks.showTags)}>
              <span>{window.t?.('tweak_tags')||'Kart etiketleri'}</span>
              <div className="toggle" data-on={tweaks.showTags} />
            </div>
            <div className="tweak-toggle" onClick={() => setTweak('sidebarCollapsed', !tweaks.sidebarCollapsed)}>
              <span>{window.t?.('tweak_sidebar')||'Kenar çubuğu daraltılmış'}</span>
              <div className="toggle" data-on={tweaks.sidebarCollapsed} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export { TweaksPanel };
