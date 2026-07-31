/**
 * BOT KARAKTERLERİ ÖLÇÜMÜ — her karakter GERÇEKTEN farklı mı oynuyor + ortalama tahmin?
 *
 * Havuz: 5 harfli TÜRKÇE cevap havuzu. Her karakter için 500 maç. Renk/entropi/
 * strateji mantığı core/ai-opponent.ts ile birebir aynıdır (bias, gamble, opener).
 * Ayrıca aynı kelimede karakterlerin FARKLI açılış yaptığını gösterir.
 *
 * Kullanım: node scripts/vsai-persona-test.mjs
 */
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const raw = JSON.parse(await readFile(new URL('../src/app/data/words.json', import.meta.url)));
const POOL = raw.words.map((w) => w.toLocaleUpperCase('tr')).filter((w) => [...w].length === 5);
const POOLSET = new Set(POOL);
const VOWELS = new Set([...'AEIİOÖUÜ']);
const SAMPLE_THRESHOLD = 300;
const MATCHES = 500;

// core/ai-personas.ts ile AYNI stratejiler
const PERSONAS = [
  { id: 'temkinli', topK: 1 },
  { id: 'unlu', topK: 4, bias: 'vowel', openerBias: true },
  { id: 'harfsayar', topK: 3, bias: 'frequent', openerBias: true, biasWeight: 2.5 },
  { id: 'kumarbaz', topK: 24, gamble: 0.5 },
];

