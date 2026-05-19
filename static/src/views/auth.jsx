// Auth page + Workspace setup — v3 FINAL
const { useState: useAuthState, useEffect: useAuthEffect, useRef: useAuthRef } = React;

// ── Dil tanımları ─────────────────────────────────────────────────────────────
const AUTH_LANGS = [
  { code: 'tr', label: 'TR', flag: '🇹🇷', name: 'Türkçe' },
  { code: 'en', label: 'EN', flag: '🇬🇧', name: 'English' },
  { code: 'de', label: 'DE', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'es', label: 'ES', flag: '🇪🇸', name: 'Español' },
  { code: 'ru', label: 'RU', flag: '🇷🇺', name: 'Русский' },
];

const AUTH_I18N = {
  tr: {
    greet_morning: "Günaydın, StoaBoard'a dön.",
    greet_day: "İyi günler, StoaBoard'a dön.",
    greet_evening: "İyi akşamlar, StoaBoard'a dön.",
    create_account: 'Yeni Hesap Oluştur.',
    subtitle_signin: 'Kaldığın yerden devam etmek için giriş yap.',
    subtitle_signup: 'Takımınla projelerini yönetmeye hemen başla.',
    tab_signin: 'Giriş yap', tab_signup: 'Kaydol',
    label_name: 'AD SOYAD', label_email: 'E-POSTA', label_password: 'PAROLA',
    forgot_link: 'Unuttun mu?',
    checking: 'DOĞRULANIYOR…', btn_signin: 'GİRİŞ YAP', btn_signup: 'HESAP OLUŞTUR',
    no_account: 'Hesabın yok mu?', free_signup: 'Ücretsiz kaydol',
    have_account: 'Hesabın var mı?', signin_here: 'Buradan giriş yap',
    err_email_domain: 'Lütfen geçerli bir e-posta adresi kullanın (Gmail, Hotmail, Outlook, Yahoo vb.)',
    err_login_fail: 'Giriş yapılamadı. Bilgilerini kontrol et.',
    err_name_required: 'Ad soyad zorunludur',
    forgot_title: 'Şifreni mi unuttun?',
    forgot_sub: 'Kayıtlı e-posta adresini gir, doğrulama kodu gönderelim.',
    forgot_checking: 'KONTROL EDİLİYOR…', forgot_send: 'DOĞRULAMA KODU GÖNDER',
    back_signin: '← Giriş ekranına dön',
    code_title: 'Kodu Doğrula',
    code_sent: '{{email}} adresine 6 haneli kod gönderildi.',
    label_code: 'DOĞRULAMA KODU',
    btn_continue: 'Devam Et', btn_change_pass: 'ŞİFREYİ DEĞİŞTİR',
    back_prev: '← Geri dön',
    newpass_title: 'Yeni Şifre Belirle',
    newpass_sub: 'Hesabın için güçlü bir şifre oluştur.',
    label_new_pass: 'YENİ PAROLA', label_confirm_pass: 'PAROLAYI TEKRARLA',
    btn_no_change: 'Değiştirme', saving: 'KAYDEDİLİYOR…', btn_save: 'KAYDET',
    err_code_required: 'Lütfen kodu girin.',
    err_pass_short: 'Şifre en az 8 karakter olmalıdır.',
    err_pass_match: 'Şifreler eşleşmiyor.',
    err_reset_fail: 'Kod yanlış veya süresi dolmuş. Yeni kod isteyin.',
    err_account_not_found: 'Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.',
    invite_text: 'Takıma davet edildiniz.',
    invite_join_signup: 'Hesap oluşturarak', invite_join_signin: 'Giriş yaparak',
    invite_continue: 'katılmaya devam edin.',
  },
  en: {
    greet_morning: 'Good morning, welcome back to StoaBoard.',
    greet_day: 'Good afternoon, welcome back to StoaBoard.',
    greet_evening: 'Good evening, welcome back to StoaBoard.',
    create_account: 'Create a New Account.',
    subtitle_signin: 'Sign in to pick up where you left off.',
    subtitle_signup: 'Start managing your projects with your team right away.',
    tab_signin: 'Sign In', tab_signup: 'Sign Up',
    label_name: 'FULL NAME', label_email: 'EMAIL', label_password: 'PASSWORD',
    forgot_link: 'Forgot?',
    checking: 'VERIFYING…', btn_signin: 'SIGN IN', btn_signup: 'CREATE ACCOUNT',
    no_account: "Don't have an account?", free_signup: 'Sign up for free',
    have_account: 'Already have an account?', signin_here: 'Sign in here',
    err_email_domain: 'Please use a valid email address (Gmail, Hotmail, Outlook, Yahoo, etc.)',
    err_login_fail: 'Sign-in failed. Please check your credentials.',
    err_name_required: 'Full name is required',
    forgot_title: 'Forgot your password?',
    forgot_sub: "Enter your registered email and we'll send you a verification code.",
    forgot_checking: 'CHECKING…', forgot_send: 'SEND VERIFICATION CODE',
    back_signin: '← Back to sign in',
    code_title: 'Verify Code',
    code_sent: 'A 6-digit code was sent to {{email}}.',
    label_code: 'VERIFICATION CODE',
    btn_continue: 'Continue', btn_change_pass: 'CHANGE PASSWORD',
    back_prev: '← Go back',
    newpass_title: 'Set New Password',
    newpass_sub: 'Create a strong password for your account.',
    label_new_pass: 'NEW PASSWORD', label_confirm_pass: 'CONFIRM PASSWORD',
    btn_no_change: 'Cancel', saving: 'SAVING…', btn_save: 'SAVE',
    err_code_required: 'Please enter the code.',
    err_pass_short: 'Password must be at least 8 characters.',
    err_pass_match: 'Passwords do not match.',
    err_reset_fail: 'Code is incorrect or expired. Please request a new one.',
    err_account_not_found: 'No account found with this email address.',
    invite_text: 'You have been invited to a team.',
    invite_join_signup: 'Sign up', invite_join_signin: 'Sign in',
    invite_continue: 'to continue joining.',
  },
  de: {
    greet_morning: 'Guten Morgen, willkommen zurück bei StoaBoard.',
    greet_day: 'Guten Tag, willkommen zurück bei StoaBoard.',
    greet_evening: 'Guten Abend, willkommen zurück bei StoaBoard.',
    create_account: 'Neues Konto erstellen.',
    subtitle_signin: 'Melden Sie sich an, um weiterzumachen.',
    subtitle_signup: 'Verwalten Sie Ihre Projekte sofort mit Ihrem Team.',
    tab_signin: 'Anmelden', tab_signup: 'Registrieren',
    label_name: 'VOR- UND NACHNAME', label_email: 'E-MAIL', label_password: 'PASSWORT',
    forgot_link: 'Vergessen?',
    checking: 'WIRD ÜBERPRÜFT…', btn_signin: 'ANMELDEN', btn_signup: 'KONTO ERSTELLEN',
    no_account: 'Noch kein Konto?', free_signup: 'Kostenlos registrieren',
    have_account: 'Bereits ein Konto?', signin_here: 'Hier anmelden',
    err_email_domain: 'Bitte verwenden Sie eine gültige E-Mail-Adresse (Gmail, Hotmail, Outlook, Yahoo usw.)',
    err_login_fail: 'Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Zugangsdaten.',
    err_name_required: 'Vor- und Nachname sind erforderlich',
    forgot_title: 'Passwort vergessen?',
    forgot_sub: 'Geben Sie Ihre registrierte E-Mail ein, um einen Bestätigungscode zu erhalten.',
    forgot_checking: 'WIRD GEPRÜFT…', forgot_send: 'BESTÄTIGUNGSCODE SENDEN',
    back_signin: '← Zurück zur Anmeldung',
    code_title: 'Code bestätigen',
    code_sent: 'Ein 6-stelliger Code wurde an {{email}} gesendet.',
    label_code: 'BESTÄTIGUNGSCODE',
    btn_continue: 'Weiter', btn_change_pass: 'PASSWORT ÄNDERN',
    back_prev: '← Zurück',
    newpass_title: 'Neues Passwort festlegen',
    newpass_sub: 'Erstellen Sie ein sicheres Passwort für Ihr Konto.',
    label_new_pass: 'NEUES PASSWORT', label_confirm_pass: 'PASSWORT WIEDERHOLEN',
    btn_no_change: 'Abbrechen', saving: 'WIRD GESPEICHERT…', btn_save: 'SPEICHERN',
    err_code_required: 'Bitte geben Sie den Code ein.',
    err_pass_short: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
    err_pass_match: 'Die Passwörter stimmen nicht überein.',
    err_reset_fail: 'Code ist falsch oder abgelaufen. Fordern Sie einen neuen an.',
    err_account_not_found: 'Es wurde kein Konto mit dieser E-Mail-Adresse gefunden.',
    invite_text: 'Sie wurden zu einem Team eingeladen.',
    invite_join_signup: 'Registrieren Sie sich,', invite_join_signin: 'Melden Sie sich an,',
    invite_continue: 'um dem Team beizutreten.',
  },
  es: {
    greet_morning: 'Buenos días, bienvenido de nuevo a StoaBoard.',
    greet_day: 'Buenas tardes, bienvenido de nuevo a StoaBoard.',
    greet_evening: 'Buenas noches, bienvenido de nuevo a StoaBoard.',
    create_account: 'Crear una cuenta nueva.',
    subtitle_signin: 'Inicia sesión para continuar donde lo dejaste.',
    subtitle_signup: 'Empieza a gestionar tus proyectos con tu equipo ahora mismo.',
    tab_signin: 'Iniciar sesión', tab_signup: 'Registrarse',
    label_name: 'NOMBRE COMPLETO', label_email: 'CORREO ELECTRÓNICO', label_password: 'CONTRASEÑA',
    forgot_link: '¿Olvidaste?',
    checking: 'VERIFICANDO…', btn_signin: 'INICIAR SESIÓN', btn_signup: 'CREAR CUENTA',
    no_account: '¿No tienes cuenta?', free_signup: 'Regístrate gratis',
    have_account: '¿Ya tienes cuenta?', signin_here: 'Inicia sesión aquí',
    err_email_domain: 'Por favor, usa una dirección de correo válida (Gmail, Hotmail, Outlook, Yahoo, etc.)',
    err_login_fail: 'No se pudo iniciar sesión. Verifica tus datos.',
    err_name_required: 'El nombre completo es obligatorio',
    forgot_title: '¿Olvidaste tu contraseña?',
    forgot_sub: 'Ingresa tu correo registrado y te enviaremos un código de verificación.',
    forgot_checking: 'COMPROBANDO…', forgot_send: 'ENVIAR CÓDIGO DE VERIFICACIÓN',
    back_signin: '← Volver al inicio de sesión',
    code_title: 'Verificar código',
    code_sent: 'Se envió un código de 6 dígitos a {{email}}.',
    label_code: 'CÓDIGO DE VERIFICACIÓN',
    btn_continue: 'Continuar', btn_change_pass: 'CAMBIAR CONTRASEÑA',
    back_prev: '← Volver',
    newpass_title: 'Establecer nueva contraseña',
    newpass_sub: 'Crea una contraseña segura para tu cuenta.',
    label_new_pass: 'NUEVA CONTRASEÑA', label_confirm_pass: 'CONFIRMAR CONTRASEÑA',
    btn_no_change: 'Cancelar', saving: 'GUARDANDO…', btn_save: 'GUARDAR',
    err_code_required: 'Por favor, ingresa el código.',
    err_pass_short: 'La contraseña debe tener al menos 8 caracteres.',
    err_pass_match: 'Las contraseñas no coinciden.',
    err_reset_fail: 'El código es incorrecto o ha expirado. Solicita uno nuevo.',
    err_account_not_found: 'No se encontró ninguna cuenta con esta dirección de correo.',
    invite_text: 'Has sido invitado a un equipo.',
    invite_join_signup: 'Regístrate', invite_join_signin: 'Inicia sesión',
    invite_continue: 'para continuar uniéndote.',
  },
  ru: {
    greet_morning: 'Доброе утро, добро пожаловать обратно в StoaBoard.',
    greet_day: 'Добрый день, добро пожаловать обратно в StoaBoard.',
    greet_evening: 'Добрый вечер, добро пожаловать обратно в StoaBoard.',
    create_account: 'Создать новый аккаунт.',
    subtitle_signin: 'Войдите, чтобы продолжить с того места, где остановились.',
    subtitle_signup: 'Начните управлять проектами вместе с командой прямо сейчас.',
    tab_signin: 'Войти', tab_signup: 'Регистрация',
    label_name: 'ИМЯ И ФАМИЛИЯ', label_email: 'ЭЛЕКТРОННАЯ ПОЧТА', label_password: 'ПАРОЛЬ',
    forgot_link: 'Забыли?',
    checking: 'ПРОВЕРКА…', btn_signin: 'ВОЙТИ', btn_signup: 'СОЗДАТЬ АККАУНТ',
    no_account: 'Нет аккаунта?', free_signup: 'Зарегистрироваться бесплатно',
    have_account: 'Уже есть аккаунт?', signin_here: 'Войти здесь',
    err_email_domain: 'Пожалуйста, используйте действительный адрес (Gmail, Hotmail, Outlook, Yahoo и т. д.)',
    err_login_fail: 'Не удалось войти. Проверьте введённые данные.',
    err_name_required: 'Имя и фамилия обязательны',
    forgot_title: 'Забыли пароль?',
    forgot_sub: 'Введите зарегистрированный email, и мы отправим вам код подтверждения.',
    forgot_checking: 'ПРОВЕРЯЕТСЯ…', forgot_send: 'ОТПРАВИТЬ КОД ПОДТВЕРЖДЕНИЯ',
    back_signin: '← Вернуться ко входу',
    code_title: 'Подтвердить код',
    code_sent: 'На адрес {{email}} отправлен 6-значный код.',
    label_code: 'КОД ПОДТВЕРЖДЕНИЯ',
    btn_continue: 'Продолжить', btn_change_pass: 'ИЗМЕНИТЬ ПАРОЛЬ',
    back_prev: '← Назад',
    newpass_title: 'Установить новый пароль',
    newpass_sub: 'Создайте надёжный пароль для вашего аккаунта.',
    label_new_pass: 'НОВЫЙ ПАРОЛЬ', label_confirm_pass: 'ПОВТОРИТЕ ПАРОЛЬ',
    btn_no_change: 'Отмена', saving: 'СОХРАНЕНИЕ…', btn_save: 'СОХРАНИТЬ',
    err_code_required: 'Пожалуйста, введите код.',
    err_pass_short: 'Пароль должен содержать не менее 8 символов.',
    err_pass_match: 'Пароли не совпадают.',
    err_reset_fail: 'Код неверный или истёк. Запросите новый.',
    err_account_not_found: 'Аккаунт с таким адресом электронной почты не найден.',
    invite_text: 'Вас пригласили в команду.',
    invite_join_signup: 'Зарегистрируйтесь,', invite_join_signin: 'Войдите,',
    invite_continue: 'чтобы продолжить вступление.',
  },
};

