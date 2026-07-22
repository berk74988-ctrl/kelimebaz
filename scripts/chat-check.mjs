/**
 * Oda sohbeti doğrulaması (2 oyuncu, gerçek tarayıcı).
 * Lobide gönderilen mesaj karşı oyuncuya (polling ile) iletiliyor mu, ad yanında
 * görünüyor mu, oyun sonrası sohbet devam ediyor mu.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const APP = process.argv[2] ?? 'http://localhost:4200';
const API = process.argv[3] ?? 'http://localhost:4243';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/chat';
mkdirSync(OUT, { recursive: true });

const raw = JSON.parse(readFileSync(new URL('../src/app/data/words.json', import.meta.url)));
const allAnswers = raw.words.map((w) => w.toLocaleUpperCase('tr'));
const LENGTHS = [4, 5, 6, 7];
const byLen = { 4: [], 5: [], 6: [], 7: [] };
for (const w of allAnswers) { const L = [...w].length; if (byLen[L]) byLen[L].push(w); }
const poolOf = (L) => (byLen[L]?.length ? byLen[L] : byLen[5]);
const wordBySeed = (seed) => { const s = Math.floor(Math.abs(seed)); const L = LENGTHS[s % 4]; const p = poolOf(L); return p[Math.floor(s / 4) % p.length]; };

const browser = await chromium.launch();
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  - ' + d : ''}`); };

async function join(name, create, code) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Arkadaşlarla Oyna/ }).click();
  await page.waitForTimeout(250);
  if (create) {
    await page.getByRole('button', { name: /Oda Oluştur/ }).click();
    await page.waitForTimeout(200);
    await page.locator('select').last().selectOption('0');
    await page.locator('input.inp').first().fill(name);
    await page.getByRole('button', { name: 'Oda Oluştur', exact: true }).click();
    await page.waitForSelector('.rc-code');
  } else {
    await page.getByRole('button', { name: /Odaya Katıl/ }).click();
    await page.waitForTimeout(200);
    await page.locator('input.inp').first().fill(name);
    await page.locator('input.code-in').fill(code);
    await page.getByRole('button', { name: 'Odaya Katıl', exact: true }).click();
    await page.waitForTimeout(600);
  }
  return { ctx, page };
}
async function chat(page, text) {
  await page.locator('.c-inp').first().fill(text);
  await page.locator('.c-send').first().click();
}
const lastMsg = (page) => page.locator('.msg').last();

const A = await join('Ayse', true);
const code = (await A.page.locator('.rc-code').textContent()).trim();
const B = await join('Berk', false, code);
await A.page.waitForTimeout(1800);

check('lobide sohbet alanı var', (await A.page.locator('app-room-chat').count()) >= 1);

await chat(A.page, 'Herkese merhaba!');
await B.page.waitForTimeout(2200);
const bSees = await lastMsg(B.page).locator('.m-text').textContent();
const bName = await lastMsg(B.page).locator('.m-name').textContent();
check("B, A'nın mesajını görüyor", (bSees ?? '').includes('Herkese merhaba'), bSees);
check('mesajın yanında gönderenin adı var (Ayse)', (bName ?? '').includes('Ayse'), bName);

await chat(B.page, 'Selam, hazirim!');
await A.page.waitForTimeout(2200);
const aSees = await lastMsg(A.page).locator('.m-text').textContent();
check("A, B'nin yanıtını görüyor", (aSees ?? '').includes('Selam'), aSees);
const aOwnName = await A.page.locator('.msg.mine .m-name').first().textContent();
check('kendi mesajın "Sen" olarak etiketli', (aOwnName ?? '').includes('Sen'), aOwnName);

await A.page.screenshot({ path: `${OUT}/lobby-chat.png` });

// --- Oyun sonrası sohbet devam ediyor mu ---
await A.page.getByRole('button', { name: /Oyunu Başlat/ }).click();
await A.page.waitForSelector('app-board');
await B.page.waitForSelector('app-board');
const state = await (await fetch(`${API}/state?code=${code}`)).json();
const answer = wordBySeed(state.room.seed);
for (const P of [A, B]) { for (const ch of answer) await P.page.locator(`.key[aria-label="${ch}"]`).click(); await P.page.locator('.key[aria-label="ENTER"]').click(); }
await A.page.waitForTimeout(2500);

check('sonuç ekranında sohbet var', (await A.page.locator('app-room-chat').count()) >= 1);
await chat(A.page, 'Iyi oyundu!');
await B.page.waitForTimeout(2200);
const bAfter = await lastMsg(B.page).locator('.m-text').textContent();
check('oyun sonrası mesaj da iletiliyor', (bAfter ?? '').includes('Iyi oyundu'), bAfter);
await A.page.screenshot({ path: `${OUT}/results-chat.png` });

await browser.close();
console.log(fail === 0 ? '\n✅ Oda sohbeti çalışıyor (lobi + oyun sonrası)' : `\n❌ ${fail} kontrol başarısız`);
process.exit(fail === 0 ? 0 : 1);
