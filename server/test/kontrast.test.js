// Metin kontrasti — sonuk yazi goz karariyla degil, hesapla yakalanir.
//
// Kusur (10 Eylul 2026): "beyaz modda bazi yazilar sonuk duruyor" diye
// bildirildi. Olculdugunde sorun tahminden genisti — uc temanin ucunde de iki
// murekkep tonu metin icin okunamaz durumdaydi:
//
//   --ink-faint  2.29:1  (71 yerde metin rengi)
//   --ink-dim    1.68:1  (14 yerde metin rengi)
//
// WCAG AA normal metin icin 4.5:1 ister. Bu, "sessiz yanlis" ailesinin gorsel
// akrabasi: hicbir sey bozulmuyor, hata cikmiyor, yalnizca kimse okuyamiyor.
// Kimse de sikayet edene kadar fark etmiyor.
//
// Belgeye "acik ton kullanma" yazmak bu kusuru bir daha engellemez; olcut
// sayisal oldugu icin dogrudan kilitlenebilir. Test CSS'i okuyor, hangi
// tokenlarin METIN rengi olarak kullanildigini kendisi buluyor ve her temada
// her yuzeye karsi kontrasti hesapliyor.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS = fs.readFileSync(path.join(KOK, 'client', 'src', 'styles.css'), 'utf8');

const AA_NORMAL = 4.5;

// Metin rengi OLMAYAN, bilincli olarak dusuk kontrastli tokenlar.
// Her biri gerekcesiyle listeleniyor; listeye ekleme yapmak bir karardir.
const METIN_DEGIL = new Set([
  // Kenarlik, avatar dolgusu, devre disi oge. Metin olarak kullanilmasi
  // 1.68:1 demek — hicbir deger secilemez. Kullanildigi yerler 10 Eylul'de
  // --ink-muted'a alindi.
  '--ink-dim',
]);

// ─── Renk matematigi (WCAG 2.x goreli parlaklik) ────────────────────────────

