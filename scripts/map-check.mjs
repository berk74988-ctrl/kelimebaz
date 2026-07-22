import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.argv[4] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844);
const TAG = W > 700 ? 'desktop' : 'mobile';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/worldmap';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H }, isMobile: W < 700, hasTouch: W < 700 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);

const setup = await page.evaluate(() => {
  const o = {};
  try {
    currentUser = 'tester';
    if (typeof state === 'undefined' || !state) startNewGame(1);
    document.querySelectorAll('.overlay.show,.vv.show,.auth-overlay.show').forEach((e) => e.classList.remove('show'));
    const R = (id, type, tier, x, y, gold, hp, owner, mine, tr, en) => ({
      id, type, tier, x, y, gold, hpBonus: hp, owner, ownerName: owner ? (mine ? 'Kartallar' : 'Kurtlar') : null,
      ownerLogo: owner ? (mine ? '🦅' : '🐺') : null, npc: !owner, hp: owner ? 300 : 220, max: owner ? 300 : 220, mine: !!mine, tr, en,
      defs: [{ t: 'wall' }, { t: 'wall' }, { t: 'tower' }], units: [{ t: 'archer', x: -0.2, y: 0.3, lv: 1 }, { t: 'sword', x: 0.2, y: 0.2, lv: 1 }],
    });
    _map = {
      inClan: true, myId: 'A', myName: 'Kartallar', myLogo: '🦅', ownedCount: 2, incomeRate: 22, totalRegions: 9,
      army: { raider: 6, axe: 3, knight: 2 }, armyTypes: ARMY_TYPES, armyMax: 15, deployMax: 6, upg: {},
      regions: [
        R('plains', 'farm', 1, 0.16, 0.28, 8, 0, null, false, 'Yeşil Ovalar', 'Green Plains'),
        R('meadow', 'farm', 1, 0.30, 0.56, 9, 0, 'A', true, 'Çayırlık', 'Meadowlands'),
        R('harbor', 'farm', 1, 0.63, 0.33, 9, 0, 'B', false, 'Liman Kenti', 'Harbor Town'),
        R('forest_e', 'forest', 2, 0.72, 0.66, 12, 0, null, false, 'Doğu Ormanı', 'East Forest'),
        R('mine_e', 'mine', 2, 0.83, 0.42, 15, 0, 'B', false, 'Doğu Madeni', 'East Mine'),
        R('quarry', 'mine', 2, 0.54, 0.80, 13, 0, null, false, 'Taş Ocağı', 'Stone Quarry'),
        R('fort_c', 'fortress', 3, 0.48, 0.44, 5, 60, 'A', true, 'Merkez Kale', 'Central Keep'),
        R('isle_gold', 'island', 2, 0.90, 0.82, 16, 20, null, false, 'Altın Ada', 'Gold Isle'),
        R('rare_d', 'rare', 3, 0.73, 0.22, 30, 10, null, false, 'Elmas Madeni', 'Diamond Mine'),
      ],
    };
    openMap();
    mapChrome();
    document.getElementById('mapView').style.zIndex = '99999';
    o.mapShown = document.getElementById('mapView').classList.contains('show');
    o.regionCount = _map.regions.length;
    o.stat = document.getElementById('mvStat').textContent;
    o.noFogRefs = typeof wmFog === 'undefined' && typeof exploreRegion === 'undefined';
    return o;
  } catch (e) { o.err = e.message; o.stack = String(e.stack || '').split('\n').slice(0, 2).join(' | '); return o; }
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/${TAG}-1-map.png` });

// tarafsiz NPC bolgesi -> panel + Saldir; tum bolgeler tiklanabilir (sis yok)
const sel = await page.evaluate(() => {
  const o = {};
  try {
    const r = _map.regions.find((x) => x.id === 'rare_d');
    const p = mapToScreen(r.x * MAP_W, r.y * MAP_H); wmTap(p.x, p.y);
    o.selected = _mapSel ? _mapSel.id : null;
    o.panelShown = document.getElementById('mvPanel').style.display !== 'none';
    o.hasAttack = /openMapRaid/.test(document.getElementById('mvPanel').innerHTML);
    o.npcLabel = /NPC/.test(document.getElementById('mvPanel').innerHTML);
    // uzak island bolgesi de secilebilir olmali
    const is = _map.regions.find((x) => x.id === 'isle_gold');
    const pp = mapToScreen(is.x * MAP_W, is.y * MAP_H); wmTap(pp.x, pp.y);
    o.islandSel = _mapSel ? _mapSel.id : null;
    return o;
  } catch (e) { o.err = e.message; return o; }
});
await page.screenshot({ path: `${OUT}/${TAG}-2-region.png` });

// saldir -> raidView (map hedefi)
const raid = await page.evaluate(() => {
  const o = {};
  try {
    openMapRaid('rare_d');
    o.raidShown = document.getElementById('raidView').classList.contains('show');
    o.mapHidden = !document.getElementById('mapView').classList.contains('show');
    o.target = _rdTarget.kind;
    o.hasDefense = !!(_rd && _rd.village && _rd.village.defs && _rd.village.defs.length);
    return o;
  } catch (e) { o.err = e.message; return o; }
});

await browser.close();
console.log(JSON.stringify({ setup, sel, raid }, null, 2));
if (errors.length) console.log('errors:\n' + errors.slice(0, 5).join('\n'));
const ok = !setup.err && !sel.err && !raid.err && setup.mapShown && setup.regionCount === 9 && setup.noFogRefs &&
  sel.selected === 'rare_d' && sel.panelShown && sel.hasAttack && sel.npcLabel && sel.islandSel === 'isle_gold' &&
  raid.raidShown && raid.mapHidden && raid.target === 'map' && raid.hasDefense && errors.length === 0;
console.log(ok ? `\nPASS [${TAG}]: full-visible map (no fog) + select + raid` : `\nFAIL [${TAG}]`);
process.exit(ok ? 0 : 1);
