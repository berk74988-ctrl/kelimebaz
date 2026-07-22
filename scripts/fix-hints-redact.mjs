// hints-en.json son-işlem: cevabın TÜREV eklerini de gizle (yorker→YORK sızıntısını önle).
import { readFile, writeFile } from 'node:fs/promises';
const P = new URL('../src/app/data/hints-en.json', import.meta.url);
const h = JSON.parse(await readFile(P));
let changed = 0;
for (const [W, o] of Object.entries(h)) {
  if (!o.h) continue;
  const w = W.toLowerCase();
  const f = new Set([w, w + 'er', w + 'ers', w + 'est', w + 'ly', w + 'ness', w + 'ment', w + 'tion',
    w + 'ing', w + 'ings', w + 'ish', w + 'ful', w + 'less', w + 'able', w + 'ist', w + 'ism']);
  if (w.endsWith('e')) { const s = w.slice(0, -1); [s + 'er', s + 'ers', s + 'ing', s + 'ist', s + 'ish', s + 'able'].forEach((x) => f.add(x)); }
  if (w.endsWith('y')) { const s = w.slice(0, -1); [s + 'ier', s + 'iest', s + 'ily', s + 'iness'].forEach((x) => f.add(x)); }
  const rx = new RegExp(`\\b(${[...f].join('|')})\\b`, 'gi');
  const before = o.h;
  o.h = o.h.replace(rx, '—').replace(/(—\s*){2,}/g, '— ').replace(/\s+/g, ' ').trim();
  if (o.h !== before) changed++;
}
await writeFile(P, JSON.stringify(h));
console.log(`Son-işlem: ${changed} ipucunda türev ek gizlendi. (toplam ${Object.keys(h).length})`);
// yorker örneği
if (h.YORK) console.log('YORK:', h.YORK.h);
