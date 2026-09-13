// MCP anahtarlarının çözümlenmesi — saf, bağımlılıksız.
//
// `lib/permissions.js` ile aynı gerekçeyle ayrı duruyor: kimlik çözümlemesi
// kodun en kritik parçası ve test edilebilmesi için ne veritabanına ne de
// config'e ihtiyaç duymalı. Bu dosya yalnızca node:crypto'ya bağlı.
//
// Anahtarlar neden veritabanında değil: şema değişikliği bu depoda bilinçli ve
// elle yapılan bir iş (CLAUDE.md, tuzaklar). Üç kişilik ekip için bir tablo
// açmak o zinciri işletmeye değmedi. Ödünü açık: iptal/rotasyon arayüzü yok,
// anahtar değiştirmek ortam değişkenini düzenleyip yeniden dağıtmak demek.
// Ekip büyüdüğünde `ApiToken` tablosuna geçilir; o gün geldiğinde değişecek
// tek yer burası, çağrı yerleri değil.

import crypto from 'node:crypto';

/**
 * Kabul edilen en kısa anahtar uzunluğu.
 *
 * Kısa anahtar, olmayan anahtardan tehlikelidir: koruma varmış gibi görünür.
 * Sınırın altındaki giriş sessizce kabul edilmiyor, gürültüyle atılıyor.
 */
export const MIN_TOKEN_LENGTH = 24;

/** Anahtarın SHA-256 özeti (hex). */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * `STOA_MCP_TOKENS` değerini çözümler.
 *
 * Biçim: virgül ya da satır sonuyla ayrılmış `slug:anahtar` çiftleri.
 *
 *   STOA_MCP_TOKENS="eray:s0k2...,ahmet:9fd1..."
 *
 * Anahtar kişiye bağlıdır, ekibe değil. Ortak anahtar kullanılsaydı denetim
 * kaydında "bunu kim yaptı" sorusunun cevabı olmazdı ve bildirimin kime
 * gideceği belirsiz kalırdı.
 *
 * Ham anahtar bellekte tutulmaz; harita anahtarın özetini taşır. Böylece
 * çalışan süreçten (bellek dökümü, hata ayıklayıcı) anahtarın kendisi okunamaz
 * ve karşılaştırma, girdinin içeriğine göre kısalmayan tek bir harita
 * aramasına iner.
 *
 * @returns {{ tokens: Map<string,string>, warnings: string[] }}
 *   tokens: anahtar özeti → kullanıcı slug'ı
 *   warnings: atılan girdilerin gerekçesi (çağıran bunları yüksek sesle basar)
 */
export function parseMcpTokens(raw) {
  const tokens = new Map();
  const warnings = [];
  if (!raw || !String(raw).trim()) return { tokens, warnings };

  // Aynı anahtarın iki kez geçmesi kimliği belirsiz bırakır. Böyle bir girdi
  // "muhtemelen ilki kastedilmiştir" diye yorumlanmaz — ikisi de düşürülür.
  const cakisan = new Set();

  for (const ham of String(raw).split(/[,\n\r]+/)) {
    const parca = ham.trim();
    if (!parca) continue;

    const ayirac = parca.indexOf(':');
    if (ayirac < 0) {
      warnings.push(`biçim hatalı (slug:anahtar bekleniyordu): "${kirp(parca)}"`);
      continue;
    }

    const slug = parca.slice(0, ayirac).trim().toLowerCase();
    const token = parca.slice(ayirac + 1).trim();

    if (!/^[a-z0-9][a-z0-9._-]{0,59}$/.test(slug)) {
      warnings.push(`kullanıcı slug'ı geçersiz: "${kirp(slug)}"`);
      continue;
    }
    if (token.length < MIN_TOKEN_LENGTH) {
      warnings.push(
        `"${slug}" anahtarı çok kısa (${token.length} karakter, en az ${MIN_TOKEN_LENGTH}) — atlandı`,
      );
      continue;
    }

    const ozet = hashToken(token);
    if (tokens.has(ozet)) {
      cakisan.add(ozet);
      warnings.push(
        `aynı anahtar birden fazla kullanıcıya verilmiş ("${tokens.get(ozet)}" ve "${slug}") — ikisi de atlandı`,
      );
      continue;
    }
    tokens.set(ozet, slug);
  }

  for (const ozet of cakisan) tokens.delete(ozet);

  return { tokens, warnings };
}

/**
 * Sunulan anahtara karşılık gelen kullanıcı slug'ı; yoksa null.
 *
 * Kapalı başarısızlık: harita boşsa (değişken tanımsız ya da tamamı atılmış)
 * her anahtar reddedilir. "Yapılandırılmamışsa serbest bırak" davranışı,
 * bu depodaki üç kusurun kök sebebi olan sessiz atlamanın ta kendisi olurdu.
 */
export function lookupSlug(tokens, presented) {
  if (!tokens || tokens.size === 0) return null;
  if (typeof presented !== 'string' || presented.length < MIN_TOKEN_LENGTH) return null;
  return tokens.get(hashToken(presented)) || null;
}

/**
 * Yüklenen anahtarların açılış satırı: slug ve özetin ilk 8 hanesi.
 *
 * 11 Eylül 2026'da canlıya karşı tarama 401 aldı ve sebep bir saat dağıtımda
 * arandı; asıl sebep taramanın, kök `.env`'deki yeni anahtar yerine
 * `server/.env`'deki eskisini göndermesiydi. Ne betik hangi anahtarı
 * gönderdiğini söylüyordu ne sunucu hangilerini yüklediğini. Bu satır sunucu
 * tarafı; `mcp:tara` aynı öneki kendi başlığında basıyor ve ikisi yan yana
 * konunca "gönderilen anahtar sunucuda var mı" tek bakışta cevaplanıyor.
 *
 * Önek anahtarın özetinden alınıyor, anahtarın kendisinden değil: 32 bitlik
 * bir SHA-256 öneki rastgele bir anahtarı geri üretmeye yaramaz. Harita zaten
 * ham anahtar tutmuyor, yani burası ham değere hiç erişemiyor.
 *
 * Harita boşsa `null` — çağıran bunu bir uyarıya çevirmek zorunda; sessiz
 * kalmak "özellik neden çalışmıyor" sorusunu yine saatlere uzatırdı.
 */
export function anahtarOzetSatiri(tokens) {
  if (!tokens || tokens.size === 0) return null;
  const parcalar = [...tokens].map(([ozet, slug]) => `${slug} (${String(ozet).slice(0, 8)})`);
  return `${tokens.size} anahtar: ${parcalar.join(', ')}`;
}

/** Uyarı metinlerinde ham değeri kısaltır — anahtarın tamamı loga düşmesin. */
function kirp(s) {
  const t = String(s);
  return t.length > 12 ? `${t.slice(0, 12)}…` : t;
}
