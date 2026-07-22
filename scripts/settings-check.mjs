/**
 * Ayar chip seçicileri doğrulaması (oyuncu sayısı + süre).
 * Native select yok, chip'lerle seçim yapılıyor, seçim sunucuya + üyeye yansıyor.
 */
import { chromium } from 'playwright';

const APP = process.argv[2] ?? 'http://localhost:4200';
const API = process.argv[3] ?? 'http://localhost:4243';
const browser = await chromium.launch();
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  - ' + d : ''}`); };

async function join(name, create, code, w = 390, h = 844) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Arkadaşlarla Oyna/ }).click();
  await page.waitForTimeout(250);
  if (create) {
    await page.getByRole('button', { name: /Oda Oluştur/ }).click();
    await page.waitForTimeout(200);
    await page.locator('input.inp').first().fill(name);
    await page.getByRole('button', { name: 'Oda Oluştur', exact: true }).click();
  } else {
    await page.getByRole('button', { name: /Odaya Katıl/ }).click();
    await page.waitForTimeout(200);
    await page.locator('input.inp').first().fill(name);
    await page.locator('input.code-in').fill(code);
    await page.getByRole('button', { name: 'Odaya Katıl', exact: true }).click();
  }
  await page.waitForSelector('.rc-code');
  return { ctx, page };
}
const chipByText = (page, block, txt) => page.locator('.set-block').nth(block).getByRole('button', { name: txt, exact: true });

const A = await join('Ayse', true);
const code = (await A.page.locator('.rc-code').textContent()).trim();

check('native <select> kalmadı', (await A.page.locator('select').count()) === 0);
check('oyuncu chip\'leri var (2-8 = 7)', (await A.page.locator('.set-block').nth(0).locator('.chip').count()) === 7);
check('süre chip\'leri var (4)', (await A.page.locator('.set-block').nth(1).locator('.chip').count()) === 4);

// Oyuncu 5 seç
await chipByText(A.page, 0, '5').click();
await A.page.waitForTimeout(300);
check('"5" chip\'i seçili (.on)', await chipByText(A.page, 0, '5').evaluate((el) => el.classList.contains('on')));
// Süre "1 dk" seç
await chipByText(A.page, 1, '1 dk').click();
await A.page.waitForTimeout(300);
check('"1 dk" chip\'i seçili (.on)', await chipByText(A.page, 1, '1 dk').evaluate((el) => el.classList.contains('on')));

// Sunucuya yansıdı mı
const st = await (await fetch(`${API}/state?code=${code}`)).json();
check('sunucu: maxPlayers=5', st.room.settings.maxPlayers === 5, `${st.room.settings.maxPlayers}`);
check('sunucu: timeLimit=60', st.room.settings.timeLimit === 60, `${st.room.settings.timeLimit}`);

// Üye katılır → salt-okunur değerleri görür
const B = await join('Berk', false, code);
await B.page.waitForTimeout(500);
const roChips = await B.page.locator('.chip.ro').allTextContents();
check('üye salt-okunur "5 kişi" görüyor', roChips.some((t) => /5 kişi/.test(t)), roChips.join(' | '));
check('üye salt-okunur "1 dk" görüyor', roChips.some((t) => /1 dk/.test(t)), roChips.join(' | '));
check('üyede tıklanabilir chip yok (yalnız .ro)', (await B.page.locator('.set-block .chip:not(.ro)').count()) === 0);

// Tek ekran
check('sahip ekranı kaydırmıyor', await A.page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1));

await A.page.screenshot({ path: 'C:/Users/berk8/AppData/Local/Temp/claude/settings-owner.png' });
// masaüstü
const D = await join('Deniz', true, null, 1280, 860);
await D.page.waitForTimeout(400);
await D.page.screenshot({ path: 'C:/Users/berk8/AppData/Local/Temp/claude/settings-desktop.png' });

await browser.close();
console.log(fail === 0 ? '\n✅ Chip ayar seçicileri çalışıyor' : `\n❌ ${fail} kontrol başarısız`);
process.exit(fail === 0 ? 0 : 1);
