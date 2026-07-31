/**
 * YZ ÇÖZÜCÜ ÖLÇÜMÜ — zorluk = OYUN GÜCÜ (entropi sıralamasında topK).
 *
 * Havuz: 5 harfli TÜRKÇE cevap havuzu (words.json). Her zorluk için 500 maç
 * (tohumlanmış rastgele cevaplar). Bot HER zorlukta yalnız ipuçlarıyla TUTARLI
 * (havuzdaki geçerli) kelimeler tahmin eder — anlamsız/çelişen tahmin yoktur.
 * Zayıflık, entropi sıralamasında daha aşağıdan (topK) seçmekle gelir.
 *
 * NOT (kalibrasyon): Yalnız-tutarlı oyunda ulaşılabilir ortalama aralığı bu
 * 3100'lük havuzda ~3.17 (hep en iyi) — ~3.57 (rastgele tutarlı aday). Hedefler
 * bu gerçeğe göre belirlendi. Renk/entropi mantığı core/ai-opponent.ts ile aynı.
 *
 * Kullanım: node scripts/vsai-solver-test.mjs
 */
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const raw = JSON.parse(await readFile(new URL('../src/app/data/words.json', import.meta.url)));
const POOL = raw.words.map((w) => w.toLocaleUpperCase('tr')).filter((w) => [...w].length === 5);

const SAMPLE_THRESHOLD = 300;
const MATCHES = 500;
// core/ai-opponent.ts AI_CONFIG ile AYNI topK; TARGET = ulaşılabilir hedef ortalama.
// (3100'lük havuza göre yeniden kalibre: havuz büyüyünce band ~0.4 yukarı kaydı.)
const TOPK = { easy: 140, medium: 8, hard: 1 };
const TARGET = { easy: 3.55, medium: 3.3, hard: 3.2 };

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

let seed = 20260727;
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

const POOLSET = new Set(POOL);
let worstTurnMs = 0;
function ranked(cands) {
  const guesses = cands.length > SAMPLE_THRESHOLD ? sample(cands, SAMPLE_THRESHOLD) : cands;
  const scoreSet = cands.length > SAMPLE_THRESHOLD ? sample(cands, SAMPLE_THRESHOLD) : cands;
  const t0 = performance.now();
  const scored = guesses.map((g) => ({ g, h: entropy(g, scoreSet), inPool: POOLSET.has(g) }));
  scored.sort((a, b) => b.h - a.h || Number(b.inPool) - Number(a.inPool));
  worstTurnMs = Math.max(worstTurnMs, performance.now() - t0);
  return scored.map((x) => x.g);
}

// Derleme zamanı sıralı açılış listesi (çalışma zamanı 0 maliyet).
const OPENERS = ranked(POOL).slice(0, 128);
worstTurnMs = 0;

function pickTopK(list, topK) {
  return list[Math.floor(rnd() * Math.min(topK, list.length))];
}
function solve(answer, topK) {
  let cands = [...POOL],
    attempts = 0;
  while (attempts < 6) {
    let pick;
    if (cands.length <= 2) pick = cands[0];
    else if (attempts === 0) pick = pickTopK(OPENERS, topK);
    else pick = pickTopK(ranked(cands), topK);
    const fb = pattern(pick, answer);
    attempts++;
    if (pick === answer) return attempts;
    cands = cands.filter((c) => pattern(pick, c) === fb);
    if (!cands.length) cands = [...POOL];
  }
  return 7;
}

console.log(`Havuz: ${POOL.length} kelimelik 5 harfli TÜRKÇE cevap havuzu · ${MATCHES} maç/zorluk`);
console.log(`Açılış listesi: ${OPENERS[0]} … (${OPENERS.length} sıralı)\n`);

const results = {};
for (const diff of ['easy', 'medium', 'hard']) {
  const dist = [0, 0, 0, 0, 0, 0, 0];
  let tot = 0,
    solved = 0;
  for (let i = 0; i < MATCHES; i++) {
    const answer = POOL[Math.floor(rnd() * POOL.length)];
    const att = solve(answer, TOPK[diff]);
    if (att <= 6) {
      solved++;
      tot += att;
      dist[att - 1]++;
    } else dist[6]++;
  }
  results[diff] = {
    avg: +(tot / Math.max(1, solved)).toFixed(2),
    winPct: Math.round((solved / MATCHES) * 100),
    dist,
  };
}

console.log('Zorluk   | topK | Ort. | Hedef | Kazanma% | Dağılım (1..6 tahmin · X=çözemedi)');
console.log('---------|------|------|-------|----------|-----------------------------------');
for (const d of ['easy', 'medium', 'hard']) {
  const r = results[d];
  const dz =
    r.dist
      .slice(0, 6)
      .map((n) => String(n).padStart(3))
      .join(' ') +
    '  X:' +
    r.dist[6];
  console.log(
    `${d.padEnd(8)} | ${String(TOPK[d]).padStart(3)}  | ${String(r.avg).padEnd(4)} | ${String(TARGET[d]).padEnd(5)} |   ${String(r.winPct).padStart(3)}%   | ${dz}`,
  );
}
console.log(`\nEn kötü tek tur düşünme süresi: ${worstTurnMs.toFixed(2)} ms`);
const gap = +(results.easy.avg - results.hard.avg).toFixed(2);
console.log(`Kolay–Zor ortalama farkı: ${gap} tahmin`);

const band = (d) => Math.abs(results[d].avg - TARGET[d]) <= 0.3;
const ok =
  band('easy') &&
  band('medium') &&
  band('hard') &&
  results.easy.avg > results.medium.avg &&
  results.medium.avg > results.hard.avg &&
  results.hard.winPct === 100 &&
  worstTurnMs < 100;
console.log(
  ok
    ? '\n✅ Her zorluk hedef ±0.3 bandında · Kolay>Orta>Zor · %100 çözüm · tur < 100 ms'
    : '\n❌ Kriterler karşılanmadı (topK/hedef kalibrasyonu gerekebilir)',
);
process.exit(ok ? 0 : 1);
