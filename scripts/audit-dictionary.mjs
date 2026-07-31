/**
 * KELİMEBAZ — GEÇERLİ TAHMİN SÖZLÜĞÜ DENETİMİ (şüpheli otomatik-üretim kelimeleri).
 *
 * Sözlük (valid-words) üç katmanlı bir hatla OTOMATİK üretiliyor; biçimbilim
 * süzgeci "türetilebilir mi?" der ama dilbilgisel her şey GERÇEK kelime değildir.
 * Bu betik, insan gözü görmemiş listede ŞÜPHELİ ALT KÜMEYİ ölçütlerle çıkarır:
 *
 *   1) ALIŞILMADIK HARF ÖRÜNTÜSÜ — listenin geneline göre çok NADİR üçlü harf
 *      dizileri (trigram) içeren kelimeler (sözlüğün kendisi frekans referansı).
 *   2) ÜNSÜZ KÜMESİ — Türkçe fonotaktiğine aykırı ardışık ünsüz yığılması.
 *   3) UZUNLUK — uzun türetilmiş biçimler daha sık uydurma olur.
 *
 * Bu ölçütlerle bir ŞÜPHE PUANI hesaplanır; en şüpheli alt küme raporlanır.
 *
 * DENETİM: ANTHROPIC_API_KEY verilirse her şüpheliye "gerçek Türkçe kelime mi?"
 * sorulup üç kovaya ayrılır (kesin-sil / şüpheli / tut) ve yazılır. Anahtar
 * yoksa yalnız şüpheli liste + istatistik çıkar (elle küratörlük için).
 *
 * GÜVENLİK: CEVAP HAVUZUNDAKİ (words.json) hiçbir kelime şüpheli sayılmaz —
 * onlar zaten elle/korpus-küratörlü, dokunulmaz.
 *
 * Kullanım: node scripts/audit-dictionary.mjs [tr|en] [topN]
 */
import { readFile, writeFile } from 'node:fs/promises';

const LANG = process.argv[2] === 'en' ? 'en' : 'tr';
const TOP_N = Number(process.argv[3] || 800);
const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.AUDIT_MODEL || 'claude-opus-4-8';

const validFile = LANG === 'tr' ? 'valid-words.json' : 'valid-words-en.json';
const answerFile = LANG === 'tr' ? 'words.json' : 'words-en.json';

const validRaw = JSON.parse(await readFile(`src/app/data/${validFile}`, 'utf8')).words;
const words = (typeof validRaw === 'string' ? validRaw.split(' ') : validRaw).filter(Boolean);
const answersRaw = JSON.parse(await readFile(`src/app/data/${answerFile}`, 'utf8')).words;
const answers = new Set(
  (Array.isArray(answersRaw) ? answersRaw : Object.values(answersRaw).flat()).map((w) =>
    LANG === 'tr' ? w.toLocaleUpperCase('tr') : w.toUpperCase(),
  ),
);

const chars = (w) => [...w];
const VOWELS = LANG === 'tr' ? new Set([...'AEIİOÖUÜ']) : new Set([...'AEIOU']);

// ── 1) Trigram frekansı (tüm liste referans) ──
const tri = new Map();
for (const w of words) {
  const c = chars(w);
  for (let i = 0; i + 2 < c.length; i++) {
    const t = c[i] + c[i + 1] + c[i + 2];
    tri.set(t, (tri.get(t) ?? 0) + 1);
  }
}

/** En nadir trigramın (log) frekansı — düşük = şüpheli. */
function rarestTri(w) {
  const c = chars(w);
  let min = Infinity;
  for (let i = 0; i + 2 < c.length; i++) {
    const f = tri.get(c[i] + c[i + 1] + c[i + 2]) ?? 0;
    if (f < min) min = f;
  }
  return min === Infinity ? 50 : min;
}

