/**
 * Değişken kelime uzunluğu doğrulaması (gerçek tarayıcı).
 * 4/6/7 harfli oyunlarda: tahta doğru KOLON sayısıyla çiziliyor mu, kutular ve
 * klavye ekrana TAŞMADAN sığıyor mu, kelime oynanıp kazanılabiliyor mu.
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const browser = await chromium.launch();
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  — ' + d : ''}`); };

const WORDS = ['ADAM', 'GÜNEŞ', 'DOKTOR', 'TELEFON']; // 4,5,6,7

for (const size of [{ n: 'mobil', w: 390, h: 844 }, { n: 'masaüstü', w: 1280, h: 860 }]) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  for (const word of WORDS) {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
    // Kayıtlı serbest oyunu bu kelimeyle tohumla → "Serbest Oyna" onu sürdürür
    await page.evaluate((w) => {
      localStorage.setItem('kelimebaz:game:practice', JSON.stringify({
        mode: 'practice', dayIndex: -1, answer: w, guesses: [], status: 'playing',
      }));
    }, word);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Serbest Oyna/ }).click();
    await page.waitForSelector('app-board');
    await page.waitForTimeout(200);

    // 1) İlk satırdaki kutu sayısı = kelime uzunluğu
    const cols = await page.locator('app-board .row').first().locator('app-tile').count();
    check(`[${size.n}] ${word} (${[...word].length}h): tahta ${cols} kolon`, cols === [...word].length, `${cols}`);

    // 2) Yatay taşma yok
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check(`[${size.n}] ${word}: yatay taşma yok`, !overflowX);

    // 3) Tahta genişliği ekrana sığıyor
    const fits = await page.evaluate(() => {
      const b = document.querySelector('app-board .row');
      return b ? b.getBoundingClientRect().width <= window.innerWidth : false;
    });
    check(`[${size.n}] ${word}: satır genişliği viewport içinde`, fits);

    // 4) Kelimeyi yazıp kazan
    for (const ch of word) await page.locator(`.key[aria-label="${ch}"]`).click();
    await page.locator('.key[aria-label="ENTER"]').click();
    await page.waitForTimeout(1300);
    const won = await page.evaluate(() => !!document.querySelector('.modal.won, app-result-modal'));
    check(`[${size.n}] ${word}: doğru yazınca kazanıldı`, won);
  }

  check(`[${size.n}] konsol hatası yok`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(fail === 0 ? '\n✅ Değişken uzunluk her ekranda düzgün çalışıyor' : `\n❌ ${fail} kontrol başarısız`);
process.exit(fail === 0 ? 0 : 1);
