/**
 * KELİMEBAZ — harf ve sözlük sistemi doğrulaması (gerçek tarayıcı).
 *
 * Üç şeyi ÖLÇER (iddia etmez):
 *
 *   1. ALFABE      — 29 harfin her biri gerçekten tahtaya yazılabiliyor mu?
 *                    (ekran klavyesi + Türkçe olmayan fiziksel klavye)
 *   2. KABUL       — geçerli Türkçe kelimeler kabul ediliyor mu?
 *                    Özellikle ÇEKİMLİ biçimler: GELDİ, OLSUN, BABAM...
 *   3. RET         — uydurma diziler ve yazım hataları hâlâ reddediliyor mu?
 *
 * Kullanım: node scripts/dictionary-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

const ALPHABET = [...'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'];

/** Geçerli Türkçe — KABUL EDİLMELİ. Cevap havuzunda olmayanlar seçildi. */
const SHOULD_ACCEPT = [
  // kök kelimeler
  'BEYİN', 'ERKEK', 'GÜNAH', 'YANAK', 'DELİK', 'ALKOL',
  // çekimli biçimler — hiçbir kök sözlüğünde YOK, korpustan + biçimbilimle geldi
  'GELDİ', 'OLSUN', 'BABAM', 'YERDE', 'EVDEN', 'ALDIM', 'YOKTU', 'ADINI', 'MUSUN',
  // Vikisözlük çekim tabloları — korpusta yeterince geçmedikleri için eskiden reddediliyordu
  'ÜTÜYE', 'ÖZETE', 'AĞAMI', 'YENSE', 'ÇÖZSE',
  // alıntı kelimeler (Türkçenin hece yapısına uymaz ama geçerli)
  'ANTRE', 'KLİŞE', 'PLAZA',
];

/** Uydurma diziler ve yazım hataları — REDDEDİLMELİ. */
const SHOULD_REJECT = [
  'ZZZZZ', 'ABCDE', 'ÇÇÇÇÇ', 'AAAAA', // uydurma
  'ALDİM', 'SİMDİ', 'DEGİL', // yazım hatası (ALDIM / ŞİMDİ / DEĞİL)
  'MORAN', 'JETER', // kurallara aykırı türetme (isim köküne fiil eki)
  'ÜVEZM', 'KEDYİ', // Vikisözlük şablon hatası (doğrusu ÜVEZİM)
  'PETER', 'FROST', 'SARAH', 'PARİS', // özel ad
];

const browser = await chromium.launch();
const page = await browser.newPage();

/** Tahtayı temiz bir serbest oyuna sıfırlar (cevap sabit → asla kazanılmaz). */
async function resetBoard() {
  await page.evaluate(() => {
    localStorage.setItem(
      'kelimebaz:game:practice',
      JSON.stringify({ mode: 'practice', dayIndex: -1, answer: 'KALEM', guesses: [], status: 'playing' }),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Serbest Oyna/ }).click();
  await page.waitForSelector('app-board');
}

/** Tahtada yazılı olan harfleri okur (kutular <app-tile> elemanıdır). */
async function boardText() {
  return page.evaluate(() =>
    [...document.querySelectorAll('app-board app-tile')]
      .map((t) => t.textContent?.trim() ?? '')
      .join(''),
  );
}

/** Kelimeyi ekran klavyesiyle yazıp ENTER'a basar; kabul edildi mi döner. */
async function tryWord(word) {
  for (const ch of word) await page.locator(`.key[aria-label="${ch}"]`).click();
  await page.locator('.key[aria-label="ENTER"]').click();
  await page.waitForTimeout(400);

  const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent?.trim() ?? '');
  const accepted = toast !== 'Sözlükte yok';

  if (accepted) {
    await page.waitForTimeout(1100); // açılma animasyonu + giriş kilidi
  } else {
    for (let i = 0; i < 5; i++) await page.locator('.key[aria-label="Sil"]').click();
    await page.waitForTimeout(150);
  }
  return accepted;
}

await page.goto(TARGET, { waitUntil: 'networkidle' });
await resetBoard();

const dictLabel = await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find((e) => e.textContent?.includes('sözlük'));
  return el?.textContent?.trim() ?? '(bulunamadı)';
});

