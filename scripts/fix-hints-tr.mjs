// hints-tr.json son-işlem: İngilizce cevaba çok benzeyen (kognat) Türkçe kelimeleri gizle.
// Örn. DOCTOR -> "Bir doktor": "doktor" ≈ "doctor" -> "—" yapılır (cevap sızmasın).
import { readFile, writeFile } from 'node:fs/promises';
const EN = new URL('../src/app/data/hints-en.json', import.meta.url);
const TR = new URL('../src/app/data/hints-tr.json', import.meta.url);
const en = JSON.parse(await readFile(EN));
const tr = JSON.parse(await readFile(TR));

function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
// TR küçük harf (İ/ı kurallı) — kognat karşılaştırması için sadeleştir
const norm = (s) => s.toLowerCase().replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');

let fixed = 0, samples = [];
for (const [W, o] of Object.entries(tr)) {
  if (!o.h) continue;
  const a = norm(W); // İngilizce cevap (normalize)
  const before = o.h;
  o.h = o.h.replace(/[\p{L}]+/gu, (tok) => {
    if (tok.length < 4) return tok;
    const b = norm(tok);
    const d = lev(a, b);
    // çok benzer (kognat) → gizle: kısa kelimede tam yakın, uzunda 2'ye kadar
    const thr = a.length <= 5 ? 1 : 2;
    if (d <= thr && Math.abs(a.length - b.length) <= 2) return '—';
    return tok;
  }).replace(/(—\s*){2,}/g, '— ').replace(/\s+/g, ' ')
    .replace(/^\s*—\s*/, '').replace(/\s*—\s*$/, '') // baş/son redakte tirelerini at
    .trim();
  if (o.h.replace(/[—\s.,]/g, '').length < 4) o.h = ''; // neredeyse tamamı gizlendi → kategori yeter
  if (o.h !== before) { fixed++; if (samples.length < 12) samples.push(`${W}: "${before}" -> "${o.h}"`); }
}
await writeFile(TR, JSON.stringify(tr));
console.log(`Kognat gizleme: ${fixed} ipucu düzeltildi.`);
for (const s of samples) console.log('  ' + s);
