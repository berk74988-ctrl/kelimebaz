/**
 * Mini Koloni — KLAN PANELİ (klan kurulduktan sonra) OYUNUN KENDİ renderClanPage()
 * fonksiyonuyla render → gerçek DOM. Mobilde modal kaydırma ölçer + ekran görüntüsü.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.argv[4] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844);
const TAG = W > 700 ? 'desktop' : `${W}x${H}`;
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/clan';
mkdirSync(OUT, { recursive: true });

const mkMembers = (n) => Array.from({ length: n }, (_, i) => ({
  user: 'u' + i, name: 'Oyuncu ' + i, role: i === 0 ? 'leader' : i === 1 ? 'coleader' : i === 2 ? 'commander' : 'member',
}));
const SCEN = {
  yeni: { id: 'c1', name: 'Demir Kurtlar', logo: '🐺', desc: 'Yeni kurulan klan', leaderName: 'Sen',
          myRole: 'leader', canManage: true, canRoles: true, memberCap: 30, level: 1, xpInto: 0, xpNeed: 100,
          unitMax: 12, hpBonus: 0, apps: [], members: mkMembers(1) },
  dolu: { id: 'c1', name: 'Demir Kurtlar', logo: '🐺', desc: 'En güçlü klan burada!', leaderName: 'Ali',
          myRole: 'leader', canManage: true, canRoles: true, memberCap: 30, level: 4, xpInto: 340, xpNeed: 600,
          unitMax: 16, hpBonus: 90, apps: [{ user: 'x', name: 'Cem' }], members: mkMembers(8) },
  kalabalik: { id: 'c1', name: 'Demir Kurtlar', logo: '🐺', desc: 'En güçlü klan burada!', leaderName: 'Ali',
          myRole: 'leader', canManage: true, canRoles: true, memberCap: 30, level: 4, xpInto: 340, xpNeed: 600,
          unitMax: 16, hpBonus: 90, apps: [], members: mkMembers(10) },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
page.on('pageerror', () => {});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

let fail = 0;
for (const [name, clan] of Object.entries(SCEN)) {
  const res = await page.evaluate((c) => {
    window.currentUser = 'u0';
    window.startClanChat = () => {}; // yan etki (polling) olmasın
    document.querySelectorAll('.overlay.show,.vv.show').forEach((e) => e.classList.remove('show'));
    const ov = document.getElementById('clanOverlay');
    ov.style.zIndex = '100000';
    ov.classList.add('show');
    try { renderClanPage(c); } catch (e) { return { err: e.message }; }
    const s = document.querySelector('#clanOverlay .clan-scroll');
    return { scroll: s.scrollHeight > s.clientHeight + 1, sh: s.scrollHeight, ch: s.clientHeight,
             page: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1 };
  }, clan);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.png` });
  if (res.err) { console.log(`✗ [${TAG}] ${name}: renderClanPage HATA ${res.err}`); fail++; continue; }
  const ok = !res.scroll && !res.page;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} [${TAG}] ${name}: klan paneli ${res.scroll ? 'KAYDIRIYOR' : 'sığıyor'} (${res.sh}/${res.ch})${res.page ? ' + SAYFA' : ''}`);
}
await browser.close();
console.log(fail === 0 ? `\n✅ [${TAG}] klan paneli tek ekrana sığıyor` : `\n❌ [${TAG}] ${fail} durum kaydırıyor`);
process.exit(fail === 0 ? 0 : 1);