console.log(`\nHedef: ${TARGET}`);

let fail = 0;

// ---------------------------------------------------------------------------
// 1. ALFABE — ekran klavyesi
// ---------------------------------------------------------------------------
console.log('\n1) EKRAN KLAVYESİ — 29 harfin hepsi yazılabiliyor mu?');
console.log('─'.repeat(64));

const missingOnScreen = [];
for (const ch of ALPHABET) {
  const key = page.locator(`.key[aria-label="${ch}"]`);
  if ((await key.count()) === 0) {
    missingOnScreen.push(ch);
    continue;
  }
  await key.click();
  await page.waitForTimeout(40);
  if (!(await boardText()).includes(ch)) missingOnScreen.push(ch);
  await page.locator('.key[aria-label="Sil"]').click();
}
if (missingOnScreen.length) {
  console.log(`✗ Yazılamayan harfler: ${missingOnScreen.join(', ')}`);
  fail++;
} else {
  console.log(`✓ ${ALPHABET.length} harfin hepsi klavyede var ve tahtaya yazılıyor`);
}

// ---------------------------------------------------------------------------
// 2. ALFABE — Türkçe OLMAYAN fiziksel klavye (event.code konum eşlemesi)
// ---------------------------------------------------------------------------
console.log('\n2) TÜRKÇE OLMAYAN FİZİKSEL KLAVYE — özel harfler tuşlanabiliyor mu?');
console.log('─'.repeat(64));

// US QWERTY'de bu tuşlar Türkçe harf ÜRETEMEZ; key değeri noktalama gelir.
// Oyun event.code ile konuma bakıp doğru harfi yazmalı.
const US_KEYS = [
  ['Semicolon', ';', 'Ş'],
  ['Quote', "'", 'İ'],
  ['BracketLeft', '[', 'Ğ'],
  ['BracketRight', ']', 'Ü'],
  ['Comma', ',', 'Ö'],
  ['Period', '.', 'Ç'],
];

await resetBoard();
const posFails = [];
for (const [code, key, expected] of US_KEYS) {
  await page.evaluate(
    ({ c, k }) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: k, cancelable: true, bubbles: true })),
    { c: code, k: key },
  );
  await page.waitForTimeout(80);
  const ok = (await boardText()).includes(expected);
  console.log(`${ok ? '✓' : '✗'} ${code.padEnd(13)} (key="${key}") → ${expected}  ${ok ? '' : 'YAZILMADI'}`);
  if (!ok) posFails.push(expected);
  await page.locator('.key[aria-label="Sil"]').click();
}
if (posFails.length) fail++;

// ---------------------------------------------------------------------------
// 3. SÖZLÜK — kabul
// ---------------------------------------------------------------------------
console.log(`\n3) KABUL EDİLMELİ — geçerli Türkçe  [${dictLabel}]`);
console.log('─'.repeat(64));
for (const w of SHOULD_ACCEPT) {
  await resetBoard();
  const ok = await tryWord(w);
  console.log(`${ok ? '✓' : '✗'} ${w.padEnd(8)} ${ok ? 'kabul edildi' : 'REDDEDİLDİ (hata!)'}`);
  if (!ok) fail++;
}

// ---------------------------------------------------------------------------
// 4. SÖZLÜK — ret
// ---------------------------------------------------------------------------
console.log('\n4) REDDEDİLMELİ — uydurma / yazım hatası / özel ad');
console.log('─'.repeat(64));
await resetBoard();
for (const w of SHOULD_REJECT) {
  const accepted = await tryWord(w);
  const ok = !accepted;
  console.log(`${ok ? '✓' : '✗'} ${w.padEnd(8)} ${ok ? 'reddedildi' : 'KABUL EDİLDİ (hata!)'}`);
  if (!ok) fail++;
}

await browser.close();

console.log('\n' + '─'.repeat(64));
if (fail === 0) {
  console.log('\n✅ HARF VE SÖZLÜK SİSTEMİ DOĞRU ÇALIŞIYOR\n');
} else {
  console.log(`\n❌ ${fail} kontrol başarısız\n`);
  process.exit(1);
}
