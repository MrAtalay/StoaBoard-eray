// Python karşılığı: config.py
// Tüm environment değişkenlerini tek yerden okur, defaults verir.

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const isProduction =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT);

function asBool(name, defaultValue = false) {
  const v = process.env[name];
  if (v === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function splitOrigins(value) {
  const list = (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1 && list[0] === '*') return '*';
  return list;
}

function getSecretKey() {
  // env > .secret_key file > rastgele üret ve kaydet (sadece dev)
  const envKey = process.env.SECRET_KEY;
  if (envKey) return envKey;
  if (isProduction) {
    throw new Error('SECRET_KEY must be set in production.');
  }
  // Dev için kalıcı bir secret üret/oku — server/.secret_key
  const keyFile = path.join(ROOT_DIR, '.secret_key');
  if (fs.existsSync(keyFile)) {
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    if (key) return key;
  }
  const key = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(keyFile, key);
  } catch {
    // ignore — yazma izni yoksa rastgele üretileni kullan
  }
  return key;
}

export const config = {
  isProduction,
  port: parseInt(process.env.PORT || '5000', 10),
  secretKey: getSecretKey(),
  corsOrigins: splitOrigins(process.env.CORS_ORIGINS),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  session: {
    cookieName: 'stoa_session',
    cookieSecure: asBool('SESSION_COOKIE_SECURE', isProduction),
    cookieHttpOnly: true,
    cookieSameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 gün
  },
  maxContentLength: 10 * 1024 * 1024, // 10 MB
  staticDir: path.resolve(ROOT_DIR, '..', 'static'),
  viewsDir: path.resolve(ROOT_DIR, 'views'),
};
