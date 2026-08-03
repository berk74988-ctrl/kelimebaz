/**
 * YZ ÇÖZÜCÜ ÖLÇÜMÜ — zorluk = OYUN GÜCÜ (entropi sıralamasında YÜZDELİK DİLİM = band).
 *
 * Havuz: 5 harfli TÜRKÇE cevap havuzu (words.json). Her zorluk için 500 maç
 * (tohumlanmış rastgele cevaplar). Bot HER zorlukta yalnız ipuçlarıyla TUTARLI
 * (havuzdaki geçerli) kelimeler tahmin eder — anlamsız/çelişen tahmin yoktur.
 * Zayıflık, entropi sıralamasında daha AŞAĞIDAN (band) seçmekle gelir. Seçim ölçütü
 * sabit topK değil YÜZDELİK DİLİM → havuz büyüklüğünden BAĞIMSIZ.
 *
 * GÜVENLİK FRENİ: son 2 hakta (attempts>=4) bot EN İYİ tutarlı adayı seçer → çıkmaza
 * girmez. Zayıflık erken/orta turda kalır; hiçbir zorluk maçları çözümsüz bırakmaz
 * (çözememe ≤ %3 hedefi). Renk/entropi mantığı core/ai-opponent.ts ile aynı.
 *
 * ESKİ İDDİA ("yalnız-tutarlı tavan ~3.3") ÖLÇÜLEREK ÇÜRÜTÜLDÜ: sıralamanın ALT
 * ucundan (anti-entropi) seçmek, hiç çelişen tahmin yapmadan Kolay'ı ~4.4'e çıkarır.
 *
 * Kullanım: node scripts/vsai-solver-test.mjs
 */
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const raw = JSON.parse(await readFile(new URL('../src/app/data/words.json', import.meta.url)));
const POOL = raw.words.map((w) => w.toLocaleUpperCase('tr')).filter((w) => [...w].length === 5);

const SAMPLE_THRESHOLD = 300;
const MATCHES = 500;
const MAX_ATTEMPTS = 6;
const UNSOLVED_CAP = 3; // %: hiçbir zorluk bundan çok maçı çözümsüz bırakmamalı
// core/ai-opponent.ts AI_CONFIG ile AYNI band. TARGET = talep edilen hedef ortalama.
const BANDS = { easy: [0.85, 1], medium: [0.4, 0.65], hard: [0, 0] };
const TARGET = { easy: 4.2, medium: 3.6, hard: 3.1 };

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

/** Yüzdelik dilim [lo,hi] içinden seç (0 = en iyi entropi … 1 = en zayıf). */
function pickBand(list, [lo, hi]) {
  const n = list.length;
  if (n <= 1) return list[0];
  const a = Math.floor(lo * (n - 1));
  const b = Math.floor(hi * (n - 1));
  return list[Math.min(n - 1, a + Math.floor(rnd() * (b - a + 1)))];
}

// Derleme zamanı TAM SIRALI açılış listesi (havuzun tamamı, en iyi → en zayıf).
// core/ai-openers.ts'in ürettiğiyle aynı: turn 0 buradan band ile seçer → 0 maliyet
// VE zayıf uç erişilebilir (Kolay merdiveni). Skorlamayı örnekle (build ile uyumlu).
const OPENERS_FULL = (() => {
  const scoreSet = POOL.length > 600 ? sample(POOL, 600) : POOL;
  const scored = POOL.map((g) => ({ g, h: entropy(g, scoreSet) }));
  scored.sort((a, b) => b.h - a.h);
  return scored.map((x) => x.g);
})();

// Çözücü core/ai-opponent.ts pickGuess mantığını birebir yansıtır:
//  cands<=2 → doğrudan · son 2 hak (attempts>=4) → EN İYİ (fren) · ilk tur → açılış
//  listesinden band · yoksa canlı sıralamadan band.
function solve(answer, band) {
  let cands = [...POOL],
    attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    let pick;
    if (cands.length <= 2) pick = cands[0];
    else if (attempts >= MAX_ATTEMPTS - 2) pick = ranked(cands)[0];
    else if (attempts === 0) pick = pickBand(OPENERS_FULL, band);
    else pick = pickBand(ranked(cands), band);
    const fb = pattern(pick, answer);
    attempts++;
    if (pick === answer) return attempts;
    cands = cands.filter((c) => pattern(pick, c) === fb);
    if (!cands.length) cands = [...POOL];
  }
  return MAX_ATTEMPTS + 1;
}

