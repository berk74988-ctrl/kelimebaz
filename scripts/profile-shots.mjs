/**
 * KELİMEBAZ — profil sayfası kareleri (masaüstü + mobil, dolu + boş).
 * Kullanım: node scripts/profile-shots.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

const SEED = {
  played: 27,
  won: 24,
  currentStreak: 6,
  maxStreak: 11,
  distribution: [1, 3, 8, 7, 4, 1],
  lastWinAttempts: 4,
  points: 3450,
  guesses: 98,
};

async function run(name, { width, height, seed = true }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: 'dark',
    isMobile: width < 600,
    hasTouch: width < 600,
    deviceScaleFactor: width < 600 ? 2 : 1,
  });
  const page = await ctx.newPage();

  await page.goto(TARGET, { waitUntil: 'networkidle' });
  if (seed) {
    await page.evaluate((s) => {
      localStorage.setItem('kelimebaz:stats', JSON.stringify(s));
      localStorage.setItem('kelimebaz:profile:name', 'Berk');
      localStorage.setItem('kelimebaz:profile:avatar', '🦊');
    }, SEED);
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: 'Profil' }).first().click();
  await page.waitForTimeout(900);

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: width < 600 });
  console.log(`  ✓ ${name}.png`);
  await ctx.close();
}

console.log(`\nProfil kareleri → ${OUT}/\n`);
await run('profil-1-masaustu', { width: 1100, height: 940 });
await run('profil-2-mobil', { width: 390, height: 844 });
await run('profil-3-bos', { width: 1100, height: 940, seed: false });
await browser.close();
console.log('\n✅ Kareler hazır\n');
