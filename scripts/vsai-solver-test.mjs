// YZ çözücü doğrulaması: her zorluk gerçekten farklı mı oynuyor? (İngilizce cevap havuzu)
import { readFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile(new URL('../src/app/data/words-en.json', import.meta.url)));
const ALL = raw.words.map((w) => w.toUpperCase());
const byLen = {};
for (const w of ALL) (byLen[[...w].length] ??= []).push(w);

function evaluateGuess(guess, answer) {
  const g = [...guess], a = [...answer];
  const res = Array(g.length).fill('absent'); const pool = new Map();
  for (let i = 0; i < g.length; i++) { if (g[i] === a[i]) res[i] = 'correct'; else pool.set(a[i], (pool.get(a[i]) || 0) + 1); }
  for (let i = 0; i < g.length; i++) { if (res[i] === 'correct') continue; const l = pool.get(g[i]) || 0; if (l > 0) { res[i] = 'present'; pool.set(g[i], l - 1); } }
  return res;
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const CFG = { easy: { smart: 0.4 }, medium: { smart: 0.85 }, hard: { smart: 1.0 } };

function solve(answer, pool, smart, rnd) {
  let cands = [...pool]; let attempts = 0; let solved = false;
  while (attempts < 6 && !solved) {
    let pick;
    if (cands.length <= 3 || rnd() < smart) pick = (cands.length ? cands : pool)[Math.floor(rnd() * (cands.length ? cands.length : pool.length))];
    else pick = pool[Math.floor(rnd() * pool.length)];
    const fb = evaluateGuess(pick, answer);
    attempts++;
    if (pick === answer) { solved = true; break; }
    cands = cands.filter((c) => same(evaluateGuess(pick, c), fb));
    if (!cands.length) cands = [...pool];
  }
  return { solved, attempts };
}

// seeded rng (deterministik)
let seed = 20260720; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const stats = {};
const N = 800;
for (const diff of ['easy', 'medium', 'hard']) {
  let wins = 0, totAtt = 0;
  for (let i = 0; i < N; i++) {
    const len = [4, 5, 6][i % 3];
    const pool = byLen[len]; if (!pool || !pool.length) continue;
    const answer = pool[Math.floor(rnd() * pool.length)];
    const r = solve(answer, pool, CFG[diff].smart, rnd);
    if (r.solved) { wins++; totAtt += r.attempts; }
  }
  stats[diff] = { winPct: Math.round((wins / N) * 100), avgAttempts: +(totAtt / Math.max(1, wins)).toFixed(2) };
}
console.log(JSON.stringify(stats, null, 2));
// Beklenti: hard en yüksek kazanma % + en az deneme; easy en düşük.
const ok = stats.hard.winPct >= stats.medium.winPct && stats.medium.winPct >= stats.easy.winPct
  && stats.hard.avgAttempts <= stats.medium.avgAttempts + 0.05 && stats.easy.winPct < 100;
console.log(ok ? '\n✅ Zorluk seviyeleri farklı oynuyor (hard > medium > easy)' : '\n❌ Zorluk ayrımı zayıf');
process.exit(ok ? 0 : 1);
