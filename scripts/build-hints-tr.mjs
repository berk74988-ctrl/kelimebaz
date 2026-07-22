/**
 * İngilizce ipuçlarını TÜRKÇEye çevirir: hints-en.json → hints-tr.json.
 * Kategori: manuel eşleme (doğal TR). Açıklama: Google Translate (gtx) ile toplu çeviri.
 * Oyuncu İngilizce kelimelerle oynar ama ipucu Türkçe gösterilir. Cevap İngilizce
 * olduğundan Türkçe çeviri onu zaten içermez (doğal koruma).
 *
 * Kullanım: node scripts/build-hints-tr.mjs   (resume'lu — kesilirse kaldığından devam)
 */
import { readFile, writeFile } from 'node:fs/promises';

const EN = new URL('../src/app/data/hints-en.json', import.meta.url);
const TR = new URL('../src/app/data/hints-tr.json', import.meta.url);

const CAT_TR = {
  Animal: 'Hayvan', Food: 'Yiyecek', Place: 'Yer', Person: 'Kişi', Tool: 'Eşya',
  Plant: 'Bitki', Material: 'Madde', Nature: 'Doğa', Color: 'Renk', Time: 'Zaman',
  Body: 'Vücut', Clothing: 'Giysi', Vehicle: 'Araç', Noun: 'İsim', Verb: 'Fiil',
  Adjective: 'Sıfat', Adverb: 'Zarf', Pronoun: 'Zamir', Preposition: 'Edat',
  Conjunction: 'Bağlaç', Exclamation: 'Ünlem', Determiner: 'Belirteç', Word: 'Kelime',
};

async function gtx(lines, tries = 5) {
  const q = lines.join('\n');
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(q)}`;
  for (let t = 0; t < tries; t++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 1000 + t * 1500)); continue; }
      if (!r.ok) throw new Error('http ' + r.status);
      const d = await r.json();
      const segs = d[0].map((s) => s[0]).join('');
      const out = segs.split('\n');
      if (out.length === lines.length) return out.map((s) => s.trim());
      // hizalama bozuldu → tek tek çevir (güvenli yol)
      const one = [];
      for (const ln of lines) { one.push((await gtxOne(ln)) || ln); }
      return one;
    } catch {
      if (t === tries - 1) return null;
      await new Promise((s) => setTimeout(s, 500));
    }
  }
  return null;
}
async function gtxOne(line) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(line)}`;
  try { const r = await fetch(url); const d = await r.json(); return d[0].map((s) => s[0]).join('').trim(); } catch { return null; }
}

const en = JSON.parse(await readFile(EN));
let tr = {};
try { tr = JSON.parse(await readFile(TR)); } catch { tr = {}; }

const words = Object.keys(en);
const todo = words.filter((w) => !tr[w]);
console.log(`Çeviri: ${todo.length} eksik ipucu (mevcut: ${Object.keys(tr).length} / toplam ${words.length})`);

// açıklaması olan kelimeleri toplu çevir; sadece kategorili olanları anında ata
const BATCH = 20, CONC = 3;
const batches = [];
let cur = [];
for (const w of todo) {
  const h = (en[w].h || '').trim();
  if (!h) { tr[w] = { c: CAT_TR[en[w].c] || en[w].c, h: '' }; continue; } // açıklama yok → sadece kategori
  cur.push(w);
  if (cur.length >= BATCH) { batches.push(cur); cur = []; }
}
if (cur.length) batches.push(cur);

let bi = 0, done = 0;
async function worker() {
  while (bi < batches.length) {
    const batch = batches[bi++];
    const lines = batch.map((w) => en[w].h);
    const res = await gtx(lines);
    for (let i = 0; i < batch.length; i++) {
      const w = batch[i];
      const ht = (res && res[i]) ? res[i] : en[w].h; // çeviri olmazsa İngilizce'ye düş
      tr[w] = { c: CAT_TR[en[w].c] || en[w].c, h: ht };
    }
    done += batch.length;
    if (done % 200 < BATCH) { console.log(`  ~${done}/${todo.length} çevrildi`); await writeFile(TR, JSON.stringify(tr)); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

await writeFile(TR, JSON.stringify(tr));
console.log(`\n✅ Bitti: ${Object.keys(tr).length} Türkçe ipucu → src/app/data/hints-tr.json (${(JSON.stringify(tr).length / 1024).toFixed(0)} KB)`);
for (const w of ['APPLE', 'TIGER', 'DOCTOR', 'HOUSE', 'GREEN', 'RIVER']) if (tr[w]) console.log(`  ${w}: [${tr[w].c}] ${tr[w].h}`);
