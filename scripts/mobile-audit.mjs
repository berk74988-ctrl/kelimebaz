import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/kb-mobile';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function shot(name, width, height, nav) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  try {
    await nav(page);
  } catch (e) {
    errors.push(`${name} nav: ${e.message}`);
  }
  await page.waitForTimeout(450);
  // dikey taşma ölç
  const over = await page.evaluate(() => {
    const de = document.documentElement;
    return { v: de.scrollHeight - de.clientHeight, h: de.scrollWidth - de.clientWidth };
  });
  await page.screenshot({ path: `${OUT}/${name}-${width}x${height}.png`, fullPage: false });
  console.log(`  ✓ ${name} ${width}×${height}  ${over.v > 1 ? 'DİKEY+' + over.v : 'sığar'}${over.h > 0 ? ' YATAY+' + over.h : ''}`);
  await ctx.close();
}

const screens = {
  title: async () => {},
  game: async (p) => { await p.getByRole('button', { name: /Günün Kelimesi|Sonucu Gör/ }).click(); await p.waitForSelector('app-board'); },
  profile: async (p) => { await p.getByRole('button', { name: /^Profil$/ }).click(); },
  shop: async (p) => { await p.getByRole('button', { name: /^Mağaza$/ }).click(); },
  league: async (p) => { await p.locator('.mode', { hasText: 'LP' }).click(); },
  settings: async (p) => { await p.getByRole('button', { name: /Ayarlar/ }).click(); },
  room: async (p) => { await p.locator('.mode', { hasText: 'Arkadaşlarla' }).click(); },
};

const sizes = [
  [360, 640],
  [390, 844],
  [320, 568],
];

console.log(`\nMobil denetim → ${OUT}/\n`);
for (const [name, nav] of Object.entries(screens)) {
  for (const [w, h] of sizes) {
    // küçük ekranlarda sadece ana ekranları çek (hız)
    if (h === 568 && !['title', 'game', 'league'].includes(name)) continue;
    await shot(name, w, h, nav);
  }
}
await browser.close();
console.log(errors.length ? `\n⚠️ hatalar:\n${errors.join('\n')}` : '\n✅ konsol temiz');
