import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const APP = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/copy';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
for (const [name, w, h] of [['mobile', 390, 844], ['desktop', 1280, 860]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const p = await c.newPage();
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: /Arkadaşlarla Oyna/ }).click();
  await p.waitForTimeout(250);
  await p.getByRole('button', { name: /Oda Oluştur/ }).click();
  await p.waitForTimeout(200);
  await p.locator('input.inp').first().fill('Ayse');
  await p.getByRole('button', { name: 'Oda Oluştur', exact: true }).click();
  await p.waitForSelector('.rc-code');
  await p.locator('.copy-btn').click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await c.close();
}
await b.close();
console.log('ok');
