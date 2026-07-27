/**
 * KELİMEBAZ — YZ / oda / lig ekran görüntüleri (README için).
 * Kullanım: node scripts/mode-shots.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { ctx, page };
}

// 🤖 Yapay zekâya karşı — zorluk seçimi + başlamış maç
{
  const { ctx, page } = await fresh();
  await page.getByRole('button', { name: /Yapay Zekâya|vs AI/i }).click();
  await page.waitForTimeout(900);
  // Orta zorlukta başlat → yarış görünümü (benim tahtam + YZ paneli)
  await page.getByRole('button', { name: /Orta|Medium/i }).first().click();
  await page.waitForTimeout(1200);
  // Birkaç harf yaz (tahtayı canlı göster)
  for (const ch of 'KALEM') await page.locator(`.key[aria-label="${ch}"]`).click().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/mod-vsai.png` });
  console.log('  ✓ mod-vsai.png');
  await ctx.close();
}

// 🎮 Çok oyunculu oda — giriş ekranı (oda kur / kodla katıl)
{
  const { ctx, page } = await fresh();
  await page.getByRole('button', { name: /Arkadaşlarla|Play with Friends/i }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/mod-oda.png` });
  console.log('  ✓ mod-oda.png');
  await ctx.close();
}

// 🏆 Lig — kademeler, LP, sezon
{
  const { ctx, page } = await fresh();
  // Biraz LP/istatistik tohumla → tablo dolu görünsün
  await page.evaluate(() => {
    localStorage.setItem('kelimebaz:stats', JSON.stringify({ played: 42, won: 33, currentStreak: 5, maxStreak: 12, distribution: [2, 6, 12, 8, 4, 1], lastWinAttempts: 3, points: 5200, guesses: 180 }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^.*\bLig\b|League/i }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/mod-lig.png` });
  console.log('  ✓ mod-lig.png');
  await ctx.close();
}

await browser.close();
console.log(errors.length ? '\n⚠️ hatalar: ' + errors.join(' | ') : '\n✅ Mod kareleri hazır, konsol hatası yok');
