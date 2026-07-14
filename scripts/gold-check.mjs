/**
 * KELİMEBAZ — altın sistemi doğrulaması (gerçek tarayıcı).
 *
 * ÖLÇER (iddia etmez):
 *   1. Oyun kazanınca altın GERÇEKTEN geliyor mu?
 *   2. Günlük görevler tamamlanınca ödeme yapılıyor mu — ve İKİNCİ KEZ yapmıyor mu?
 *   3. Altın ana menüde ve profil sayfasında görünüyor mu?
 *   4. Sayfa yenilenince altın duruyor mu?
 *   5. Mobil + masaüstünde yatay kaydırma var mı?
 *
 * Kullanım: node scripts/gold-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

const browser = await chromium.launch();
let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(50)} ${detail}`);
};

const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

/** Cevabı sabitleyip serbest oyun kurar. */
async function seedGame(answer, guesses = []) {
  await page.evaluate(
    ({ a, g }) =>
      localStorage.setItem(
        'kelimebaz:game:practice',
        JSON.stringify({ mode: 'practice', dayIndex: -1, answer: a, guesses: g, status: 'playing' }),
      ),
    { a: answer, g: guesses },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Serbest Oyna/ }).click();
  await page.waitForSelector('app-board');
}

const purse = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('kelimebaz:gold') ?? '{"balance":0}'));

/** Kelimeyi ekran klavyesiyle yazıp onayla. */
async function play(word) {
  for (const ch of word) await page.locator(`.key[aria-label="${ch}"]`).click();
  await page.locator('.key[aria-label="ENTER"]').click();
  await page.waitForTimeout(1500);
}

await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

console.log(`\nHedef: ${TARGET}\n`);
console.log('1) BAŞLANGIÇ');
console.log('─'.repeat(72));

const menuGold = await page.locator('.coin b').textContent();
check('ana menüde altın rozeti var', menuGold !== null, `🪙 ${menuGold}`);
check('sıfırdan başlıyor', menuGold?.trim() === '0');

console.log('\n2) OYUN KAZANINCA ALTIN');
console.log('─'.repeat(72));

// KALEM'i 4. tahminde bul → oyun: 20 + (6-4)*5 = 30
// Görevler: play1(10) + win1(25) + fast(40) = 75   → toplam 105
await seedGame('KALEM', ['KİTAP', 'ÇORBA', 'GÜNEŞ']);
await play('KALEM');

const after1 = await purse();
check('kazanınca altın geldi', after1.balance > 0, `🪙 ${after1.balance}`);
check('oyun (30) + görevler (10+25+40) = 105', after1.balance === 105, `${after1.balance}`);

// Sonuç ekranı kazancı gösteriyor mu?
const shown = await page.evaluate(() => document.querySelector('.gc-tx b')?.textContent?.trim());
check('sonuç ekranı kazancı gösteriyor', shown === '+105 altın', shown);

console.log('\n3) GÖREVLER İKİNCİ KEZ ÖDEME YAPMAZ');
console.log('─'.repeat(72));

// Aynı gün ikinci oyun: KALEM'i 1. tahminde bul
// Oyun: 20 + 5*5 = 45. Görevler: play1/win1/fast ZATEN ALINMIŞ → 0. play3 hâlâ 2/3.
await seedGame('ŞEKER', []);
await play('ŞEKER');

const after2 = await purse();
const delta = after2.balance - after1.balance;
check('ikinci oyunda SADECE oyun altını geldi', delta === 45, `+${delta} (görev ödemesi yok)`);

// Üçüncü oyun → play3 (3 oyun oyna) tamamlanır → +20
await seedGame('GÜNEŞ', []);
await play('GÜNEŞ');

const after3 = await purse();
const delta3 = after3.balance - after2.balance;
check('3. oyunda "3 oyun oyna" görevi ödedi', delta3 === 45 + 20, `+${delta3} (45 oyun + 20 görev)`);

console.log('\n4) GÖRÜNTÜLEME + KALICILIK');
console.log('─'.repeat(72));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const menuAfter = (await page.locator('.coin b').textContent())?.trim();
check('ana menüde güncel altın', menuAfter === after3.balance.toLocaleString('tr'), `🪙 ${menuAfter}`);

await page.getByRole('button', { name: 'Profil' }).first().click();
await page.waitForTimeout(600);

const prof = await page.evaluate(() => ({
  balance: document.querySelector('.g-tx b')?.textContent?.trim(),
  quests: document.querySelectorAll('.quest').length,
  done: document.querySelectorAll('.quest.done').length,
}));
check('profil sayfasında altın', prof.balance === after3.balance.toLocaleString('tr'), `🪙 ${prof.balance}`);
check('günlük görevler listeleniyor', prof.quests === 5, `${prof.quests} görev`);
check('tamamlananlar işaretli', prof.done === 4, `${prof.done} tamamlandı (daily hariç)`);

console.log('\n5) RESPONSIVE');
console.log('─'.repeat(72));

for (const [w, h, ad] of [
  [320, 640, 'küçük telefon'],
  [390, 844, 'telefon'],
  [1440, 900, 'masaüstü'],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(350);
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  check(`${ad.padEnd(15)} ${w}×${h} — yatay kaydırma yok`, !over);
}

check('konsol hatası yok', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();

console.log('\n' + '─'.repeat(72));
if (fail === 0) {
  console.log('\n✅ ALTIN SİSTEMİ DOĞRU ÇALIŞIYOR\n');
} else {
  console.log(`\n❌ ${fail} kontrol başarısız\n`);
  process.exit(1);
}
