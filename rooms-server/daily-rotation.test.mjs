/**
 * daily-rotation.js testleri — SUNUCU PARITY (istemci ile senkron).
 *
 * GOLDEN dizi, src/app/core/daily-rotation.spec.ts ile AYNIDIR. İki taraf da
 * bu değerleri doğrular → server JS ↔ client TS senkron kalır (biri kayarsa
 * kendi tarafındaki test kırılır). Kullanım: node rooms-server/daily-rotation.test.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const r = require('./daily-rotation.js');

let pass = 0,
  fail = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else {
    fail++;
    console.error('  ❌', m, '→', JSON.stringify(a), '≠', JSON.stringify(b));
  }
};

const GOLD_BAND = [2, 4, 4, 3, 2, 3, 3, 2, 4, 5, 3, 2, 1, 2, 3, 4, 3, 5, 1, 1, 2];
const GOLD_LEN = [4, 7, 6, 5, 7, 6, 5, 4, 4, 5, 6, 7, 5, 6, 7, 4, 6, 5, 4, 7, 6];

eq(
  Array.from({ length: 21 }, (_, d) => r.targetBand(d)),
  GOLD_BAND,
  'targetBand golden (istemciyle aynı)',
);
eq(
  Array.from({ length: 21 }, (_, d) => r.lengthForDay(d)),
  GOLD_LEN,
  'lengthForDay golden (istemciyle aynı)',
);

// Art arda iki band-5 gelmemeli (kural).
let twoFives = false;
for (let d = 1; d <= 1000; d++)
  if (r.targetBand(d) === 5 && r.targetBand(d - 1) === 5) twoFives = true;
eq(twoFives, false, 'asla art arda iki band-5');

// pickDaily belirleyici + hedef band boşsa en yakına düşer.
// d=3: lengthForDay(3)=5 (golden), band=targetBand(3)=3 → 5-harf band-3 havuzu dolu.
const pool = { 5: { 3: ['ALFA5', 'BETA5', 'GAMA5'] } };
const byBand = (L, b) => pool[L]?.[b] ?? [];
const a1 = r.pickDaily(3, byBand);
const a2 = r.pickDaily(3, byBand);
eq(a1, a2, 'pickDaily aynı girdi → aynı çıktı');
eq(!!a1 && a1.length === 5 && a1.word.length === 5, true, 'pickDaily 5-harf kelime verir');

console.log(`\ndaily-rotation: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
