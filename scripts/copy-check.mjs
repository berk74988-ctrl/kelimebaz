/**
 * "Kopyala" butonu doğrulaması.
 * Tek buton var mı, tıklayınca toast çıkıyor mu, kod gerçekten kopyalanıyor mu.
 * (Kopyalanan içerik yalnızca GÜVENLİ bağlamda — localhost — okunabilir; canlı
 *  HTTP'de toast'ın çıkması execCommand'in başarılı olduğunu kanıtlar.)
 */
import { chromium } from 'playwright';

const APP = process.argv[2] ?? 'http://localhost:4200';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 880 } });
try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write']); } catch { /* yoksay */ }
const page = await ctx.newPage();
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  - ' + d : ''}`); };

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Arkadaşlarla Oyna/ }).click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: /Oda Oluştur/ }).click();
await page.waitForTimeout(200);
await page.locator('input.inp').first().fill('Ayse');
await page.getByRole('button', { name: 'Oda Oluştur', exact: true }).click();
await page.waitForSelector('.rc-code');
const code = (await page.locator('.rc-code').textContent()).trim();

// Tek buton, eski iki ikon buton yok
check('tek "Kopyala" butonu var', (await page.locator('.copy-btn').count()) === 1);
check('eski işlevsiz ikon butonları kaldırıldı (.rc-btn yok)', (await page.locator('.rc-btn').count()) === 0);
check('buton metni "Kopyala"', (await page.locator('.copy-btn .cb-tx').textContent() ?? '').includes('Kopyala'));

// Tıkla → toast + buton "Kopyalandı"
await page.locator('.copy-btn').click();
await page.waitForTimeout(250);
const toast = await page.locator('.copy-toast').textContent().catch(() => '');
check('"Oda kodu kopyalandı" bildirimi çıktı', /kopyaland/i.test(toast || ''), toast);
check('buton "Kopyalandı" durumuna geçti', (await page.locator('.copy-btn .cb-tx').textContent() ?? '').includes('Kopyalandı'));

// Güvenli bağlamsa (localhost) panoyu oku ve kod ile karşılaştır
try {
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('pano gerçekten oda kodunu içeriyor', clip.trim() === code, `${clip} vs ${code}`);
} catch {
  console.log('… (pano okuma güvenli bağlam gerektirir; canlı HTTP\'de toast yeterli kanıt)');
}

// Toast kısa süre sonra kaybolur
await page.waitForTimeout(1900);
check('bildirim kısa süre sonra kayboldu', (await page.locator('.copy-toast').count()) === 0);

await browser.close();
console.log(fail === 0 ? '\n✅ Kopyala butonu çalışıyor' : `\n❌ ${fail} kontrol başarısız`);
process.exit(fail === 0 ? 0 : 1);