function measure(band) {
  const dist = [0, 0, 0, 0, 0, 0, 0];
  let tot = 0,
    solved = 0;
  for (let i = 0; i < MATCHES; i++) {
    const answer = POOL[Math.floor(rnd() * POOL.length)];
    const att = solve(answer, band);
    if (att <= MAX_ATTEMPTS) {
      solved++;
      tot += att;
      dist[att - 1]++;
    } else dist[6]++;
  }
  return {
    avg: +(tot / Math.max(1, solved)).toFixed(2),
    unsolvedPct: +((dist[6] / MATCHES) * 100).toFixed(1),
    dist,
  };
}

console.log(`Havuz: ${POOL.length} kelimelik 5 harfli TÜRKÇE cevap havuzu · ${MATCHES} maç/band`);
console.log(`Güvenlik freni: son 2 hakta en iyi tutarlı aday (çözememe düşük kalsın)\n`);

// 1) Zorluk ölçümü (AI_CONFIG bandları) — kabul ölçütleri buradan doğrulanır.
const results = {};
for (const diff of ['easy', 'medium', 'hard']) {
  seed = 20260727;
  results[diff] = measure(BANDS[diff]);
}

console.log('Zorluk   | band          | Ort. | Hedef | Çözemedi% | Dağılım (1..6 · X=çözemedi)');
console.log('---------|---------------|------|-------|-----------|----------------------------');
for (const d of ['easy', 'medium', 'hard']) {
  const r = results[d];
  const dz =
    r.dist
      .slice(0, 6)
      .map((n) => String(n).padStart(3))
      .join(' ') +
    '  X:' +
    r.dist[6];
  const bs = `[${BANDS[d][0]}, ${BANDS[d][1]}]`.padEnd(13);
  console.log(
    `${d.padEnd(8)} | ${bs} | ${String(r.avg).padEnd(4)} | ${String(TARGET[d]).padEnd(5)} |   ${String(r.unsolvedPct).padStart(4)}%   | ${dz}`,
  );
}
// Bilgi: en kötü tek tur maliyeti. Makine yüküne göre değişken (deterministik değil) →
// geçme ölçütü DEĞİL. Zayıf açılış sonrası çok aday kalınca örnekleme (SAMPLE=300) tur
// maliyetini ~100-200 ms'e taşır; bu botun saniyelik "düşünme" gecikmesinin arkasında
// görünmez (UI bloklanmaz). Ölçütler: ortalama, fark ve çözememe (aşağıda).
console.log(`\nEn kötü tek tur düşünme süresi (bilgi): ${worstTurnMs.toFixed(2)} ms`);
const gap = +(results.easy.avg - results.hard.avg).toFixed(2);
console.log(`Kolay–Zor ortalama farkı: ${gap} tahmin (hedef ≥ 1.2)`);

// 2) Band tarama — alternatif dilimlerin ort./çözememe karşılaştırması (bilgi amaçlı).
console.log('\nBand tarama (bilgi):');
console.log('band          | Ort. | Çözemedi%');
console.log('--------------|------|----------');
for (const b of [
  [0, 0],
  [0.4, 0.65],
  [0.45, 0.7],
  [0.85, 1],
  [0.9, 1],
  [1, 1],
]) {
  seed = 20260727;
  const r = measure(b);
  console.log(`[${b[0]}, ${b[1]}]`.padEnd(14) + `| ${String(r.avg).padEnd(4)} | ${r.unsolvedPct}%`);
}

const within = (d) => Math.abs(results[d].avg - TARGET[d]) <= 0.3;
const unsolvedOk = (d) => results[d].unsolvedPct <= UNSOLVED_CAP;
const ok =
  within('easy') &&
  within('medium') &&
  within('hard') &&
  results.easy.avg > results.medium.avg &&
  results.medium.avg > results.hard.avg &&
  gap >= 1.2 &&
  unsolvedOk('easy') &&
  unsolvedOk('medium') &&
  unsolvedOk('hard');
console.log(
  ok
    ? `\n✅ Her zorluk hedef ±0.3 · Kolay>Orta>Zor · fark ${gap}≥1.2 · çözememe ≤%${UNSOLVED_CAP}`
    : '\n❌ Kriterler karşılanmadı (band kalibrasyonu gerekebilir)',
);
process.exit(ok ? 0 : 1);
