// Serileştirici sözleşmeleri — kusurun yaşadığı yer iki tarafın ARASI.
//
// NİÇİN VAR: Aynı kusur iki gün üst üste, iki ayrı yerde çıktı. `columnToDict`
// kolonun slug'ını `id` adıyla veriyor; tüketici `.slug` diye aradı ve
// `undefined` aldı (9 Eylül MCP araçları, 10 Eylül `weeklyDone` hep sıfır).
// İki tarafa ayrı ayrı bakınca ikisi de doğru görünüyor: üretici tutarlı,
// tüketici makul. Kusur sözleşmelerin arasında ve hiçbir birim testi oraya
// bakmıyor.
//
// DİKKAT — bu dosyanın asıl işi TODO'da yazandan farklı. TODO "her `*ToDict`
// fonksiyonunun ürettiği alan kümesini teste sabitle" diyordu. O tek başına
// yukarıdaki iki kusurun HİÇBİRİNİ yakalamazdı: `columnToDict` hep böyle
// yazıyordu, üretici hiç değişmedi. Alan kümesini dondurmak yalnızca
// "yeniden adlandırıldı / eklendi / silindi" sınıfını yakalar.
//
// O yüzden iki katman var:
//
//   1. ÜRETİCİ ŞEKİL KİLİDİ — her serileştiricinin ürettiği alan kümesi
//      sabitleniyor. Şekil değişince test kırılır ve tüketicilere bakmak
//      zorunlu hâle gelir. Tablo elle bakımlı değil: kaynak taranıyor ve
//      tabloda karşılığı olmayan yeni bir serileştirici testi kırıyor.
//
//   2. DİKİŞ — asıl kusur sınıfı. Tüketici, GERÇEK üretici çıktısıyla
//      besleniyor. `mcp.test.js` bugün `gorevOzeti`/`notOzeti`/`uyeOzeti`
//      testlerini elle yazılmış sözlüklerle besliyor; `columnToDict` kusuru
//      tam bu yüzden hayatta kaldı — testin uydurduğu girdide `slug` vardı,
//      üretici onu hiç yazmıyordu. Uydurulan girdi, uydurulan sözleşmedir.
//
// Kontrast ve vurgu testleri (10 Eylül) bu merdivenin aynı basamağında;
// bu üçüncüsü.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  workspaceToDict, workspaceRoleToDict, projectToDict, columnToDict,
  labelToDictValue, taskToDict, subtaskToDict, commentToDict, taskToDetailDict,
  chatMessageToDict, taskAttachmentToDict, notificationToDict, activityToDict,
} from '../src/lib/serializers.js';
import { userToDict } from '../src/lib/user.js';
import { memberToDict, userPrivateDict } from '../src/lib/workspace.js';
import { noteToDict } from '../src/lib/notes.js';
import { channelToDict } from '../src/lib/channels.js';
import { auditToDict } from '../src/lib/audit.js';
import {
  gorevOzeti, gorevDetayi, acikMi, notOzeti, uyeOzeti,
} from '../src/lib/mcpShape.js';
import { yorumsuzDosya, kaynakDosyalari } from './yardimcilar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, '..', 'src', 'lib');

// ─── Sahte Prisma kayıtları ────────────────────────────────────────────────
//
// Prisma kaydı taklit ediliyor, serileştirici çıktısı DEĞİL. Fark önemli:
// çıktıyı elle yazmak, sözleşmeyi testin uydurması demek olurdu — bu dosyanın
// varlık sebebi tam olarak o hata.

const KULLANICI = {
  id: 5, slug: 'eray-atalay', name: 'Eray Atalay', email: 'eray@ornek.tld',
  roleTitle: 'Kurucu', avatarInitials: 'EA', avatarColor: 'oklch(55% 0.13 25)',
  avatarPhotoUrl: null, status: 'offline', awayTimeout: 15,
};

const KOLON_BITIS = {
  id: 42, slug: 'done', title: 'Done', titleTr: 'Bitti',
  color: 'oklch(55% 0.02 250)', isDone: true, allowedNext: [],
};

