// Python karşılığı: auth.py _send_reset_email
//
// SMTP yapılandırılmışsa gerçek mail atar, değilse konsola yazar (dev mode).

import nodemailer from 'nodemailer';

function readSmtpEnv() {
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: (process.env.SMTP_USER || '').trim(),
    pass: (process.env.SMTP_PASS || '').trim(),
    from: (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim(),
  };
}

let cachedTransporter = null;
function getTransporter(cfg) {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port === 587,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return cachedTransporter;
}

/**
 * Şifre sıfırlama kodunu mail at. SMTP yoksa konsola yaz (dev).
 * Python tarafıyla aynı subject ve gövdeyi kullanır.
 */
export async function sendResetEmail(toEmail, code) {
  const cfg = readSmtpEnv();

  const body =
    `Merhaba,\n\n` +
    `StoaBoard şifre sıfırlama kodunuz:\n\n` +
    `  ${code}\n\n` +
    `Bu kod 15 dakika geçerlidir.\n` +
    `Bu isteği siz yapmadıysanız bu e-postayı görmezden gelin.\n\n` +
    `StoaBoard Ekibi`;

  if (!cfg.host || !cfg.user) {
    console.log(`[StoaBoard DEV] Şifre sıfırlama kodu (${toEmail}): ${code}`);
    return;
  }

  await getTransporter(cfg).sendMail({
    from: cfg.from || 'no-reply@stoaboard.app',
    to: toEmail,
    subject: 'StoaBoard – Şifre Sıfırlama Kodu',
    text: body,
  });
}