const EyeOpen = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
const EyeClosed = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>;

// ── GERÇEK StoaBoard Logo (PNG olarak img tag ile) ─────────────────────────────
// Logo PNG dosyasını kullanıyoruz — sütunlar + SR harfleri
const StoaLogoPNG = ({ size = 40, style = {} }) => (
  <img
    src="/static/StoaBoard_symbol.png"
    width={size}
    height={size}
    alt="StoaBoard"
    style={{ objectFit: 'contain', display: 'block', ...style }}
    onError={e => { e.target.style.display = 'none'; }}
  />
);

// Fallback SVG logosu (PNG yüklenemezse) — gerçek logoya yakın
const StoaLogoSVG = ({ color = '#1d3461', size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Sol sütun grubu */}
    <rect x="5" y="52" width="8" height="42" rx="2" fill={color} />
    <rect x="15" y="52" width="8" height="42" rx="2" fill={color} />
    <rect x="25" y="52" width="8" height="42" rx="2" fill={color} />
    <rect x="3" y="89" width="32" height="5" rx="2" fill={color} />
    <rect x="1" y="94" width="36" height="4" rx="2" fill={color} />
    {/* Sağ sütun grubu */}
    <rect x="59" y="52" width="8" height="42" rx="2" fill={color} />
    <rect x="69" y="52" width="8" height="42" rx="2" fill={color} />
    <rect x="79" y="52" width="8" height="42" rx="2" fill={color} />
    <rect x="57" y="89" width="32" height="5" rx="2" fill={color} />
    <rect x="55" y="94" width="36" height="4" rx="2" fill={color} />
    {/* Orta sütun */}
    <rect x="44" y="52" width="10" height="46" rx="2" fill={color} />
    <rect x="41" y="94" width="16" height="4" rx="2" fill={color} />
    {/* S harfi */}
    <path d="M8 8 C4 8 1 11 1 15 C1 19 4 21 9 23 L16 26 C21 28 24 30 24 35 C24 40 21 43 16 43 C11 43 8 40 7 36 L3 37.5 C5 43 10 47 16 47 C23 47 28 43 28 35 C28 30 25 27 20 25 L13 22 C9 20 5 18 5 15 C5 12 7 10 10 10 C13 10 15 11.5 16 14 L20 12 C18 9 14 8 8 8Z" fill={color} />
    {/* R harfi */}
    <path d="M32 8 L32 47 L37 47 L37 30 L45 30 L51 47 L57 47 L50 29.5 C54 28 56 24.5 56 20 C56 13 51 8 44 8 L32 8Z M37 12.5 L43 12.5 C47 12.5 50 15 50 20 C50 25 47 27.5 43 27.5 L37 27.5 L37 12.5Z" fill={color} />
  </svg>
);

