/**
 * Mini Koloni — Klan Savaşı ekranını OYUNUN KENDİ renderWar() fonksiyonuyla
 * (mock veri) render eder → DOM gerçek oyundakiyle BİREBİR. 3 senaryo:
 * aktif savaş, rakip-seçim, bitmiş savaş. Mobilde modal kaydırma ölçer.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.argv[4] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844);
const TAG = W > 700 ? 'desktop' : `${W}x${H}`;
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/colony2';
mkdirSync(OUT, { recursive: true });

const mkLog = (n) => Array.from({ length: n }, (_, i) => ({
  type: i === 0 ? 'start' : (i % 2 ? 'attack' : 'defend'),
  name: 'Oyuncu' + i, amt: 30 + i, blocked: i % 3 ? 4 : 0, sent: 5,
}));
const mkRaids = (n) => Array.from({ length: n }, (_, i) => ({
  by: 'Akıncı' + i, sent: 5 + i, amt: 40 + i, destroyed: ['b1', 'b2'].slice(0, i % 3), lost: i % 3,
}));
const warBase = {
  inClan: true, canWar: true, members: 4, side: 'a', army: { raider: 5, axe: 2, knight: 1 },
  war: {
    a: { clan: 'A', name: 'Kartallar', logo: '🦅', hp: 820, max: 1000 },
    b: { clan: 'B', name: 'Kurtlar', logo: '🐺', hp: 520, max: 1000 },
    over: false, winner: null, log: mkLog(14), raids: mkRaids(9),
  },
};
const SCEN = {
  active: warBase,
  over: { ...warBase, war: { ...warBase.war, over: true, winner: 'A' } },
  nowar: {
    inClan: true, canWar: true, members: 5,
    village: { name: 'Kartallar', max: 1200, members: 5 },
    opponents: Array.from({ length: 8 }, (_, i) => ({ id: 'c' + i, name: 'Klan ' + i, logo: '🛡️', members: 3 + i })),
  },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
page.on('pageerror', () => {});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

let fail = 0;
for (const [name, data] of Object.entries(SCEN)) {
  const res = await page.evaluate((d) => {
    window.currentUser = 'tester';
    document.querySelectorAll('.overlay.show,.vv.show').forEach((e) => e.classList.remove('show'));
    const ov = document.getElementById('warOverlay');
    ov.style.zIndex = '100000';
    ov.classList.add('show');
    try { renderWar(d); } catch (e) { return { err: e.message }; }
    const s = document.querySelector('#warOverlay .clan-scroll');
    return { scroll: s.scrollHeight > s.clientHeight + 1, sh: s.scrollHeight, ch: s.clientHeight,
             page: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1 };
  }, data);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.png` });
  if (res.err) { console.log(`✗ [${TAG}] ${name}: renderWar HATA ${res.err}`); fail++; continue; }
  const ok = !res.scroll && !res.page;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} [${TAG}] ${name}: modal ${res.scroll ? 'KAYDIRIYOR' : 'sığıyor'} (${res.sh}/${res.ch})${res.page ? ' + SAYFA kayıyor' : ''}`);
}

await browser.close();
console.log(fail === 0 ? `\n✅ [${TAG}] tüm savaş ekranları tek ekrana sığıyor` : `\n❌ [${TAG}] ${fail} senaryo kaydırıyor`);
process.exit(fail === 0 ? 0 : 1);
