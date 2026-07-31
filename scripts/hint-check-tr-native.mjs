/**
 * hints-tr-native.json OTOMATİK DENETİMİ.
 * - Her cevap kelimesi için ipucu var mı? (kapsam)
 * - Hiçbir açıklama cevabı/kökünü/çekimini içermiyor mu? (sızıntı)
 * Çıkış kodu: sızıntı ya da eksik varsa 1 (CI'da kırar), temizse 0.
 *
 * Kullanım: node scripts/hint-check-tr-native.mjs
 */
import { readFile } from 'node:fs/promises';
import { checkLeak } from './lib-hint-leak.mjs';

const WORDS = new URL('../src/app/data/words.json', import.meta.url);
const HINTS = new URL('../src/app/data/hints-tr-native.json', import.meta.url);

const words = JSON.parse(await readFile(WORDS)).words;
const hints = JSON.parse(await readFile(HINTS));

const missing = [];
const leaks = [];
const empty = [];
for (const w of words) {
  const h = hints[w];
  if (!h || !h.h) {
    (h ? empty : missing).push(w);
    continue;
  }
  if (checkLeak(w, h.h)) leaks.push(`${w} → ${h.h}`);
}

console.log(`Kapsam : ${words.length - missing.length}/${words.length} kelimede ipucu var`);
console.log(`Boş    : ${empty.length}`);
console.log(`Sızıntı: ${leaks.length}`);
if (missing.length)
  console.log('  EKSİK:', missing.slice(0, 30).join(' '), missing.length > 30 ? '…' : '');
if (leaks.length) {
  console.log('  SIZINTILI:');
  for (const l of leaks) console.log('   ', l);
}

if (missing.length || leaks.length || empty.length) {
  console.error(
    `\n❌ Denetim başarısız (eksik ${missing.length}, boş ${empty.length}, sızıntı ${leaks.length}).`,
  );
  process.exit(1);
}
console.log('\n✅ Denetim temiz: her kelimede ipucu var, hiçbiri cevabı sızdırmıyor.');
