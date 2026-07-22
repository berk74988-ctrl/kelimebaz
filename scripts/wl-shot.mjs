import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/wl_shots';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
for (const [name, w, h, word, guesses] of [
  ['mobile7', 390, 844, 'TELEFON', ['ARABALI']],
  ['mobile4', 390, 844, 'ADAM', ['OKUL']],
  ['desktop7', 1280, 860, 'TELEFON', ['ARABALI']],
]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const p = await c.newPage();
  await p.goto('http://localhost:4200', { waitUntil: 'domcontentloaded' });
  await p.evaluate((word) => localStorage.setItem('kelimebaz:game:practice', JSON.stringify({ mode: 'practice', dayIndex: -1, answer: word, guesses: [], status: 'playing' })), word);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: /Serbest Oyna/ }).click();
  await p.waitForSelector('app-board');
  for (const g of guesses) {
    if ([...g].length === [...word].length) {
      for (const ch of g) await p.locator(`.key[aria-label="${ch}"]`).click();
      await p.locator('.key[aria-label="ENTER"]').click();
      await p.waitForTimeout(1100);
    }
  }
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await c.close();
}
await b.close();
console.log('ok');
