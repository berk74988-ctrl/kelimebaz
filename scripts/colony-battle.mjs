/**
 * Mini Koloni — GELİŞTİRİLMİŞ KLAN SAVAŞI (akın simülatörü) testi.
 * Deploy fazı (stat gösterimi), savaş ortası (efektler + HUD) ve savaş raporunu
 * gerçek fonksiyonlarla (openRaid/raidState/raidStep/rdCollectFx/rdDraw/renderBattleReport)
 * mock veriyle sürer, ekran görüntüsü alır ve konsol hatası kontrol eder.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.argv[4] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 768);
const TAG = W > 700 ? `desktop-${H}` : `${W}x${H}`;
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/battle';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

// --- mock savaş kur + akın ekranını aç (deploy fazı) ---
const setup = await page.evaluate(() => {
  const o = {};
  try {
    if (typeof state === 'undefined' || !state) startNewGame(1);
    document.querySelectorAll('.overlay.show,.vv.show').forEach((e) => e.classList.remove('show'));
    _war = {
      side: 'a', army: { raider: 6, axe: 3, knight: 2 },
      foeVillage: {
        defs: [{ t: 'wall' }, { t: 'wall' }, { t: 'wall' }, { t: 'wall' }, { t: 'tower' }, { t: 'tower' }, { t: 'catapult' }],
        units: [{ t: 'archer', x: 0.12, y: -0.1 }, { t: 'sword', x: -0.2, y: 0.16 }, { t: 'guard', x: 0.18, y: 0.22 }],
      },
      war: { over: false, a: { clan: 'A', name: 'Kartallar', logo: '🦅', hp: 520, max: 1000, members: 5 },
             b: { clan: 'B', name: 'Kurtlar', logo: '🐺', hp: 700, max: 1000, members: 4 } },
    };
    openRaid();
    document.getElementById('raidView').style.zIndex = '100000';
    o.armyBtns = document.querySelectorAll('#rdArmy .vv-b').length;
    o.statText = (document.querySelector('#rdArmy .vv-bh:last-child') || {}).textContent || '';
    o.hasRngSpd = /🎯/.test(o.statText) && /💨/.test(o.statText);
    o.foe = _rd.foe.name;
    return o;
  } catch (e) { o.err = e.message; o.stack = String(e.stack || '').split('\n').slice(0, 2).join(' | '); return o; }
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/${TAG}-1-deploy.png` });

// --- savaş ortası: deploy + sim adımları + efekt toplama + çizim + HUD ---
const battle = await page.evaluate(() => {
  const o = {};
  try {
    _rd.deploy = [{ t: 'knight', x: 0, y: -1.4 }, { t: 'knight', x: 0.35, y: -1.4 },
                  { t: 'axe', x: 1.15, y: 0.7 }, { t: 'axe', x: -1.15, y: 0.6 },
                  { t: 'raider', x: 1.3, y: -0.4 }, { t: 'raider', x: -1.3, y: -0.3 }];
    _rd.sent = { knight: 2, axe: 2, raider: 2 };
    _rd.armyAtStart = { knight: 0, axe: 1, raider: 4 };
    _rdResult = { amt: 260, destroyed: ['wall', 'wall', 'wall', 'tower'], army: { knight: 2, axe: 2, raider: 5 }, lost: 1, over: false, cdLeft: 45000 };
    _rdFx = []; _rdShake = 0;
    _rdBattle = raidState(_rd.deploy, _rd.village.defs, _rd.village.units);
    _rdBattle.hp0 = _rd.foe.hp;
    let steps = 0;
    while (!_rdBattle.done && steps < 120) { raidStep(_rdBattle); rdCollectFx(_rdBattle); if (steps % 8 === 0) rdFxUpdate(0.05); steps++; }
    rdFxUpdate(0.016); rdHudUI(); rdDraw();
    o.steps = steps;
    o.fx = _rdFx.length;
    o.hudShown = document.getElementById('rdHud').classList.contains('show');
    o.pctText = document.getElementById('rdDmgPct').textContent;
    o.stars = document.getElementById('rdStars').textContent;
    o.downed = _rdBattle.T.filter((t) => t.hp <= 0).length;
    o.fxKinds = [...new Set(_rdFx.map((f) => f.k))];
    return o;
  } catch (e) { o.err = e.message; o.stack = String(e.stack || '').split('\n').slice(0, 2).join(' | '); return o; }
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/${TAG}-2-battle.png` });

// --- savaş raporu ---
const report = await page.evaluate(() => {
  const o = {};
  try {
    renderBattleReport({ d: _rdResult, pct: 62, stars: 2, razed: 3,
      lost: { raider: 1, axe: 0, knight: 0 }, lostTot: 1, loot: { gold: 78, resKey: 'odun', resN: 62 }, foe: _rd.foe });
    document.getElementById('battleReport').style.zIndex = '100001';
    o.shown = document.getElementById('battleReport').classList.contains('show');
    o.hasLoot = /altın/.test(document.getElementById('brContent').innerHTML);
    o.hasStars = document.querySelectorAll('#brContent .br-star-on').length;
    return o;
  } catch (e) { o.err = e.message; return o; }
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/${TAG}-3-report.png` });
await browser.close();

console.log(`[${TAG}] deploy:`, JSON.stringify(setup));
console.log(`[${TAG}] battle:`, JSON.stringify(battle));
console.log(`[${TAG}] report:`, JSON.stringify(report));
if (errors.length) console.log(`[${TAG}] ⚠️ konsol hataları:\n` + errors.join('\n'));

const ok = !setup.err && !battle.err && !report.err &&
  setup.armyBtns === 3 && setup.hasRngSpd &&
  battle.steps > 0 && battle.fx > 0 && battle.hudShown && battle.downed > 0 &&
  report.shown && report.hasLoot && report.hasStars === 2 &&
  errors.length === 0;
console.log(ok ? `\n✅ [${TAG}] geliştirilmiş savaş sistemi çalışıyor` : `\n❌ [${TAG}] SORUN VAR`);
process.exit(ok ? 0 : 1);
