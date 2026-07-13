/**
 * KELİMEBAZ — README için ekran görüntüleri.
 *
 * Oyunu gerçekten oynayıp anlamlı kareler yakalar:
 *   1. Başlık ekranı
 *   2. Oyun ortası (renkli kutular)
 *   3. Kazanma ekranı
 *   4. İstatistikler
 *   5. Aydınlık tema
 *   6. Renk körü modu
 *   7. Mobil görünüm
 *
 * Kullanım: node scripts/screenshots.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'docs/screenshots';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

/** Cevabı sabitleyerek serbest oyun başlatır (deterministik kareler için). */
async function startGame(page, answer, guesses = []) {
  await page.evaluate(
    ({ ans, gs }) => {
      localStorage.setItem(
        'kelimebaz:game:practice',
        JSON.stringify({ mode: 'practice', dayIndex: -1, answer: ans, guesses: gs, status: 'playing' }),
      );
    },
    { ans: answer, gs: guesses },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Serbest Oyna/ }).click();
  await page.waitForSelector('app-board');
  await page.waitForTimeout(1200); // açılma animasyonları bitsin
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${name}.png`);
}

console.log(`\nEkran görüntüleri → ${OUT}/\n`);

// ---------- MASAÜSTÜ ----------
{
  // colorScheme: Playwright varsayılanı 'light'. Oyun sistem temasına uyduğu
  // için açıkça 'dark' diyoruz — aksi hâlde tüm kareler aydınlık çıkardı.
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 820 },
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'networkidle' });

  await page.waitForTimeout(700);
  await shot(page, '1-baslik');

  // Oyun ortası — birkaç tahmin yapılmış hâlde
  await startGame(page, 'KALEM', ['KİTAP', 'ÇORBA']);
  await shot(page, '2-oyun');

  // Kazanma
  await startGame(page, 'KALEM', ['KİTAP', 'ÇORBA']);
  for (const ch of 'KALEM') await page.locator(`.key[aria-label="${ch}"]`).click();
  await page.locator('.key[aria-label="ENTER"]').click();
  await page.waitForTimeout(2200);
  await shot(page, '3-kazanma');

  // İstatistikler
  await page.getByRole('button', { name: /Sonuç ekranını kapat/ }).click();
  await page.getByRole('button', { name: /İstatistikleri göster/ }).click();
  await page.waitForTimeout(600);
  await shot(page, '4-istatistik');
  await page.keyboard.press('Escape');

  // Aydınlık tema
  await startGame(page, 'KALEM', ['KİTAP', 'ÇORBA']);
  await page.getByRole('button', { name: /Aydınlık moda geç/ }).click();
  await page.waitForTimeout(600);
  await shot(page, '5-aydinlik-tema');

  // Renk körü modu (koyu temaya geri dön)
  await page.getByRole('button', { name: /Karanlık moda geç/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /renk körü.*aç|Yüksek kontrast.*aç/i }).click();
  await page.waitForTimeout(600);
  await shot(page, '6-renk-koru-modu');

  await ctx.close();
}

// ---------- MOBİL ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'networkidle' });

  await startGame(page, 'KALEM', ['KİTAP', 'ÇORBA', 'GÜNEŞ']);
  await shot(page, '7-mobil');

  await ctx.close();
}

await browser.close();
console.log('\n✅ Ekran görüntüleri hazır\n');