function pattern(guess, answer) {
  const g = [...guess],
    a = [...answer];
  const res = new Array(g.length).fill('0');
  const pool = new Map();
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) res[i] = '2';
    else pool.set(a[i], (pool.get(a[i]) || 0) + 1);
  }
  for (let i = 0; i < g.length; i++) {
    if (res[i] === '2') continue;
    const left = pool.get(g[i]) || 0;
    if (left > 0) {
      res[i] = '1';
      pool.set(g[i], left - 1);
    }
  }
  return res.join('');
}
function entropy(guess, cands) {
  const n = cands.length;
  if (n <= 1) return 0;
  const b = new Map();
  for (const c of cands) {
    const k = pattern(guess, c);
    b.set(k, (b.get(k) || 0) + 1);
  }
  let h = 0;
  for (const c of b.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

// harf sıklığı (havuz), 0..1
const FREQ = (() => {
  const count = new Map();
  for (const w of POOL) for (const ch of w) count.set(ch, (count.get(ch) || 0) + 1);
  let max = 1;
  for (const v of count.values()) if (v > max) max = v;
  const norm = new Map();
  for (const [k, v] of count) norm.set(k, v / max);
  return norm;
})();
function letterScore(word, bias) {
  const chars = [...word];
  if (bias === 'vowel') {
    let v = 0;
    for (const ch of chars) if (VOWELS.has(ch)) v++;
    return v / chars.length;
  }
  if (bias === 'frequent') {
    let s = 0;
    for (const ch of chars) s += FREQ.get(ch) || 0;
    return s / chars.length;
  }
  return 0;
}

let seed = 20260729;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
function sample(list, k) {
  if (list.length <= k) return list;
  const out = [],
    seen = new Set();
  while (out.length < k) {
    const i = Math.floor(rnd() * list.length);
    if (!seen.has(i)) {
      seen.add(i);
      out.push(list[i]);
    }
  }
  return out;
}

// Derleme zamanı sıralı açılış listesi (entropiye göre en iyi 128).
const RANKED = (() => {
  const scored = POOL.map((g) => ({ g, h: entropy(g, POOL) }));
  scored.sort((a, b) => b.h - a.h);
  return scored.slice(0, 128).map((x) => x.g);
})();

function pickOpener(cfg) {
  let list = RANKED;
  if (cfg.openerBias && cfg.bias)
    list = [...RANKED].sort((a, b) => letterScore(b, cfg.bias) - letterScore(a, cfg.bias));
  return list[Math.floor(rnd() * Math.min(cfg.topK, list.length))];
}
let worstTurnMs = 0;
function rankedGuess(cands, cfg) {
  const guesses = cands.length > SAMPLE_THRESHOLD ? sample(cands, SAMPLE_THRESHOLD) : cands;
  const scoreSet = cands.length > SAMPLE_THRESHOLD ? sample(cands, SAMPLE_THRESHOLD) : cands;
  const bw = cfg.biasWeight || 0;
  const t0 = performance.now();
  const scored = guesses.map((g) => ({
    s: entropy(g, scoreSet) + (bw ? bw * letterScore(g, cfg.bias) : 0),
    g,
    inPool: POOLSET.has(g),
  }));
  scored.sort((a, b) => b.s - a.s || Number(b.inPool) - Number(a.inPool));
  worstTurnMs = Math.max(worstTurnMs, performance.now() - t0);
  return scored[Math.floor(rnd() * Math.min(cfg.topK, scored.length))].g;
}
function solve(answer, cfg) {
  let cands = [...POOL],
    attempts = 0;
  while (attempts < 6) {
    let pick;
    if (cands.length <= 2) pick = cands[0];
    else if (attempts === 0) pick = pickOpener(cfg);
    else if (cfg.gamble && cands.length > 8 && rnd() < cfg.gamble)
      pick = cands[Math.floor(rnd() * cands.length)];
    else pick = rankedGuess(cands, cfg);
    const fb = pattern(pick, answer);
    attempts++;
    if (pick === answer) return attempts;
    cands = cands.filter((c) => pattern(pick, c) === fb);
    if (!cands.length) cands = [...POOL];
  }
  return 7;
}

console.log(`Havuz: ${POOL.length} kelimelik 5 harfli TÜRKÇE · ${MATCHES} maç/karakter\n`);

console.log(
  'Karakter   | Ort. | Kazanma% | Dağılım (1..6 · X)          | Açılış (örnek kelime KALEM)',
);
console.log(
  '-----------|------|----------|-----------------------------|---------------------------',
);
const results = {};
for (const p of PERSONAS) {
  const dist = [0, 0, 0, 0, 0, 0, 0];
  let tot = 0,
    solved = 0;
  const s0 = seed;
  for (let i = 0; i < MATCHES; i++) {
    const answer = POOL[Math.floor(rnd() * POOL.length)];
    const att = solve(answer, p);
    if (att <= 6) {
      solved++;
      tot += att;
      dist[att - 1]++;
    } else dist[6]++;
  }
  // aynı tohumdan açılış örneği (farklılığı göstermek için)
  seed = s0;
  const opener = pickOpener(p);
  const avg = +(tot / Math.max(1, solved)).toFixed(2);
  results[p.id] = { avg, winPct: Math.round((solved / MATCHES) * 100), opener };
  const dz =
    dist
      .slice(0, 6)
      .map((n) => String(n).padStart(3))
      .join(' ') + ` X:${dist[6]}`;
  console.log(
    `${p.id.padEnd(10)} | ${String(avg).padEnd(4)} |   ${String(results[p.id].winPct).padStart(3)}%   | ${dz} | ${opener}`,
  );
}

console.log(`\nEn kötü tek tur düşünme süresi: ${worstTurnMs.toFixed(2)} ms`);

// Farklı oynuyorlar mı? (en az iki karakter farklı açılış)
const openers = new Set(PERSONAS.map((p) => results[p.id].opener));
const distinctOpeners = openers.size;
console.log(
  `Farklı açılış sayısı: ${distinctOpeners}/${PERSONAS.length}  → ${[...openers].join(', ')}`,
);

const avgs = PERSONAS.map((p) => results[p.id].avg);
const spread = +(Math.max(...avgs) - Math.min(...avgs)).toFixed(2);
console.log(`Ortalama tahmin yayılımı: ${spread}`);

const ok =
  PERSONAS.every((p) => results[p.id].winPct >= 99) && // havuz içi kelimede çözerler
  distinctOpeners >= 2 && // gerçekten farklı açılış
  worstTurnMs < 100; // tur < 100 ms
console.log(
  ok ? '\n✅ Karakterler farklı oynuyor, hepsi çözüyor, tur < 100 ms' : '\n❌ Kriter karşılanmadı',
);
console.log(
  '\nai-personas.ts avgGuesses için: ' +
    PERSONAS.map((p) => `${p.id}=${results[p.id].avg}`).join('  '),
);
process.exit(ok ? 0 : 1);
