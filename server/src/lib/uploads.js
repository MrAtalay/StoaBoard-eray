// Python karşılığı: api.py _store_file_in_db + multer setup
//
// Dosyaları memory'de tut → uploaded_files tablosuna bytes olarak yaz.
// (Python tarafı da DB'de saklıyordu — Railway efemer disk için.)

import multer from 'multer';
import { prisma } from '../db.js';

// Bellek-içi storage; small files için yeterli (10 MB üst sınır).
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Avatar için ayrı, daha sıkı bir limit (5 MB)
export const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    if (!ok) return cb(new Error('Geçersiz dosya türü'));
    cb(null, true);
  },
});

/**
 * Memory'deki dosyayı uploaded_files tablosuna kaydeder.
 * Python _store_file_in_db karşılığı.
 */
export async function storeFile(file, purpose = 'chat') {
  return prisma.uploadedFile.create({
    data: {
      filename: file.originalname || 'file',
      contentType: file.mimetype || 'application/octet-stream',
      purpose,
      data: file.buffer,
      size: file.size,
    },
  });
}
