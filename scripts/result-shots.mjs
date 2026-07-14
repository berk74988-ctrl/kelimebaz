/**
 * KELİMEBAZ — oyun sonu ekranının kareleri (kazanma / kaybetme, masaüstü + mobil).
 * Kullanım: node scripts/result-shots.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

/** Oyunu belirli bir sonuçla bitmiş hâlde yükler. */
async function seed(page, { answer, guesses, status, stats }) {
  await page.evaluate(
    ({ ans, gs, st, s }) => {
      localStorage.setItem(
        'kelimebaz:game:practice',
        JSON.stringify({ mode: 'practice', dayIndex: -1, answer: ans, guesses: gs, status: st }),
      );
      localStorage.setItem('kelimebaz:stats', JSON.stringify(s));
    },
    { ans: answer, gs: guesses, st: status, s: stats },
  );
}

const STATS = {
  played: 27,
  won: 24,
  currentStreak: 6,
  maxStreak: 11,
  distribution: [1, 3, 8, 7, 4, 1],
  lastWinAttempts: 4,
};

async function run(name, { width, height, answer, guesses, status }) {
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
  await seed(page, { answer, guesses, status, stats: STATS });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Serbest Oyna/ }).click();

  await page.waitForSelector('.preview', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1400); // açılma + kutu çevirme animasyonları

  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${name}.png`);
  await ctx.close();
}

console.log(`\nSonuç ekranı kareleri → ${OUT}/\n`);

const WIN = { answer: 'KALEM', guesses: ['KİTAP', 'ÇORBA', 'GÜNEŞ', 'KALEM'], status: 'won' };
const LOSE = {
  answer: 'ŞEKER',
  guesses: ['KİTAP', 'ÇORBA', 'GÜNEŞ', 'KALEM', 'ARABA', 'ÇİÇEK'],
  status: 'lost',
};

await run('sonuc-1-kazanma', { width: 1100, height: 900, ...WIN });
await run('sonuc-2-kaybetme', { width: 1100, height: 900, ...LOSE });
await run('sonuc-3-mobil', { width: 390, height: 844, ...WIN });

await browser.close();

if (errors.length) {
  console.log('\n❌ Konsol hataları:\n  ' + errors.slice(0, 8).join('\n  ') + '\n');
  process.exit(1);
}
console.log('\n✅ Kareler hazır, konsol hatası yok\n');
