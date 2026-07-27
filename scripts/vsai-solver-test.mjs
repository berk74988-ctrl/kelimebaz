/**
 * YZ ÇÖZÜCÜ ÖLÇÜMÜ — entropi tabanlı çözücünün performansı.
 *
 * Havuz: 5 harfli TÜRKÇE cevap havuzu (words.json). Her cevap bir kez oynanır.
 * Rapor: zorluk başına ortalama tahmin + kazanma % + en kötü tur süresi.
 *
 * Renk deseni + entropi mantığı core/ai-opponent.ts ile birebir aynıdır.
 * Kullanım: node scripts/vsai-solver-test.mjs
 */
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const raw = JSON.parse(await readFile(new URL('../src/app/data/words.json', import.meta.url)));
const POOL = raw.words.map((w) => w.toLocaleUpperCase('tr')).filter((w) => [...w].length === 5);

const SAMPLE_THRESHOLD = 300;
const CFG = { easy: { smart: 0.35 }, medium: { smart: 0.85 }, hard: { smart: 1.0 } };

// --- renk deseni (core/evaluate.ts ile aynı iki geçiş) ---
function pattern(guess, answer) {
  const g = [...guess];
  const a = [...answer];
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
  const buckets = new Map();
  for (const c of cands) {
    const k = pattern(guess, c);
    buckets.set(k, (buckets.get(k) || 0) + 1);
  }
  let h = 0;
  for (const c of buckets.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

let seed = 20260727;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
function sample(list, k) {
  if (list.length <= k) return list;
  const out = [];
  const seen = new Set();
  while (out.length < k) {
    const i = Math.floor(rnd() * list.length);
    if (!seen.has(i)) {
      seen.add(i);
      out.push(list[i]);
    }
  }
  return out;
}

let worstTurnMs = 0;
function bestGuess(cands) {
  const guesses = cands.length > SAMPLE_THRESHOLD ? sample(cands, SAMPLE_THRESHOLD) : cands;
  const scoreSet = cands.length > SAMPLE_THRESHOLD ? sample(cands, SAMPLE_THRESHOLD) : cands;
  const t0 = performance.now();
  let best = guesses[0];
  let bestH = -1;
  for (const g of guesses) {
    const h = entropy(g, scoreSet);
    if (h > bestH) {
      bestH = h;
      best = g;
    }
  }
  worstTurnMs = Math.max(worstTurnMs, performance.now() - t0);
  return best;
}

// Açılış = tüm havuzun en yüksek entropili tahmini (derleme zamanında gömülür).
const t0 = performance.now();
const OPENER = bestGuess(POOL);
const openerMs = performance.now() - t0;
worstTurnMs = 0; // açılış çalışma zamanında hesaplanmaz; ölçümü sıfırla

function solve(answer, smart) {
  let cands = [...POOL];
  let attempts = 0;
  while (attempts < 6) {
    let pick;
    if (cands.length <= 2) pick = cands[0];
    else if (rnd() < smart) pick = attempts === 0 ? OPENER : bestGuess(cands);
    else pick = POOL[Math.floor(rnd() * POOL.length)]; // "hata" (kolay YZ)
    const fb = pattern(pick, answer);
    attempts++;
    if (pick === answer) return { solved: true, attempts };
    cands = cands.filter((c) => pattern(pick, c) === fb);
    if (!cands.length) cands = [...POOL];
  }
  return { solved: false, attempts };
}

console.log(`Havuz: ${POOL.length} kelimelik 5 harfli TÜRKÇE cevap havuzu`);
console.log(`Açılış kelimesi: ${OPENER} (derleme zamanı ${openerMs.toFixed(1)} ms, çalışma zamanında 0)\n`);

const stats = {};
for (const diff of ['easy', 'medium', 'hard']) {
  let wins = 0;
  let totAtt = 0;
  let maxAtt = 0;
  for (const answer of POOL) {
    const r = solve(answer, CFG[diff].smart);
    if (r.solved) {
      wins++;
      totAtt += r.attempts;
    }
    maxAtt = Math.max(maxAtt, r.attempts);
  }
  stats[diff] = {
    kazanmaYuzde: Math.round((wins / POOL.length) * 100),
    ortalamaTahmin: +(totAtt / Math.max(1, wins)).toFixed(2),
    enKotu: maxAtt,
  };
}

console.log('Zorluk   | Ort. tahmin | Kazanma % | En kötü');
console.log('---------|-------------|-----------|--------');
for (const d of ['easy', 'medium', 'hard']) {
  const s = stats[d];
  console.log(
    `${d.padEnd(8)} |    ${String(s.ortalamaTahmin).padEnd(8)} |   ${String(s.kazanmaYuzde).padEnd(6)}  |   ${s.enKotu}`,
  );
}
console.log(`\nEn kötü tek tur düşünme süresi: ${worstTurnMs.toFixed(2)} ms`);

// Kabul kriterleri
const hard = stats.hard;
const ok =
  hard.ortalamaTahmin <= 2.9 && // entropi çözücü ≤ 2.9
  hard.kazanmaYuzde === 100 && // havuz içi kelimelerde hiç çözümsüz kalmaz
  worstTurnMs < 100 && // tarayıcıda tek tur < 100 ms
  stats.hard.ortalamaTahmin <= stats.medium.ortalamaTahmin + 0.05 && // hard ≥ medium ≥ easy
  stats.medium.ortalamaTahmin <= stats.easy.ortalamaTahmin + 0.05;
console.log(
  ok
    ? '\n✅ Entropi çözücü: ort ≤ 2.9, %100 çözüm, tur < 100 ms, zorluklar ayrışıyor'
    : '\n❌ Kriterler karşılanmadı',
);
process.exit(ok ? 0 : 1);
