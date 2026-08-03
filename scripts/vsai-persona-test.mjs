/**
 * BOT KARAKTERLERİ ÖLÇÜMÜ — her karakter GERÇEKTEN farklı mı oynuyor + ortalama tahmin?
 *
 * Havuz: 5 harfli TÜRKÇE cevap havuzu. Her karakter için 500 maç. Renk/entropi/
 * strateji mantığı core/ai-opponent.ts ile birebir aynıdır (band, bias, gamble,
 * güvenlik freni). Ayrıca aynı kelimede karakterlerin FARKLI açılış yaptığını gösterir.
 *
 * Seçim ölçütü sabit topK değil, entropi sıralamasında YÜZDELİK DİLİM (band). Son 2
 * hakta güvenlik freni EN İYİ tutarlı adayı seçer (çözememe düşük). İlk tur da CANLI
 * sıralanır → zayıf karakter zayıf açılış yapabilir.
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
const MAX_ATTEMPTS = 6;

// core/ai-personas.ts ile AYNI stratejiler (band + bias/gamble)
const PERSONAS = [
  { id: 'temkinli', band: [0, 0] },
  { id: 'unlu', band: [0.4, 0.65], bias: 'vowel', biasWeight: 1.5 },
  { id: 'harfsayar', band: [0.45, 0.7], bias: 'frequent', biasWeight: 2.5 },
  { id: 'kumarbaz', band: [0.85, 1], gamble: 0.5 },
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

/** Yüzdelik dilim [lo,hi] içinden indeks (0 = en iyi … n−1 = en zayıf). */
function pickBand(list, [lo, hi]) {
  const n = list.length;
  if (n <= 1) return list[0];
  const a = Math.floor(lo * (n - 1));
  const b = Math.floor(hi * (n - 1));
  return list[Math.min(n - 1, a + Math.floor(rnd() * (b - a + 1)))];
}

// Derleme zamanı TAM SIRALI açılış listesi (havuzun tamamı, en iyi → en zayıf).
const OPENERS_FULL = (() => {
  const scoreSet = POOL.length > 600 ? sample(POOL, 600) : POOL;
  const scored = POOL.map((g) => ({ g, h: entropy(g, scoreSet) }));
  scored.sort((a, b) => b.h - a.h);
  return scored.map((x) => x.g);
})();

let worstTurnMs = 0;
/** İlk tur: açılış listesinden (bias'a göre yeniden sıralı) band ile seç. */
function pickOpener(cfg) {
  let list = OPENERS_FULL;
  if (cfg.bias) {
    const bw = cfg.biasWeight || 0;
    list = OPENERS_FULL.map((w, i) => ({ w, rank: i - bw * letterScore(w, cfg.bias) }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.w);
  }
  return pickBand(list, cfg.band);
}
/** Entropi (+ kayırma) ile sırala; best ise en iyi, değilse banddan seç. */
function rankGuess(cands, cfg, best) {
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
  if (best) return scored[0].g;
  return pickBand(
    scored.map((x) => x.g),
    cfg.band,
  );
}
function solve(answer, cfg) {
  let cands = [...POOL],
    attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    let pick;
    if (cands.length <= 2) pick = cands[0];
    else if (attempts >= MAX_ATTEMPTS - 2) pick = rankGuess(cands, cfg, true); // güvenlik freni
    else if (attempts === 0) pick = pickOpener(cfg);
    else if (cfg.gamble && cands.length > 8 && rnd() < cfg.gamble)
      pick = cands[Math.floor(rnd() * cands.length)];
    else pick = rankGuess(cands, cfg, false);
    const fb = pattern(pick, answer);
    attempts++;
    if (pick === answer) return attempts;
    cands = cands.filter((c) => pattern(pick, c) === fb);
    if (!cands.length) cands = [...POOL];
  }
  return MAX_ATTEMPTS + 1;
}

console.log(`Havuz: ${POOL.length} kelimelik 5 harfli TÜRKÇE · ${MATCHES} maç/karakter\n`);

console.log('Karakter   | band          | Ort. | Çözemedi% | Dağılım (1..6 · X) | Açılış (örnek)');
console.log('-----------|---------------|------|-----------|--------------------|--------------');
const results = {};
for (const p of PERSONAS) {
  seed = 20260729;
  const dist = [0, 0, 0, 0, 0, 0, 0];
  let tot = 0,
    solved = 0;
  for (let i = 0; i < MATCHES; i++) {
    const answer = POOL[Math.floor(rnd() * POOL.length)];
    const att = solve(answer, p);
    if (att <= MAX_ATTEMPTS) {
      solved++;
      tot += att;
      dist[att - 1]++;
    } else dist[6]++;
  }
  // açılış örneği: ilk turdaki band seçimi (karakter farkını gösterir)
  seed = 20260729;
  const opener = pickOpener(p);
  const avg = +(tot / Math.max(1, solved)).toFixed(2);
  results[p.id] = { avg, unsolvedPct: +((dist[6] / MATCHES) * 100).toFixed(1), opener };
  const dz =
    dist
      .slice(0, 6)
      .map((n) => String(n).padStart(3))
      .join(' ') + ` X:${dist[6]}`;
  const bs = `[${p.band[0]}, ${p.band[1]}]`.padEnd(13);
  console.log(
    `${p.id.padEnd(10)} | ${bs} | ${String(avg).padEnd(4)} |   ${String(results[p.id].unsolvedPct).padStart(4)}%  | ${dz} | ${opener}`,
  );
}

// Bilgi (deterministik değil, geçme ölçütü değil): en kötü tek tur maliyeti.
console.log(`\nEn kötü tek tur düşünme süresi (bilgi): ${worstTurnMs.toFixed(2)} ms`);

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
  PERSONAS.every((p) => results[p.id].unsolvedPct <= 3) && // çözememe ≤ %3
  distinctOpeners >= 2; // gerçekten farklı açılış
console.log(ok ? '\n✅ Karakterler farklı oynuyor, çözememe ≤%3' : '\n❌ Kriter karşılanmadı');
console.log(
  '\nai-personas.ts avgGuesses için: ' +
    PERSONAS.map((p) => `${p.id}=${results[p.id].avg}`).join('  '),
);
process.exit(ok ? 0 : 1);