const KOLON_ACIK = {
  id: 41, slug: 'todo', title: 'To Do', titleTr: 'Yapılacak',
  color: null, isDone: false, allowedNext: [],
};

const gorevKaydi = (kolon) => ({
  id: 114, title: 'Kart', description: 'açıklama', priority: 'mid',
  dueDate: new Date('2026-09-20T00:00:00.000Z'), startDate: null,
  assigneeDates: {}, progress: 0, projectId: 3,
  createdAt: new Date('2026-09-01T09:30:00.000Z'),
  completedAt: null, deletedAt: null,
  column: kolon, creator: KULLANICI,
  assignees: [{ user: KULLANICI }],
  labelLinks: [{ label: { slug: 'hata' } }],
  subtasks: [{ id: 1, title: 'alt iş', done: true }],
  comments: [{
    id: 9, user: KULLANICI, text: 'yorum',
    createdAt: new Date('2026-09-12T08:00:00.000Z'),
  }],
});

const NOT_KAYDI = {
  id: 7, title: 'Gereksinim', body: 'gövde metni', labels: [],
  visibility: 'private', status: 'draft', pinned: false, archived: false,
  deletedAt: null, workspaceId: 1, author: KULLANICI,
  collaborators: [{ user: KULLANICI }], linkedTasks: [{ taskId: 114 }],
  createdAt: new Date('2026-09-10T08:00:00.000Z'),
  updatedAt: new Date('2026-09-10T08:00:00.000Z'),
};

const UYELIK = {
  role: 'owner', roleTitle: 'Kurucu', roleId: 2, user: KULLANICI,
  workspaceRole: { name: 'Yönetici', color: 'mavi', permissions: ['manage_tasks'] },
};

const ALAN = { id: 1, name: 'Mytherra', slug: 'mytherra', ownerId: 5, logoUrl: null };

const KANAL = {
  id: 12, slug: 'genel', name: 'Genel', description: '', type: 'public',
  icon: 'hash', isDefault: true, createdBy: 5,
  members: [{ userId: 5, role: 'admin', user: KULLANICI, joinedAt: new Date('2026-09-01T00:00:00.000Z') }],
  lastMessage: {
    id: 3, text: 'selam', fileName: null,
    createdAt: new Date('2026-09-12T09:00:00.000Z'), sender: KULLANICI,
  },
};

const MESAJ = {
  id: 3, sender: KULLANICI, receiver: KULLANICI, receiverId: 5,
  createdAt: new Date('2026-09-12T09:00:00.000Z'), channel: 'genel',
  pinned: false, isRead: true, text: 'selam',
  replyToId: 2, replyToSender: 'eray-atalay', replyToText: 'önceki',
  fileUrl: '/x.png', fileType: 'image', fileName: 'x.png',
};

// ─── 1. Üretici şekil kilidi ───────────────────────────────────────────────