/** En uzun ardışık ünsüz dizisi. */
function maxConsRun(w) {
  let run = 0;
  let max = 0;
  for (const ch of chars(w)) {
    if (VOWELS.has(ch)) run = 0;
    else max = Math.max(max, ++run);
  }
  return max;
}

// ── Şüphe puanı ──
function suspicion(w) {
  const rare = rarestTri(w); // 0..∞ (küçük = nadir)
  const cons = maxConsRun(w); // 1..
  const len = chars(w).length;
  // Nadir trigram ağır basar; ünsüz yığılması ve uzunluk ekler.
  let score = 0;
  if (rare <= 1) score += 5;
  else if (rare <= 3) score += 3;
  else if (rare <= 8) score += 1.5;
  if (cons >= 4) score += 3;
  else if (cons >= 3) score += 1;
  if (len >= 7) score += 1;
  return score;
}

const scored = words
  .filter((w) => !answers.has(w)) // cevap havuzu DOKUNULMAZ
  .map((w) => ({ w, s: suspicion(w) }))
  .filter((x) => x.s >= 3) // eşik: yalnız belirgin şüpheliler
  .sort((a, b) => b.s - a.s);

const suspects = scored.slice(0, TOP_N).map((x) => x.w);

console.log(`\n[${LANG}] Sözlük: ${words.length} · Cevap havuzu (dokunulmaz): ${answers.size}`);
console.log(
  `Şüphe eşiği ≥3 → ${scored.length} şüpheli · en şüpheli ${suspects.length} incelemeye alındı`,
);
console.log(`\nEN ŞÜPHELİ 60:\n${suspects.slice(0, 60).join(' ')}`);

await writeFile(
  `src/app/data/.audit-suspects-${LANG}.json`,
  JSON.stringify({ lang: LANG, count: suspects.length, suspects }, null, 0) + '\n',
);
console.log(`\nŞüpheli liste yazıldı → .audit-suspects-${LANG}.json`);

// ── LLM denetimi (anahtar varsa) ──
if (!KEY) {
  console.log('\n(ANTHROPIC_API_KEY yok → yalnız şüpheli çıkarıldı; LLM denetimi atlandı.)');
  console.log(
    'Anahtar verilince: node scripts/audit-dictionary.mjs ' + LANG + ' → 3 kovaya ayırır.',
  );
} else {
  const langName = LANG === 'tr' ? 'Türkçe' : 'İngilizce';
  const remove = [];
  const review = [];
  const keep = [];
  const BATCH = 50;
  for (let i = 0; i < suspects.length; i += BATCH) {
    const batch = suspects.slice(i, i + BATCH);
    const system = `Sen bir ${langName} sözlük uzmanısın. Verilen her kelime için GERÇEK, sözlükte yer alan bir ${langName} kelimesi mi karar ver. Emin değilsen "review" de (yanlış silme, tutmaktan kötüdür). YALNIZCA JSON dizi döndür: [{"w":"KELİME","v":"remove|review|keep"}] — remove=kesinlikle uydurma/kelime değil, keep=gerçek kelime, review=şüpheli.`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: batch.join(', ') }],
      }),
    });
    if (!r.ok) throw new Error('api_' + r.status);
    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    for (const { w, v } of arr) {
      if (answers.has(w)) continue; // güvenlik
      (v === 'remove' ? remove : v === 'keep' ? keep : review).push(w);
    }
    process.stdout.write(`\rLLM: ${Math.min(i + BATCH, suspects.length)}/${suspects.length}`);
  }
  process.stdout.write('\n');
  await writeFile(
    `src/app/data/.audit-verdicts-${LANG}.json`,
    JSON.stringify({ remove, review, keep }, null, 0) + '\n',
  );
  console.log(
    `\nDENETİM: kesin-sil ${remove.length} · şüpheli(elle) ${review.length} · tut ${keep.length}`,
  );
  console.log(`KESİN-SİL örnek: ${remove.slice(0, 40).join(' ')}`);
}
