import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = 'C:/Users/berk8/Documents/GitHub/kelimebaz/dist/kelimebaz/browser';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/vsai';
await mkdir(OUT, { recursive: true });
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ico':'image/x-icon','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]).replace('/berk/kelimebaz/', '/');
    if (p === '/' || p === '') p = '/index.html';
    let buf; try { buf = await readFile(join(ROOT, p)); } catch { buf = await readFile(join(ROOT, 'index.html')); p = '/index.html'; }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const URL = `http://localhost:${server.address().port}/berk/kelimebaz/`;

// gercek EN sozlugu -> uzunluga gore GECERLI kelimeler (dogru kabul garantisi)
const validRaw = JSON.parse(await readFile('C:/Users/berk8/Documents/GitHub/kelimebaz/src/app/data/valid-words-en.json'));
const VALID_BY_LEN = {};
for (const w of validRaw.words.split(' ')) { const u = w.toUpperCase(); (VALID_BY_LEN[[...u].length] ??= []).push(u); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kelimebaz:lang', 'en'); });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.mode', { timeout: 8000 });

const out = {};
// 1) menude vs AI butonu (En son mode butonlarindan biri, ikonla)
await page.locator('.mode', { hasText: 'AI' }).first().click();
await page.waitForTimeout(300);
out.pickCards = await page.locator('.vs-card').count();
await page.screenshot({ path: `${OUT}/1-pick.png` });

// 2) Hard sec -> oynama
await page.locator('.vs-card[data-d="hard"]').click();
await page.waitForSelector('app-board', { timeout: 5000 });
await page.waitForTimeout(400);
out.hudVisible = await page.locator('.vs-hud').isVisible();
out.boardVisible = await page.locator('app-board').isVisible();
const cols = await page.evaluate(() => document.querySelector('app-board .row')?.querySelectorAll('app-tile').length || 5);
out.cols = cols;

const playedBefore = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('kelimebaz:stats') || '{}').played || 0; } catch { return 0; } });

// AI birkac tahmin yapsin -> HUD dolsun
await page.waitForTimeout(4500);
out.aiRowsMid = await page.locator('.vs-hud .vs-row:not(.ghost)').count();
await page.screenshot({ path: `${OUT}/2-playing.png` });

// 3) INSAN HIC OYNAMASIN -> YZ cozunce oyun ANINDA bitmeli (yeni davranis)
const filledRows = () => page.evaluate(() =>
  [...document.querySelectorAll('app-board .row')].filter(r => [...r.querySelectorAll('app-tile')].some(t => t.className.match(/correct|present|absent/))).length);
const t0 = Date.now();
try { await page.waitForSelector('.vs-result', { timeout: 20000 }); } catch {}
out.endMs = Date.now() - t0;
out.humanRows = await filledRows();
out.aiState = await page.evaluate(() => {
  const h = document.querySelector('.vs-hud');
  return { won: h?.classList.contains('won'), lost: h?.classList.contains('lost'),
           rows: document.querySelectorAll('.vs-hud .vs-row:not(.ghost)').length,
           statusText: document.querySelector('.vs-hud-st')?.textContent?.replace(/\s+/g,' ').trim() };
});
out.errsMid = errors.slice(0, 4);
out.resultShown = await page.locator('.vs-result').isVisible();
out.outcome = await page.evaluate(() => document.querySelector('.vs-result')?.getAttribute('data-o'));
out.hasVs = await page.locator('.vs-vs .vs-side').count();
out.hasAgain = await page.locator('.vs-btn.primary').count() > 0;
out.answerShown = (await page.locator('.vs-answer b').textContent().catch(() => '')) || '';
await page.screenshot({ path: `${OUT}/3-result.png` });

// 5) istatistik entegrasyonu
const playedAfter = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('kelimebaz:stats') || '{}').played || 0; } catch { return 0; } });
out.statsIncremented = playedAfter > playedBefore;
out.gold = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('kelimebaz:gold') || '{}').balance || 0; } catch { return 0; } });

out.errors = errors;
await browser.close(); server.close();
console.log(JSON.stringify(out, null, 2));
const ok = out.pickCards === 3 && out.hudVisible && out.boardVisible && out.resultShown &&
  out.hasVs === 2 && out.hasAgain && !!out.answerShown && out.statsIncremented &&
  out.humanRows === 0 && out.outcome === 'lose' && out.errors.length === 0;
// humanRows===0: insan hic oynamadi -> mac YZ cozer cozmez ANINDA bitti (yeni davranis)
console.log(ok ? '\nPASS: YZ cozunce oyun ANINDA bitti + istatistik islendi' : '\nFAIL');
process.exit(ok ? 0 : 1);