const SOZLESME = [
  ['workspaceToDict', () => workspaceToDict(ALAN),
    ['id', 'name', 'slug', 'owner_id', 'logo_url']],
  ['workspaceRoleToDict', () => workspaceRoleToDict({ id: 2, name: 'Yönetici', color: 'mavi', permissions: [], isDefault: true }),
    ['id', 'name', 'color', 'permissions', 'is_default']],
  ['projectToDict', () => projectToDict({ id: 3, name: 'Ana', color: 'mavi', icon: 'folder' }, { openCount: 6 }),
    ['id', 'name', 'color', 'open', 'icon']],
  ['columnToDict', () => columnToDict(KOLON_BITIS),
    ['id', 'db_id', 'title', 'title_tr', 'color', 'is_done', 'allowed_next']],
  ['labelToDictValue', () => labelToDictValue({ nameEn: 'bug', nameTr: 'hata', colorTone: 'kirmizi' }),
    ['en', 'tr', 'tone']],
  ['taskToDict', () => taskToDict(gorevKaydi(KOLON_ACIK)),
    ['id', 'col', 'title', 'desc', 'labels', 'priority', 'assignees', 'due', 'start',
      'assignee_dates', 'progress', 'comments', 'attachments', 'project_id',
      'created_by', 'created_at', 'completed_at', 'deleted_at', 'subtasks']],
  ['subtaskToDict', () => subtaskToDict({ id: 1, title: 'alt iş', done: true }),
    ['id', 'text', 'done']],
  ['commentToDict', () => commentToDict({ id: 9, user: KULLANICI, createdAt: new Date(), text: 'yorum' }),
    ['id', 'author', 'time', 'text']],
  ['taskToDetailDict', () => taskToDetailDict(gorevKaydi(KOLON_ACIK)),
    ['id', 'col', 'title', 'desc', 'labels', 'priority', 'assignees', 'due', 'start',
      'assignee_dates', 'progress', 'comments', 'attachments', 'project_id',
      'created_by', 'created_at', 'completed_at', 'deleted_at', 'subtasks',
      'comments_list', 'subtasks_detail', 'doc']],
  ['chatMessageToDict', () => chatMessageToDict(MESAJ),
    ['id', 'from', 'to', 'time', 'ts', 'channel', 'pinned', 'is_read',
      'reply_to', 'text', 'file_url', 'file_type', 'file_name']],
  ['taskAttachmentToDict', () => taskAttachmentToDict({ id: 4, fileName: 'a.png', displayName: null, fileType: 'image', uploader: KULLANICI, createdAt: new Date() }),
    ['id', 'file_name', 'display_name', 'file_type', 'url', 'uploader', 'created_at']],
  ['notificationToDict', () => notificationToDict({ id: 8, read: false, createdAt: new Date(), text: 'bildirim', taskId: 114, senderSlug: 'eray-atalay', workspaceId: 1, chatChannel: null, messageId: null }),
    ['id', 'unread', 'time', 'text', 'task_id', 'sender_slug', 'workspace_id',
      'chat_channel', 'message_id']],
  ['activityToDict', () => activityToDict({ user: KULLANICI, createdAt: new Date(), text: 'olay' }),
    ['who', 'time', 'text']],
  ['userToDict', () => userToDict(KULLANICI),
    ['id', 'name', 'role', 'initials', 'color', 'avatar_photo_url', 'status', 'away_timeout']],
  ['memberToDict', () => memberToDict(UYELIK),
    ['id', 'name', 'role', 'initials', 'color', 'avatar_photo_url', 'status',
      'away_timeout', 'ws_role', 'role_id', 'role_name', 'role_color', 'role_permissions']],
  ['userPrivateDict', () => userPrivateDict(KULLANICI, UYELIK),
    ['id', 'name', 'role', 'initials', 'color', 'avatar_photo_url', 'status',
      'away_timeout', 'email']],
  ['noteToDict', () => noteToDict(NOT_KAYDI),
    ['id', 'title', 'labels', 'visibility', 'status', 'pinned', 'archived',
      'deleted_at', 'author', 'collaborators', 'linked_tasks', 'workspace_id',
      'created_at', 'updated_at', 'updated_ago', 'body', 'preview']],
  ['channelToDict', () => channelToDict(KANAL, { currentUserId: 5, includeMembers: true }),
    ['id', 'channel_id', 'slug', 'name', 'description', 'type', 'icon',
      'is_default', 'created_by', 'member_count', 'my_role', 'is_member',
      'members', 'last_message']],
  ['auditToDict', () => auditToDict({ id: 11, action: 'mcp.task_created', userId: 5, userName: 'Eray', detail: null, ip: null, userAgent: null, at: new Date() }),
    ['id', 'action', 'user_id', 'user_name', 'detail', 'ip', 'user_agent', 'at']],
];

