import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/kb-en';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// İngilizce'ye geç
await page.locator('.tools .tool').nth(2).click();
await page.waitForTimeout(250);
await page.locator('.lang-opt', { hasText: 'İngilizce' }).click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/settings.png` });
await page.locator('.modal .x').click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/title.png` });

async function shot(name, open, close) {
  try {
    await open();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (close) { await close(); await page.waitForTimeout(300); }
  } catch (e) { console.log(`${name}: ${e.message.split('\n')[0]}`); }
}

// Profil (istatistik ekranı kartına tıkla)
await shot('profile', () => page.locator('.stats-row, [class*="stat"]').first().click(),
  () => page.locator('.back, .x, [aria-label*="ack"], [aria-label*="eri"]').first().click());
// Mağaza (altın rozeti)
await shot('shop', () => page.locator('.coin, [class*="gold"], [aria-label*="hop"], [aria-label*="ağaza"]').first().click(),
  () => page.locator('.back, [aria-label*="ack"], [aria-label*="eri"]').first().click());
// Lig
await shot('league', () => page.locator('.mode', { hasText: 'League' }).first().click(),
  () => page.locator('.back, [aria-label*="ack"], [aria-label*="eri"]').first().click());

// Görünür Türkçe harf taraması (tüm gövde)
const turkish = await page.evaluate(() => {
  const t = document.body.innerText || '';
  const m = t.match(/[şğıİçöüŞĞÇÖÜ]\w*/g) || [];
  return [...new Set(m)].slice(0, 30);
});
console.log('Kalan Türkçe kelime izleri (title ekranı):', JSON.stringify(turkish));

await browser.close();
console.log('Ekran görüntüleri:', OUT);
