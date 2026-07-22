/**
 * Kürsü + kazanan kutlaması + canlı tablo doğrulaması (3 oyuncu, gerçek tarayıcı).
 *   A: 1 tahminde çözer (en yüksek puan) -> KAZANAN
 *   B: 3 tahminde çözer (orta puan)
 *   C: bulamaz (0 puan)
 * Doğrular: oyun sırasında canlı tablo açılıyor; bitince kürsü (3 basamak);
 * kazanan ilan; sıralama puana göre.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const APP = process.argv[2] ?? 'http://localhost:4200';
const API = process.argv[3] ?? 'http://localhost:4243';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/podium';
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
  const ctx = await browser.newContext({ viewport: { width: 420, height: 880 } });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Arkadaşlarla Oyna/ }).click();
  await page.waitForTimeout(250);
  if (create) {
    await page.getByRole('button', { name: /Oda Oluştur/ }).click();
    await page.waitForTimeout(200);
    await page.locator('select').last().selectOption('0'); // süre serbest
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
const typeWord = async (page, w) => { for (const ch of w) await page.locator(`.key[aria-label="${ch}"]`).click(); await page.locator('.key[aria-label="ENTER"]').click(); };

// --- Kur ---
const A = await join('Ayse', true);
const code = (await A.page.locator('.rc-code').textContent()).trim();
const B = await join('Berk', false, code);
const C = await join('Cem', false, code);
await A.page.waitForTimeout(1800);
await A.page.getByRole('button', { name: /Oyunu Başlat/ }).click();
for (const P of [A, B, C]) await P.page.waitForSelector('app-board', { timeout: 8000 });

// --- CANLI TABLO oyun sırasında (A henüz oynuyor) ---
await A.page.waitForTimeout(400);
check('oyun sırasında canlı tablo butonu var', (await A.page.locator('.live-fab').count()) === 1);
await A.page.locator('.live-fab').click();
await A.page.waitForTimeout(300);
const liveRows = await A.page.locator('.live-card .row').count();
check('canlı tablo açıldı ve 3 oyuncu gösteriyor', liveRows === 3, `${liveRows}`);
await A.page.locator('.live-card .link').click();

// --- kelime + puan farkları ---
const state = await (await fetch(`${API}/state?code=${code}`)).json();
const answer = wordBySeed(state.room.seed);
const L = [...answer].length;
const wrong = poolOf(L).filter((w) => w !== answer);

await typeWord(A.page, answer);                         // A: 1 tahmin -> en yüksek
await A.page.waitForTimeout(1100);
await typeWord(B.page, wrong[0]); await B.page.waitForTimeout(1100);
await typeWord(B.page, wrong[1]); await B.page.waitForTimeout(1100);
await typeWord(B.page, answer);   await B.page.waitForTimeout(1100); // B: 3 tahmin
for (let i = 0; i < 6; i++) { await typeWord(C.page, wrong[i % wrong.length]); await C.page.waitForTimeout(1050); } // C: bulamaz

await A.page.waitForTimeout(2500);

// --- Kürsü + kazanan (A ekranı) ---
check('kazanan başlığı görünüyor', (await A.page.locator('.winner-head').count()) === 1);
const wtext = (await A.page.locator('.winner-head h2').textContent() ?? '').trim();
check('A kazanan ilan edildi (Kazandın)', /Kazandın/.test(wtext), wtext);
const pods = await A.page.locator('.podium .pod:not(.pod-empty)').count();
check('kürsü 3 basamak gösteriyor', pods === 3, `${pods}`);
const firstPod = (await A.page.locator('.podium .pod-1 .pod-name').textContent() ?? '').trim();
check('1. basamakta Ayse (en yüksek puan)', firstPod.includes('Ayse'), firstPod);
const secondPod = (await A.page.locator('.podium .pod-2 .pod-name').textContent() ?? '').trim();
check('2. basamakta Berk', secondPod.includes('Berk'), secondPod);

await A.page.screenshot({ path: `${OUT}/podium-mobile.png` });

await browser.close();
console.log(fail === 0 ? '\n✅ Kürsü, kazanan kutlaması ve canlı tablo çalışıyor' : `\n❌ ${fail} kontrol başarısız`);
process.exit(fail === 0 ? 0 : 1);
