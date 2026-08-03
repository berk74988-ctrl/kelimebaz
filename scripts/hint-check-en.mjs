/**
 * hints-en.json OTOMATİK DENETİMİ (İngilizce).
 * - Her cevap kelimesi için ipucu var mı? (kapsam)
 * - Her ipucunda sözcük türü (c) ve tanım (h) dolu mu?
 * - Hiçbir açıklama … ile KESİK ya da boşta "—" içermiyor mu? (redaction artığı)
 * - Hiçbir açıklama cevabı/kökünü/çekimini/türevini içermiyor mu? (sızıntı)
 * Çıkış kodu: eksik/boş/kesik/sızıntı varsa 1 (CI'da kırar), temizse 0.
 *
 * Kullanım: node scripts/hint-check-en.mjs
 */
import { readFile } from 'node:fs/promises';
import { checkLeakEn } from './lib-hint-leak-en.mjs';

const WORDS = new URL('../src/app/data/words-en.json', import.meta.url);
const HINTS = new URL('../src/app/data/hints-en.json', import.meta.url);

const words = JSON.parse(await readFile(WORDS)).words;
const hints = JSON.parse(await readFile(HINTS));

const missing = [];
const empty = [];
const truncated = [];
const leaks = [];
for (const w of words) {
  const h = hints[w];
  if (!h || !h.h) {
    (h ? empty : missing).push(w);
    continue;
  }
  if (!h.c || !String(h.c).trim()) empty.push(w);
  // Kesik/boşta-— (redaction artığı) ya da çok kısa
  if (/[…—]/.test(h.h) || h.h.trim().endsWith('...') || h.h.trim().length < 8)
    truncated.push(`${w} → ${h.h}`);
  if (checkLeakEn(w, h.h)) leaks.push(`${w} → [${h.c}] ${h.h}`);
}

console.log(`Kapsam : ${words.length - missing.length}/${words.length} kelimede ipucu var`);
console.log(`Boş    : ${empty.length}`);
console.log(`Kesik / boşta —: ${truncated.length}`);
console.log(`Sızıntı: ${leaks.length}`);
if (missing.length)
  console.log('  EKSİK:', missing.slice(0, 20).join(' '), missing.length > 20 ? '…' : '');
for (const l of truncated.slice(0, 15)) console.log('  KESİK:', l);
for (const l of leaks.slice(0, 15)) console.log('  SIZINTI:', l);

const fail = missing.length || empty.length || truncated.length || leaks.length;
if (fail) {
  console.error(
    `\n❌ Denetim başarısız (eksik ${missing.length}, boş ${empty.length}, kesik ${truncated.length}, sızıntı ${leaks.length}).`,
  );
  process.exit(1);
}
console.log('\n✅ Denetim temiz: her kelimede tür+tanım var, kesik/boşta-— yok, sızıntı yok.');