describe('serileştirici şekli — alan kümesi sabit', () => {
  for (const [ad, uret, beklenen] of SOZLESME) {
    test(`${ad} tam olarak sözleşmedeki alanları veriyor`, () => {
      assert.deepEqual(
        Object.keys(uret()).sort(), [...beklenen].sort(),
        `${ad} şekli değişti. Tüketicilere bak: bu sözlüğü okuyan her yer `
        + '(client/src, mcpShape.js, raporlama) yeni alanı bilmiyor ya da '
        + 'kaybolan alanı hâlâ okuyor olabilir.',
      );
    });
  }

  test('tabloda karşılığı olmayan serileştirici yok', () => {
    // Tablo elle bakımlı olsaydı bayatlardı: yeni bir serileştirici eklenir,
    // kimse tabloya yazmaz, sözleşme sessizce korumasız kalırdı. Kaynak
    // taranıyor — yorumlar boşaltılarak, çünkü yorumdaki örnek kod da
    // `export function ...ToDict` gibi görünebilir (yardimcilar.js).
    const dosyalar = kaynakDosyalari(LIB, /\.js$/);
    const bulunan = new Set();
    for (const tam of dosyalar) {
      const src = yorumsuzDosya(tam);
      for (const m of src.matchAll(/export function (\w+)/g)) {
        if (/(ToDict|ToDictValue|ToDetailDict|PrivateDict)$/.test(m[1])) bulunan.add(m[1]);
      }
    }
    assert.ok(bulunan.size >= 15, `tarama bozuk — yalnızca ${bulunan.size} serileştirici bulundu`);

    const tabloda = new Set(SOZLESME.map(([ad]) => ad));
    const eksik = [...bulunan].filter((ad) => !tabloda.has(ad)).sort();
    assert.deepEqual(
      eksik, [],
      'Bu serileştiricilerin sözleşmesi teste bağlı değil. SOZLESME tablosuna '
      + 'ürettiği alan kümesiyle ekle.',
    );
  });
});

// ─── 2. Dikiş: tüketici gerçek üretici çıktısıyla besleniyor ───────────────

describe('dikiş — bitiş kolonu kümesi ile kartın kolonu aynı uzayda', () => {
  // KUSURUN KENDİSİ. `routes/mcp.js` bitiş kümesini şöyle kuruyor:
  //     new Set(kolonlar.filter((c) => c.is_done).map((c) => c.id))
  // `mcpShape` ise şöyle soruyor:
  //     bitisKolonlari.has(gorev.col)
  // Biri `columnToDict().id`, öteki `taskToDict().col`. Bugün örtüşüyorlar
  // ÇÜNKÜ ikisi de kolonun slug'ı. Biri "düzeltilip" `id` sayısal yapılsa
  // küme sayılarla dolar, `has(slug)` hep false döner ve HER KART AÇIK
  // görünür — tek bir test kırılmadan. `weeklyDone` hep sıfır kusuru bu
  // dikişin öbür ucuydu: tüketici `.slug` okuyup `undefined` küme kurmuştu.
  const kolonlar = [columnToDict(KOLON_ACIK), columnToDict(KOLON_BITIS)];
  const bitisKumesi = new Set(kolonlar.filter((c) => c.is_done).map((c) => c.id));

  test('kolon sözlüğündeki adresleme alanı, kart sözlüğündeki kolon alanıyla eşleşiyor', () => {
    assert.equal(
      columnToDict(KOLON_BITIS).id, taskToDict(gorevKaydi(KOLON_BITIS)).col,
      'columnToDict kartı adresleyen alanı değiştirmiş. Bitiş kolonu kümesi '
      + 'artık kartın kolonuyla eşleşmiyor; her kart açık görünür.',
    );
  });

  test('bitiş kolonundaki kart açık sayılmıyor', () => {
    const kart = taskToDict(gorevKaydi(KOLON_BITIS));
    assert.equal(acikMi(kart, bitisKumesi), false);
    assert.equal(gorevOzeti(kart, { bitisKolonlari: bitisKumesi }).col_is_done, true);
  });

  test('açık kolondaki kart açık sayılıyor', () => {
    const kart = taskToDict(gorevKaydi(KOLON_ACIK));
    assert.equal(acikMi(kart, bitisKumesi), true);
    assert.equal(gorevOzeti(kart, { bitisKolonlari: bitisKumesi }).col_is_done, false);
  });

  test('gorevDetayi de aynı kümeyle çalışıyor', () => {
    const kart = taskToDict(gorevKaydi(KOLON_BITIS));
    assert.equal(gorevDetayi(kart, { bitisKolonlari: bitisKumesi }).col_is_done, true);
  });

  test('küme boş değil — tarama gerçekten bir şey ölçüyor', () => {
    // Küme boş kalsaydı üstteki testlerin yarısı sessizce geçerdi.
    assert.equal(bitisKumesi.size, 1, 'bitiş kolonu kümesi beklenen gibi kurulmadı');
  });
});

