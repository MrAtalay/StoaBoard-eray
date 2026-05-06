// Auth page — login/register

const { useState: useAuthState } = React;

function AuthPage({ onSignIn }) {
  const [mode, setMode] = useAuthState('signin');

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-brand">
          <div className="sidebar-logo"><Icon name="bolt" size={16} strokeWidth={1.8} /></div>
          <div className="sidebar-logo-text" style={{ fontSize: 22 }}>Stoa<em>Board</em></div>
        </div>
        <div className="auth-hero">
          <h1>Takımının işi <em>konuşsun</em>, kartları değil.</h1>
          <p>
            StoaBoard — pano, liste ve takvimde aynı anda çalışan hafif, hızlı bir proje yönetim aracı.
            Startup takımları için tasarlandı, ekibinle 15 saniyede başla.
          </p>
          <div style={{ display: 'flex', gap: 28, fontSize: 12.5, color: 'var(--ink-muted)' }}>
            <div><strong style={{ color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 22, display: 'block', lineHeight: 1 }}>6k+</strong> aktif takım</div>
            <div><strong style={{ color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 22, display: 'block', lineHeight: 1 }}>98%</strong> memnuniyet</div>
            <div><strong style={{ color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 22, display: 'block', lineHeight: 1 }}>15sn</strong> başlama süresi</div>
          </div>
          <div className="auth-quote">
            "StoaBoard'a geçtikten sonra haftalık sync toplantılarımızı yarıya indirdik. Kartları açıyoruz, işleri konuşuyoruz."
            <cite>— Deniz Arslan, Flux Labs</cite>
          </div>
        </div>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-form">
          <h2>{mode === 'signin' ? 'Tekrar hoşgeldin.' : 'Hesap oluştur.'}</h2>
          <p className="sub">{mode === 'signin' ? 'Devam etmek için giriş yap.' : 'Takımınla başlamak için 30 saniye.'}</p>

          <div className="auth-tabs">
            <button data-active={mode === 'signin'} onClick={() => setMode('signin')}>Giriş yap</button>
            <button data-active={mode === 'signup'} onClick={() => setMode('signup')}>Kaydol</button>
          </div>

          <div className="auth-oauth">
            <button className="oauth-btn"><Icon name="google" size={14} /> Google</button>
            <button className="oauth-btn"><Icon name="github" size={14} /> GitHub</button>
          </div>

          <div className="auth-divider">veya e-posta ile</div>

          <form className="auth-fields" onSubmit={(e) => { e.preventDefault(); onSignIn(); }}>
            {mode === 'signup' && (
              <div className="field">
                <label>Ad Soyad</label>
                <input placeholder="Aliz Kaya" required />
              </div>
            )}
            <div className="field">
              <label>E-posta</label>
              <input type="email" placeholder="sen@stoalabs.co" required />
            </div>
            <div className="field">
              <label>
                Parola {mode === 'signin' && <a href="#" style={{ float: 'right', color: 'var(--ink-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Unuttun mu?</a>}
              </label>
              <input type="password" placeholder="••••••••" required />
            </div>
            <button type="submit" className="auth-submit">
              {mode === 'signin' ? 'Giriş yap' : 'Hesap oluştur'}
            </button>
          </form>

          <div className="auth-foot">
            {mode === 'signin'
              ? <>Hesabın yok mu? <a onClick={() => setMode('signup')}>Ücretsiz kaydol</a></>
              : <>Şartlar ve gizlilik politikasını kabul ediyorsun.</>}
          </div>
        </div>
      </div>
    </div>
  );
}

window.AuthPage = AuthPage;
// FKAFAWKFJ