function kanal(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parlaklik(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

function kontrast(a, b) {
  const x = parlaklik(a);
  const y = parlaklik(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ─── CSS'ten tema tablolarini cikar ─────────────────────────────────────────

const TEMALAR = {
  'varsayilan (isikli)': /:root\s*\{([\s\S]*?)\n\}/,
  cream: /\[data-theme="cream"\]\s*\{([\s\S]*?)\n\}/,
  dark: /\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/,
};

function tokenlar(blokRe) {
  const m = CSS.match(blokRe);
  assert.ok(m, 'tema blogu CSS icinde bulunamadi');
  const t = {};
  for (const mm of m[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    t[`--${mm[1]}`] = mm[2].toLowerCase();
  }
  return t;
}

// Hangi tokenlar METIN rengi olarak kullaniliyor? Testin kendisi bulsun —
// elle tutulan bir liste, yeni bir token eklendiginde sessizce eskir.
function metinTokenlari() {
  const bulunan = new Set();
  for (const m of CSS.matchAll(/color:\s*var\((--[a-z0-9-]+)/g)) bulunan.add(m[1]);
  const jsxKok = path.join(KOK, 'client', 'src');
  const gez = (dizin) => {
    for (const ad of fs.readdirSync(dizin)) {
      const tam = path.join(dizin, ad);
      if (fs.statSync(tam).isDirectory()) { gez(tam); continue; }
      if (!ad.endsWith('.jsx')) continue;
      const icerik = fs.readFileSync(tam, 'utf8');
      for (const m of icerik.matchAll(/color:\s*['"`]var\((--[a-z0-9-]+)/g)) bulunan.add(m[1]);
    }
  };
  gez(jsxKok);
  return [...bulunan].filter(t => t.startsWith('--ink'));
}

// ─── Testler ────────────────────────────────────────────────────────────────

describe('Metin kontrasti — WCAG AA (4.5:1)', () => {
  const metin = metinTokenlari();

  test('metin rengi olarak kullanilan token bulundu', () => {
    assert.ok(metin.length >= 3, `beklenenden az token bulundu: ${metin.join(', ')}`);
  });

  for (const [temaAdi, re] of Object.entries(TEMALAR)) {
    const t = tokenlar(re);
    const yuzeyler = ['--bg', '--bg-raised'].filter(y => t[y]);

    for (const token of metin) {
      if (METIN_DEGIL.has(token)) continue;
      if (!t[token]) continue; // bu tema o tokeni tanimlamiyorsa ust temadan miras

      test(`${temaAdi}: ${token} okunabilir`, () => {
        for (const y of yuzeyler) {
          const r = kontrast(t[token], t[y]);
          assert.ok(
            r >= AA_NORMAL,
            `${temaAdi} temasinda ${token} (${t[token]}) ${y} (${t[y]}) uzerinde `
            + `${r.toFixed(2)}:1 — AA normal metin ${AA_NORMAL}:1 istiyor. `
            + 'Tonu koyulastir (isikli/cream) ya da acikslastir (dark); '
            + 'metin olarak kullanilmayacaksa METIN_DEGIL listesine gerekcesiyle ekle.',
          );
        }
      });
    }
  }

  // Hiyerarsi de olculebilir: ton adlari bir siralamayi vaat ediyor ve o
  // siralama bozulunca kimse fark etmiyor. 10 Eylul'de tam bu oldu — faint
  // koyulastirilirken muted ile esitlendi, cream'de ise muted'dan koyu kaldi.
  for (const [temaAdi, re] of Object.entries(TEMALAR)) {
    test(`${temaAdi}: ink > ink-2 > ink-muted > ink-faint sirasi korunuyor`, () => {
      const t = tokenlar(re);
      const sira = ['--ink', '--ink-2', '--ink-muted', '--ink-faint'].filter(k => t[k]);
      const zemin = t['--bg'];
      const oranlar = sira.map(k => [k, kontrast(t[k], zemin)]);
      for (let i = 1; i < oranlar.length; i++) {
        assert.ok(
          oranlar[i - 1][1] > oranlar[i][1],
          `${temaAdi}: ${oranlar[i - 1][0]} (${oranlar[i - 1][1].toFixed(2)}:1) `
          + `${oranlar[i][0]} (${oranlar[i][1].toFixed(2)}:1) tonundan daha belirgin `
          + 'olmali. Ad bir siralama vaat ediyor; deger onu tutmuyor.',
        );
      }
    });
  }
});

// ─── Vurgu rengi: ornek kare ile uygulanan renk ayni kaynaktan gelmeli ──────
//
// Kusur (10 Eylul 2026): ayarlardaki renk kareleri ELLE yazilmis sabit
// degerlerdi ve her zaman isikli tema degerini gosteriyordu. Koyu tema her
// vurgu secenegini bilincli olarak aciyor (L %50-55 → %68-72), dolayisiyla
// kullanici #1a4a70 karesini secip ≈ #60a7d6 aliyordu. Ustelik ayni liste iki
// dosyada birden kopyalanmisti.
//
// Kareleri elle duzeltmek kusuru kapatmaz, bir sonraki ton degisikligine
// erteler. Cozum tek kaynak: --accent-<ad> degiskenleri. Bu test o tekligi
// kilitliyor — kareye ham bir renk yazan herkes burada durur.
describe('Vurgu rengi — ornek kare uygulanan rengi gosteriyor', () => {
  const SWATCH_DOSYALARI = [
    'client/src/views/settings.jsx',
    'client/src/tweaks.jsx',
  ];

  for (const goreli of SWATCH_DOSYALARI) {
    const icerik = fs.readFileSync(path.join(KOK, goreli), 'utf8');
    // ['navy','...'] bicimindeki ciftleri yakala
    const ciftler = [...icerik.matchAll(/\['(navy|terracotta|sage|slate|indigo|plum)',\s*'([^']+)'\]/g)];

    test(`${goreli}: vurgu kareleri bulundu`, () => {
      assert.equal(
        ciftler.length, 6,
        `alti vurgu secenegi bekleniyordu, ${ciftler.length} bulundu. `
        + 'Liste bicimi degistiyse bu test de guncellenmeli.',
      );
    });

    for (const [, ad, deger] of ciftler) {
      test(`${goreli}: ${ad} karesi degiskenden okuyor`, () => {
        assert.equal(
          deger, `var(--accent-${ad})`,
          `${ad} karesine ham renk yazilmis: "${deger}". Kare degiskeni `
          + `okumali (var(--accent-${ad})), yoksa koyu temada gosterdigi renk `
          + 'ile uygulanan renk ayrisir — 10 Eylul 2026 kusuru aynen geri gelir.',
        );
      });
    }
  }

  const VURGULAR = ['navy', 'terracotta', 'sage', 'slate', 'indigo', 'plum'];

  // Bir tema birden fazla blokta tanimlanabilir (CSS'i konuya gore bolmek
  // mesru). Test duzeni dayatmasin: ayni seciciye ait TUM bloklar birlestirilip
  // bakiliyor.
  function temaGovdesi(secici) {
    const re = new RegExp(`${secici}\\s*\\{([\\s\\S]*?)\\n\\}`, 'g');
    return [...CSS.matchAll(re)].map(m => m[1]).join('\n');
  }

  for (const ad of VURGULAR) {
    test(`--accent-${ad} hem isikli hem koyu temada tanimli`, () => {
      for (const [temaAdi, secici] of [['varsayilan', ':root'], ['dark', '\\[data-theme="dark"\\]']]) {
        assert.match(
          temaGovdesi(secici), new RegExp(`--accent-${ad}:`),
          `--accent-${ad} ${temaAdi} temasinda tanimli degil. Tanimsizsa o `
          + 'temada kare bos ya da yanlis renk gosterir.',
        );
      }
    });
  }

  test('hicbir [data-accent] blogu --accent\'e ham renk yazmiyor', () => {
    const satirlar = CSS.split('\n').filter(s => /^\[data-(accent|theme)[^\n]*--accent:/.test(s));
    assert.ok(satirlar.length >= 6, 'vurgu bloklari bulunamadi');
    for (const satir of satirlar) {
      const m = satir.match(/--accent:\s*([^;]+);/);
      if (!m) continue;
      assert.match(
        m[1].trim(), /^var\(--accent-[a-z]+\)$/,
        `Ham renk atanmis: "${m[1].trim()}"\n  ${satir.slice(0, 90)}\n`
        + '  --accent daima var(--accent-<ad>) okumali; ornek kareler de ayni '
        + 'degiskeni okuyor ve ancak boyle ayrisamazlar.',
      );
    }
  });
});
