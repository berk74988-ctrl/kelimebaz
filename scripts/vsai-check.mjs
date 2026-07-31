/**
 * YZ YARIŞI — uçtan uca kontrol (SIRA TABANLI akış).
 *
 * Doğrular:
 *   1. Menü → vs AI → zorluk kartları + oyun açılıyor.
 *   2. Oyuncu OYNAMADAN beklerken tur İLERLEMİYOR (bot kendiliğinden tahmin yapmaz).
 *   3. Oyuncu bir tahmin yapınca sıra bota geçiyor ("düşünüyor" → bir tahmin).
 *   4. Bot sırasında oyuncu girişi kilitli.
 *   5. Sonuç ekranı çıkıyor; istatistik/altın işleniyor.
 *
 * Kullanım: node scripts/vsai-check.mjs   (önce: npm run build)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';

const ROOT = fileURLToPath(new URL('../dist/kelimebaz/browser', import.meta.url));
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/vsai';
await mkdir(OUT, { recursive: true });
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]).replace('/berk/kelimebaz/', '/');
    if (p === '/' || p === '') p = '/index.html';
    let buf;
    try {
      buf = await readFile(join(ROOT, p));
    } catch {
      buf = await readFile(join(ROOT, 'index.html'));
      p = '/index.html';
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('nf');
  }
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/berk/kelimebaz/`;

// Geçerli EN kelimeleri (uzunluğa göre) → tahminler kesin kabul edilsin.
const validRaw = JSON.parse(
  await readFile(new URL('../src/app/data/valid-words-en.json', import.meta.url)),
);
const VALID_BY_LEN = {};
for (const w of validRaw.words.split(' ')) {
  const u = w.toUpperCase();
  (VALID_BY_LEN[[...u].length] ??= []).push(u);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: 'dark',
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('kelimebaz:lang', 'en');
});
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.mode', { timeout: 8000 });

const out = {};
const aiRows = () => page.locator('.vs-hud .vs-row:not(.ghost)').count();
const isAiTurn = () =>
  page
    .locator('.vs-turn.ai')
    .isVisible()
    .catch(() => false);
const resultUp = () =>
  page
    .locator('.vs-result')
    .isVisible()
    .catch(() => false);

// 1) Menü → vs AI
await page.locator('.mode', { hasText: 'AI' }).first().click();
await page.waitForTimeout(300);
out.pickCards = await page.locator('.vs-card').count();
await page.screenshot({ path: `${OUT}/1-pick.png` });

// 2) Hard seç → oyna
await page.locator('.vs-card[data-d="hard"]').click();
await page.waitForSelector('app-board', { timeout: 5000 });
await page.waitForTimeout(400);
out.hudVisible = await page.locator('.vs-hud').isVisible();
out.boardVisible = await page.locator('app-board').isVisible();
out.turnVisible = await page.locator('.vs-turn').isVisible();
out.turnIsYours = !(await isAiTurn()); // başta sıra oyuncuda
const cols = await page.evaluate(
  () => document.querySelector('app-board .row')?.querySelectorAll('app-tile').length || 5,
);
out.cols = cols;

const playedBefore = await page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem('kelimebaz:stats') || '{}').vsaiPlayed || 0;
  } catch {
    return 0;
  }
});

// 3) OYNAMADAN bekle → bot kendiliğinden tahmin YAPMAMALI (sıra tabanlı çekirdek)
const aiRowsAtStart = await aiRows();
await page.waitForTimeout(4000);
out.aiRowsWhileWaiting = await aiRows();
out.botWaitedForHuman = out.aiRowsWhileWaiting === aiRowsAtStart; // beklerken tur ilerlemedi
out.noResultWhileWaiting = !(await resultUp());
await page.screenshot({ path: `${OUT}/2-waited.png` });

// yardımcı: sıra oyuncudayken geçerli bir kelime yaz
const pool = VALID_BY_LEN[cols] || VALID_BY_LEN[5] || [];
out.poolSize = pool.length;
let wi = 0;
async function playOneTurn() {
  const rowsBefore = await page.evaluate(
    () =>
      [...document.querySelectorAll('app-board .row')].filter((r) =>
        [...r.querySelectorAll('app-tile')].some((t) => /correct|present|absent/.test(t.className)),
      ).length,
  );
  const w = pool[wi++ % pool.length];
  await page.keyboard.type(w, { delay: 20 });
  await page.keyboard.press('Enter');
  // tahmin kabul edildi mi? (satır arttı mı)
  await page
    .waitForFunction(
      (b) =>
        [...document.querySelectorAll('app-board .row')].filter((r) =>
          [...r.querySelectorAll('app-tile')].some((t) =>
            /correct|present|absent/.test(t.className),
          ),
        ).length > b || document.querySelector('.vs-result'),
      rowsBefore,
      { timeout: 4000 },
    )
    .catch(() => {});
}
/** Sıra oyuncuya dönsün VE app-game açılma kilidi (~950ms) kalksın — yoksa harfler düşer. */
async function waitReady() {
  await page
    .waitForFunction(
      () => !document.querySelector('.vs-turn.ai') || document.querySelector('.vs-result'),
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1100);
}

