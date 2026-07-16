/**
 * KELİMEBAZ — seviye ödülü doğrulaması (gerçek tarayıcı).
 *
 * ÖLÇER: aynı oyun (kazanma, aynı tahmin sayısı) FARKLI seviyelerde farklı
 * altın veriyor mu? Seviye yükseldikçe kademeli artıyor mu? Kaybedince yok mu?
 *
 * Kullanım: node scripts/levelgold-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const browser = await chromium.launch();
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${n.padEnd(50)} ${d}`); };

const ctx = await browser.newContext({ viewport: { width: 900, height: 820 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

/** Belirli PUAN (→ seviye) ve sıfır günlük-görev durumuyla oyunu kur. */
async function seed(points) {
  await page.evaluate((pts) => {
    localStorage.setItem('kelimebaz:stats', JSON.stringify({
      played: 50, won: 40, currentStreak: 0, maxStreak: 5,
      distribution: [0, 0, 0, 0, 0, 0], lastWinAttempts: null,
      points: pts, guesses: 200,
    }));
    localStorage.setItem('kelimebaz:gold', JSON.stringify({ balance: 0, earned: 0, spent: 0 }));
    // günlük görevleri "bugün hepsi alınmış" yap → görev altını karışmasın
    localStorage.removeItem('kelimebaz:quests');
    localStorage.setItem('kelimebaz:game:practice',
      JSON.stringify({ mode: 'practice', dayIndex: -1, answer: 'KALEM', guesses: ['KİTAP', 'ÇORBA', 'GÜNEŞ'], status: 'playing' }));
  }, points);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Serbest Oyna/ }).click();
  await page.waitForSelector('app-board');
}

/** KALEM'i 4. tahminde bul (kazan), kazanılan altını döndür. */
async function winAndReadGold() {
  for (const ch of 'KALEM') await page.locator(`.key[aria-label="${ch}"]`).click();
  await page.locator('.key[aria-label="ENTER"]').click();
  await page.waitForTimeout(1600);
  return page.evaluate(() => JSON.parse(localStorage.getItem('kelimebaz:gold')).balance);
}

await page.goto(TARGET, { waitUntil: 'networkidle' });

console.log(`\nHedef: ${TARGET}\n`);
console.log('AYNI OYUN (KALEM, 4. tahmin) — SEVİYE arttıkça altın:');
console.log('─'.repeat(66));

// Seviye eşikleri (level.ts): L1=0, L2=100, L3=300, L5=1000, L11=5500
// bonus = min(40, (L-1)*4): L1→0, L2→4, L3→8, L5→16, L11→40
const cases = [
  { pts: 0, level: 1, bonus: 0 },
  { pts: 100, level: 2, bonus: 4 },
  { pts: 300, level: 3, bonus: 8 },
  { pts: 1000, level: 5, bonus: 16 },
  { pts: 6000, level: 11, bonus: 40 },
];

// Oyun altını (KALEM 4. tahmin, serbest): 20 + (6-4)*5 = 30.
// + günlük görevler (her seed'de quests sıfırlanır → play1 10 + win1 25 + fast 40 = 75).
// + seviye bonusu. Ölçtüğümüz asıl şey: seviye arttıkça BASE üstüne bonusun eklenmesi.
const BASE = 30 + 75;
let prev = -1;
for (const c of cases) {
  await seed(c.pts);
  const gold = await winAndReadGold();
  const expected = BASE + c.bonus;
  check(`Seviye ${String(c.level).padStart(2)} → ${gold} altın (beklenen ${expected})`, gold === expected, `bonus +${c.bonus}`);
  if (prev >= 0) check(`  seviye ${c.level} > önceki seviye kazancı`, gold > prev);
  prev = gold;
}

console.log('\nKAYBEDİNCE seviye bonusu YOK:');
console.log('─'.repeat(66));
await page.evaluate(() => {
  localStorage.setItem('kelimebaz:stats', JSON.stringify({ played: 50, won: 40, currentStreak: 0, maxStreak: 5, distribution: [0, 0, 0, 0, 0, 0], lastWinAttempts: null, points: 6000, guesses: 200 }));
  localStorage.setItem('kelimebaz:gold', JSON.stringify({ balance: 0, earned: 0, spent: 0 }));
  localStorage.setItem('kelimebaz:game:practice', JSON.stringify({ mode: 'practice', dayIndex: -1, answer: 'KALEM', guesses: ['KİTAP', 'ÇORBA', 'GÜNEŞ', 'ARABA', 'ŞEKER'], status: 'playing' }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Serbest Oyna/ }).click();
await page.waitForSelector('app-board');
for (const ch of 'BEYİN') await page.locator(`.key[aria-label="${ch}"]`).click(); // yanlış → 6. tahmin, kaybet
await page.locator('.key[aria-label="ENTER"]').click();
await page.waitForTimeout(1600);
const lostGold = await page.evaluate(() => JSON.parse(localStorage.getItem('kelimebaz:gold')).balance);
check('seviye 11 oyuncusu kaybedince sadece 2 altın (bonus yok)', lostGold === 2, `${lostGold} altın`);

console.log('\nSONUÇ EKRANI seviye ödülünü gösteriyor mu:');
console.log('─'.repeat(66));
await seed(1000); // seviye 5, bonus 16
await winAndReadGold();
const shown = await page.evaluate(() => document.querySelector('.gc-tx span')?.textContent?.trim() ?? '');
check('sonuç ekranında "seviye ödülü +16"', /seviye ödülü \+16/.test(shown), shown);

check('konsol hatası yok', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log('\n' + '─'.repeat(66));
if (fail === 0) console.log('\n✅ SEVİYE ÖDÜL SİSTEMİ DOĞRU ÇALIŞIYOR\n');
else { console.log(`\n❌ ${fail} kontrol başarısız\n`); process.exit(1); }
