/**
 * İngilizce cevap kelimeleri için İPUCU verisi üretir (build-time).
 * Kaynak: Free Dictionary API (dictionaryapi.dev). Her kelime için kategori
 * (isimlerde hayvan/yiyecek/eşya... ; diğerlerinde tür) + kısa, CEVABI GİZLEYEN
 * bir açıklama çıkarır. Çıktı: src/app/data/hints-en.json { "HOUSE": {c,h}, ... }
 *
 * Kullanım: node scripts/build-hints-en.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const ANS = JSON.parse(await readFile(new URL('../src/app/data/words-en.json', import.meta.url))).words;
const OUT = new URL('../src/app/data/hints-en.json', import.meta.url);
const api = (w) => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w.toLowerCase())}`;

const CAT = [
  ['Animal', /\b(animal|mammal|bird|fish|insect|reptile|amphibian|creature|rodent|feline|canine|livestock|beast)\b/i],
  ['Food', /\b(food|fruit|vegetable|dish|meal|edible|snack|dessert|meat|grain|spice|drink|beverage|sauce|bread|cheese)\b/i],
  ['Body', /\b(organ|bone|muscle|limb|human body|part of the body|joint|tissue)\b/i],
  ['Plant', /\b(plant|tree|flower|shrub|herb|vegetation|crop|weed|leaf|seed)\b/i],
  ['Person', /\b(person who|one who|someone who|a person|people who|worker|professional|expert in)\b/i],
  ['Place', /\b(place|area|region|building|location|country|city|town|room|structure|piece of land|ground)\b/i],
  ['Tool', /\b(tool|device|instrument|utensil|implement|apparatus|machine|container|equipment)\b/i],
  ['Clothing', /\b(garment|clothing|worn on|apparel|footwear|worn over)\b/i],
  ['Vehicle', /\b(vehicle|boat|aircraft|craft|carriage|transport)\b/i],
  ['Nature', /\b(weather|natural phenomenon|geological|celestial|mineral|rock|element|body of water)\b/i],
  ['Material', /\b(material|substance|fabric|metal|liquid|powder|cloth)\b/i],
  ['Time', /\b(unit of time|period of time|month|season|part of the day|point in time)\b/i],
];

function categorize(pos, def) {
  if (pos === 'noun') {
    for (const [label, rx] of CAT) if (rx.test(def)) return label;
    return 'Noun';
  }
  const map = { verb: 'Verb', adjective: 'Adjective', adverb: 'Adverb', pronoun: 'Pronoun', preposition: 'Preposition', conjunction: 'Conjunction', interjection: 'Exclamation', determiner: 'Determiner', exclamation: 'Exclamation' };
  return map[pos] || 'Word';
}

function sanitize(def, word) {
  const w = word.toLowerCase();
  const forms = new Set([w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'd', w + 'r', w + 'ly', 'un' + w]);
  if (w.endsWith('y')) { forms.add(w.slice(0, -1) + 'ies'); forms.add(w.slice(0, -1) + 'ied'); }
  if (w.endsWith('e')) { forms.add(w.slice(0, -1) + 'ing'); forms.add(w.slice(0, -1) + 'ed'); }
  const rx = new RegExp(`\\b(${[...forms].join('|')})\\b`, 'gi');
  let s = def.replace(/\([^)]*\)/g, ' ').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(rx, '—'); // kelimeyi ve çekimlerini gizle
  s = s.split(/[.;:]/)[0].trim(); // ilk cümle
  s = s.replace(/^(a|an|the|to|used to|of or relating to|relating to)\s+/i, (m) => m); // baştaki artikeli koru
  if (s.length > 72) s = s.slice(0, 69).trim() + '…';
  return s;
}

async function fetchWord(w, tries = 5) {
  for (let t = 0; t < tries; t++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(api(w), { signal: ctrl.signal });
      clearTimeout(to);
      if (r.status === 404) return null;
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 800 + t * 1200)); continue; } // oran sınırı → bekle
      if (!r.ok) throw new Error('http ' + r.status);
      const data = await r.json();
      if (!Array.isArray(data)) return null;
      // önce isim anlamını dene (kategori için en zengin), yoksa ilk anlam
      const meanings = data.flatMap((e) => e.meanings || []);
      if (!meanings.length) return null;
      const noun = meanings.find((m) => m.partOfSpeech === 'noun');
      const m = noun || meanings[0];
      const def = (m.definitions || []).map((d) => d.definition).find((d) => d && d.length > 5);
      if (!def) return null;
      const cat = categorize(m.partOfSpeech, def);
      const hint = sanitize(def, w);
      if (!hint || hint.replace(/[—\s]/g, '').length < 4) return { c: cat, h: '' }; // açıklama zayıf → kategori yeter
      return { c: cat, h: hint };
    } catch {
      if (t === tries - 1) return null;
      await new Promise((res) => setTimeout(res, 400));
    }
  }
  return null;
}

// DEVAM: mevcut çıktı varsa yükle, yalnızca eksik kelimeleri çek (resume)
let out = {};
try { out = JSON.parse(await readFile(OUT)); } catch { out = {}; }
const todo = ANS.filter((w) => !out[w.toUpperCase()]);
let done = 0, found = Object.keys(out).length;
const CONC = 4;
let idx = 0;
async function worker() {
  while (idx < todo.length) {
    const w = todo[idx++];
    const r = await fetchWord(w);
    done++;
    if (r) { out[w.toUpperCase()] = r; found++; }
    if (done % 150 === 0) { console.log(`  ${done}/${todo.length} denendi · toplam bulunan: ${found}`); await writeFile(OUT, JSON.stringify(out)); }
  }
}
console.log(`İpucu üretiliyor: ${todo.length} eksik kelime (mevcut: ${Object.keys(out).length})...`);
await Promise.all(Array.from({ length: CONC }, worker));

await writeFile(OUT, JSON.stringify(out));
const size = JSON.stringify(out).length;
console.log(`\n✅ Bitti: ${found}/${ANS.length} kelime için ipucu (${(size / 1024).toFixed(0)} KB) → src/app/data/hints-en.json`);
// örnek
const keys = Object.keys(out).slice(0, 8);
for (const k of keys) console.log(`  ${k}: [${out[k].c}] ${out[k].h}`);
