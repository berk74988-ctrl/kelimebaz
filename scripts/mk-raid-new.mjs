import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
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
    if (typeof state === 'undefined' || !state) startNewGame(1);
    document.querySelectorAll('.overlay.show,.vv.show,.auth-overlay.show').forEach((e) => e.classList.remove('show'));
    _war = { side:'a', army:{ raider:6, axe:3, knight:2 },
      foeVillage:{ defs:[{t:'wall'},{t:'wall'},{t:'tower'},{t:'tower'}], units:[] },
      war:{ over:false, a:{clan:'A',name:'Kartallar',logo:'🦅',hp:520,max:1000,members:5},
            b:{clan:'B',name:'Kurtlar',logo:'🐺',hp:700,max:1000,members:4} } };
    openRaid();
    document.getElementById('raidView').style.zIndex = '100000';

    // 1) SERBEST YERLEŞTİRME: ekran merkezine (sur İÇİ, r≈0) asker koy → eskiden reddedilirdi
    _rdPlace = 'knight';
    const before = _rd.deploy.length;
    rdPlaceAt(_rdW/2, _rdH/2);                 // ekran merkezi → dünya (0,0) → köy merkezi
    o.deployedInside = _rd.deploy.length > before;
    const last = _rd.deploy[_rd.deploy.length-1];
    o.insideR = last ? +Math.hypot(last.x, last.y).toFixed(3) : null;   // <1.06 = eski surun içi

    // 2) KULE KARŞI-SALDIRISI: yalnız kule + menzilde raider → raider hasar almalı
    const vv = (function(k){ const a=(-112.5+45*k)*Math.PI/180; return {x:Math.cos(a),y:Math.sin(a)}; })(0); // tower vert(0) normalize
    const S = raidState([{t:'raider', x:vv.x, y:vv.y}], [{t:'tower'}], []);
    const hp0 = S.A[0].hp;
    let steps = 0; while (!S.done && steps < 200) { raidStep(S); steps++; }
    o.attackerHp0 = hp0;
    o.attackerHpEnd = +S.A[0].hp.toFixed(2);
    o.towerDamagedAttacker = S.A[0].hp < hp0;   // kule saldırgana hasar verdi mi

    rdChrome(); rdDraw();
    return o;
  } catch (e) { o.err = e.message; o.stack = String(e.stack||'').split('\n').slice(0,2).join(' | '); return o; }
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/free-placement.png` });
await browser.close();

console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('⚠️ konsol:\n' + errors.join('\n'));
const ok = !out.err && out.deployedInside && out.insideR < 1.06 && out.towerDamagedAttacker && errors.length === 0;
console.log(ok ? '\n✅ Serbest yerleştirme + kule karşı-saldırısı çalışıyor' : '\n❌ SORUN VAR');
process.exit(ok ? 0 : 1);
