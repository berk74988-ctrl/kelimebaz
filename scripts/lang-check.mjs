import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/kb-lang';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const out = {};

// 1) Türkçe başlangıç
out.htmlLangStart = await page.evaluate(() => document.documentElement.lang);
out.trTitle = (await page.locator('.mode.primary, .mode.ghost').first().textContent())?.replace(/\s+/g, ' ').trim();
await page.screenshot({ path: `${OUT}/1-title-tr.png` });

// 2) Ayarları aç → İngilizce'ye geç
await page.locator('.tools .tool').nth(2).click(); // ⚙️
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/2-settings-tr.png` });
await page.locator('.lang-opt', { hasText: 'İngilizce' }).click();
await page.waitForTimeout(300);
out.htmlLangAfter = await page.evaluate(() => document.documentElement.lang);
await page.screenshot({ path: `${OUT}/3-settings-en.png` });
// modalı kapat
await page.locator('.modal .x').click();
await page.waitForTimeout(300);

// 3) Başlık İngilizce mi?
out.enMenu = await page.evaluate(() => [...document.querySelectorAll('.mode .m-tx b')].map((e) => e.textContent.trim()));
await page.screenshot({ path: `${OUT}/4-title-en.png` });

// 4) Oyuna gir → klavye İngilizce (QWERTY) + İngilizce kelime geçerli mi?
await page.locator('.mode', { hasText: /Word of the Day|Daily/ }).first().click();
await page.waitForSelector('app-board');
await page.waitForTimeout(400);
const keys = await page.evaluate(() => [...document.querySelectorAll('.key')].map((k) => k.textContent.trim()));
out.hasQWX = ['Q', 'W', 'X'].every((c) => keys.includes(c));
out.hasTurkish = ['İ', 'Ş', 'Ç', 'Ğ', 'Ö', 'Ü'].some((c) => keys.includes(c));
// Tahta sütun sayısını bul (tile'lar <app-tile>), o uzunlukta geçerli İngilizce kelime yaz
const cols = await page.evaluate(() => {
  const row = document.querySelector('app-board .row');
  return row ? row.querySelectorAll('app-tile').length : 5;
});
out.boardCols = cols;
const WORD = { 4: 'THAT', 5: 'HOUSE', 6: 'PEOPLE', 7: 'BECAUSE' }[cols] || 'HOUSE';
await page.keyboard.type(WORD.toLowerCase());
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
const res = await page.evaluate(() => {
  const row = document.querySelector('app-board .row');
  const evaluated = row
    ? row.querySelectorAll('app-tile.correct, app-tile.present, app-tile.absent').length
    : 0;
  const msg = (document.querySelector('.msg, app-toast')?.textContent || '').trim();
  return { evaluated, msg };
});
out.typedWord = WORD;
out.guessAccepted = res.evaluated >= cols && !/word list|sözlük|listede yok|enter|harf/i.test(res.msg);
out.msgAfterGuess = res.msg;
await page.screenshot({ path: `${OUT}/5-game-en.png` });

await browser.close();
console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('⚠️ konsol:\n' + errors.join('\n'));

const ok = out.htmlLangStart === 'tr' && out.htmlLangAfter === 'en' &&
  out.enMenu.includes('Word of the Day') && out.enMenu.includes('Free Play') &&
  out.hasQWX && !out.hasTurkish && out.guessAccepted && errors.length === 0;
console.log(ok ? '\n✅ İngilizce dil desteği çalışıyor (UI + klavye + kelime)' : '\n❌ SORUN VAR');
process.exit(ok ? 0 : 1);
