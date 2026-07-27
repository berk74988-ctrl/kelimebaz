/**
 * KELİMEBAZ — YZ AÇILIŞ KELİMELERİNİ DERLEME ZAMANINDA HESAPLAR.
 *
 * Açılış kelimesi her maçta AYNIDIR (ilk turda henüz ipucu yok, adaylar = tüm
 * havuz). Bu yüzden entropi maksimumu bir kez burada hesaplanır ve
 * `src/app/core/ai-openers.ts` sabitine gömülür → çalışma zamanında ilk tur
 * maliyeti SIFIRA iner (tarayıcıda gecikme olmaz).
 *
 * "En iyi açılış" = aday havuzunu en çok bölen (en yüksek Shannon entropili)
 * tahmin. Renk deseni mantığı `core/evaluate.ts` ile birebir aynıdır.
 *
 * Kullanım: node scripts/build-ai-openers.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const LANGS = /** @type {const} */ (['tr', 'en']);
const LENGTHS = [4, 5, 6, 7];
const SCORE_CAP = 600; // entropiyi bu kadar adaya karşı örnekle (build hızı; sonuç kararlı)

// Dile göre büyük harf — core/lang.ts upperFor ile aynı.
const upperFor = (s, lang) => (lang === 'tr' ? s.toLocaleUpperCase('tr') : s.toUpperCase());

// core/evaluate.ts ile BİREBİR aynı iki-geçişli renk mantığı.
function evaluateGuess(guess, answer) {
  const g = [...guess];
  const a = [...answer];
  const res = new Array(g.length).fill(0); // 0=absent, 1=present, 2=correct
  const pool = new Map();
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) res[i] = 2;
    else pool.set(a[i], (pool.get(a[i]) || 0) + 1);
  }
  for (let i = 0; i < g.length; i++) {
    if (res[i] === 2) continue;
    const left = pool.get(g[i]) || 0;
    if (left > 0) {
      res[i] = 1;
      pool.set(g[i], left - 1);
    }
  }
  return res.join('');
}

/** Bir tahminin, aday kümesini böldüğü desenlerin Shannon entropisi (bit). */
function entropy(guess, cands) {
  const n = cands.length;
  if (n <= 1) return 0;
  const buckets = new Map();
  for (const c of cands) {
    const k = evaluateGuess(guess, c);
    buckets.set(k, (buckets.get(k) || 0) + 1);
  }
  let h = 0;
  for (const count of buckets.values()) {
    const p = count / n;
    h -= p * Math.log2(p);
  }
  return h;
}

// Deterministik RNG (seed sabit → üretilen açılışlar kararlı/tekrarlanabilir).
function makeRng(seed) {
  let s = seed >>> 0;
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

/** Havuzdaki en yüksek entropili açılış kelimesi. */
function bestOpener(pool, rnd) {
  if (pool.length <= 1) return pool[0] || '';
  const scoreSet = pool.length > SCORE_CAP ? sample(pool, SCORE_CAP, rnd) : pool;
  let best = pool[0];
  let bestH = -1;
  for (const g of pool) {
    const h = entropy(g, scoreSet);
    if (h > bestH) {
      bestH = h;
      best = g;
    }
  }
  return best;
}

async function loadAnswers(file, lang) {
  const raw = JSON.parse(await readFile(new URL(`../src/app/data/${file}`, import.meta.url)));
  const byLen = { 4: [], 5: [], 6: [], 7: [] };
  for (const w0 of raw.words) {
    const w = upperFor(w0, lang);
    const L = [...w].length;
    if (byLen[L]) byLen[L].push(w);
  }
  return byLen;
}

const openers = { tr: {}, en: {} };
const report = [];
for (const lang of LANGS) {
  const byLen = await loadAnswers(lang === 'tr' ? 'words.json' : 'words-en.json', lang);
  for (const L of LENGTHS) {
    const pool = byLen[L] || [];
    const rnd = makeRng(2026_07 + L); // uzunluğa göre sabit seed
    const opener = bestOpener(pool, rnd);
    openers[lang][L] = opener;
    report.push(`  ${lang} ${L} harf: ${opener || '(havuz boş)'}  [${pool.length} aday]`);
  }
}

const body =
  `/**\n` +
  ` * OTOMATİK ÜRETİLDİ — scripts/build-ai-openers.mjs (elle düzenleme).\n` +
  ` *\n` +
  ` * YZ açılış kelimeleri: her dil × kelime uzunluğu için EN YÜKSEK ENTROPİLİ ilk\n` +
  ` * tahmin. Derleme zamanında hesaplanır → çalışma zamanında ilk tur gecikmesi yok.\n` +
  ` * Yeniden üretmek: node scripts/build-ai-openers.mjs\n` +
  ` */\n` +
  `export const AI_OPENERS: Record<'tr' | 'en', Record<number, string>> = {\n` +
  `  tr: { 4: '${openers.tr[4]}', 5: '${openers.tr[5]}', 6: '${openers.tr[6]}', 7: '${openers.tr[7]}' },\n` +
  `  en: { 4: '${openers.en[4]}', 5: '${openers.en[5]}', 6: '${openers.en[6]}', 7: '${openers.en[7]}' },\n` +
  `};\n`;

await writeFile(new URL('../src/app/core/ai-openers.ts', import.meta.url), body, 'utf8');

console.log('YZ açılış kelimeleri hesaplandı → src/app/core/ai-openers.ts\n');
console.log(report.join('\n'));
