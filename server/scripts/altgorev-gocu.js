// Alt görevin iki kaynağını tek kaynağa indiren göç — tek seferlik, tekrar
// koşulabilir.
//
//   node scripts/altgorev-gocu.js            DENEME: hiçbir şey yazmaz, planı basar
//   node scripts/altgorev-gocu.js --uygula   önce yedeği diske döker, sonra yazar
//
// ── Ne yapıyor ────────────────────────────────────────────────────────────
//
// 1. Saklı `doc`unda kontrol listesi bloğu olan her kart (çöptekiler dahil —
//    geri alınan kart da tutarlı dönsün): maddeler `subtasks` satırlarına
//    katılır, blok ve önündeki üretilmiş "Alt görevler" başlığı doc'tan
//    çıkarılır. Birleştirme kuralı `lib/checklist.js` içinde ve testli:
//    eşleşen maddede işaret doc'tan alınır, eşleşmeyen madde yeni satır olur,
//    doc'ta olmayan tablo satırı SİLİNMEZ.
// 2. Her kartın ilerlemesi tek kurala göre yeniden türetilir
//    (`ilerlemeHesapla`: bitmiş kolon 100, değilse alt görev oranı, alt görev
//    yoksa 0). Kolondan kopmuş %100'ler burada düzelir.
//
// ── Neden iki kez koşulur ─────────────────────────────────────────────────
//
// Dağıtımdan ÖNCE ve SONRA. Arada eski arayüzü açık biri doc'a yeniden liste
// yazabilir; yeni sunucu bunu reddediyor ama eski sunucu reddetmiyordu. İkinci
// koşu normalde "yapılacak bir şey yok" der; bir şey bulursa aynı kuralla
// katar. Plan her koşuda veriden yeniden kuruluyor, yani ikinci koşu ilkinin
// yaptığını tekrar etmez (testte: "plan iki kez uygulanırsa ikincisi boş").
//
// ── Yedek ─────────────────────────────────────────────────────────────────
//
// `--uygula` yazmadan önce etkilenecek her kartın `doc`, `progress` ve alt görev
// satırlarını JSON olarak işletim sisteminin geçici dizinine döker ve yolunu
// basar. Geri dönüş gerekirse kaynak orası. Denetim kaydına yazılmıyor: bu bir
// kullanıcı eylemi değil, şema düzeyinde bir veri düzeltmesi.
//
// Bağlantı `server/.env` içindeki DATABASE_URL — betik hangi sunucuya
// baktığını en başta basıyor. Yanlış veritabanında `--uygula` koşma.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Prisma } from '@prisma/client';

import { prisma } from '../src/db.js';
import {
  docKontrolListesiVarMi,
  docKontrolListesiz,
  kontrolListesiMaddeleri,
  kontrolListesiBirlestir,
  ilerlemeHesapla,
} from '../src/lib/checklist.js';

const UYGULA = process.argv.includes('--uygula');
const sunucu = (/@([^/:?]+)/.exec(process.env.DATABASE_URL || '') || [])[1] || 'tanımsız';

console.log(`Alt görev göçü — ${UYGULA ? 'UYGULAMA' : 'DENEME (hiçbir şey yazılmayacak)'}`);
console.log(`veritabanı: ${sunucu}\n`);

const kartlar = await prisma.task.findMany({
  select: {
    id: true, projectId: true, progress: true, doc: true, deletedAt: true,
    column: { select: { slug: true, isDone: true } },
    subtasks: { select: { id: true, title: true, done: true, position: true }, orderBy: { position: 'asc' } },
  },
  orderBy: { id: 'asc' },
});

const planlar = [];
for (const k of kartlar) {
  const listeli = docKontrolListesiVarMi(k.doc);
  let guncelle = [];
  let ekle = [];
  let yeniDoc = null;
  if (listeli) {
    ({ guncelle, ekle } = kontrolListesiBirlestir({
      docMaddeler: kontrolListesiMaddeleri(k.doc),
      altlar: k.subtasks,
    }));
    const ayik = docKontrolListesiz(k.doc);
    yeniDoc = ayik.length ? ayik : null;
  }

  // İlerleme göçten SONRAKİ alt görev kümesinden hesaplanıyor.
  const sonrakiAltlar = [
    ...k.subtasks.map((s) => ({ done: guncelle.find((g) => g.id === s.id)?.done ?? s.done })),
    ...ekle.map((e) => ({ done: e.done })),
  ];
  const kolonBitti = k.column?.isDone === true;
  const ilerleme = ilerlemeHesapla({ altlar: sonrakiAltlar, kolonBitti });
  const eskiIlerleme = k.progress ?? 0;

  if (listeli || ilerleme !== eskiIlerleme) {
    planlar.push({ k, listeli, guncelle, ekle, yeniDoc, ilerleme, eskiIlerleme, kolonBitti, altSayisi: sonrakiAltlar.length });
  }
}

