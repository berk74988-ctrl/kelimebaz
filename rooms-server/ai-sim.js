'use strict';

/**
 * YZ MAÇ SİMÜLATÖRÜ (saf JS, bağımlılıksız) — panelden "Ölçüm çalıştır" için.
 *
 * Renk/entropi/çözücü mantığı core/ai-opponent.ts (pickGuess) ve
 * scripts/vsai-solver-test.mjs ile AYNIDIR:
 *   - yüzdelik dilim = band ([0,0]=en iyi … [~,1]=en zayıf)
 *   - güvenlik freni: son 2 hakta en iyi tutarlı aday
 *   - karakter kayırması (bias 'vowel'/'frequent' + biasWeight) sıralamaya eklenir
 *   - kumarbaz (gamble): erken turda doğrudan bir cevabı dener
 * Fark: PARAMETRİK ve yeniden kullanılabilir — havuz + çözücü config + maç sayısı
 * dışarıdan verilir, deterministik tohumla çalışır.
 *
 * MALİYET: CPU harcar → server.js bunu WORKER THREAD'de çalıştırır (ana olay
 * döngüsü bloklanmaz), eşzamanlılığı + maç sayısını + önbelleği yönetir.
 */

const SAMPLE_THRESHOLD = 300;
const DEFAULT_MAX_ATTEMPTS = 6;
const VOWELS = new Set([...'AEIİOÖUÜ']);

/** Wordle renk deseni: '2'=yeşil, '1'=sarı, '0'=gri. */
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

/** Shannon entropisi (bit) — tahmin adayları kaç dengeli kovaya böler. */
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

/** Deterministik LCG (tohumlanmış) — ölçüm tekrarlanabilir olsun. */
function makeRnd(seed) {
  let s = seed & 0x7fffffff;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function sample(list, k, rnd) {
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

/** Yüzdelik dilim [lo,hi] içinden seç (0 = en iyi entropi … 1 = en zayıf). */
function pickBand(list, lo, hi, rnd) {
  const n = list.length;
  if (n <= 1) return list[0];
  const a = Math.floor(lo * (n - 1));
  const b = Math.floor(hi * (n - 1));
  return list[Math.min(n - 1, a + Math.floor(rnd() * (b - a + 1)))];
}

/** Havuz harf sıklığı, 0..1'e normalize (en sık = 1). */
function letterFreq(pool) {
  const count = new Map();
  for (const w of pool) for (const ch of w) count.set(ch, (count.get(ch) || 0) + 1);
  let max = 1;
  for (const v of count.values()) if (v > max) max = v;
  const norm = new Map();
  for (const [k, v] of count) norm.set(k, v / max);
  return norm;
}

/**
 * Bir çözücü config'i (band + kayırma + kumarbaz) için ortalama tahmin + çözememe.
 * config: { band:[lo,hi], bias?:'vowel'|'frequent', biasWeight?, gamble? }
 * opts:   { matches, seed, maxAttempts }
 * @returns { avg, unsolvedPct, dist, matches }
 */
function measure(pool, config, opts = {}) {
  const matches = Math.max(1, Math.floor(opts.matches || 200));
  const maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const band = config.band || [0, 0];
  const lo = band[0];
  const hi = band[1];
  const bias = config.bias || null;
  const bw = config.biasWeight || 0;
  const gamble = config.gamble || 0;
  const rnd = makeRnd(opts.seed || 20260727);
  const poolSet = new Set(pool);
  const freq = bias === 'frequent' ? letterFreq(pool) : null;

  const letterScore = (word) => {
    const chars = [...word];
    if (!chars.length || !bias) return 0;
    let s = 0;
    if (bias === 'vowel') {
      for (const ch of chars) if (VOWELS.has(ch)) s++;
      return s / chars.length;
    }
    for (const ch of chars) s += freq.get(ch) || 0;
    return s / chars.length;
  };

  // Derleme zamanı TAM SIRALI açılış listesi (core/ai-openers ile aynı fikir),
  // kayırma varsa harf tipine göre yeniden sıralı.
  const openerScoreSet = pool.length > 600 ? sample(pool, 600, rnd) : pool;
  let openers = pool
    .map((g) => ({ g, h: entropy(g, openerScoreSet) }))
    .sort((a, b) => b.h - a.h)
    .map((x) => x.g);
  if (bias) {
    openers = openers
      .map((w, i) => ({ w, rank: i - bw * letterScore(w) }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.w);
  }

  const ranked = (cands) => {
    const guesses = cands.length > SAMPLE_THRESHOLD ? sample(cands, SAMPLE_THRESHOLD, rnd) : cands;
    const scoreSet = cands.length > SAMPLE_THRESHOLD ? sample(cands, SAMPLE_THRESHOLD, rnd) : cands;
    const scored = guesses.map((g) => ({
      g,
      s: entropy(g, scoreSet) + (bw ? bw * letterScore(g) : 0),
      inPool: poolSet.has(g),
    }));
    scored.sort((a, b) => b.s - a.s || Number(b.inPool) - Number(a.inPool));
    return scored.map((x) => x.g);
  };

  const solve = (answer) => {
    let cands = [...pool];
    let attempts = 0;
    while (attempts < maxAttempts) {
      let pick;
      if (cands.length <= 2) pick = cands[0];
      else if (attempts >= maxAttempts - 2) pick = ranked(cands)[0]; // güvenlik freni
      else if (attempts === 0) pick = pickBand(openers, lo, hi, rnd);
      else if (gamble && cands.length > 8 && rnd() < gamble)
        pick = cands[Math.floor(rnd() * cands.length)]; // kumarbaz: cevabı dene
      else pick = pickBand(ranked(cands), lo, hi, rnd);
      const fb = pattern(pick, answer);
      attempts++;
      if (pick === answer) return attempts;
      cands = cands.filter((c) => pattern(pick, c) === fb);
      if (!cands.length) cands = [...pool];
    }
    return maxAttempts + 1;
  };

  const dist = new Array(maxAttempts + 1).fill(0);
  let tot = 0;
  let solved = 0;
  for (let i = 0; i < matches; i++) {
    const answer = pool[Math.floor(rnd() * pool.length)];
    const att = solve(answer);
    if (att <= maxAttempts) {
      solved++;
      tot += att;
      dist[att - 1]++;
    } else {
      dist[maxAttempts]++;
    }
  }
  return {
    avg: +(tot / Math.max(1, solved)).toFixed(2),
    unsolvedPct: +((dist[maxAttempts] / matches) * 100).toFixed(1),
    dist,
    matches,
  };
}

/**
 * Birden çok config'i sırayla ölç. configs = { key: {band, bias?, ...}, ... }.
 * Her config aynı tohumla ölçülür → sonuçlar karşılaştırılabilir.
 */
function measureAll(pool, configs, opts = {}) {
  const out = {};
  for (const [key, cfg] of Object.entries(configs)) {
    out[key] = measure(pool, cfg, opts);
  }
  return out;
}

module.exports = { measure, measureAll, pattern, entropy };
