/**
 * KELİMEBAZ — İNGİLİZCE sözlük üretici (4-7 harf).
 *
 * İki liste üretir (Türkçe sürümle aynı biçim):
 *   CEVAPLAR (words-en.json)          → yaygın/bilinen kelimeler (frekansa göre)
 *   GEÇERLİ TAHMİNLER (valid-words-en.json) → gerçek İngilizce kelimeler
 *
 * Kaynaklar (açık kaynak):
 *   - dwyl/english-words words_alpha.txt  → gerçek İngilizce kelime listesi
 *   - hermitdave/FrequencyWords en_50k     → yaygınlık (cevap seçimi + süzme)
 *
 * Kullanım: node scripts/build-dictionary-en.mjs
 */
import { writeFile } from 'node:fs/promises';

const WORDS = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';
const FREQ = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';

const LENGTHS = [4, 5, 6, 7];
const ANSWER_TARGET = { 4: 260, 5: 1500, 6: 620, 7: 460 };

const up = (s) => s.toUpperCase();
const inRange = (w) => w.length >= 4 && w.length <= 7;
const isAlpha = (w) => /^[A-Z]+$/.test(w);
const n = (x) => x.toLocaleString('en');

async function lines(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.text()).split(/\r?\n/);
}

// Aile dostu: argo/müstehcen/hassas kelimeler CEVAP OLMAZ (tahmin olarak kalabilir).
const BLOCK = new Set(
  ('SEX SEXY PORN COCK DICK CUNT FUCK FUCKS SHIT SHITS CRAP DAMN HELL PISS TITS TIT BOOB BOOBS ARSE ANAL ANUS PENIS VAGINA RAPE RAPED SLUT WHORE BITCH BITCHES BASTARD DILDO HORNY NAKED NUDE NUDES DRUG DRUGS HEROIN COCAINE KILL KILLS KILLED MURDER SUICIDE NAZI NIGGA NIGGER FAG FAGS QUEER JIZZ CUM SEMEN SPERM ORGASM PUSSY BALLS BONER HITLER').split(' '),
);

console.log('\n📥 İngilizce kelime listesi indiriliyor...');
const validAll = new Set();
for (const l of await lines(WORDS)) {
  const w = up(l.trim());
  if (inRange(w) && isAlpha(w)) validAll.add(w);
}
console.log(`  ${n(validAll.size)} gerçek İngilizce kelime (4-7 harf)`);

console.log('📥 İngilizce frekans listesi indiriliyor (en_50k)...');
const freq = new Map();
for (const l of await lines(FREQ)) {
  const [w0, c0] = l.trim().split(/\s+/);
  const w = up(w0 || '');
  if (inRange(w) && isAlpha(w)) freq.set(w, (freq.get(w) || 0) + (Number(c0) || 0));
}
console.log(`  ${n(freq.size)} frekans girdisi (4-7 harf)`);

// GEÇERLİ TAHMİNLER: gerçek kelime VE yaygınlıkta görünen (obskür/uydurma dışı).
const valid = new Set();
for (const [w] of freq) if (validAll.has(w)) valid.add(w);
console.log(`  ${n(valid.size)} geçerli tahmin (kelime listesi ∩ frekans)`);

// CEVAP HAVUZU: en yaygın kelimeler, uzunluğa göre, blocklist dışı.
const byFreqDesc = [...freq].sort((a, b) => b[1] - a[1]).map(([w]) => w).filter((w) => validAll.has(w));
const answersByLen = {};
for (const L of LENGTHS) {
  answersByLen[L] = byFreqDesc.filter((w) => w.length === L && !BLOCK.has(w)).slice(0, ANSWER_TARGET[L]);
}
// Her cevap tahmin sözlüğünde olmalı
for (const L of LENGTHS) for (const a of answersByLen[L]) valid.add(a);

// Alfabe denetimi
const final = [...valid].sort();
console.log('\n🔤 Alfabe denetimi (A-Z hepsi oynanabilir mi?)');
const gaps = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((ch) => !final.some((w) => w.includes(ch)));
console.log(gaps.length ? `  ❌ eksik: ${gaps.join(', ')}` : '  ✅ 26 harfin hepsi oynanabilir.');

console.log('\n📊 Uzunluk dağılımı (geçerli / cevap):');
for (const L of LENGTHS) {
  const v = final.filter((w) => w.length === L).length;
  console.log(`  ${L} harf: ${String(n(v)).padStart(7)} tahmin · ${n(answersByLen[L].length)} cevap`);
}

const validOut = { lengths: LENGTHS, count: final.length, note: 'English valid GUESSES (4-7). Secret words are in words-en.json.', words: final.join(' ') };
await writeFile('src/app/data/valid-words-en.json', JSON.stringify(validOut) + '\n', 'utf8');
const allAnswers = LENGTHS.flatMap((L) => answersByLen[L]);
const answersOut = { lengths: LENGTHS, counts: Object.fromEntries(LENGTHS.map((L) => [L, answersByLen[L].length])), note: 'English ANSWER pool (4-7).', words: allAnswers };
await writeFile('src/app/data/words-en.json', JSON.stringify(answersOut, null, 0) + '\n', 'utf8');

const kb = (Buffer.byteLength(JSON.stringify(validOut)) / 1024).toFixed(0);
console.log(`\n💾 valid-words-en.json — ${n(final.length)} kelime, ${kb} KB`);
console.log(`💾 words-en.json — ${n(allAnswers.length)} cevap\n`);
