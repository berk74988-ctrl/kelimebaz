import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function run(name, { width, height, tab }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: 'dark',
    isMobile: width < 600,
    deviceScaleFactor: width < 600 ? 2 : 1,
  });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('kelimebaz:gold', JSON.stringify({ balance: 320, earned: 700, spent: 380 }));
    // Birkaç ürün satın alınmış görünsün
    localStorage.setItem(
      'kelimebaz:inv:owned',
      JSON.stringify(['theme.ocean', 'frame.gold', 'badge.crown', 'avatar.dragon']),
    );
    localStorage.setItem('kelimebaz:inv:equipped', JSON.stringify({ theme: 'theme.ocean' }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Mağaza/ }).first().click();
  await page.waitForTimeout(400);
  if (tab) {
    await page.locator('.tab', { hasText: tab }).click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: width < 600 });
  console.log(`  ✓ ${name}.png`);
  await ctx.close();
}

console.log(`\nMağaza kareleri → ${OUT}/\n`);
await run('magaza-1-temalar', { width: 1100, height: 900, tab: 'Temalar' });
await run('magaza-2-avatarlar', { width: 1100, height: 900, tab: 'Avatarlar' });
await run('magaza-3-mobil', { width: 390, height: 844, tab: 'Çerçeveler' });
await browser.close();
console.log('\n✅ Kareler hazır\n');
