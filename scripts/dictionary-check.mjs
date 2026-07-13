/**
 * KELİMEBAZ — sözlük kapsamı doğrulama (gerçek tarayıcı).
 *
 * ÖNCEKİ SORUN: cevap havuzu ile geçerli tahmin listesi AYNIYDI.
 * Oyuncu yalnızca ~200 kelimeyi tahmin edebiliyordu; "BEYİN" gibi apaçık
 * Türkçe kelimeler "Sözlükte yok" diye reddediliyordu.
 *
 * Bu script gerçek oyunda tahmin denemeleri yapıp kabul/red durumunu ölçer.
 *
 * Kullanım: node scripts/dictionary-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

// Cevap havuzunda OLMAYAN ama gerçek Türkçe olan kelimeler → KABUL EDİLMELİ
const SHOULD_ACCEPT = ['BEYİN', 'ERKEK', 'GÜNAH', 'YANAK', 'DELİK', 'HAREM', 'FIKRA', 'ALKOL'];

// Uydurma diziler → REDDEDİLMELİ
const SHOULD_REJECT = ['ZZZZZ', 'ABCDE', 'ÇÇÇÇÇ', 'AAAAA'];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(TARGET, { waitUntil: 'networkidle' });

// Cevabı sabitle ki tahminler asla kazanmasın
await page.evaluate(() => {
  localStorage.setItem(
    'kelimebaz:game:practice',
    JSON.stringify({ mode: 'practice', dayIndex: -1, answer: 'KALEM', guesses: [], status: 'playing' }),
  );
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Serbest Oyna/ }).click();
await page.waitForSelector('app-board');

const dictSize = await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find((e) => e.textContent?.includes('sözlük'));
  return el?.textContent?.trim() ?? '';
});

/** Bir kelimeyi yazıp ENTER'a basar; kabul edildi mi döner. */
async function tryWord(word) {
  for (const ch of word) await page.locator(`.key[aria-label="${ch}"]`).click();
  await page.locator('.key[aria-label="ENTER"]').click();
  await page.waitForTimeout(400);

  const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent?.trim() ?? '');
  const accepted = toast !== 'Sözlükte yok';

  // temizle: kabul edildiyse satır ilerledi, reddedildiyse harfleri sil
  if (accepted) {
    await page.waitForTimeout(1100); // açılma animasyonu + kilit
  } else {
    for (let i = 0; i < 5; i++) await page.locator('.key[aria-label="Sil"]').click();
    await page.waitForTimeout(150);
  }
  return accepted;
}

console.log(`\nHedef: ${TARGET}`);
console.log(`Ekranda yazan: "${dictSize}"\n`);

let fail = 0;

console.log('KABUL EDİLMELİ (gerçek Türkçe, cevap havuzunda değil)');
console.log('─'.repeat(60));
for (const w of SHOULD_ACCEPT) {
  // her kelime için tahtayı sıfırla (6 hak dolmasın)
  await page.evaluate(() => {
    localStorage.setItem(
      'kelimebaz:game:practice',
      JSON.stringify({ mode: 'practice', dayIndex: -1, answer: 'KALEM', guesses: [], status: 'playing' }),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Serbest Oyna/ }).click();
  await page.waitForSelector('app-board');

  const ok = await tryWord(w);
  console.log(`${ok ? '✓' : '✗'} ${w.padEnd(8)} ${ok ? 'kabul edildi' : 'REDDEDİLDİ (hata!)'}`);
  if (!ok) fail++;
}

console.log('\nREDDEDİLMELİ (uydurma)');
console.log('─'.repeat(60));
await page.evaluate(() => {
  localStorage.setItem(
    'kelimebaz:game:practice',
    JSON.stringify({ mode: 'practice', dayIndex: -1, answer: 'KALEM', guesses: [], status: 'playing' }),
  );
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Serbest Oyna/ }).click();
await page.waitForSelector('app-board');

for (const w of SHOULD_REJECT) {
  const accepted = await tryWord(w);
  const ok = !accepted;
  console.log(`${ok ? '✓' : '✗'} ${w.padEnd(8) } ${ok ? 'reddedildi' : 'KABUL EDİLDİ (hata!)'}`);
  if (!ok) fail++;
}

await browser.close();

console.log('\n' + '─'.repeat(60));
if (fail === 0) {
  console.log('\n✅ SÖZLÜK DOĞRU ÇALIŞIYOR\n');
} else {
  console.log(`\n❌ ${fail} kontrol başarısız\n`);
  process.exit(1);
}
