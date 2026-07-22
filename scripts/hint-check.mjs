import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = 'C:/Users/berk8/Documents/GitHub/kelimebaz/dist/kelimebaz/browser';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/hint';
await mkdir(OUT, { recursive: true });
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ico':'image/x-icon','.svg':'image/svg+xml','.mp3':'audio/mpeg' };
const server = createServer(async (req, res) => {
  try { let p = decodeURIComponent(req.url.split('?')[0]).replace('/berk/kelimebaz/', '/'); if (p === '/' || p === '') p = '/index.html';
    let buf; try { buf = await readFile(join(ROOT, p)); } catch { buf = await readFile(join(ROOT, 'index.html')); p = '/index.html'; }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const URL = `http://localhost:${server.address().port}/berk/kelimebaz/`;

const browser = await chromium.launch();

async function run(label, W, H, mobile) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, colorScheme: 'dark' })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const o = { label };

  // ---- İNGİLİZCE: ipucu VAR ----
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kelimebaz:lang', 'en'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.mode', { timeout: 10000 });
  // Free Play'i başlat; ipucu olan bir kelime çıkana kadar birkaç dene (kapsam %89)
  let hintFound = false;
  for (let t = 0; t < 6 && !hintFound; t++) {
    await page.locator('.mode', { hasText: 'Free Play' }).first().click();
    await page.waitForSelector('app-board', { timeout: 5000 });
    await page.waitForTimeout(300);
    hintFound = await page.locator('.hint-btn').count() > 0;
    if (!hintFound) { await page.locator('.icon', { hasText: '←' }).first().click().catch(() => {}); await page.waitForTimeout(200); }
  }
  o.enHintButton = hintFound;
  if (hintFound) {
    await page.locator('.hint-btn').click();
    await page.waitForTimeout(200);
    o.enHintCard = await page.locator('.hint-card').isVisible();
    o.enCategory = (await page.locator('.hint-cat b').textContent().catch(() => '')) || '';
    o.enDesc = (await page.locator('.hint-desc').textContent().catch(() => '')) || '';
    await page.screenshot({ path: `${OUT}/hint-en-${label}.png` });
  }

  // ---- TÜRKÇE: ipucu YOK ----
  await page.evaluate(() => { localStorage.setItem('kelimebaz:lang', 'tr'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.mode', { timeout: 8000 });
  await page.locator('.mode').nth(1).click(); // 2. mod = Serbest Oyun (practice)
  await page.waitForSelector('app-board', { timeout: 5000 });
  await page.waitForTimeout(400);
  o.trHintAbsent = await page.locator('.hint-bar').count() === 0;
  await page.screenshot({ path: `${OUT}/hint-tr-${label}.png` });

  o.errors = errors;
  await page.close();
  return o;
}

const mob = await run('mobile', 390, 844, true);
const desk = await run('desktop', 1280, 800, false);
await browser.close(); server.close();
console.log(JSON.stringify({ mob, desk }, null, 2));
const good = (o) => o.enHintButton && o.enHintCard && !!o.enCategory && o.trHintAbsent && o.errors.length === 0;
const ok = good(mob) && good(desk);
console.log(ok ? '\nPASS: EN ipucu var/acilir, TR yok (mobil+masaustu)' : '\nFAIL');
process.exit(ok ? 0 : 1);
