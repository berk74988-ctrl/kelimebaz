/**
 * KELİME KARTI DENETİMİ (TR + EN).
 * Her cevap kelimesi için kart var mı ve kartta hem TANIM (t) hem ÖRNEK CÜMLE (e)
 * dolu mu? (Kabul: "Her cevap kelimesi için tanım ve örnek cümle görünüyor.")
 * Kartlar oyun SONRASI gösterilir → cevabı gizleme (sızıntı) denetimi YOK.
 * Çıkış kodu: eksik/boş varsa 1 (CI'da kırar), temizse 0.
 *
 * Kullanım: node scripts/card-check.mjs
 */
import { readFile } from 'node:fs/promises';

const D = new URL('../src/app/data/', import.meta.url);
const load = async (n) => JSON.parse(await readFile(new URL(n, D), 'utf8'));

let fail = 0;
for (const [label, wf, cf] of [
  ['TR', 'words.json', 'word-cards-tr.json'],
  ['EN', 'words-en.json', 'word-cards-en.json'],
]) {
  const words = (await load(wf)).words;
  const cards = await load(cf);
  const missing = [];
  const badField = [];
  for (const w of words) {
    const c = cards[w];
    if (!c) {
      missing.push(w);
      continue;
    }
    const t = (c.t || '').trim();
    const e = (c.e || '').trim();
    if (t.length < 4 || e.length < 6) badField.push(`${w} (t:${t.length} e:${e.length})`);
  }
  const ok = words.length - missing.length;
  console.log(
    `[${label}] kapsam: ${ok}/${words.length} · eksik: ${missing.length} · boş/kısa alan: ${badField.length}`,
  );
  if (missing.length)
    console.log('   EKSİK:', missing.slice(0, 20).join(' '), missing.length > 20 ? '…' : '');
  if (badField.length) console.log('   BOŞ/KISA:', badField.slice(0, 15).join(' · '));
  if (missing.length || badField.length) fail++;
}

if (fail) {
  console.error('\n❌ Kart denetimi başarısız — eksik ya da boş tanım/örnek var.');
  process.exit(1);
}
console.log('\n✅ Kart denetimi temiz: her cevap kelimesinde tanım + örnek cümle var (TR + EN).');
