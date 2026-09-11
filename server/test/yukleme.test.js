// Yükleme (smoke) testi — bütün sunucu modülleri hatasız içe aktarılıyor mu?
//
// Neden var: `node --check` yalnızca sözdizimine bakar. Eksik bir import,
// yanlış yazılmış bir dosya adı ya da dairesel bağımlılık ondan geçer ve
// yalnızca çalışma anında patlar. 1 Eylül 2026'da api.js'e hasPermission
// kullanımı eklenmiş ama importu unutulmuştu; sözdizimi temizdi, uygulama
// açılışta ReferenceError verecekti.
//
// Veritabanı gerektirmez: db.js warmup sorgusunu kendi içinde yakalıyor,
// bağlantı yoksa yalnızca uyarı yazıyor.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const MODULLER = [
  '../src/lib/permissions.js',
  '../src/lib/csv.js',
  '../src/lib/audit.js',
  '../src/lib/sessionStore.js',
  '../src/lib/reporting.js',
  '../src/lib/mailer.js',
  '../src/lib/workspace.js',
  '../src/lib/notifications.js',
  '../src/lib/channels.js',
  '../src/lib/serializers.js',
  '../src/lib/projects.js',
  '../src/lib/lang.js',
  // MCP zinciri. `app.js` bunları zaten çekiyor, yani kırık bir import
  // yakalanıyordu — ama hangi modülün kırıldığını söylemeden. Adı geçen bir
  // test, yığın izi okumaktan hızlı.
  '../src/lib/mcpToken.js',
  '../src/lib/mcpAuth.js',
  '../src/lib/mcpShape.js',
  '../src/lib/selfApi.js',
  '../src/routes/mcp.js',
  '../src/routes/reports.js',
  '../src/routes/tasks.js',
  '../src/routes/projects.js',
  '../src/routes/chat.js',
  '../src/routes/channels.js',
  '../src/routes/auth.js',
  '../src/routes/api.js',
  '../src/routes/workspaces.js',
  '../src/routes/notes.js',
  '../src/routes/notifications.js',
  '../src/routes/attachments.js',
  '../src/sockets/chat.js',
  '../src/app.js',
];

for (const mod of MODULLER) {
  test(`yüklenir: ${mod.replace('../src/', '')}`, async () => {
    const m = await import(mod);
    assert.ok(m, `${mod} boş döndü`);
  });
}