// Akıllı logo: önce PNG dene, hata olunca SVG göster
const StoaLogo = ({ color = '#1d3461', size = 40, style = {} }) => {
  const [pngFailed, setPngFailed] = useAuthState(false);
  if (pngFailed) return <StoaLogoSVG color={color} size={size} />;
  return (
    <img
      src="/static/StoaBoard_symbol.png"
      width={size} height={size}
      alt="StoaBoard"
      style={{
        objectFit: 'contain', display: 'block', ...style,
        ...(color !== '#1d3461' ? { filter: color === '#ef4444' ? 'invert(27%) sepia(97%) saturate(1000%) hue-rotate(332deg)' : color === 'white' ? 'brightness(0) invert(1)' : 'none' } : {})
      }}
      onError={() => setPngFailed(true)}
    />
  );
};

// ── GEÇERLİ E-POSTA DOMAINLER ─────────────────────────────────────────────────
const VALID_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es', 'hotmail.tr',
  'outlook.com', 'outlook.co.uk', 'outlook.de', 'outlook.fr', 'outlook.com.tr',
  'live.com', 'live.co.uk', 'live.fr', 'live.de',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.com.tr',
  'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'msn.com',
  'protonmail.com', 'proton.me', 'pm.me', 'zoho.com',
  'yandex.com', 'yandex.ru', 'mail.com', 'email.com', 'aol.com',
  'tutanota.com', 'tuta.io',
];
function isValidEmailDomain(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? VALID_EMAIL_DOMAINS.includes(domain) : false;
}

