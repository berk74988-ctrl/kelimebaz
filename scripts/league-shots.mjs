import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/league';
await mkdir(OUT, { recursive: true });

const DAY = 24 * 60 * 60 * 1000;
const browser = await chromium.launch();
const errors = [];
let fail = 0;

async function seed(page, league) {
  await page.evaluate((l) => {
    localStorage.setItem('kelimebaz:gold', JSON.stringify({ balance: 540, earned: 900, spent: 360 }));
    localStorage.setItem('kelimebaz:league', JSON.stringify(l));
  }, league);
}

async function openLeague(width, height, league) {
  const c = await browser.newContext({
    viewport: { width, height },
    colorScheme: 'dark',
    isMobile: width < 600,
    deviceScaleFactor: width < 600 ? 2 : 1,
  });
  const page = await c.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await seed(page, league);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('.mode', { hasText: 'LP' }).click();
  await page.waitForTimeout(450);
  return { c, page };
}

// Lig ekranı: scroll YOK doğrulaması + ekran görüntüsü
async function leagueScreen(name, width, height) {
  const now = Date.now();
  const { c, page } = await openLeague(width, height, {
    lp: 725, season: 3, seasonStart: now - 4 * DAY, wins: 21, losses: 9, peakLp: 812, history: [],
  });
  const scroll = await page.evaluate(() => {
    const el = document.querySelector('.content');
    const de = document.documentElement;
    return {
      content: el ? el.scrollHeight > el.clientHeight + 1 : false,
      page: de.scrollHeight > de.clientHeight + 1,
      sh: el ? el.scrollHeight : 0,
      ch: el ? el.clientHeight : 0,
    };
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  const ok = !scroll.content && !scroll.page;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${name} (${width}×${height}) — içerik ${scroll.content ? 'KAYDIRIYOR' : 'sığıyor'} (${scroll.sh}/${scroll.ch})${scroll.page ? ' + SAYFA' : ''}`);
  await c.close();
}

async function rewardModal(name, width, height) {
  const now = Date.now();
  const { c, page } = await openLeague(width, height, {
    lp: 1320, season: 5, seasonStart: now - 20 * DAY, wins: 44, losses: 12, peakLp: 1435, history: [],
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`  ✓ ${name} (ödül modalı)`);
  await c.close();
}

console.log(`\nLig ekranı — scroll kontrolü → ${OUT}/\n`);
await leagueScreen('league-desktop', 1280, 800);
await leagueScreen('league-desktop-short', 1100, 680);
await leagueScreen('league-mobile', 390, 844);
await leagueScreen('league-mobile-640', 360, 640);
await leagueScreen('league-mobile-568', 360, 568);
await rewardModal('reward-mobile', 390, 844);
await browser.close();
console.log(errors.length ? `\n⚠️ konsol hataları:\n${errors.join('\n')}` : '\n(konsol temiz)');
console.log(fail === 0 ? '\n✅ tüm boyutlarda scroll YOK' : `\n❌ ${fail} boyutta scroll var`);
process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