// ─── Plan ──────────────────────────────────────────────────────────────────

const etiket = (p) => `#${p.k.id} (proje ${p.k.projectId}, ${p.k.column?.slug ?? 'kolonsuz'}${p.k.deletedAt ? ', çöpte' : ''})`;

const listeliler = planlar.filter((p) => p.listeli);
console.log(`1) Kontrol listesi taşıyan kart: ${listeliler.length}`);
for (const p of listeliler) {
  const maddeler = kontrolListesiMaddeleri(p.k.doc).length;
  console.log(`   ${etiket(p)}  doc ${maddeler} madde · tablo ${p.k.subtasks.length} satır`
    + ` → işaret düzelt ${p.guncelle.length}, yeni satır ${p.ekle.length}; doc bloğu çıkarılır`
    + `${p.yeniDoc ? '' : ' (doc boşalıyor → null)'}`);
  for (const g of p.guncelle) console.log(`      işaret: alt görev ${g.id} → ${g.done ? 'yapıldı' : 'yapılmadı'}`);
  for (const e of p.ekle) console.log(`      yeni:   "${e.title.slice(0, 60)}"${e.done ? ' (yapıldı)' : ''}`);
}

const ilerlemeDegisen = planlar.filter((p) => p.ilerleme !== p.eskiIlerleme);
console.log(`\n2) İlerlemesi değişen kart: ${ilerlemeDegisen.length}`);
for (const p of ilerlemeDegisen) {
  const neden = p.kolonBitti ? 'bitmiş kolon' : (p.altSayisi ? `${p.altSayisi} alt görevden` : 'alt görev yok');
  console.log(`   ${etiket(p)}  ${p.eskiIlerleme} → ${p.ilerleme}  (${neden})`);
}

// `subtasks.title` VARCHAR(500). Uzun madde kırpılmıyor — kırpmak sessiz veri
// kaybı olurdu; göç duruyor ve maddeyi gösteriyor, karar elle verilir.
const SINIR = 500;
const uzunlar = listeliler.flatMap((p) => p.ekle.filter((e) => e.title.length > SINIR).map((e) => ({ p, e })));
if (uzunlar.length) {
  console.log(`\n!! ${uzunlar.length} madde ${SINIR} karakteri aşıyor; alt görev başlığına sığmaz:`);
  for (const { p, e } of uzunlar) console.log(`   ${etiket(p)}  ${e.title.length} karakter: "${e.title.slice(0, 80)}…"`);
  if (UYGULA) {
    console.log('Uygulama REDDEDİLDİ — bu maddeler için karar verilmeden hiçbir şey yazılmadı.');
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (!planlar.length) {
  console.log('\nYapılacak bir şey yok — veri zaten tek kaynakta ve ilerlemeler kurala uyuyor.');
  await prisma.$disconnect();
  process.exit(0);
}

if (!UYGULA) {
  console.log('\nDENEME bitti, hiçbir şey yazılmadı. Uygulamak için: node scripts/altgorev-gocu.js --uygula');
  await prisma.$disconnect();
  process.exit(0);
}

// ─── Uygulama ──────────────────────────────────────────────────────────────

const yedekYolu = path.join(os.tmpdir(), `altgorev-gocu-yedek-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(yedekYolu, JSON.stringify(planlar.map((p) => ({
  task_id: p.k.id, progress: p.k.progress, doc: p.k.doc, subtasks: p.k.subtasks,
})), null, 2));
console.log(`\nyedek: ${yedekYolu}`);

let yazilan = 0;
for (const p of planlar) {
  // Kart başına bir işlem: biri düşerse öbürleri yarım kalmaz, düşen de
  // bütünüyle geri alınır. İkinci koşu kalanı yeniden bulur.
  await prisma.$transaction(async (tx) => {
    for (const g of p.guncelle) {
      await tx.subtask.update({ where: { id: g.id }, data: { done: g.done } });
    }
    let sira = p.k.subtasks.reduce((m, s) => Math.max(m, s.position ?? -1), -1) + 1;
    for (const e of p.ekle) {
      await tx.subtask.create({ data: { taskId: p.k.id, title: e.title, done: e.done, position: sira } });
      sira += 1;
    }
    const veri = { progress: p.ilerleme };
    if (p.listeli) veri.doc = p.yeniDoc ?? Prisma.DbNull;
    await tx.task.update({ where: { id: p.k.id }, data: veri });
  });
  yazilan += 1;
}
console.log(`uygulandı: ${yazilan} kart. Doğrulamak için betiği bir kez daha DENEME kipinde koş — "yapılacak bir şey yok" demeli.`);
await prisma.$disconnect();
