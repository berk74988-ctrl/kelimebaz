/**
 * Mini Koloni — Klan Savaşı ekranı + köy savaşçı menüsü MOBİL düzen kontrolü.
 * index-2d.html'i doğrudan açar, ilgili overlay'leri örnek içerikle zorla gösterir,
 * mobil boyutta ekran görüntüsü alır ve taşma/yükseklik ölçer.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const FILE = process.argv[4] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/colony';
mkdirSync(OUT, { recursive: true });

const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844);
const TAG = W > 700 ? 'desktop' : 'mobile';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
page.on('pageerror', () => {}); // oyun JS'i backend'siz hata verebilir, önemsiz
await page.goto(FILE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

// --- 1) KLAN SAVAŞI ekranı (aktif savaş) ---
await page.evaluate(() => {
  // araya girebilecek diğer overlay'leri gizle
  document.querySelectorAll('.overlay.show, .vv.show').forEach((e) => e.classList.remove('show'));
  const ov = document.getElementById('warOverlay');
  ov.style.zIndex = '100000';
  ov.classList.add('show');
  const log = Array.from({ length: 8 }, (_, i) =>
    `<div class="w-le">⚔️ <b>Oyuncu${i}</b> rakip köye saldırdı <span class="dmg">−${40 + i}</span></div>`).join('');
  document.getElementById('warBody').innerHTML = `
    <div class="w-vs">
      <div class="w-vil">
        <div class="w-top"><span class="w-lg">🛡️</span><span class="w-nm">Kartallar</span></div>
        <canvas class="w-cv" width="230" height="150"></canvas>
        <div class="w-hp mine"><i style="width:82%"></i></div>
        <div class="w-hpt">🛡️ Senin köyün · 820/1000</div>
      </div>
      <div class="w-vil foe">
        <div class="w-top"><span class="w-lg">🐺</span><span class="w-nm">Kurtlar</span></div>
        <canvas class="w-cv" width="230" height="150"></canvas>
        <div class="w-hp foe"><i style="width:55%"></i></div>
        <div class="w-hpt">⚔️ Rakip köy · 550/1000</div>
      </div>
    </div>
    <div class="w-acts">
      <button class="cl-btn no">⚔️ Saldır</button>
      <button class="cl-btn ok">🛡️ Savun</button>
    </div>
    <button class="cl-btn no wide" style="margin-top:9px">🗡️ Akın Düzenle · 8 asker</button>
    <div class="cl-desc" style="margin-top:6px;text-align:center">Kendi savaşçılarını rakip köye sür — binalara kendileri saldırır.</div>
    <div class="cl-sec">📜 Savaş Kaydı</div>
    <div class="w-log">${log}</div>
    <div class="cl-sec">🗡️ Akın Sonuçları</div>
    <div class="w-log">${Array.from({ length: 6 }, (_, i) =>
      `<div class="w-le">🗡️ <b>Akıncı${i}</b> · ${5 + i} gönderildi <span class="dmg">−${30 + i} HP</span> <span class="dmg">🏚️ ${i}</span> <span class="rep">💀 ${i}</span></div>`).join('')}</div>`;
});
await page.waitForTimeout(300);
const warScroll = await page.evaluate(() => {
  const s = document.querySelector('#warOverlay .clan-scroll');
  return { need: s.scrollHeight > s.clientHeight + 1, sh: s.scrollHeight, ch: s.clientHeight };
});
console.log(`Savaş ekranı body kaydırma gerekiyor mu: ${warScroll.need ? 'EVET' : 'hayır'} (${warScroll.sh}>${warScroll.ch})`);
const pageScrollWar = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1);
console.log(`Sayfa kaydırma: ${pageScrollWar ? 'EVET' : 'hayır'}`);
await page.screenshot({ path: `${OUT}/war-${TAG}.png` });

// --- 1b) RAKİP SEÇİM ekranı (savaş yok) ---
await page.evaluate(() => {
  const opp = Array.from({ length: 6 }, (_, i) =>
    `<div class="cl-row"><div class="cl-av" style="font-size:19px">🛡️</div>
     <div class="cl-mid"><div class="cl-t">Klan ${i}</div><div class="cl-s">👥 ${3 + i} üye</div></div>
     <button class="cl-btn no">⚔️ Savaş Aç</button></div>`).join('');
  document.getElementById('warBody').innerHTML = `
    <div class="cl-card" style="text-align:center">
      <div style="font-weight:800;font-size:16px;margin-bottom:3px">🏰 Savaş Köyün</div>
      <div class="cl-desc" style="margin-bottom:10px">Klan savaşları yalnızca burada — ortak savaş köyünde — yapılır. Kendi kolonin asla saldırıya uğramaz.</div>
      <canvas id="warCvPrev" class="w-cv" width="300" height="180" style="max-width:320px;margin:0 auto"></canvas>
      <div class="w-hp mine" style="max-width:320px;margin:9px auto 0"><i style="width:100%"></i></div>
      <div class="w-hpt">🛡️ Kartallar · 1200 HP · 👥 5 üye</div>
      <div class="cl-desc" style="margin-top:7px;font-size:11.5px">Klan kalabalıklaştıkça savaş köyün büyür ve dayanıklılığı artar.</div>
      <div class="w-ban win" style="margin-top:12px">Aşağıdan bir rakip seçip savaş ilan et.</div>
    </div>
    <div class="cl-sec">⚔️ Rakipler</div>
    <div class="w-opps">${opp}</div>`;
});
await page.waitForTimeout(300);
const noWar = await page.evaluate(() => {
  const s = document.querySelector('#warOverlay .clan-scroll');
  return s.scrollHeight > s.clientHeight + 1;
});
console.log(`Rakip-seçim ekranı body kaydırma: ${noWar ? 'EVET' : 'hayır'}`);
await page.screenshot({ path: `${OUT}/war-nowar-${TAG}.png` });

// --- 2) KÖY savaşçı menüsü (vv-dock) ---
await page.evaluate(() => {
  document.getElementById('warOverlay').classList.remove('show');
  const v = document.getElementById('villageView');
  if (v) { v.style.zIndex = '100000'; v.classList.add('show'); }
  const btn = (icon, name, cost, stat, statLbl) =>
    `<button class="vv-b"><span class="vv-bi">${icon}</span><span class="vv-bn">${name} <span class="vv-bh">×2</span><br><span class="vv-bc">🪙 ${cost}</span> <span class="vv-bh">${statLbl} ${stat}</span></span></button>`;
  const army = btn('🗡️', 'Akıncı', 40, '1.0', '⚔️') + btn('🪓', 'Baltacı', 85, '2.0', '⚔️') + btn('🐎', 'Şövalye', 150, '3.5', '⚔️');
  const units = btn('🗡️', 'Akıncı', 40, '10', '🛡️') + btn('🪓', 'Baltacı', 85, '18', '🛡️') + btn('🐎', 'Şövalye', 150, '30', '🛡️');
  const builds = btn('🏹', 'Kule', 60, '120', '+') + btn('🧱', 'Sur', 40, '80', '+') + btn('🔥', 'Ocak', 90, '150', '+');
  if (document.getElementById('vvArmy')) document.getElementById('vvArmy').innerHTML = army;
  if (document.getElementById('vvUnits')) document.getElementById('vvUnits').innerHTML = units;
  if (document.getElementById('vvBuilds')) document.getElementById('vvBuilds').innerHTML = builds;
  const co = document.getElementById('vvCoins'); if (co) co.textContent = '1250';
});
await page.waitForTimeout(300);
const dock = await page.evaluate(() => {
  const d = document.querySelector('#villageView .vv-dock');
  if (!d) return null;
  const rows = [...d.querySelectorAll('.vv-builds')].map((r) => ({ wrap: r.scrollWidth > r.clientWidth + 1, h: r.offsetHeight }));
  return { dockH: d.offsetHeight, vh: window.innerHeight, pct: Math.round((d.offsetHeight / window.innerHeight) * 100), rows };
});
if (dock) {
  console.log(`Köy menüsü yüksekliği: ${dock.dockH}px (ekranın %${dock.pct}'i) · satırlar: ${dock.rows.map((r) => r.h + (r.wrap ? '(kaydırır)' : '')).join(', ')}`);
}
await page.screenshot({ path: `${OUT}/village-${TAG}.png` });

await browser.close();
console.log('bitti');
