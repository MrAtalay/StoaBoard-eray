// Python karşılığı: app/models.py User.to_dict + AVATAR_COLORS + slug üretme
//
// to_dict çıktısı frontend'in beklediği şekilde olmalı — id alanı slug,
// status default 'offline', vs.

import { prisma } from '../db.js';

export const AVATAR_COLORS = [
  'oklch(55% 0.13 25)',
  'oklch(52% 0.15 270)',
  'oklch(55% 0.09 150)',
  'oklch(50% 0.14 340)',
  'oklch(55% 0.09 230)',
  'oklch(65% 0.11 70)',
  'oklch(50% 0.04 250)',
];

/**
 * Python User.to_dict() ile birebir aynı çıktı.
 * Frontend bu yapıyı bekliyor (static/src/*.jsx içinde her yerde kullanılıyor).
 */
export function userToDict(user) {
  if (!user) return null;
  return {
    id: user.slug,
    name: user.name,
    role: user.roleTitle || '',
    initials: user.avatarInitials || '',
    color: user.avatarColor || 'oklch(58% 0.13 25)',
    avatar_photo_url: user.avatarPhotoUrl || null,
    status: user.status || 'offline',
    away_timeout: user.awayTimeout ?? 15,
  };
}

/**
 * "Ali Veli" → "ali-veli" (sadece a-z, 0-9, tire)
 * Python karşılığı: register() içindeki slug üretimi
 */
export function slugify(name) {
  const base = (name || '').toLowerCase().replace(/\s+/g, '-');
  const cleaned = base.replace(/[^a-z0-9-]/g, '');
  return cleaned || 'user';
}

/**
 * Aynı slug varsa sonuna -1, -2 ekleyerek benzersiz hale getir.
 */
export async function uniqueSlug(baseInput) {
  const base = slugify(baseInput);
  let slug = base;
  let counter = 1;
  // 50 deneme genelde fazlasıyla yeter
  while (await prisma.user.findUnique({ where: { slug } })) {
    slug = `${base}-${counter}`;
    counter += 1;
    if (counter > 1000) break;
  }
  return slug;
}

/**
 * "Ali Veli" → "AV", "Ali" → "A"
 */
export function initialsFromName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
}

/**
 * Toplam kullanıcı sayısına göre dönüşümlü bir avatar rengi seç.
 */
export async function nextAvatarColor() {
  const count = await prisma.user.count();
  return AVATAR_COLORS[count % AVATAR_COLORS.length];
}
