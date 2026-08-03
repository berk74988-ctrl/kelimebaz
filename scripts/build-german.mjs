/**
 * KELİMEBAZ — ALMANCA veri üretimi (cevap havuzu + geçerli sözlük + zorluk + İPUÇLARI).
 *
 * Kaynaklar (indirilmiş, argümanla):
 *   1) GEÇERLİ SÖZLÜK: büyük Almanca kelime listesi → geçerli tahminler.
 *   2) FREKANS LİSTESİ: en sık kelimeler → sıralama (yaygın önce).
 *   3) İSİM LİSTESİ (cinsiyetli): german-nouns.csv → cevap havuzu YAYGIN İSİMLERDEN
 *      seçilir (en iyi oyun kelimeleri) + her kelimeye İPUCU: kategori "Substantiv"
 *      + artikel (der/die/das). Sözlük tanımı gerektirmeden gerçek bir ipucu.
 *
 * ALMANCA: A–Z + Ä Ö Ü. ß HARİÇ (büyük harfte SS → uzunluk belirsizliği). 4–7 harf.
 * Küfür/uygunsuz filtre uygulanır (kalan denetim: içerik denetim aracı).
 *
 * Kullanım:
 *   node scripts/build-german.mjs <valid-src.txt> <freq-src.txt> <nouns.csv> [maxAnswers]
 * Yazar: src/app/data/{valid-words-de,words-de,word-difficulty-de,hints-de}.json
 */
import { readFile, writeFile } from 'node:fs/promises';

const [validSrc, freqSrc, nounsSrc] = process.argv.slice(2);
const MAX_ANSWERS = Number(process.argv[5] || 3000);
if (!validSrc || !freqSrc || !nounsSrc) {
  console.error(
    'Kullanım: node scripts/build-german.mjs <valid-src.txt> <freq-src.txt> <nouns.csv> [maxAnswers]',
  );
  process.exit(1);
}

const up = (s) => s.toUpperCase();
const OK = /^[A-ZÄÖÜ]{4,7}$/;
const hasSz = (s) => s.includes('ß') || s.includes('ẞ');
const ARTICLE = { m: 'der', f: 'die', n: 'das' };

const BLOCK = new Set(
  [
    'FICKEN',
    'FICKT',
    'ARSCH',
    'ARSCHE',
    'SCHEIS',
    'HURE',
    'HUREN',
    'FOTZE',
    'FOTZEN',
    'WICHSER',
    'MUSCHI',
    'PENIS',
    'VAGINA',
    'KACKE',
    'KACKEN',
    'PISSE',
    'PISSEN',
    'TITTEN',
    'TITTE',
    'NUTTE',
    'NUTTEN',
    'FRESSE',
    'KOTZEN',
    'SCHWANZ',
    'MOSE',
    'SPACKO',
    'SPASTI',
    'HODEN',
    'NEGER',
    'NEGERN',
    'FASCHO',
    'NAZI',
    'NAZIS',
    'HITLER',
  ].map(up),
);

// İşlev kelimeleri (isimleştirilince "das Aber" gibi isim sayılırlar ama kötü
// oyun cevabıdır) → cevap havuzundan dışla. Genuine isimler öne çıksın.
const STOP = new Set(
  [
    'aber',
    'oder',
    'wenn',
    'weil',
    'dass',
    'denn',
    'doch',
    'noch',
    'schon',
    'nur',
    'auch',
    'sehr',
    'mehr',
    'hier',
    'dort',
    'dann',
    'jetzt',
    'immer',
    'nicht',
    'nein',
    'kein',
    'keine',
    'mein',
    'meine',
    'dein',
    'deine',
    'sein',
    'seine',
    'ihre',
    'ihrer',
    'unser',
    'euch',
    'ihnen',
    'mich',
    'dich',
    'sich',
    'haben',
    'habe',
    'hast',
    'hatte',
    'hatten',
    'wird',
    'werden',
    'wurde',
    'wurden',
    'kann',
    'kannst',
    'muss',
    'musst',
    'soll',
    'sollte',
    'will',
    'willst',
    'wollte',
    'wollen',
    'etwas',
    'nichts',
    'alles',
    'jemand',
    'wieder',
    'gegen',
    'ohne',
    'unter',
    'über',
    'nach',
    'diese',
    'dieser',
    'dieses',
    'jede',
    'jeden',
    'jeder',
    'alle',
    'allen',
    'aller',
    'einen',
    'einem',
    'einer',
    'eines',
    'eine',
    'welche',
    'welcher',
    'warum',
    'wieso',
    'weshalb',
    'womit',
    'wohin',
    'woher',
    'damit',
    'dabei',
    'darum',
    'davon',
    'dazu',
    'sondern',
    'weder',
    'sowie',
    'zwar',
    'also',
    'eben',
    'halt',
    'mal',
    'bloss',
    'gerade',
    'genau',
    'ganz',
    'viel',
    'viele',
    'wenig',
    'ziemlich',
    'ohnehin',
    'trotzdem',
    'deshalb',
    'daher',
    'zwischen',
    'während',
    'obwohl',
    'nachdem',
    'bevor',
    'sobald',
    'falls',
    'komm',
    'kommt',
    'geht',
    'gehen',
    'macht',
    'machen',
    'gemacht',
    'sagen',
    'sagte',
    'gesagt',
    'weiss',
    'weisst',
    'denke',
    'denkst',
    'glaube',
    'sehen',
    'sieht',
    'lassen',
    'lässt',
    'bitte',
    'danke',
    'hallo',
    'tschüss',
    'okay',
    'wirklich',
    'vielleicht',
    'natürlich',
  ].map(up),
);

