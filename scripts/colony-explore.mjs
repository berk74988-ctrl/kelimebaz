/**
 * Mini Koloni — KEŞİF ekranı: Altın Market YALNIZCA ana harita ekranında görünmeli,
 * bölgelere (ör. Taşlık Alan) girilince gizlenmeli. Gerçek fonksiyonlarla doğrular + ekran görüntüsü.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.argv[4] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 768);
const TAG = W > 700 ? `desktop-${H}` : `${W}x${H}`;
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/explore';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const vis = () => {
  const b = document.getElementById('marketBtn'), p = document.getElementById('marketPanel');
  const bv = b && getComputedStyle(b).display !== 'none';
  const pv = p && getComputedStyle(p).display !== 'none';
  return { btn: !!bv, panel: !!pv };
};

const out = await page.evaluate((visSrc) => {
  const visFn = eval('(' + visSrc + ')');
  const o = {};
  try {
    if (typeof state === 'undefined' || !state) startNewGame(1);
    document.querySelectorAll('.overlay.show,.vv.show').forEach((e) => e.classList.remove('show'));
    openExplore();                       // ana harita
    document.getElementById('exploreOverlay').style.zIndex = '100000';
    o.map = visFn();                     // market butonu görünür olmalı
    // market panelini aç (kullanıcı ana ekranda açtı)
    toggleMarket();
    o.mapPanelOpen = visFn().panel;      // panel açık
    // bölgeye gir (Taşlık Alan)
    exploreView = 'taslik'; drawExplore(); updateExploreTop(); refreshExploreChrome();
    o.region = visFn();                  // market butonu + panel GİZLİ olmalı
    return o;
  } catch (e) { o.err = e.message; return o; }
}, vis.toString());
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/${TAG}-region.png` });   // bölge (marketsiz)

const out2 = await page.evaluate((visSrc) => {
  const visFn = eval('(' + visSrc + ')');
  const o = {};
  try {
    exploreView = 'map'; drawExplore(); updateExploreTop(); refreshExploreChrome();
    o.backToMap = visFn();               // market butonu yeniden görünür
    return o;
  } catch (e) { o.err = e.message; return o; }
}, vis.toString());
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/${TAG}-map.png` });       // ana harita (marketli)
await browser.close();

console.log(`[${TAG}]`, JSON.stringify({ ...out, ...out2 }));
if (errors.length) console.log(`[${TAG}] ⚠️ konsol:\n` + errors.join('\n'));

const ok = !out.err && !out2.err &&
  out.map.btn === true &&               // ana ekranda market var
  out.mapPanelOpen === true &&          // panel açılabiliyor
  out.region.btn === false && out.region.panel === false &&   // bölgede market YOK
  out2.backToMap.btn === true &&        // haritaya dönünce yeniden var
  errors.length === 0;
console.log(ok ? `\n✅ [${TAG}] Altın Market yalnızca ana keşif ekranında` : `\n❌ [${TAG}] SORUN VAR`);
process.exit(ok ? 0 : 1);
