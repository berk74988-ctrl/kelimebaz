/**
 * hints-de.json OTOMATİK DENETİMİ (Almanca).
 * - Her cevap kelimesi için ipucu var mı? (kapsam)
 * - Her ipucunda sözcük türü (c) ve tanım (h) dolu mu?
 * - Artikel YALNIZCA isimlerde mi? ("Substantiv (der/das/die)"; fiil/sıfat/zarfta artikel YOK)
 * - Hiçbir açıklama cevabı/kökünü/çekimini içermiyor mu? (Almanca sızıntı denetimi)
 * - Türü belirlenemeyen (c = "?") kaç tane? (işaretli — bilgi amaçlı, hata değil)
 * Çıkış kodu: eksik/boş/sızıntı/kaçak-artikel varsa 1 (CI'da kırar), temizse 0.
 *
 * Kullanım: node scripts/hint-check-de.mjs
 */
import { readFile } from 'node:fs/promises';
import { checkLeakDe } from './lib-hint-leak-de.mjs';

const WORDS = new URL('../src/app/data/words-de.json', import.meta.url);
const HINTS = new URL('../src/app/data/hints-de.json', import.meta.url);

const words = JSON.parse(await readFile(WORDS)).words;
const hints = JSON.parse(await readFile(HINTS));

const NOUN = /^Substantiv \((der|das|die)\)$/;
// İsim dışı geçerli türler: temel 4'ün yanında dilbilgisel diğer sınıflar
// (sayı/ünlem/zamir/edat) + özel ad/yabancı sözcük (havuzda İngilizce/isim var).
const NONNOUN =
  /^(Verb|Adjektiv|Adverb|Zahlwort|Interjektion|Pronomen|Präposition|Eigenname|Fremdwort)$/;

const missing = [];
const empty = [];
const leaks = [];
const strayArticle = []; // isim olmayan ama artikel/Substantiv etiketli
const unknown = []; // c = "?" (türü belirlenemeyen — işaretli)
for (const w of words) {
  const h = hints[w];
  if (!h || !h.h) {
    (h ? empty : missing).push(w);
    continue;
  }
  if (checkLeakDe(w, h.h)) leaks.push(`${w} → [${h.c}] ${h.h}`);
  if (h.c === '?') unknown.push(w);
  else if (!NOUN.test(h.c) && !NONNOUN.test(h.c)) strayArticle.push(`${w} → ${h.c}`);
}

console.log(`Kapsam : ${words.length - missing.length}/${words.length} kelimede ipucu var`);
console.log(`Boş    : ${empty.length}`);
console.log(`Sızıntı: ${leaks.length}`);
console.log(`Kaçak/bozuk tür etiketi: ${strayArticle.length}`);
console.log(`Türü belirlenemeyen (?): ${unknown.length}  (işaretli — elle gözden geçirilir)`);
if (missing.length)
  console.log('  EKSİK:', missing.slice(0, 20).join(' '), missing.length > 20 ? '…' : '');
if (leaks.length) {
  console.log('  SIZINTILI:');
  for (const l of leaks.slice(0, 20)) console.log('   ', l);
}
if (strayArticle.length) {
  console.log('  BOZUK ETİKET:');
  for (const l of strayArticle.slice(0, 20)) console.log('   ', l);
}

const fail = missing.length || empty.length || leaks.length || strayArticle.length;
if (fail) {
  console.error(
    `\n❌ Denetim başarısız (eksik ${missing.length}, boş ${empty.length}, sızıntı ${leaks.length}, bozuk-etiket ${strayArticle.length}).`,
  );
  process.exit(1);
}
console.log(
  '\n✅ Denetim temiz: her kelimede tür+tanım var, artikel yalnız isimlerde, sızıntı yok.',
);
