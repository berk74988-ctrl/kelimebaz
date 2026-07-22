import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.argv[2] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/clan';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function run(label, W, H, mobile) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, colorScheme:'dark' })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    currentUser = 'tester';
    document.getElementById('authOverlay').classList.remove('show');
    document.getElementById('clanOverlay').classList.add('show');
    const clans=[];
    for(let i=0;i<6;i++) clans.push({id:'c'+i,name:['Demir Kurtlar','Gölge Birliği','Ejder Lordları','Kızıl Şafak','Buz Kalesi','Fırtına Süvarileri'][i],desc:'Sadık savaşçılar birliği',members:3+i,level:1+(i%4),leaderName:'Lider'+i});
    renderClanList({ clans, applied:['c1'] });
  });
  await page.waitForTimeout(150);
  const o = { label };
  o.hasCard = await page.locator('.cc-card').count() > 0;
  o.hasPreview = await page.locator('.cc-preview').count() > 0;
  o.hasCreateBtn = await page.locator('.cc-create').count() > 0;
  o.logoCount = await page.locator('#clanLogos .cl-lg').count();

  // canlı önizleme: ad + açıklama yaz
  await page.fill('#clanName', 'Ejderhanın Yükselişi');
  await page.fill('#clanDesc', 'En güçlü klan burada!');
  o.prevName = await page.locator('#ccPrevName').textContent();
  o.nameCount = await page.locator('#ccNameCount').textContent();
  o.descCount = await page.locator('#ccDescCount').textContent();

  // logo seç (🐉) → önizleme güncellenmeli
  await page.locator('#clanLogos .cl-lg', { hasText: '🐉' }).click();
  o.prevLogo = await page.locator('#ccPrevLogo').textContent();
  o.selDragon = await page.locator('#clanLogos .cl-lg.sel', { hasText:'🐉' }).count() > 0;

  // düzen + scroll ölçümleri
  o.layoutRow = await page.evaluate(() => getComputedStyle(document.querySelector('.cc-layout')).flexDirection);
  o.joinRows = await page.locator('.cc-join-list .cl-row').count();
  o.createBtnInView = await page.evaluate(() => { const b=document.querySelector('.cc-create'); if(!b)return false;
    const r=b.getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight+1; });
  o.bodyScrolls = await page.evaluate(() => { const s=document.getElementById('clanBody'); return s.scrollHeight > s.clientHeight+2; });
  o.dbg = await page.evaluate(() => { const s=document.getElementById('clanBody'), box=document.querySelector('.clan-box'),
    f=document.querySelector('.cc-col-form'), j=document.querySelector('.cc-col-join');
    return { sSH:s.scrollHeight, sCH:s.clientHeight, boxH:box.offsetHeight, vh:innerHeight, formH:f.offsetHeight, joinH:j.offsetHeight }; });

  await page.screenshot({ path: `${OUT}/clan-create-${label}.png` });
  o.errors = errors;
  await page.close();
  return o;
}

const mob = await run('mobile', 390, 844, true);
const desk = await run('desktop', 1280, 800, false);
await browser.close();
console.log(JSON.stringify({ mob, desk }, null, 2));
const base = (o) => o.hasCard && o.hasPreview && o.hasCreateBtn && o.logoCount===12 &&
  /Ejderhanın/.test(o.prevName) && o.nameCount==='20/24' && o.descCount==='21/140' &&
  o.prevLogo==='🐉' && o.selDragon && o.joinRows===6 && o.errors.length===0;
// Masaüstü: iki sütun (row) + oluştur butonu görünür + DIŞ SCROLL YOK
const deskOk = base(desk) && desk.layoutRow==='row' && desk.createBtnInView && !desk.bodyScrolls;
// Mobil: tek sütun (column) + 6 klan listelenir
const mobOk = base(mob) && mob.layoutRow==='column';
const ok = deskOk && mobOk;
console.log('desk:', JSON.stringify({row:desk.layoutRow, btnInView:desk.createBtnInView, scroll:desk.bodyScrolls, rows:desk.joinRows}));
console.log('mob:', JSON.stringify({col:mob.layoutRow, rows:mob.joinRows, scroll:mob.bodyScrolls}));
console.log(ok ? '\n✅ Klan düzeni: masaüstü iki sütun/scroll yok, mobil ferah liste' : '\n❌ SORUN VAR');
process.exit(ok ? 0 : 1);