// --- 1) Geçerli tahmin sözlüğü ---
const valid = new Set();
for (const line of (await readFile(validSrc, 'utf8')).split('\n')) {
  const w0 = line.trim();
  if (!w0 || hasSz(w0)) continue;
  const w = up(w0);
  if (OK.test(w)) valid.add(w);
}
const validSorted = [...valid].sort((a, b) => a.localeCompare(b, 'de'));
console.log(`geçerli tahminler: ${validSorted.length}`);

// --- 2) İsim → cinsiyet (Substantiv) ---
const nounGender = new Map();
for (const line of (await readFile(nounsSrc, 'utf8')).split('\n')) {
  const m = line.match(/^([^,]+),("[^"]*"|[^,]*),([^,]*)/);
  if (!m) continue;
  const lemma = m[1].trim();
  const pos = m[2];
  const genus = m[3].trim();
  if (!/Substantiv/.test(pos) || !(genus in ARTICLE) || hasSz(lemma)) continue;
  const w = up(lemma);
  if (OK.test(w) && !nounGender.has(w)) nounGender.set(w, genus);
}
console.log(`isimler (cinsiyetli, 4–7 harf): ${nounGender.size}`);

// --- 3) Cevap havuzu: YAYGIN İSİMLER (frekans sırası) ∩ geçerli ---
const answers = [];
const seen = new Set();
for (const line of (await readFile(freqSrc, 'utf8')).split('\n')) {
  const w0 = (line.split(/\s+/)[0] || '').trim();
  if (!w0 || hasSz(w0)) continue;
  const w = up(w0);
  if (!OK.test(w) || seen.has(w) || BLOCK.has(w) || STOP.has(w)) continue;
  if (!valid.has(w) || !nounGender.has(w)) continue; // yalnız gerçek + isim (işlev kelimesi değil)
  seen.add(w);
  answers.push(w);
  if (answers.length >= MAX_ANSWERS) break;
}
console.log(`cevap havuzu (yaygın isimler): ${answers.length}`);

// --- 4) İpuçları: kategori + artikel (her cevaba) ---
const hints = {};
for (const w of answers) {
  const g = nounGender.get(w);
  hints[w] = { c: 'Substantiv', h: `Artikel: ${ARTICLE[g]}` };
}

// --- 5) Zorluk (frekans sırasından band 1–5) ---
const scores = {};
answers.forEach((w, i) => {
  scores[w] = Math.min(5, Math.max(1, Math.floor((i / answers.length) * 5) + 1));
});

// --- Yaz ---
await writeFile(
  'src/app/data/valid-words-de.json',
  JSON.stringify({ count: validSorted.length, words: validSorted.join(' ') }) + '\n',
);
await writeFile('src/app/data/words-de.json', JSON.stringify({ words: answers }) + '\n');
await writeFile(
  'src/app/data/word-difficulty-de.json',
  JSON.stringify({ version: 1, source: 'frequency-rank', scores }) + '\n',
);
await writeFile('src/app/data/hints-de.json', JSON.stringify(hints) + '\n');
console.log('yazıldı: valid-words-de · words-de · word-difficulty-de · hints-de');
console.log(
  'örnek:',
  answers
    .slice(0, 12)
    .map((w) => `${w}(${ARTICLE[nounGender.get(w)]})`)
    .join(' '),
);
