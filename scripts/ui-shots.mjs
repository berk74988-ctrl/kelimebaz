/**
 * Tek-ekran doğrulaması: her ekranı masaüstü + mobil boyutta yakalar ve
 * DİKEY TAŞMA (kaydırma gerektiren durum) olup olmadığını ölçer.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = process.argv[3] ?? 'C:/Users/berk8/AppData/Local/Temp/claude/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

const SIZES = [
  { name: 'desktop', w: 1280, h: 860 },
  { name: 'mobile', w: 390, h: 844 },
];

function seed(page) {
  return page.evaluate(() => {
    localStorage.setItem('kelimebaz:stats', JSON.stringify({
      played: 87, won: 61, currentStreak: 4, maxStreak: 11,
      distribution: [1, 6, 14, 19, 15, 6], lastWinAttempts: 4,
      points: 1180, guesses: 402,
    }));
    localStorage.setItem('kelimebaz:gold', JSON.stringify({ balance: 1875, earned: 3120, spent: 1245 }));
    localStorage.setItem('kelimebaz:profile', JSON.stringify({ name: 'Berk', avatar: '🦊', photo: '' }));
  });
}

const overflow = (page) => page.evaluate(() => ({
  scrollH: document.documentElement.scrollHeight,
  clientH: document.documentElement.clientHeight,
  scrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
}));

let problems = 0;

for (const s of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await seed(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  // 1) ANA MENÜ
  await page.screenshot({ path: `${OUT}/${s.name}-1-menu.png` });
  let o = await overflow(page);
  if (o.scrolls) { problems++; console.log(`✗ [${s.name}] ana menü KAYDIRIYOR (${o.scrollH}>${o.clientH})`); }
  else console.log(`✓ [${s.name}] ana menü tek ekran`);

  // 2) MAĞAZA — avatar sekmesi en kalabalık
  await page.getByRole('button', { name: 'Mağaza', exact: true }).first().click();
  await page.waitForTimeout(400);
  // avatar kategorisine geç
  const avTab = page.getByRole('button', { name: /Avatar/ }).first();
  if (await avTab.count()) { await avTab.click(); await page.waitForTimeout(300); }
  await page.screenshot({ path: `${OUT}/${s.name}-2-shop.png` });
  o = await overflow(page);
  if (o.scrolls) { problems++; console.log(`✗ [${s.name}] mağaza KAYDIRIYOR (${o.scrollH}>${o.clientH})`); }
  else console.log(`✓ [${s.name}] mağaza tek ekran`);
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  // geri butonu ile dönmek daha güvenli:
  const back1 = page.getByRole('button', { name: 'Geri dön' });
  if (await back1.count()) { await back1.first().click(); await page.waitForTimeout(300); }

  // 3) PROFİL — 3 sekme
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Profil', exact: true }).first().click();
  await page.waitForTimeout(500);
  for (const [key, label] of [['stats', 'İstatistik'], ['quests', 'Görevler'], ['avatar', 'Avatar']]) {
    const t = page.getByRole('button', { name: new RegExp(label) }).first();
    if (await t.count()) { await t.click(); await page.waitForTimeout(300); }
    await page.screenshot({ path: `${OUT}/${s.name}-3-profil-${key}.png` });
    o = await overflow(page);
    if (o.scrolls) { problems++; console.log(`✗ [${s.name}] profil/${label} KAYDIRIYOR (${o.scrollH}>${o.clientH})`); }
    else console.log(`✓ [${s.name}] profil/${label} tek ekran`);
  }

  // 4) AYARLAR
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${s.name}-4-ayarlar.png` });

  await ctx.close();
}

await browser.close();
console.log(problems === 0 ? '\n✅ Hiçbir ekran kaydırmıyor' : `\n⚠ ${problems} ekran kaydırıyor`);