// ── 1. GİRİŞ YAP / KAYDOL SAYFASI ───────────────────────────────────────────────
function AuthPage({ onSignIn }) {
  const joinInviteCode = React.useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('join') || ''; } catch { return ''; }
  }, []);
  const [mode, setMode] = useAuthState(joinInviteCode ? 'signup' : 'signin');
  const [error, setError] = useAuthState('');
  const [busy, setBusy] = useAuthState(false);
  const [form, setForm] = useAuthState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useAuthState(false);
  const [isShaking, setIsShaking] = useAuthState(false);
  const [currentSlide, setCurrentSlide] = useAuthState(0);

  const [showForgot, setShowForgot] = useAuthState(false);
  const [forgotStep, setForgotStep] = useAuthState('email');
  const [forgotEmail, setForgotEmail] = useAuthState('');
  const [forgotCode, setForgotCode] = useAuthState('');
  const [forgotNewPass, setForgotNewPass] = useAuthState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useAuthState('');
  const [forgotError, setForgotError] = useAuthState('');
  const [forgotBusy, setForgotBusy] = useAuthState(false);
  const [forgotShowNewPass, setForgotShowNewPass] = useAuthState(false);
  const [greeting, setGreeting] = useAuthState('Tekrar hoşgeldin.');
  const [lang, setLang] = useAuthState(() => {
    try { const tw = JSON.parse(localStorage.getItem('stoa.tweaks') || '{}'); if (tw.locale) return tw.locale; } catch {}
    return localStorage.getItem('stoa.lang') || 'tr';
  });
  const [langMenuOpen, setLangMenuOpen] = useAuthState(false);
  const langMenuRef = useAuthRef(null);
  const t = (key) => (AUTH_I18N[lang] || AUTH_I18N.tr)[key] || AUTH_I18N.tr[key] || key;

  const switchLang = (code) => {
    setLang(code);
    localStorage.setItem('stoa.lang', code);
    try { const tw = JSON.parse(localStorage.getItem('stoa.tweaks') || '{}'); localStorage.setItem('stoa.tweaks', JSON.stringify({ ...tw, locale: code })); } catch {}
  };

  useAuthEffect(() => {
    if (!langMenuOpen) return;
    const close = (e) => { if (!langMenuRef.current?.contains(e.target)) setLangMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [langMenuOpen]);

  // YENİ FOTOĞRAFLAR - zoom azaltıldı
  const slideImages = [
    "https://images.unsplash.com/photo-1486272812091-a9bf3c6376c5?q=80&w=1920&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1776799733252-e918015c662b?q=80&w=1920&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1748946148754-55f2435e2f62?q=80&w=1920&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1698011765547-0bbeeda62045?q=80&w=1920&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1765972644093-b22467b94724?q=80&w=1920&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1672189033759-e36009a597a5?q=80&w=1920&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1674081363291-605bff71e4e4?q=80&w=1920&auto=format&fit=crop",
  ];

  useAuthEffect(() => {
    const t = setInterval(() => setCurrentSlide(p => (p + 1) % slideImages.length), 10000);
    return () => clearInterval(t);
  }, [slideImages.length]);

  useAuthEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting(t('greet_morning'));
    else if (h < 18) setGreeting(t('greet_day'));
    else setGreeting(t('greet_evening'));
  }, [lang]);

  const [particles] = useAuthState(() => Array.from({ length: 30 }).map((_, i) => ({
    id: i, size: Math.random() * 4 + 1 + 'px', left: Math.random() * 100 + '%',
    delay: Math.random() * 8 + 's', duration: Math.random() * 8 + 6 + 's',
  })));

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const calculatePasswordStrength = (pwd) => {
    if (!pwd || mode === 'signin') return { width: 0, color: 'transparent' };
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    if (s === 1) return { width: '25%', color: '#ef4444' };
    if (s === 2) return { width: '50%', color: '#f59e0b' };
    if (s === 3) return { width: '75%', color: '#3b82f6' };
    if (s === 4) return { width: '100%', color: '#22c55e' };
    return { width: '5%', color: '#e5e7eb' };
  };
  const pwdStrength = calculatePasswordStrength(form.password);

  const handleForgotEmailSubmit = async (e) => {
    e.preventDefault(); setForgotError(''); setForgotBusy(true);
    try {
      await window.API.sendPasswordReset(forgotEmail);
      setForgotStep('code');
    } catch (err) { setForgotError(err.message || t('err_account_not_found')); }
    finally { setForgotBusy(false); }
  };

  const handleForgotCodeSubmit = (e) => {
    e.preventDefault(); setForgotError('');
    if (!forgotCode.trim()) { setForgotError(t('err_code_required')); return; }
    setForgotStep('newpassword');
  };

  const handleForgotNewPassSubmit = async (e) => {
    e.preventDefault(); setForgotError('');
    if (forgotNewPass.length < 8) { setForgotError(t('err_pass_short')); return; }
    if (forgotNewPass !== forgotConfirmPass) { setForgotError(t('err_pass_match')); return; }
    setForgotBusy(true);
    try {
      await window.API.resetPassword(forgotEmail, forgotNewPass, forgotCode.trim());
      window.showToast?.('Şifreniz başarıyla güncellendi!', 'success');
      setShowForgot(false); setForgotStep('email');
      setForgotEmail(''); setForgotCode(''); setForgotNewPass(''); setForgotConfirmPass('');
    } catch (err) { setForgotError(err.message || t('err_reset_fail')); }
    finally { setForgotBusy(false); }
  };

  const handleContinueWithoutChange = () => {
    setShowForgot(false); setForgotStep('email');
    setForgotEmail(''); setForgotCode(''); setForgotNewPass(''); setForgotConfirmPass(''); setForgotError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (mode === 'signup' && !isValidEmailDomain(form.email)) {
      setError(t('err_email_domain'));
      setIsShaking(true); setTimeout(() => setIsShaking(false), 500); return;
    }
    setBusy(true); setIsShaking(false);
    try {
      if (mode === 'signin') { await window.API.login(form.email, form.password); }
      else { if (!form.name.trim()) throw new Error(t('err_name_required')); await window.API.register(form.name.trim(), form.email, form.password); }
      onSignIn();
    } catch (err) {
      setError(err.message || t('err_login_fail'));
      setIsShaking(true); setTimeout(() => setIsShaking(false), 500);
    } finally { setBusy(false); }
  };

  const isRegisterMode = mode === 'signup' && !showForgot;
  const dataVariant = showForgot ? 'forgot' : (isRegisterMode ? 'register' : 'login');

  return (
    <div className="auth-page" data-variant={dataVariant}>
      <div className="auth-visual">
        <div className="slider-container">
          {slideImages.map((img, i) => (
            <div key={i} className={`slide ${i === currentSlide ? 'active' : ''}`} style={{ backgroundImage: `url('${img}')` }} />
          ))}
        </div>
        <div className="dust-overlay">
          {particles.map(p => (
            <div key={p.id} className="dust-particle" style={{ width: p.size, height: p.size, left: p.left, animationDelay: p.delay, animationDuration: p.duration }} />
          ))}
        </div>
        <div className="glass-content">
          <div className="auth-brand-row">
            <StoaLogo color="#1d3461" size={38} />
            <div className="auth-brand-text">Stoa<em>Board</em></div>
          </div>
          <div className="auth-hero">
            <h1>Yarının projelerini, bugünün en <em>hafif</em> araçlarıyla inşa edin.</h1>
            <p>Teknoloji dünyası artık ağır ve hantal sistemleri kaldırmıyor. StoaBoard, startup çevikliğini merkeze alarak tasarlandı; 15 saniyede kurulum, sıfır karmaşıklık ve tam senkronizasyon. Pano, liste ve takvim görünümleri arasında pürüzsüzce geçiş yaparken, sistemin ağırlığını değil, ekibinizin yaratıcılığını hissedeceksiniz. Gelecek burada başlıyor, hafiflikten güç alarak.</p>
            <div className="stats-row">
              <div><strong>1.200+</strong><span>aktif ekip</span></div>
              <div><strong>38k+</strong><span>tamamlanan görev</span></div>
              <div><strong>15sn</strong><span>ortalama kurulum</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-form-wrap" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 10 }} ref={langMenuRef}>
          <button onClick={() => setLangMenuOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:8, cursor:'pointer', background:'var(--bg)', color:'var(--ink)', border:'1px solid var(--line)', fontSize:12, fontWeight:600, transition:'all 0.15s', boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
            <span>{AUTH_LANGS.find(l => l.code === lang)?.label || 'TR'}</span>
            <svg width="10" height="7" viewBox="0 0 10 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d={langMenuOpen ? 'M1 6L5 2L9 6' : 'M1 1L5 5L9 1'}/></svg>
          </button>
          {langMenuOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 5px)', right:0, background:'var(--bg)', border:'1px solid var(--line)', borderRadius:10, overflow:'hidden', minWidth:148, boxShadow:'0 8px 24px rgba(0,0,0,0.13)', zIndex:200 }}>
              {AUTH_LANGS.map((l, i) => (
                <button key={l.code} onClick={() => { switchLang(l.code); setLangMenuOpen(false); }}
                  style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'9px 14px', cursor:'pointer', textAlign:'left',
                    background: lang === l.code ? 'oklch(55% 0.13 250 / 0.08)' : 'transparent',
                    color: lang === l.code ? 'var(--accent)' : 'var(--ink)',
                    fontWeight: lang === l.code ? 600 : 400, fontSize:13, border:'none',
                    borderBottom: i < AUTH_LANGS.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ fontSize:16 }}>{l.flag}</span>
                  <span style={{ flex:1 }}>{l.name}</span>
                  {lang === l.code && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 6L5 9L10 3"/></svg>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="auth-form">
          {showForgot ? (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              {forgotStep === 'email' && (<>
                <h2>{t('forgot_title')}</h2>
                <p className="sub">{t('forgot_sub')}</p>
                {forgotError && <div className="error-msg">{forgotError}</div>}
                <form className="auth-fields" onSubmit={handleForgotEmailSubmit}>
                  <div className="field"><label className="field-label">{t('label_email')}</label>
                    <input className="glow-input" autoFocus type="email" placeholder="sen@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                  </div>
                  <button type="submit" className="auth-submit" disabled={forgotBusy}>{forgotBusy ? t('forgot_checking') : t('forgot_send')}</button>
                </form>
                <div className="auth-foot"><a onClick={() => { setShowForgot(false); setForgotError(''); }}>{t('back_signin')}</a></div>
              </>)}
              {forgotStep === 'code' && (<>
                <h2>{t('code_title')}</h2>
                <p className="sub">{(() => { const [before, after] = t('code_sent').split('{{email}}'); return <>{before}<strong>{forgotEmail}</strong>{after}</>; })()}</p>
                {forgotError && <div className="error-msg">{forgotError}</div>}
                <form className="auth-fields" onSubmit={handleForgotCodeSubmit}>
                  <div className="field"><label className="field-label">{t('label_code')}</label>
                    <input className="glow-input" autoFocus placeholder="123456" value={forgotCode} onChange={e => setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.3em', fontSize: 20, textAlign: 'center', fontWeight: 'bold' }} required />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" className="auth-submit" style={{ background: 'transparent', color: 'var(--color-ink)', border: '1px solid var(--color-line)', flex: 1 }} onClick={handleContinueWithoutChange}>{t('btn_continue')}</button>
                    <button type="submit" className="auth-submit" style={{ flex: 2 }}>{t('btn_change_pass')}</button>
                  </div>
                </form>
                <div className="auth-foot"><a onClick={() => { setForgotStep('email'); setForgotError(''); setForgotCode(''); }}>{t('back_prev')}</a></div>
              </>)}
              {forgotStep === 'newpassword' && (<>
                <h2>{t('newpass_title')}</h2>
                <p className="sub">{t('newpass_sub')}</p>
                {forgotError && <div className="error-msg">{forgotError}</div>}
                <form className="auth-fields" onSubmit={handleForgotNewPassSubmit}>
                  <div className="field"><label className="field-label">{t('label_new_pass')}</label>
                    <div className="password-wrapper">
                      <input className="glow-input" autoFocus type={forgotShowNewPass ? 'text' : 'password'} placeholder="••••••••" value={forgotNewPass} onChange={e => setForgotNewPass(e.target.value)} required minLength={8} />
                      <span className="toggle-eye" onClick={() => setForgotShowNewPass(!forgotShowNewPass)}>{forgotShowNewPass ? <EyeClosed /> : <EyeOpen />}</span>
                    </div>
                  </div>
                  <div className="field"><label className="field-label">{t('label_confirm_pass')}</label>
                    <input className="glow-input" type="password" placeholder="••••••••" value={forgotConfirmPass} onChange={e => setForgotConfirmPass(e.target.value)} required />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" className="auth-submit" style={{ background: 'transparent', color: 'var(--color-ink)', border: '1px solid var(--color-line)', flex: 1 }} onClick={handleContinueWithoutChange}>{t('btn_no_change')}</button>
                    <button type="submit" className="auth-submit" disabled={forgotBusy} style={{ flex: 2 }}>{forgotBusy ? t('saving') : t('btn_save')}</button>
                  </div>
                </form>
              </>)}
            </div>
          ) : (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <h2>{mode === 'signin' ? greeting : t('create_account')}</h2>
              <p className="sub">{mode === 'signin' ? t('subtitle_signin') : t('subtitle_signup')}</p>
              {joinInviteCode && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, background:'oklch(55% 0.13 250 / 0.1)', border:'1px solid oklch(55% 0.13 250 / 0.25)', marginBottom:16, fontSize:13 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(55% 0.13 250)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <span style={{ color:'var(--ink)' }}>
                    {t('invite_text')}{' '}
                    <strong>{mode === 'signup' ? t('invite_join_signup') : t('invite_join_signin')}</strong> {t('invite_continue')}
                  </span>
                </div>
              )}
              <div className="auth-tabs">
                <button className="tab-btn" data-active={mode === 'signin'} onClick={() => { setMode('signin'); setError(''); }}>{t('tab_signin')}</button>
                <button className="tab-btn" data-active={mode === 'signup'} onClick={() => { setMode('signup'); setError(''); }}>{t('tab_signup')}</button>
              </div>
              {error && <div className="error-msg">{error}</div>}
              <form className={`auth-fields ${isShaking ? 'shake' : ''}`} onSubmit={handleSubmit}>
                {mode === 'signup' && (
                  <div className="field"><label className="field-label">{t('label_name')}</label>
                    <input className="glow-input" placeholder="Aliz Kaya" value={form.name} onChange={set('name')} required />
                  </div>
                )}
                <div className="field"><label className="field-label">{t('label_email')}</label>
                  <input className="glow-input" type="email" placeholder="sen@example.com" value={form.email} onChange={set('email')} required />
                </div>
                <div className="field">
                  <div className="password-header">
                    <label className="field-label">{t('label_password')}</label>
                    {mode === 'signin' && <a className="forgot-link" onClick={e => { e.preventDefault(); setShowForgot(true); setForgotEmail(form.email); }}>{t('forgot_link')}</a>}
                  </div>
                  <div className="password-wrapper">
                    <input className="glow-input" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={set('password')} required minLength={8} />
                    <span className="toggle-eye" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeClosed /> : <EyeOpen />}</span>
                  </div>
                </div>
                {mode === 'signup' && (
                  <div className={`password-strength-container ${form.password.length > 0 ? '' : 'hidden'}`}>
                    <div className="password-strength-bar" style={{ width: pwdStrength.width, backgroundColor: pwdStrength.color }} />
                  </div>
                )}
                <button type="submit" className="auth-submit" disabled={busy}>
                  {busy ? t('checking') : (mode === 'signin' ? t('btn_signin') : t('btn_signup'))}
                </button>
              </form>
              <div className="auth-foot">
                {mode === 'signin'
                  ? <><span>{t('no_account')}</span> <a onClick={() => { setMode('signup'); setError(''); }}>{t('free_signup')}</a></>
                  : <><span>{t('have_account')}</span> <a onClick={() => { setMode('signin'); setError(''); }}>{t('signin_here')}</a></>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── BLUEPRINT SVG ─────────────────────────────────────────────────────────────
const BlueprintSVG = () => (
  <svg viewBox="0 0 900 480" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
    <defs>
      <pattern id="bpgrid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(160,200,255,0.12)" strokeWidth="0.5" />
      </pattern>
      <filter id="bpglow">
        <feGaussianBlur stdDeviation="1.8" result="coloredBlur" />
        <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <rect width="900" height="480" fill="url(#bpgrid)" />
    {/* Üst ölçü */}
    <line x1="90" y1="28" x2="810" y2="28" stroke="rgba(160,200,255,0.35)" strokeWidth="0.7" strokeDasharray="4,4" />
    <line x1="90" y1="24" x2="90" y2="34" stroke="rgba(160,200,255,0.5)" strokeWidth="0.9" />
    <line x1="810" y1="24" x2="810" y2="34" stroke="rgba(160,200,255,0.5)" strokeWidth="0.9" />
    <text x="450" y="20" fill="rgba(160,200,255,0.65)" fontSize="8.5" textAnchor="middle" fontFamily="monospace">69.5 m — STOA CEPHESİ</text>
    {/* Yan ölçü */}
    <line x1="50" y1="95" x2="50" y2="430" stroke="rgba(160,200,255,0.35)" strokeWidth="0.7" strokeDasharray="4,4" />
    <line x1="42" y1="95" x2="58" y2="95" stroke="rgba(160,200,255,0.5)" strokeWidth="0.9" />
    <line x1="42" y1="430" x2="58" y2="430" stroke="rgba(160,200,255,0.5)" strokeWidth="0.9" />
    <text x="32" y="265" fill="rgba(160,200,255,0.65)" fontSize="8.5" textAnchor="middle" fontFamily="monospace" transform="rotate(-90,32,265)">18.2 m — YÜKSEKLİK</text>
    {/* Pediment (alın üçgeni) */}
    <polygon points="90,95 450,38 810,95" fill="none" stroke="rgba(160,220,255,0.92)" strokeWidth="1.6" filter="url(#bpglow)" />
    <polygon points="170,95 450,52 730,95" fill="none" stroke="rgba(160,220,255,0.35)" strokeWidth="0.7" />
    {/* Akroter */}
    <polygon points="450,38 440,26 460,26" fill="none" stroke="rgba(160,220,255,0.7)" strokeWidth="1" />
    <polygon points="90,95 78,83 90,83" fill="none" stroke="rgba(160,220,255,0.6)" strokeWidth="0.9" />
    <polygon points="810,95 822,83 810,83" fill="none" stroke="rgba(160,220,255,0.6)" strokeWidth="0.9" />
    {/* Arşitrav */}
    <rect x="90" y="95" width="720" height="17" fill="none" stroke="rgba(160,220,255,0.92)" strokeWidth="1.6" filter="url(#bpglow)" />
    <rect x="90" y="112" width="720" height="9" fill="none" stroke="rgba(160,220,255,0.55)" strokeWidth="0.75" />
    {/* Triglifler */}
    {[128, 174, 220, 266, 312, 358, 404, 450, 496, 542, 588, 634, 680, 726, 772].map((x, i) => (
      <g key={i}>
        <rect x={x} y="121" width="22" height="9" fill="none" stroke="rgba(160,220,255,0.45)" strokeWidth="0.55" />
        <line x1={x + 7} y1="121" x2={x + 7} y2="130" stroke="rgba(160,220,255,0.35)" strokeWidth="0.55" />
        <line x1={x + 15} y1="121" x2={x + 15} y2="130" stroke="rgba(160,220,255,0.35)" strokeWidth="0.55" />
      </g>
    ))}
    {/* Sütunlar */}
    {[108, 178, 248, 318, 388, 458, 528, 598, 668, 738].map((x, i) => (
      <g key={i}>
        <path d={`M${x} 130 Q${x - 5} 285 ${x} 430`} fill="none" stroke="rgba(160,220,255,0.88)" strokeWidth="1.3" filter="url(#bpglow)" />
        <path d={`M${x + 48} 130 Q${x + 53} 285 ${x + 48} 430`} fill="none" stroke="rgba(160,220,255,0.88)" strokeWidth="1.3" filter="url(#bpglow)" />
        {[8, 16, 24, 32, 40].map((d, j) => (
          <line key={j} x1={x + d} y1="138" x2={x + d} y2="422" stroke="rgba(160,220,255,0.16)" strokeWidth="0.5" />
        ))}
        <ellipse cx={x + 24} cy={130} rx={29} ry={5} fill="none" stroke="rgba(160,220,255,0.68)" strokeWidth="0.9" />
        <path d={`M${x - 4} 130 Q${x + 6} 124 ${x + 13} 130`} fill="none" stroke="rgba(160,220,255,0.45)" strokeWidth="0.7" />
        <path d={`M${x + 35} 130 Q${x + 42} 124 ${x + 52} 130`} fill="none" stroke="rgba(160,220,255,0.45)" strokeWidth="0.7" />
        <rect x={x - 4} y="430" width="56" height="6" fill="none" stroke="rgba(160,220,255,0.68)" strokeWidth="0.9" />
        <rect x={x - 8} y="436" width="64" height="6" fill="none" stroke="rgba(160,220,255,0.55)" strokeWidth="0.75" />
        <rect x={x - 12} y="442" width="72" height="7" fill="none" stroke="rgba(160,220,255,0.45)" strokeWidth="0.75" />
      </g>
    ))}
    {/* Stylobat */}
    <rect x="78" y="449" width="744" height="11" fill="none" stroke="rgba(160,220,255,0.8)" strokeWidth="1.5" />
    <rect x="66" y="460" width="768" height="7" fill="none" stroke="rgba(160,220,255,0.6)" strokeWidth="1" />
    {/* Etiketler */}
    <line x1="450" y1="38" x2="590" y2="14" stroke="rgba(160,200,255,0.35)" strokeWidth="0.55" />
    <text x="593" y="13" fill="rgba(160,200,255,0.65)" fontSize="7.5" fontFamily="monospace">Akroter</text>
    <line x1="810" y1="112" x2="848" y2="100" stroke="rgba(160,200,255,0.35)" strokeWidth="0.55" />
    <text x="851" y="104" fill="rgba(160,200,255,0.65)" fontSize="7.5" fontFamily="monospace">Arşitrav</text>
    <line x1="810" y1="275" x2="848" y2="265" stroke="rgba(160,200,255,0.35)" strokeWidth="0.55" />
    <text x="851" y="269" fill="rgba(160,200,255,0.65)" fontSize="7.5" fontFamily="monospace">Sütun — İon. Düz.</text>
    <line x1="810" y1="440" x2="848" y2="430" stroke="rgba(160,200,255,0.35)" strokeWidth="0.55" />
    <text x="851" y="434" fill="rgba(160,200,255,0.65)" fontSize="7.5" fontFamily="monospace">Stylobat</text>
    <line x1="108" y1="472" x2="178" y2="472" stroke="rgba(160,200,255,0.3)" strokeWidth="0.55" />
    <line x1="108" y1="468" x2="108" y2="476" stroke="rgba(160,200,255,0.45)" strokeWidth="0.75" />
    <line x1="178" y1="468" x2="178" y2="476" stroke="rgba(160,200,255,0.45)" strokeWidth="0.75" />
    <text x="143" y="474" fill="rgba(160,200,255,0.5)" fontSize="7" textAnchor="middle" fontFamily="monospace" dominantBaseline="hanging">6.35 m</text>
    <circle cx="90" cy="95" r="3" fill="none" stroke="rgba(160,220,255,0.55)" strokeWidth="0.9" />
    <line x1="90" y1="95" x2="76" y2="80" stroke="rgba(160,200,255,0.35)" strokeWidth="0.55" />
    <text x="73" y="78" fill="rgba(160,200,255,0.55)" fontSize="7" textAnchor="end" fontFamily="monospace">R.P.01</text>
    <text x="680" y="476" fill="rgba(160,200,255,0.4)" fontSize="7.5" fontFamily="monospace">KESİT A-A — M 1:200</text>
  </svg>
);

// Oda rozeti önizlemesi (create)
const TEMPLATE_META = {
  software: { iconName: 'cpu',    color: '#1d3461', label: 'Yazılım Geliştirme',
    cols: ['Backlog','Yapılacak','Devam Ediyor','İncelemede','Tamamlandı'],
    labels: [['Bug','rose'],['Özellik','blue'],['Teknik Borç','amber'],['Sprint','green']] },
  design:   { iconName: 'layers', color: '#6d28d9', label: 'Tasarım Stüdyosu',
    cols: ['Brief','Taslak','Tasarım','Revizyon','Teslim'],
    labels: [['UI','purple'],['UX','blue'],['Revizyon','amber'],['Onaylı','green']] },
  personal: { iconName: 'target', color: '#065f46', label: 'Kişisel Yönetim',
    cols: ['Fikirler','Bu Hafta','Yapıyor','Tamamlandı'],
    labels: [['Hedef','blue'],['Alışkanlık','green'],['Proje','amber'],['Kişisel','rose']] },
};

const RoomBadge = ({ name, template }) => {
  const t = TEMPLATE_META[template] || TEMPLATE_META.software;
  if (!name) return null;
  return (
    <div className="room-badge-preview">
      <div className="room-badge-icon" style={{ background: t.color }}>
        <Icon name={t.iconName} size={16} strokeWidth={2} />
      </div>
      <div>
        <div className="room-badge-name">{name}</div>
        <div className="room-badge-type">{t.label} Odası</div>
      </div>
      <div className="room-badge-live">ÖNİZLEME</div>
    </div>
  );
};

// Oda doğrulama kartı (join) — 8 hane girilince gösterilir
const JoinRoomPreview = ({ code, isOnline }) => {
  if (!code || code.length < 8) return null;
  // Mock: gerçek API'de window.API.previewRoom(code) çağrılır
  const mockRooms = {
    'ABCD1234': { name: "Aristo'nun Akademisi", admin: 'Platon', members: 12 },
    'STOA2024': { name: 'Stoa Takımı', admin: 'Marcus Aurelius', members: 7 },
    'FLUX2025': { name: 'Flux Labs', admin: 'Zeno', members: 24 },
  };
  const room = mockRooms[code] || { name: 'Doğrulandı — Aktif Oda', admin: 'Oda Yöneticisi', members: '?' };
  return (
    <div className="join-room-preview" style={{ animation: 'fadeIn 0.35s ease' }}>
      <div className="join-room-status">
        <span className="join-room-dot" />
        <span className="join-room-verified">Oda Doğrulandı</span>
      </div>
      <div className="join-room-name">{room.name}</div>
      <div className="join-room-meta">
        <span>Yönetici: <strong>{room.admin}</strong></span>
        <span>·</span>
        <span>{room.members} üye</span>
      </div>
    </div>
  );
};

// Güvenlik protokolü notu
const SecurityNote = () => (
  <div className="security-note">
    <div className="security-note-icon">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    </div>
    <div className="security-note-text">
      <div className="security-note-title">Güvenlik Protokolü Aktif</div>
      <div className="security-note-body">Bu işlem uçtan uca şifrelenmiş bir tünel üzerinden gerçekleşir. Kodun geçerlilik süresi oda yöneticisi tarafından belirlenir ve tek kullanımlıktır.</div>
    </div>
  </div>
);

// ── BEKLEME LOBİSİ ───────────────────────────────────────────────────────────────
function PendingLobby({ joinedAt, onApproved, onRejected }) {
  const [elapsed, setElapsed] = useAuthState(0);
  const [rejected, setRejected] = useAuthState(false);

  useAuthEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - joinedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [joinedAt]);

  useAuthEffect(() => {
    if (!window.io) return;
    const sock = window.io({ transports: ['websocket', 'polling'] });
    sock.on('join_request_approved', () => { sock.disconnect(); onApproved(); });
    sock.on('join_request_rejected', () => { sock.disconnect(); setRejected(true); });
    return () => sock.disconnect();
  }, []);

  const fmtElapsed = (s) => {
    const m = Math.floor(s / 60);
    return m > 0 ? `${m} dk ${s % 60} sn` : `${s} saniye`;
  };

  if (rejected) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🚫</div>
        <h2 style={{ color: '#ef4444', marginBottom: 8 }}>İstek Reddedildi</h2>
        <p style={{ fontSize: 13, color: 'var(--color-ink-muted, #888)', marginBottom: 28, lineHeight: 1.6 }}>
          Takım sahibi katılım isteğinizi reddetti.<br />Farklı bir kod deneyebilirsiniz.
        </p>
        <button className="auth-submit" onClick={onRejected}>Geri Dön</button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <style>{`@keyframes stoa-ping{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.9);opacity:0}}`}</style>
      <div style={{ position: 'relative', width: 84, height: 84, margin: '0 auto 22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid #1d3461', animation: 'stoa-ping 1.6s ease-out infinite' }} />
        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '2px solid #1d3461', animation: 'stoa-ping 1.6s ease-out infinite 0.4s' }} />
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#1d3461', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
      </div>
      <h2 style={{ marginBottom: 8, fontSize: 20 }}>Onay Bekleniyor</h2>
      <p style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 22, opacity: 0.65 }}>
        Katılım isteğiniz takım sahibine iletildi.<br />
        Onaylandığında otomatik olarak içeri alınacaksınız.
      </p>
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 28px', borderRadius: 12, background: 'rgba(29,52,97,0.06)', border: '1px solid rgba(29,52,97,0.15)', marginBottom: 22 }}>
        <div style={{ fontSize: 11, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bekleme Süresi</div>
        <div style={{ fontSize: 24, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: '#1d3461' }}>
          {fmtElapsed(elapsed)}
        </div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.4 }}>
        Bu pencereyi açık tutun — onay geldiğinde otomatik yönlendirilirsiniz.
      </div>
    </div>
  );
}

