// Python karşılığı: app/routes/auth.py
//
// /api/auth altındaki tüm endpoint'ler. Frontend'in beklediği error code'lar
// ve response yapısı Python tarafıyla birebir aynı tutuldu.

import { Router } from 'express';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { rateLimited, clientIp } from '../lib/rateLimit.js';
import { login as loginSession, logout as logoutSession } from '../lib/session.js';
import {
  userToDict,
  uniqueSlug,
  initialsFromName,
  nextAvatarColor,
} from '../lib/user.js';
import { sendResetEmail } from '../lib/mailer.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const authRouter = Router();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// In-memory reset code store (Python _reset_codes karşılığı, 15dk TTL)
const resetCodes = new Map(); // email -> { code, expiresAt }

// ─── POST /api/auth/login ──────────────────────────────────────────────────

authRouter.post('/login', asyncHandler(async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(`login:${ip}`, 10, 5 * 60 * 1000)) {
    return res.status(429).json({ error: 'err_rate_limit_login' });
  }

  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';

  if (!email || !password) {
    return res.status(400).json({ error: 'err_fields_required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash || '')) {
    return res.status(401).json({ error: 'err_login_invalid' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeen: new Date() },
  });

  loginSession(req, user.id);
  return res.json({ ok: true, user: userToDict(user) });
}));

// ─── POST /api/auth/register ───────────────────────────────────────────────

authRouter.post('/register', asyncHandler(async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'err_rate_limit_register' });
  }

  const name = (req.body?.name || '').trim();
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'err_fields_required' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'err_email_invalid' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'err_pass_short' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'err_email_taken' });
  }

  const slug = await uniqueSlug(name);
  const initials = initialsFromName(name);
  const color = await nextAvatarColor();

  const user = await prisma.user.create({
    data: {
      slug,
      name,
      email,
      avatarInitials: initials,
      avatarColor: color,
      roleTitle: req.body?.role_title || 'Üye',
      passwordHash: hashPassword(password),
    },
  });

  loginSession(req, user.id);
  return res.status(201).json({
    ok: true,
    user: userToDict(user),
    needs_workspace: true,
  });
}));

// ─── POST /api/auth/logout ─────────────────────────────────────────────────

authRouter.post('/logout', asyncHandler(async (req, res) => {
  await logoutSession(req);
  return res.json({ ok: true });
}));

// ─── GET /api/auth/me ──────────────────────────────────────────────────────

authRouter.get('/me', asyncHandler(async (req, res) => {
  const uid = req.session?.userId;
  if (!uid) {
    return res.status(401).json({ error: 'err_auth_required' });
  }
  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) {
    await logoutSession(req);
    return res.status(401).json({ error: 'err_user_not_found' });
  }
  return res.json(userToDict(user));
}));

// ─── POST /api/auth/forgot-password ────────────────────────────────────────

authRouter.post('/forgot-password', asyncHandler(async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(`forgot:${ip}`, 5, 5 * 60 * 1000)) {
    return res.status(429).json({ error: 'err_rate_limit_forgot' });
  }

  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'err_email_invalid' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(404).json({ error: 'err_account_not_found' });
  }

  // 6 haneli kod (100000-999999), Python secrets.randbelow(900000)+100000 karşılığı
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + 15 * 60 * 1000;
  resetCodes.set(email, { code, expiresAt });

  try {
    await sendResetEmail(email, code);
  } catch (err) {
    console.error('[StoaBoard] E-posta gönderilemedi:', err);
    return res.status(500).json({ error: 'err_email_send_failed' });
  }

  return res.json({ ok: true });
}));

// ─── POST /api/auth/reset-password ─────────────────────────────────────────

authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const code = (req.body?.code || '').trim();
  const newPass = (req.body?.password || '').trim();

  if (!email || !code || !newPass) {
    return res.status(400).json({ error: 'err_fields_required' });
  }
  if (newPass.length < 8) {
    return res.status(400).json({ error: 'err_pass_short' });
  }

  const record = resetCodes.get(email);
  if (!record || record.code !== code) {
    return res.status(400).json({ error: 'err_reset_fail' });
  }
  if (Date.now() > record.expiresAt) {
    resetCodes.delete(email);
    return res.status(400).json({ error: 'err_code_expired' });
  }
  resetCodes.delete(email);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(404).json({ error: 'err_user_not_found' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPass) },
  });

  return res.json({ ok: true });
}));

// ─── POST /api/auth/google ─────────────────────────────────────────────────

const googleClient = new OAuth2Client();

authRouter.post('/google', asyncHandler(async (req, res) => {
  const credential = (req.body?.credential || '').trim();
  const clientId = config.googleClientId;

  if (!credential) {
    return res.status(400).json({ error: 'err_google_no_credential' });
  }
  if (!clientId) {
    return res.status(503).json({ error: 'err_google_not_configured' });
  }

  let idinfo;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    idinfo = ticket.getPayload();
  } catch (err) {
    console.error('[Google OAuth] Token doğrulama hatası:', err.message);
    return res.status(401).json({ error: 'err_google_failed' });
  }

  const googleId = idinfo?.sub || '';
  const email = (idinfo?.email || '').trim().toLowerCase();
  const name = (idinfo?.name || email.split('@')[0] || '').trim();
  const picture = idinfo?.picture || null;

  if (!email || !googleId) {
    return res.status(400).json({ error: 'err_google_no_info' });
  }

  let user = await prisma.user.findUnique({ where: { googleId } });
  if (!user) {
    user = await prisma.user.findUnique({ where: { email } });
  }

  let needsWorkspace = false;

  if (!user) {
    const slug = await uniqueSlug(name);
    const initials = initialsFromName(name);
    const color = await nextAvatarColor();

    user = await prisma.user.create({
      data: {
        slug,
        name,
        email,
        googleId,
        avatarInitials: initials,
        avatarColor: color,
        avatarPhotoUrl: picture,
        roleTitle: 'Üye',
      },
    });
    needsWorkspace = true;
  } else {
    const updates = { lastSeen: new Date() };
    if (!user.googleId) updates.googleId = googleId;
    if (picture && !user.avatarPhotoUrl) updates.avatarPhotoUrl = picture;
    user = await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
    });
    if (!membership) needsWorkspace = true;
  }

  loginSession(req, user.id);
  return res.json({
    ok: true,
    user: userToDict(user),
    needs_workspace: needsWorkspace,
  });
}));
