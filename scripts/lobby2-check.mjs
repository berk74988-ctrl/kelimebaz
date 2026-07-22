/** Yeni lobi tasarımı + "hazır" sistemi (2 oyuncu, gerçek tarayıcı). */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const APP = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/lobby2';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  — ' + d : ''}`); };

async function join(name, create, code, w = 390, h = 844) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
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
    await page.waitForSelector('.rc-code');
  } else {
    await page.getByRole('button', { name: /Odaya Katıl/ }).click();
    await page.waitForTimeout(200);
    await page.locator('input.inp').first().fill(name);
    await page.locator('input.code-in').fill(code);
    await page.getByRole('button', { name: 'Odaya Katıl', exact: true }).click();
    await page.waitForSelector('.rc-code');
  }
  return { ctx, page };
}
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1);

const A = await join('Ayse', true);
const code = (await A.page.locator('.rc-code').textContent()).trim();
const B = await join('Berk', false, code);
await A.page.waitForTimeout(1800);

check('yeni oda kodu başlığı (rc-code) var', await A.page.locator('.rc-code').count() === 1, code);
check('sahip: başlat butonu var', await A.page.getByRole('button', { name: /Oyunu Başlat/ }).count() === 1);
check('sahip: ayarlar düzenlenebilir (select)', await A.page.locator('.set-sel').count() === 2);
check('üye: "Hazır Ol" butonu var', await B.page.locator('.ready-btn').count() === 1);
check('üye: ayarlar salt-okunur (select yok)', await B.page.locator('.set-sel').count() === 0);

// başlangıçta 1/2 hazır (sadece sahip)
const cnt0 = (await A.page.locator('.pl-count').textContent() ?? '').trim();
check('başlangıç: 1/2 hazır', /1\/2/.test(cnt0), cnt0);

// Üye hazır olur → sahipte 2/2 + herkes hazır
await B.page.locator('.ready-btn').click();
await A.page.waitForTimeout(2200);
await B.page.waitForTimeout(400);
const cnt1 = (await A.page.locator('.pl-count').textContent() ?? '').trim();
check('üye hazır sonrası: 2/2 hazır', /2\/2/.test(cnt1), cnt1);
const hint = (await A.page.locator('.ab-hint').textContent() ?? '').trim();
check('sahip ipucu "Herkes hazır"', /Herkes hazır/.test(hint), hint);
const bBtn = (await B.page.locator('.ready-btn').textContent() ?? '').trim();
check('üye butonu "Hazırsın" durumuna geçti', /Hazırsın/.test(bBtn), bBtn);
const readyBadges = await A.page.locator('.pl-ready.on').count();
check('sahipte 2 oyuncu da "✓ Hazır" rozetli', readyBadges === 2, `${readyBadges}`);

// tek ekran (scroll yok)
check('sahip ekranı kaydırmıyor', await noScroll(A.page));
check('üye ekranı kaydırmıyor', await noScroll(B.page));

await A.page.screenshot({ path: `${OUT}/owner.png` });
await B.page.screenshot({ path: `${OUT}/member.png` });

// masaüstü sahip görünümü
const D = await join('Deniz', true, null, 1280, 860);
await D.page.waitForTimeout(500);
check('masaüstü sahip kaydırmıyor', await noScroll(D.page));
await D.page.screenshot({ path: `${OUT}/owner-desktop.png` });

await b.close();
console.log(fail === 0 ? '\n✅ Yeni lobi + hazır sistemi çalışıyor' : `\n❌ ${fail} kontrol başarısız`);
process.exit(fail === 0 ? 0 : 1);
