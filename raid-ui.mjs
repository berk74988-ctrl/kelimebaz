/**
 * Saldırı ekranını GERÇEK tarayıcıda sürer:
 * klan → savaş → akın ekranı → asker yerleştir → saldır → animasyon → sonuç.
 * Ekran görüntüsü alır ve konsol hatalarını yakalar.
 */
import { chromium } from 'playwright';

const URL = 'http://34.158.136.9/berk/';
const OUT = process.argv[2] || '.';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });

// "berk" kullanıcısı olarak oturum aç (oyun oturumu localStorage'da)
await page.evaluate(() => {
  const users = JSON.parse(localStorage.getItem('miniKoloni_users') || '{}');
  users.berk = users.berk || { name: 'berk', h: 'x', coins: 5000 };
  localStorage.setItem('miniKoloni_users', JSON.stringify(users));
  localStorage.setItem('miniKoloni_session', 'berk');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// açılış öğretici turunu kapat (ekranı kapatıyor)
const skip = page.getByText(/Turu geç/);
if (await skip.count()) { await skip.first().click(); await page.waitForTimeout(400); }

const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(`  📸 ${n}.png`); };

const state = async () => page.evaluate(() => ({
  user: typeof currentUser !== 'undefined' ? currentUser : null,
  raidOpen: document.getElementById('raidView')?.classList.contains('show'),
  warOpen: document.getElementById('warOverlay')?.classList.contains('show'),
  war: typeof _war !== 'undefined' && _war ? { inClan: _war.inClan, hasWar: !!_war.war, army: _war.army } : null,
  rd: typeof _rd !== 'undefined' && _rd ? { deploy: _rd.deploy.length, army: _rd.army, foeHp: _rd.foe.hp } : null,
  battle: typeof _rdBattle !== 'undefined' && _rdBattle ? { step: _rdBattle.step, done: _rdBattle.done, dmg: Math.round(_rdBattle.dmg) } : null,
  result: typeof _rdResult !== 'undefined' && _rdResult ? _rdResult : null,
}));

console.log('\n1) Oturum');
let s = await state();
console.log('   kullanıcı:', s.user);
if (!s.user) { console.log('   ❌ giriş yapılamadı'); await browser.close(); process.exit(1); }

console.log('\n2) Savaş paneli açılıyor');
await page.evaluate(() => openWar());
await page.waitForTimeout(2000);
s = await state();
console.log('   klanda:', s.war?.inClan, '· aktif savaş:', s.war?.hasWar, '· ordu:', JSON.stringify(s.war?.army));
await shot('raid-1-savas-paneli');

if (!s.war?.hasWar) { console.log('   ⚠️ aktif savaş yok — test verisi kurulmamış'); await browser.close(); process.exit(2); }

console.log('\n3) Akın ekranı açılıyor');
await page.evaluate(() => openRaid());
await page.waitForTimeout(900);
s = await state();
console.log('   akın ekranı açık:', s.raidOpen, '· rakip HP:', s.rd?.foeHp, '· ordum:', JSON.stringify(s.rd?.army));
await shot('raid-2-hazirlik');

console.log('\n4) 3 Şövalye yerleştiriliyor (kuzey cephesi)');
await page.evaluate(() => {
  // ekran koordinatına çevir (dünya → ekran) — gerçek tıklama ile aynı yol
  const toScreen = (fx, fy) => ({
    x: fx * VV_RX * _rdZ + _rdW / 2 + _rdPX,
    y: fy * VV_RY * (_rdZ * 0.92) + _rdH / 2 + _rdPY,
  });
  for (const [fx, fy] of [[0, -1.15], [0.28, -1.12], [-0.28, -1.12]]) {
    if (_rdPlace !== 'knight') rdPick('knight');   // seçili değilse seç (rdPick bir aç/kapa anahtarı)
    const p = toScreen(fx, fy);
    rdPlaceAt(p.x, p.y);
  }
});
await page.waitForTimeout(400);
s = await state();
console.log('   sahadaki asker:', s.rd?.deploy, '· orduda kalan:', JSON.stringify(s.rd?.army));
await shot('raid-3-yerlestirildi');

if (s.rd?.deploy !== 3) { console.log('   ❌ yerleştirme başarısız'); await browser.close(); process.exit(1); }

console.log('\n5) SALDIRI başlatılıyor');
await page.evaluate(() => startRaid());
await page.waitForTimeout(2600);           // savaşçılar sura varsın, dövüş başlasın
s = await state();
console.log('   savaş başladı · adım:', s.battle?.step, '· sunucu hasarı:', s.result?.amt);
console.log('   buton:', await page.textContent('#rdGo'));
await shot('raid-4-savas-ortasi');

console.log('\n6) Animasyon izleniyor…');
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(900);
  s = await state();
  if (s.battle?.done) break;
}
await page.waitForTimeout(700);
s = await state();
await shot('raid-5-sonuc');

console.log('\n7) SONUÇ');
console.log('   animasyon bitti :', s.battle?.done);
console.log('   tarayıcı hasarı :', s.battle?.dmg);
console.log('   sunucu hasarı   :', s.result?.amt);
console.log('   yıkılan yapı    :', (s.result?.destroyed || []).filter(x => x !== 'core').length);
console.log('   kayıp asker     :', s.result?.lost);
console.log('   rakip HP        :', s.rd?.foeHp);

const match = s.battle?.dmg === s.result?.amt;
console.log(`\n   ${match ? '✅' : '❌'} Tarayıcı animasyonu ile sunucu sonucu ${match ? 'BİREBİR AYNI' : 'UYUŞMUYOR'} (${s.battle?.dmg} vs ${s.result?.amt})`);

console.log('\n8) Konsol hataları:', errors.length ? '❌\n   ' + errors.slice(0, 6).join('\n   ') : '✅ yok');

await browser.close();
process.exit(match && errors.length === 0 ? 0 : 1);

