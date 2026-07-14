/**
 * KELİMEBAZ — ana menü kareleri (masaüstü + mobil, boş + oynanmış, profil + ayarlar).
 * Kullanım: node scripts/menu-shots.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

/** Oynanmış bir geçmiş yazar — istatistik kartları dolu görünsün. */
async function seedStats(page) {
  await page.evaluate(() => {
    localStorage.setItem(
      'kelimebaz:stats',
      JSON.stringify({
        played: 27,
        won: 24,
        currentStreak: 6,
        maxStreak: 11,
        distribution: [1, 3, 8, 7, 4, 1],
        lastWinAttempts: 4,
      }),
    );
    localStorage.setItem('kelimebaz:profile:name', 'Berk');
    localStorage.setItem('kelimebaz:profile:avatar', '🦊');
  });
}

async function run(name, { width, height, seed = false, open = null }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: 'dark',
    isMobile: width < 600,
    hasTouch: width < 600,
    deviceScaleFactor: width < 600 ? 2 : 1,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${name}: ${m.text()}`);
  });

  await page.goto(TARGET, { waitUntil: 'networkidle' });
  if (seed) {
    await seedStats(page);
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(1500); // açılış animasyonları otursun

  if (open) {
    await page.getByRole('button', { name: open }).first().click();
    await page.waitForTimeout(600);
  }

  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${name}.png`);
  await ctx.close();
}

console.log(`\nAna menü kareleri → ${OUT}/\n`);

await run('menu-1-masaustu', { width: 1100, height: 860 });
await run('menu-2-masaustu-dolu', { width: 1100, height: 860, seed: true });
await run('menu-3-profil', { width: 1100, height: 860, seed: true, open: 'Profil' });
await run('menu-4-ayarlar', { width: 1100, height: 860, seed: true, open: 'Ayarlar' });
await run('menu-5-mobil', { width: 390, height: 844, seed: true });

await browser.close();

if (errors.length) {
  console.log('\n❌ Konsol hataları:\n  ' + errors.slice(0, 8).join('\n  ') + '\n');
  process.exit(1);
}
console.log('\n✅ Kareler hazır, konsol hatası yok\n');
