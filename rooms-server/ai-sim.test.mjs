/**
 * ai-sim.js testleri — saf-JS solver ölçümü doğru sıralamayı üretir mi?
 * Kullanım: node rooms-server/ai-sim.test.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const SIM = require('./ai-sim.js');

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, '../src/app/data/words.json'), 'utf8'));
const POOL = raw.words.map((w) => w.toLocaleUpperCase('tr')).filter((w) => [...w].length === 5);

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.error('  ❌', m);
  }
};

ok(POOL.length > 100, `havuz yüklendi (${POOL.length} kelime)`);

// 200 maç/band (test hızı için) — deterministik tohum → tekrarlanabilir.
const opts = { matches: 200, seed: 20260727 };
const hard = SIM.measure(POOL, { band: [0, 0] }, opts);
const med = SIM.measure(POOL, { band: [0.4, 0.65] }, opts);
const easy = SIM.measure(POOL, { band: [0.85, 1] }, opts);

console.log(
  `  zor ${hard.avg} (çöz.%${hard.unsolvedPct}) · orta ${med.avg} (%${med.unsolvedPct}) · kolay ${easy.avg} (%${easy.unsolvedPct})`,
);

ok(hard.avg > 0 && med.avg > 0 && easy.avg > 0, 'her band pozitif ortalama döndürür');
ok(hard.avg < med.avg, 'zor < orta (band zayıfladıkça ortalama artar)');
ok(med.avg < easy.avg, 'orta < kolay');
ok(easy.avg - hard.avg >= 1.0, `kolay−zor farkı belirgin (${(easy.avg - hard.avg).toFixed(2)} ≥ 1.0)`);
ok(hard.unsolvedPct <= 3 && med.unsolvedPct <= 3, 'zor/orta çözememe ≤ %3');
ok(easy.unsolvedPct <= 8, 'kolay çözememe makul (≤ %8)');

// Determinizm: aynı tohum → aynı sonuç
const hard2 = SIM.measure(POOL, { band: [0, 0] }, opts);
ok(hard2.avg === hard.avg && hard2.unsolvedPct === hard.unsolvedPct, 'aynı tohum → aynı sonuç');

// Persona kayırması modelleniyor (bias/gamble config'i kabul edilir, mantıklı ortalama)
const unlu = SIM.measure(POOL, { band: [0.4, 0.65], bias: 'vowel', biasWeight: 1.5 }, opts);
const kumar = SIM.measure(POOL, { band: [0.85, 1], gamble: 0.5 }, opts);
console.log(`  ünlü ${unlu.avg} · kumarbaz ${kumar.avg}`);
ok(unlu.avg > 0 && unlu.avg < 6, 'ünlü avcısı (vowel bias) makul ortalama üretir');
ok(kumar.avg > 0 && kumar.avg < 6, 'kumarbaz (gamble) makul ortalama üretir');

// measureAll: birden çok config tek çağrıda
const set = SIM.measureAll(POOL, { hard: { band: [0, 0] }, easy: { band: [0.85, 1] } }, opts);
ok(set.hard.avg === hard.avg && set.easy.avg === easy.avg, 'measureAll tekil ölçümle tutarlı');

console.log(`\nai-sim: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
