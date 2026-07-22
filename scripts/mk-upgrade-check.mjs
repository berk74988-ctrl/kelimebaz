import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.argv[2] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/battle';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const out = await page.evaluate(() => {
  const o = {};
  try {
    currentUser = 'tester';
    if (typeof state === 'undefined' || !state) startNewGame(1);
    state.resources = Object.assign(state.resources||{}, { odun: 999, tas: 999 });
    coins = () => 9999;                                   // yeterli altın (test)
    _upg = { raider:3, axe:1, knight:1, archer:2, sword:1, guard:1 };

    // 1) Yükseltme çarpanları
    o.hpMul = { l1:upgHpMult(1), l3:upgHpMult(3), l5:upgHpMult(5), l9:upgHpMult(9) };
    o.dpsMul = { l1:upgDpsMult(1), l3:upgDpsMult(3), l5:upgDpsMult(5) };

    // 2) raidState yükseltmeyi uyguluyor mu?
    const S = raidState([{t:'raider',x:0.5,y:0}], [], [{t:'archer',x:0,y:0,lv:2}], {raider:3});
    o.atkHp = +S.A[0].hp.toFixed(2);     // 24*1.30 = 31.2
    o.atkDps = +S.A[0].dps.toFixed(2);   // 1.0*1.20 = 1.2
    o.defHp = +S.D[0].hp.toFixed(2);     // archer 22*1.15 = 25.3
    o.defDps = +S.D[0].dps.toFixed(2);   // archer 3*1.10 = 3.3

    // 3) Maliyet ilerlemesi (yüksek seviyede artar)
    o.cost = { l1:upgCost('raider',1).gold, l2:upgCost('raider',2).gold, l3:upgCost('raider',3).gold, l4:upgCost('raider',4).gold };
    o.costProgressive = o.cost.l1 < o.cost.l2 && o.cost.l2 < o.cost.l3 && o.cost.l3 < o.cost.l4;

    // 4) Arayüz render — 6 birlik, seviye + sonraki stat gösterimi
    document.getElementById('authOverlay').classList.remove('show');   // görsel için karşılamayı gizle
    document.getElementById('villageView').classList.add('show');      // köy görünümündeymiş gibi
    openUpgrade();
    o.upgAboveVillage = getComputedStyle(document.getElementById('upgradeOverlay')).zIndex >
                        getComputedStyle(document.getElementById('villageView')).zIndex;
    const rows = document.querySelectorAll('#upgList .upg-row');
    o.rowCount = rows.length;
    o.overlayShown = document.getElementById('upgradeOverlay').classList.contains('show');
    const raiderRow = rows[0].textContent.replace(/\s+/g,' ');
    o.raiderShowsLv3 = /Sv 3\/5|Lv 3\/5/.test(raiderRow);
    o.raiderShowsNext = /→/.test(rows[0].innerHTML);      // mevcut → sonraki oku

    // 5) upgradeTroop — server'ı mock'la, _upg artıyor mu + kaynak düşüyor mu
    const odun0 = state.resources.odun;
    _clanPost = (p, b) => Promise.resolve({ ok:true, d:{ upg:Object.assign({}, _upg, {[b.type]:(_upg[b.type]||1)+1}), type:b.type, level:(_upg[b.type]||1)+1 } });
    return new Promise(resolve => {
      const before = _upg.axe||1;
      upgradeTroop('axe');
      setTimeout(() => {
        o.axeLeveledUp = (_upg.axe||1) === before+1;
        o.odunSpent = state.resources.odun < odun0;
        resolve(o);
      }, 200);
    });
  } catch (e) { o.err = e.message; o.stack = String(e.stack||'').split('\n').slice(0,2).join(' | '); return o; }
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/upgrade.png` });
await browser.close();

console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('⚠️ konsol:\n' + errors.join('\n'));
const ok = !out.err &&
  out.hpMul.l3===1.30 && out.hpMul.l5===1.60 && out.hpMul.l9===1.60 &&   // 9 → clamp 5
  out.atkHp===31.2 && out.atkDps===1.2 && out.defHp===25.3 && out.defDps===3.3 &&
  out.costProgressive && out.rowCount===6 && out.overlayShown &&
  out.raiderShowsLv3 && out.raiderShowsNext && out.axeLeveledUp && out.odunSpent &&
  errors.length===0;
console.log(ok ? '\n✅ Birlik yükseltme sistemi çalışıyor' : '\n❌ SORUN VAR');
process.exit(ok ? 0 : 1);
