/**
 * balance.js testleri — aralık reddi + geri alma + geçmiş + şema parity.
 * GOLDEN, src/app/core/balance.spec.ts ile AYNIDIR (istemci↔sunucu senkron).
 * Kullanım: node rooms-server/balance.test.mjs
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const B = require('./balance.js');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.error('  ❌', m);
  }
};

// --- Şema parity (istemci golden ile aynı) ---
const GOLDEN = [
  ['winGold', 20, 0, 200, true],
  ['speedGold', 5, 0, 100, true],
  ['dailyBonus', 10, 0, 200, true],
  ['lossGold', 2, 0, 100, true],
  ['levelGold', 4, 0, 50, true],
  ['levelGoldCap', 40, 0, 500, true],
  ['aiTopKMul', 1, 0.25, 4, false],
];
const got = B.SPEC.map((p) => [p.key, p.def, p.min, p.max, p.int]);
ok(JSON.stringify(got) === JSON.stringify(GOLDEN), 'şema golden ile eşleşir (istemci parity)');

// --- Depo davranışı ---
const dir = mkdtempSync(join(tmpdir(), 'kbbal-'));
try {
  const bal = B.open({ file: join(dir, 'ovr.json') });

  ok(Object.keys(bal.overrides()).length === 0, 'başta override yok');

  // Geçerli set
  ok(bal.set('winGold', 60, 't1').ok === true, 'geçerli set kabul');
  ok(bal.overrides().winGold === 60, 'override kaydedildi');

  // ARALIK DIŞI reddedilir
  ok(bal.set('winGold', 999999, 't2').error === 'out_of_range', 'aralık üstü reddedilir');
  ok(bal.set('winGold', -5, 't2').error === 'out_of_range', 'aralık altı reddedilir');
  ok(bal.set('bilinmeyen', 5, 't2').error === 'unknown_key', 'bilinmeyen anahtar reddedilir');
  ok(bal.overrides().winGold === 60, 'reddedilen set override’ı değiştirmedi');

  // int yuvarlama
  bal.set('speedGold', 7.8, 't3');
  ok(bal.overrides().speedGold === 8, 'int değer yuvarlanır');
  // float korunur
  bal.set('aiTopKMul', 1.5, 't4');
  ok(bal.overrides().aiTopKMul === 1.5, 'float değer korunur');

  // Şema (mevcut+varsayılan+aralık)
  const sch = bal.schema().find((p) => p.key === 'winGold');
  ok(
    sch.current === 60 && sch.def === 20 && sch.overridden === true,
    'schema mevcut/varsayılan/override',
  );

  // Geri al (tek)
  bal.reset('winGold', 't5');
  ok(bal.overrides().winGold === undefined, 'reset override’ı kaldırır (varsayılana döner)');

  // Kalıcılık: yeni örnek dosyadan okur
  const bal2 = B.open({ file: join(dir, 'ovr.json') });
  ok(bal2.overrides().speedGold === 8, 'override diske kalıcı (restart’ta korunur)');

  // Geçmiş
  ok(bal2.history().length >= 4, 'değişiklik geçmişi tutulur');

  // Hepsini geri al
  bal2.resetAll('t6');
  ok(Object.keys(bal2.overrides()).length === 0, 'resetAll tümünü temizler');
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* yoksay */
  }
}

console.log(`\nbalance: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