describe('dikiş — MCP özetleri gerçek serileştirici çıktısını okuyor', () => {
  test('uyeOzeti slug’ı memberToDict zincirinden doğru alıyor', () => {
    // `userToDict` slug'ı `id` alanında taşıyor; `uyeOzeti` onu `slug` diye
    // yeniden adlandırıyor. Zincirin iki ucu da gerçek kodla sınanıyor.
    const d = uyeOzeti(memberToDict(UYELIK));
    assert.equal(d.slug, KULLANICI.slug, 'üye slug zinciri kopmuş');
    assert.equal(d.name, KULLANICI.name);
  });

  test('uyeOzeti owner izinlerini rol satırından bağımsız veriyor', () => {
    const d = uyeOzeti(memberToDict(UYELIK));
    assert.ok(d.permissions.length > 1, 'owner izinleri memberPermissions’tan gelmiyor');
  });

  test('notOzeti düşürdüğü alan üreticide gerçekten var', () => {
    // Bu testin asıl işi `mcp.test.js`teki "updated_ago düşürülüyor" testini
    // BOŞ GEÇMEKTEN kurtarmak: üretici o alanı yazmayı bıraksa oradaki test
    // hiçbir şey ölçmeden geçmeye devam ederdi.
    const ham = noteToDict(NOT_KAYDI);
    assert.ok('updated_ago' in ham, 'noteToDict artık updated_ago yazmıyor — '
      + 'mcpShape’teki düşürme kuralı ve onun testi anlamsızlaştı');
    assert.equal('updated_ago' in notOzeti(ham), false);
  });

  test('gorevOzeti kimlikleri metne çekiyor — üretici sayı verse bile', () => {
    const kart = taskToDict(gorevKaydi(KOLON_ACIK));
    // `project_id` üreticide HAM SAYI (taskToDict onu String'e çevirmiyor),
    // `id` ise metin. MCP yüzeyi ikisini de metne çekmek zorunda.
    assert.equal(typeof kart.project_id, 'number', 'üretici sözleşmesi değişmiş');
    const d = gorevOzeti(kart, { bitisKolonlari: new Set() });
    assert.equal(d.id, '114');
    assert.equal(d.project_id, '3');
  });
});

// ─── 3. Kimlik anlamları ───────────────────────────────────────────────────

describe('kimlik alanı — üç ayrı anlam, üçü de kilitli', () => {
  // `id` bu depoda üç şey demek ve karışması gerçek kusur üretti. Buradaki
  // tablo onları tek yerde görünür kılıyor: değişirse test kırılır, kimse
  // "id nasılsa sayıdır" varsayamaz.
  test('slug taşıyanlar', () => {
    assert.equal(columnToDict(KOLON_BITIS).id, 'done');
    assert.equal(userToDict(KULLANICI).id, 'eray-atalay');
    assert.equal(channelToDict(KANAL).id, 'genel');
  });

  test('metne çevrilmiş sayı taşıyanlar', () => {
    assert.equal(projectToDict({ id: 3 }).id, '3');
    assert.equal(taskToDict(gorevKaydi(KOLON_ACIK)).id, '114');
    assert.equal(notificationToDict({ id: 8, createdAt: new Date() }).id, '8');
    assert.equal(auditToDict({ id: 11, at: new Date() }).id, '11');
  });

  test('ham sayı taşıyanlar', () => {
    assert.equal(noteToDict(NOT_KAYDI).id, 7);
    assert.equal(subtaskToDict({ id: 1, title: 'x', done: false }).id, 1);
    assert.equal(commentToDict({ id: 9, createdAt: new Date() }).id, 9);
  });

  test('kolon sayısal kimliğini ayrı alanda saklıyor', () => {
    // `db_id` olmasaydı slug'ı `id`ye koymak bilgiyi tamamen kaybettirirdi.
    assert.equal(columnToDict(KOLON_BITIS).db_id, 42);
  });
});