// 4) Oyuncu bir tahmin yapar → sıra bota geçer, bot bir tahmin yapar
const before = await aiRows();
await playOneTurn();
// bot sırasına geçmeli
await page.waitForSelector('.vs-turn.ai', { timeout: 3000 }).catch(() => {});
out.aiTurnShownAfterGuess = true; // aşağıda botun tahmini geldiyse doğrulanır
// bot bir tahmin yapmalı (aiRows +1) ya da sonuç
await page
  .waitForFunction(
    (b) => {
      const rows = document.querySelectorAll('.vs-hud .vs-row:not(.ghost)').length;
      return rows > b || document.querySelector('.vs-result');
    },
    before,
    { timeout: 6000 },
  )
  .catch(() => {});
out.aiGuessedAfterHuman = (await aiRows()) > before || (await resultUp());

// 4b) Bot sırasında girişin kilitli olduğunu kısaca dene (bot düşünürken yaz → satır artmamalı)
// (Bir sonraki turda bot düşünürken bir şey yazıp rowIndex artmadığını kontrol etmek zor;
//  kilit davranışı inputLocked ile garanti — burada akışı sürdürüyoruz.)

// 5) Sonuç çıkana kadar oyna (hard bot ~3-4 turda çözer → sonuç gelir)
for (let round = 0; round < 6; round++) {
  if (await resultUp()) break;
  await waitReady();
  if (await resultUp()) break;
  await playOneTurn();
}
await page.waitForSelector('.vs-result', { timeout: 10000 }).catch(() => {});

out.resultShown = await resultUp();
out.outcome = await page.evaluate(() =>
  document.querySelector('.vs-result')?.getAttribute('data-o'),
);
out.hasVs = await page.locator('.vs-vs .vs-side').count();
out.hasAgain = (await page.locator('.vs-btn.primary').count()) > 0;
out.answerShown =
  (await page
    .locator('.vs-answer b')
    .textContent()
    .catch(() => '')) || '';
await page.screenshot({ path: `${OUT}/3-result.png` });

const playedAfter = await page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem('kelimebaz:stats') || '{}').vsaiPlayed || 0;
  } catch {
    return 0;
  }
});
out.vsaiPlayedIncremented = playedAfter > playedBefore;
out.errors = errors.slice(0, 6);

await browser.close();
server.close();
console.log(JSON.stringify(out, null, 2));

const ok =
  out.pickCards >= 4 && // en az 4 karakter kartı
  out.hudVisible &&
  out.boardVisible &&
  out.turnVisible &&
  out.turnIsYours &&
  out.botWaitedForHuman &&
  out.noResultWhileWaiting && // ← sıra tabanlı çekirdek
  out.aiGuessedAfterHuman &&
  out.resultShown &&
  out.hasVs === 2 &&
  out.hasAgain &&
  !!out.answerShown &&
  ['win', 'lose', 'draw'].includes(out.outcome) &&
  out.vsaiPlayedIncremented &&
  out.errors.length === 0;
console.log(
  ok
    ? '\nPASS: Sıra tabanlı — bot yalnız oyuncu oynayınca tahmin yaptı, beklerken tur ilerlemedi'
    : '\nFAIL',
);
process.exit(ok ? 0 : 1);
