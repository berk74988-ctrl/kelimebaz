/**
 * KELİMEBAZ — sözlük üretici.
 *
 * Açık kaynak Türkçe kelime listelerini indirir, 5 harfli olanları süzer
 * ve oyunun GEÇERLİ TAHMİN sözlüğünü üretir.
 *
 * ÖNEMLİ AYRIM (Wordle'daki gibi):
 *   - CEVAPLAR (words.json)        → elle seçilmiş, bilinen, adil kelimeler
 *   - GEÇERLİ TAHMİNLER (bu dosya) → sözlükteki HER 5 harfli kelime
 *
 * Oyuncu istediği kelimeyi deneyebilsin diye tahmin sözlüğü geniş;
 * ama gizli kelime asla obskür/çekimli bir kelime olmasın diye cevaplar dar.
 *
 * Kullanım: node scripts/build-dictionary.mjs
 */
import { writeFile, readFile } from 'node:fs/promises';

const SOURCES = [
  'https://raw.githubusercontent.com/mertemin/turkish-word-list/master/words.txt',
  'https://raw.githubusercontent.com/CanNuhlar/Turkce-Kelime-Listesi/master/turkce_kelime_listesi.txt',
];

/** Türkçe alfabe — SADECE bu harfler (Q, W, X yok). */
const TR_ALPHABET = new Set('ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ');

const trUpper = (s) => s.toLocaleUpperCase('tr');

console.log('\n📥 Kaynaklar indiriliyor...\n');

const raw = [];
for (const url of SOURCES) {
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  console.log(`  ${lines.length.toLocaleString('tr')} satır  ←  ${url.split('/').slice(-3).join('/')}`);
  raw.push(...lines);
}

console.log(`\n🔍 Süzülüyor (5 harfli, sadece Türkçe alfabe)...`);

const words = new Set();
let skippedLength = 0;
let skippedChars = 0;

for (const line of raw) {
  const w = trUpper(line.trim());
  if (!w) continue;

  const chars = [...w];

  if (chars.length !== 5) {
    skippedLength++;
    continue;
  }

  // Türkçe alfabe dışı karakter varsa at (tire, boşluk, Q/W/X, rakam...)
  if (!chars.every((c) => TR_ALPHABET.has(c))) {
    skippedChars++;
    continue;
  }

  words.add(w);
}

const sorted = [...words].sort((a, b) => a.localeCompare(b, 'tr'));

console.log(`  ${skippedLength.toLocaleString('tr')} kelime → 5 harfli değil`);
console.log(`  ${skippedChars.toLocaleString('tr')} kelime → Türkçe alfabe dışı karakter`);
console.log(`\n✅ ${sorted.length.toLocaleString('tr')} geçerli 5 harfli Türkçe kelime\n`);

// --- Cevap havuzundaki her kelime tahmin sözlüğünde OLMAK ZORUNDA ---
const answersRaw = JSON.parse(await readFile('src/app/data/words.json', 'utf8'));
const answers = answersRaw.words.map(trUpper);
const missing = answers.filter((a) => !words.has(a));

if (missing.length) {
  console.log(`⚠️  Cevap havuzundaki ${missing.length} kelime sözlükte yoktu, eklendi:`);
  console.log(`   ${missing.join(', ')}\n`);
  for (const m of missing) words.add(m);
}

const final = [...words].sort((a, b) => a.localeCompare(b, 'tr'));

/**
 * Kompakt biçim: kelimeleri boşlukla birleştirilmiş TEK bir metin olarak
 * saklıyoruz. JSON dizisi olsaydı her kelime için tırnak + virgül fazladan
 * yer kaplardı — bu hâli belirgin şekilde küçük.
 */
const out = {
  length: 5,
  count: final.length,
  note: 'Geçerli TAHMİN sözlüğü. Gizli kelimeler words.json içindedir.',
  words: final.join(' '),
};

await writeFile('src/app/data/valid-words.json', JSON.stringify(out) + '\n', 'utf8');

const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
console.log(`💾 src/app/data/valid-words.json yazıldı  (${kb} KB, ${final.length.toLocaleString('tr')} kelime)`);
console.log(`   Cevap havuzu: ${answers.length} kelime (words.json — değişmedi)\n`);
