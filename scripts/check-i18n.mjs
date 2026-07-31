/**
 * ÇEVİRİ TUTARLILIK DENETİMİ — bir dilde olup diğerinde OLMAYAN (ya da BOŞ)
 * anahtarları raporlar. Referans = varsayılan dil (tr). CI'da koşar; tutarsızlık
 * varsa çıkış kodu 1 (eksik çeviriyle birleştirme engellenir).
 *
 * Kullanım: node scripts/check-i18n.mjs   (npm run check:i18n)
 */
import { readdir, readFile } from 'node:fs/promises';

const DIR = new URL('../src/i18n/', import.meta.url);
const REF = 'tr'; // varsayılan dil = kaynak/referans

const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
const dicts = {};
for (const f of files) dicts[f.replace('.json', '')] = JSON.parse(await readFile(new URL(f, DIR)));

if (!dicts[REF]) {
  console.error(`❌ Referans dil dosyası yok: src/i18n/${REF}.json`);
  process.exit(1);
}

const refKeys = Object.keys(dicts[REF]);
const refSet = new Set(refKeys);
let problems = 0;

const empties = (d) => Object.keys(d).filter((k) => !String(d[k] ?? '').trim());

// Referansın kendisinde boş var mı?
const refEmpty = empties(dicts[REF]);
if (refEmpty.length) {
  problems++;
  console.error(`[${REF}] BOŞ ${refEmpty.length}: ${refEmpty.slice(0, 30).join(', ')}`);
}

for (const [lang, d] of Object.entries(dicts)) {
  if (lang === REF) continue;
  const keys = new Set(Object.keys(d));
  const missing = refKeys.filter((k) => !keys.has(k)); // referansta var, bu dilde yok
  const extra = [...keys].filter((k) => !refSet.has(k)); // bu dilde var, referansta yok
  const empty = empties(d);
  if (missing.length || extra.length || empty.length) {
    problems++;
    console.error(`[${lang}] EKSİK ${missing.length} · FAZLA ${extra.length} · BOŞ ${empty.length}`);
    if (missing.length) console.error(`  EKSİK: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? ' …' : ''}`);
    if (extra.length) console.error(`  FAZLA: ${extra.slice(0, 30).join(', ')}${extra.length > 30 ? ' …' : ''}`);
    if (empty.length) console.error(`  BOŞ:   ${empty.slice(0, 30).join(', ')}${empty.length > 30 ? ' …' : ''}`);
  } else {
    console.log(`[${lang}] ✓ ${keys.size} anahtar — ${REF} ile tam uyumlu`);
  }
}

console.log(`\nDiller: ${files.map((f) => f.replace('.json', '')).join(', ')} · referans: ${REF} (${refKeys.length} anahtar)`);
if (problems) {
  console.error('\n❌ Çeviri tutarsızlığı bulundu — düzeltilmeden birleştirme yapılmamalı.');
  process.exit(1);
}
console.log('✅ Tüm diller tutarlı: eksik/fazla/boş anahtar yok.');
