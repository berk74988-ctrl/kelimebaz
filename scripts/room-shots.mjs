import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const APP = process.argv[2] ?? 'http://localhost:4200';
const OUT = process.argv[3] ?? 'C:/Users/berk8/AppData/Local/Temp/claude/room_shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const s of [{ name: 'desktop', w: 1280, h: 860 }, { name: 'mobile', w: 390, h: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Arkadaşlarla Oyna/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${s.name}-1-menu.png` });

  await page.getByRole('button', { name: /Oda Oluştur/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${s.name}-2-create.png` });

  await page.locator('input.inp').first().fill('Ayse');
  await page.getByRole('button', { name: 'Oda Oluştur', exact: true }).click();
  await page.waitForSelector('.rc-code');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${s.name}-3-lobby.png` });
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1);
  console.log(`[${s.name}] lobi kaydırıyor mu: ${scrolls ? 'EVET' : 'hayır'}`);
  await ctx.close();
}
await browser.close();
console.log('bitti');