// ── 2. ÇALIŞMA ALANI SAYFASI ─────────────────────────────────────────────────────
function WorkspaceSetupPage({ onReady, onLogout }) {
  const [tab, setTab] = React.useState(() => {
    try { return new URLSearchParams(window.location.search).get('join') ? 'join' : 'create'; } catch { return 'create'; }
  });
  const [wsName, setWsName] = React.useState('');
  const [wsTemplate, setWsTemplate] = React.useState('software');
  const [code, setCode] = React.useState(() => {
    try { return new URLSearchParams(window.location.search).get('join') || ''; } catch { return ''; }
  });
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [pendingLobby, setPendingLobby] = React.useState(false);
  const [pendingJoinedAt, setPendingJoinedAt] = React.useState(null);
  const me = window.CURRENT_USER || {};

  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [netFlash, setNetFlash] = React.useState(false);

  useAuthEffect(() => {
    const handleOnline = () => { setIsOnline(true); setNetFlash(true); setTimeout(() => setNetFlash(false), 2500); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!isOnline) { setError('Ağ bağlantısı yok.'); return; }
    if (!wsName.trim()) return;
    setError(''); setBusy(true);
    try { await window.API.createWorkspace({ name: wsName.trim(), template: wsTemplate }); onReady(); }
    catch (err) { setError(err.message || 'Bir hata oluştu'); }
    finally { setBusy(false); }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!isOnline) { setError('Ağ bağlantısı yok.'); return; }
    setError(''); setBusy(true);
    try {
      const res = await window.API.joinWorkspace(code.trim());
      if (res && res.pending) {
        setPendingJoinedAt(Date.now());
        setPendingLobby(true);
      } else {
        onReady();
      }
    }
    catch (err) { setError(err.message || 'Geçersiz davet kodu'); }
    finally { setBusy(false); }
  };

  const joinActive = tab === 'join';

  // Sol arka plan: create → siyah, join → mavi (ilk açılış → mavi çünkü join için default theme var)
  // Tab'e göre sol arka plan rengi değişir
  const leftBg = joinActive ? '#0a1628' : '#0d0d0d';

  // Sağ taraf theme: create → siyah (ink), join → mavi
  const dataVariant = joinActive ? 'ws-join' : 'ws-create';

  if (pendingLobby) {
    return (
      <div className="auth-page workspace-page" data-variant="ws-join">
        <div className="auth-visual ws-blueprint-bg" style={{ background: '#0a1628' }}>
          <div className="ws-bp-overlay" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(29,52,97,0.5) 0%, transparent 70%)' }} />
          <div className="ws-blueprint-content">
            <div className="auth-brand-row" style={{ marginBottom: 28 }}>
              <StoaLogo color="rgba(160,220,255,0.9)" size={36} />
              <div className="auth-brand-text ws-brand" style={{ color: 'rgba(200,230,255,0.95)' }}>
                Stoa<em style={{ color: 'rgba(120,190,255,0.9)' }}>Board</em>
              </div>
            </div>
            <div className="ws-blueprint-drawing"><BlueprintSVG /></div>
            <div className="ws-bp-bottom">
              <div className="ws-bp-title" style={{ color: 'rgba(200,230,255,0.95)' }}>İsteğin <em style={{ color: 'rgba(120,190,255,0.9)' }}>iletildi.</em></div>
              <div className="ws-bp-subtitle" style={{ color: 'rgba(160,200,255,0.65)' }}>Takım sahibi isteğini inceledikten sonra otomatik olarak ekleneceksin.</div>
            </div>
          </div>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-form">
            <PendingLobby
              joinedAt={pendingJoinedAt}
              onApproved={onReady}
              onRejected={() => { setPendingLobby(false); setPendingJoinedAt(null); setError(''); }}
            />
            <div className="auth-foot">
              <a onClick={onLogout} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sistemi Kapat (Çıkış)
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page workspace-page" data-variant={dataVariant}>
      {/* SOL TARAF — BLUEPRINT */}
      <div className="auth-visual ws-blueprint-bg" style={{ background: leftBg, transition: 'background 0.7s ease' }}>
        <div className="ws-bp-overlay" style={{
          background: joinActive
            ? 'radial-gradient(ellipse at 30% 40%, rgba(29,52,97,0.5) 0%, transparent 70%), radial-gradient(ellipse at 80% 80%, rgba(29,52,97,0.3) 0%, transparent 60%)'
            : 'radial-gradient(ellipse at 30% 40%, rgba(40,40,40,0.6) 0%, transparent 70%)'
        }} />

        <div className="ws-blueprint-content">
          {/* Logo + Marka */}
          <div className="auth-brand-row" style={{ marginBottom: 28 }}>
            <StoaLogo
              color={isOnline ? (joinActive ? 'rgba(160,220,255,0.9)' : 'white') : '#ef4444'}
              size={36}
            />
            <div className="auth-brand-text ws-brand" style={{ color: joinActive ? 'rgba(200,230,255,0.95)' : 'white' }}>
              Stoa<em style={{ color: isOnline ? (joinActive ? 'rgba(120,190,255,0.9)' : 'rgba(255,255,255,0.7)') : '#ef4444' }}>Board</em>
            </div>
          </div>

          {/* Blueprint SVG */}
          <div className="ws-blueprint-drawing">
            <BlueprintSVG />
          </div>

          {/* Alt metin + istatistikler */}
          <div className="ws-bp-bottom">
            <div className="ws-bp-title" style={{ color: joinActive ? 'rgba(200,230,255,0.95)' : 'rgba(255,255,255,0.9)' }}>
              Çalışma Alanın <em style={{ color: joinActive ? 'rgba(120,190,255,0.9)' : 'rgba(255,255,255,0.6)' }}>hazır</em> mı?
            </div>
            <div className="ws-bp-subtitle" style={{ color: joinActive ? 'rgba(160,200,255,0.65)' : 'rgba(255,255,255,0.45)' }}>
              Kendi odanı kur veya bir davet koduyla mevcut takıma katıl. Her şey burada inşa edilir.
            </div>
            <div className="ws-bp-stats" style={{ borderColor: joinActive ? 'rgba(160,200,255,0.12)' : 'rgba(255,255,255,0.08)', background: joinActive ? 'rgba(160,200,255,0.05)' : 'rgba(255,255,255,0.04)' }}>
              {[['6k+', 'aktif takım'], ['98%', 'memnuniyet'], ['15sn', 'başlama süresi'], ['15m+', 'görev tamamlandı']].map(([v, l]) => (
                <div key={l}>
                  <strong style={{ color: joinActive ? 'rgba(200,230,255,0.9)' : 'rgba(255,255,255,0.85)' }}>{v}</strong>
                  <span style={{ color: joinActive ? 'rgba(160,200,255,0.55)' : 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</span>
                </div>
              ))}
            </div>
            <div className="ws-bp-footer" style={{ color: joinActive ? 'rgba(160,200,255,0.35)' : 'rgba(255,255,255,0.2)' }}>Güvenli · Hızlı · Ekip odaklı</div>
          </div>
        </div>
      </div>

      {/* SAĞ TARAF */}
      <div className="auth-form-wrap">
        <div className="auth-form">
          {/* Bağlantı kartı — Logo avatar */}
          <div className={`user-session-card ${isOnline ? (netFlash ? 'net-flash' : 'net-online') : 'net-offline'}`}>
            {typeof Avatar !== 'undefined' ? <Avatar member={me} size="md" /> : (
              <div className="ws-logo-avatar" style={{ background: isOnline ? 'var(--ws-theme)' : '#9ca3af', transition: 'background 0.8s ease' }}>
                <StoaLogo color="white" size={22} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>{me.name || 'Kullanıcı'}</div>
              <div style={{ fontSize: 12, color: isOnline ? '#16a34a' : '#dc2626', fontWeight: 500 }}>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                {isOnline
                  ? (netFlash
                      ? <><Icon name="check" size={12} strokeWidth={2.5} /> Bağlantı yeniden kuruldu</>
                      : 'Bağlantı başarılı, oda bekleniyor...')
                  : <><Icon name="bolt" size={12} strokeWidth={2} /> Ağ bağlantısı kesildi</>
                }
              </span>
              </div>
            </div>
            <div style={{ width: 10, height: 10, background: isOnline ? '#22c55e' : '#ef4444', borderRadius: '50%', boxShadow: isOnline ? '0 0 0 3px rgba(34,197,94,0.25)' : '0 0 0 3px rgba(239,68,68,0.25)', transition: 'all 1s ease', flexShrink: 0 }} />
          </div>

          {!isOnline && (
            <div className="error-msg" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <span>İnternet bağlantısı yok. Bağlanmadan oda oluşturulamaz.</span>
            </div>
          )}

          <div className="auth-tabs">
            <button className="tab-btn" data-active={tab === 'create'} onClick={() => { setTab('create'); setError(''); }}>Yeni Oda Kur</button>
            <button className="tab-btn" data-active={tab === 'join'} onClick={() => { setTab('join'); setError(''); }}>Odaya Katıl</button>
          </div>

          {error && <div className="error-msg">{error}</div>}

          {tab === 'create' ? (
            <form className="auth-fields" onSubmit={handleCreate}>
              <div className="field">
                <label className="field-label">ODA / ÇALIŞMA ALANI ADI</label>
                <input className="glow-input" autoFocus placeholder="Örn: Flux Labs, Kişisel Projeler…" value={wsName} onChange={e => setWsName(e.target.value)} required disabled={!isOnline} />
              </div>
              <RoomBadge name={wsName} template={wsTemplate} />
              <div className="field">
                <label className="field-label">ODA TÜRÜ — ÇALIŞMA MODU</label>
                <div className="template-selector">
                  {Object.entries(TEMPLATE_META).map(([key, t]) => (
                    <div key={key} className={`template-card ${wsTemplate === key ? 'selected' : ''}`} onClick={() => setWsTemplate(key)}>
                      <div className="template-icon" style={{ color: t.color }}>
                        <Icon name={t.iconName} size={22} strokeWidth={1.8} />
                      </div>
                      <div className="template-title">{t.label}</div>
                      <div className="template-desc">{t.cols.slice(0,3).join(' · ')}</div>
                      {wsTemplate === key && <div className="template-check"><Icon name="check" size={11} strokeWidth={2.5} /></div>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="room-blueprint">
                <strong>
                  <Icon name="layers" size={14} strokeWidth={2} />
                  Oda Altyapısı — {TEMPLATE_META[wsTemplate]?.label}
                </strong>
                <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Icon name="layoutBoard" size={12} strokeWidth={2} />
                    <span>Kolonlar: {TEMPLATE_META[wsTemplate]?.cols.join(' → ')}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Icon name="tag" size={12} strokeWidth={2} />
                    <span>Etiketler: {TEMPLATE_META[wsTemplate]?.labels.map(([l]) => l).join(', ')}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Icon name="lock" size={12} strokeWidth={2} />
                    <span>Şifreli davet kodu otomatik oluşturulur.</span>
                  </div>
                </div>
              </div>
              <button type="submit" className="auth-submit" disabled={busy || !wsName.trim() || !isOnline}>
                {busy ? 'SİSTEM KURULUYOR…' : 'SİSTEMİ BAŞLAT'}
              </button>
            </form>
          ) : (
            <form className="auth-fields" onSubmit={handleJoin}>
              <div className="field">
                <label className="field-label">GÜVENLİK KODU</label>
                <input className="glow-input" autoFocus placeholder="ABCD1234" value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8}
                  style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.3em', fontSize: 20, textAlign: 'center', textTransform: 'uppercase', fontWeight: 'bold' }}
                  required disabled={!isOnline} />
              </div>
              {/* Dinamik oda önizleme */}
              <JoinRoomPreview code={code} isOnline={isOnline} />
              {/* Güvenlik protokolü notu */}
              <SecurityNote />
              <button type="submit" className="auth-submit" disabled={busy || code.length < 6 || !isOnline}>
                {busy ? 'DOĞRULANIYOR…' : 'İÇERİ GİR'}
              </button>
            </form>
          )}

          <div className="auth-foot">
            <a onClick={onLogout} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Sistemi Kapat (Çıkış)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

window.AuthPage = AuthPage;
window.WorkspaceSetupPage = WorkspaceSetupPage;
