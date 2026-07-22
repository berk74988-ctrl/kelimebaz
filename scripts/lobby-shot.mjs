/** Lobi + sohbet: tek ekrana sığıyor mu (sayfa kaymıyor), görsel düzen. */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const APP = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/lobby';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  - ' + d : ''}`); };

for (const s of [{ n: 'mobil', w: 390, h: 844 }, { n: 'masaustu', w: 1280, h: 860 }, { n: 'kisa', w: 390, h: 680 }]) {
  const c = await b.newContext({ viewport: { width: s.w, height: s.h } });
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
  for (const m of ['Selam!', 'Hazır mısınız?', 'Başlıyoruz']) {
    await p.locator('.c-inp').fill(m);
    await p.locator('.c-send').click();
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(300);
  const scrolls = await p.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1);
  check(`[${s.n}] lobi+sohbet sayfa KAYDIRMIYOR`, !scrolls, scrolls ? 'kayıyor' : 'tek ekran');
  const chatVisible = await p.locator('app-room-chat .c-inp').isVisible();
  check(`[${s.n}] sohbet giriş kutusu görünür`, chatVisible);
  await p.screenshot({ path: `${OUT}/${s.n}.png` });
  await c.close();
}
await b.close();
console.log(fail === 0 ? '\n✅ Lobi + sohbet tek ekrana sığıyor' : `\n❌ ${fail} kontrol başarısız`);
process.exit(fail === 0 ? 0 : 1);
