/**
 * KARA LİSTEYİ MEVCUT SÖZLÜĞE UYGULA — tam üretim hattını (uzak veri) yeniden
 * koşmadan, denetimden geçmiş sahte biçimleri valid-words.json'dan çıkarır.
 *
 * (Aynı çıkarma build-dictionary.mjs'e KALICI katman olarak da eklendi; bu betik
 * ağsız, anında uygulama içindir.)
 *
 * GÜVENLİK: CEVAP HAVUZUNDAKİ (words.json) hiçbir kelime çıkarılmaz — kara
 * listede cevap havuzuyla kesişen bir kelime varsa HATA verir (küratör yanlışı).
 *
 * Kullanım: node scripts/apply-blacklist.mjs [tr|en]
 */
import { readFile, writeFile } from 'node:fs/promises';

const LANG = process.argv[2] === 'en' ? 'en' : 'tr';
const validFile = `src/app/data/valid-words.json`.replace(
  'valid-words',
  LANG === 'tr' ? 'valid-words' : 'valid-words-en',
);
const answerFile = LANG === 'tr' ? 'src/app/data/words.json' : 'src/app/data/words-en.json';
const blFile = `src/app/data/blacklist-${LANG}.json`;
const up = (w) => (LANG === 'tr' ? w.toLocaleUpperCase('tr') : w.toUpperCase());

let blWords;
try {
  blWords = JSON.parse(await readFile(blFile, 'utf8')).words.map(up);
} catch {
  console.log(`[${LANG}] kara liste yok (${blFile}) — çıkarma yapılmadı.`);
  process.exit(0);
}
const blacklist = new Set(blWords);

const validRaw = JSON.parse(await readFile(validFile, 'utf8'));
const words = validRaw.words.split(' ').filter(Boolean);
const before = words.length;

const answersRaw = JSON.parse(await readFile(answerFile, 'utf8')).words;
const answers = new Set(
  (Array.isArray(answersRaw) ? answersRaw : Object.values(answersRaw).flat()).map(up),
);

// GÜVENLİK: kara listede cevap havuzuyla kesişen varsa DUR.
const collide = [...blacklist].filter((w) => answers.has(w));
if (collide.length) {
  console.error(`❌ Kara liste cevap havuzuyla çakışıyor (silinmez!): ${collide.join(' ')}`);
  process.exit(1);
}

const wordSet = new Set(words);
const removed = [...blacklist].filter((w) => wordSet.has(w));
const notFound = [...blacklist].filter((w) => !wordSet.has(w));
const cleaned = words.filter((w) => !blacklist.has(w));

validRaw.count = cleaned.length;
validRaw.words = cleaned.join(' ');
await writeFile(validFile, JSON.stringify(validRaw) + '\n', 'utf8');

console.log(`\n[${LANG}] KARA LİSTE UYGULANDI`);
console.log(`  ÖNCESİ:  ${before} kelime`);
console.log(`  SONRASI: ${cleaned.length} kelime  (−${before - cleaned.length})`);
console.log(`  Çıkarılan (${removed.length}): ${removed.join(' ') || '(yok)'}`);
if (notFound.length) console.log(`  Zaten yoktu (${notFound.length}): ${notFound.join(' ')}`);
console.log(`  ✓ Cevap havuzundan hiçbir kelime silinmedi.`);
