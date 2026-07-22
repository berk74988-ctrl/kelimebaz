import { chromium } from 'playwright';
const URL = process.argv[2] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const out = await page.evaluate(() => {
  const o = {};
  try {
    // 1) Maliyet rebalance
    o.costs = {
      raider: ARMY_TYPES.raider.cost, axe: ARMY_TYPES.axe.cost, knight: ARMY_TYPES.knight.cost,
      archer: VV_UNITS.archer.cost, sword: VV_UNITS.sword.cost, guard: VV_UNITS.guard.cost,
    };
    // cost/dps ve cost/def oranları (denge)
    o.cpd = { raider:+(ARMY_TYPES.raider.cost/ARMY_TYPES.raider.dps).toFixed(1),
              knight:+(ARMY_TYPES.knight.cost/ARMY_TYPES.knight.dps).toFixed(1) };

    // 2) Savaş paneli: manuel butonlar (mock savaş verisiyle renderWar)
    currentUser = currentUser || 'tester';
    const mockWar = { inClan:true, side:'a', canWar:true, members:3,
      army:{ raider:4, axe:2, knight:1 },
      village:{ name:'Test', max:1000, members:3, defs:[], units:[] },
      war:{ over:false,
        a:{clan:'A',name:'Kartallar',logo:'🦅',hp:600,max:1000,members:3},
        b:{clan:'B',name:'Kurtlar',logo:'🐺',hp:800,max:1000,members:4},
        log:[], raids:[] } };
    document.getElementById('warOverlay').classList.add('show');
    renderWar(mockWar);
    const raidBtn = document.getElementById('warRaid');
    const defBtn  = document.getElementById('warDefend');
    o.hasRaidBtn = !!raidBtn;
    o.hasDefendBtn = !!defBtn;
    o.raidOpensRaid = !!raidBtn && /openRaid/.test(raidBtn.getAttribute('onclick') || '');
    o.defendOpensVillage = !!defBtn && /openVillage/.test(defBtn.getAttribute('onclick') || '');
    o.noAutoAttackBtn = !document.getElementById('warAtk') && !document.getElementById('warDef');
    o.raidBtnText = (raidBtn && raidBtn.textContent || '').replace(/\s+/g,' ').trim();

    // 3) warRaid gerçekten manuel yerleştirme ekranını mı açıyor?
    raidBtn.click();
    o.raidViewShown = document.getElementById('raidView').classList.contains('show');
    return o;
  } catch (e) { o.err = e.message; o.stack = String(e.stack||'').split('\n').slice(0,2).join(' | '); return o; }
});
await browser.close();

console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('⚠️ konsol:\n' + errors.join('\n'));
const c = out.costs || {};
const ok = !out.err &&
  c.raider===30 && c.axe===60 && c.knight===105 && c.archer===24 && c.sword===40 && c.guard===64 &&
  out.hasRaidBtn && out.hasDefendBtn && out.raidOpensRaid && out.defendOpensVillage &&
  out.noAutoAttackBtn && out.raidViewShown && errors.length===0;
console.log(ok ? '\n✅ Rebalance + tamamen manuel savaş akışı çalışıyor' : '\n❌ SORUN VAR');
process.exit(ok ? 0 : 1);
