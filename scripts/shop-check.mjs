/**
 * KELİMEBAZ — mağaza sistemi doğrulaması (gerçek tarayıcı).
 *
 * ÖLÇER (iddia etmez):
 *   1. Mağaza açılıyor, dört kategori ve ürünler görünüyor mu?
 *   2. Yeterli altınla satın alma OLUYOR, altın düşüyor mu?
 *   3. Yetersiz altınla satın alma REDDEDİLİYOR mu?
 *   4. Satın alınan tema GERÇEKTEN uygulanıyor mu (data-skin)?
 *   5. Satın alınanlar kalıcı, istenince kullanılıp geri çıkarılıyor mu?
 *   6. Mobil + masaüstünde yatay kaydırma yok mu?
 *
 * Kullanım: node scripts/shop-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

const browser = await chromium.launch();
let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(50)} ${detail}`);
};

const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const gold = () => page.evaluate(() => JSON.parse(localStorage.getItem('kelimebaz:gold') ?? '{"balance":0}').balance);
const skin = () => page.evaluate(() => document.documentElement.dataset.skin ?? '(yok)');
const owned = () => page.evaluate(() => JSON.parse(localStorage.getItem('kelimebaz:inv:owned') ?? '[]'));

async function openShop() {
  await page.getByRole('button', { name: /Mağaza/ }).first().click();
  await page.waitForSelector('app-shop-screen');
  await page.waitForTimeout(300);
}

await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
// 400 altın ver — bazı şeyler alınsın, bazıları alınamasın
await page.evaluate(() =>
  localStorage.setItem('kelimebaz:gold', JSON.stringify({ balance: 400, earned: 400, spent: 0 })),
);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);

console.log(`\nHedef: ${TARGET}\n`);
console.log('1) MAĞAZA AÇILIŞI');
console.log('─'.repeat(72));

await openShop();
const tabs = await page.locator('.tab').count();
check('dört kategori sekmesi var', tabs === 4, `${tabs} sekme`);
const items = await page.locator('.item').count();
check('temalar sekmesinde ürünler var', items > 0, `${items} ürün`);
check('mağazada altın gösteriliyor', (await page.locator('.coin b').textContent())?.trim() === '400');

console.log('\n2) SATIN ALMA — yeterli altın');
console.log('─'.repeat(72));

// Okyanus teması (150). Sekmedeki 2. ürün (default ücretsiz, sonra ocean).
const ocean = page.locator('.item', { hasText: 'Okyanus' });
await ocean.click();
await page.waitForTimeout(800);

check('altın düştü (400 → 250)', (await gold()) === 250, `🪙 ${await gold()}`);
check('okyanus teması sahiplendi', (await owned()).includes('theme.ocean'));
check('tema GERÇEKTEN uygulandı (data-skin)', (await skin()) === 'ocean', await skin());
check('kart "kullanımda" işaretlendi', (await ocean.getAttribute('class'))?.includes('equipped'));

console.log('\n3) KULLANMA — geri çıkar / tekrar tak');
console.log('─'.repeat(72));

// Klasik (default, ücretsiz) temaya dön
await page.locator('.item', { hasText: 'Klasik' }).click();
await page.waitForTimeout(500);
check('varsayılana dönünce data-skin kalkar', (await skin()) === '(yok)', await skin());
check('altın değişmedi (zaten sahip olunanı kullanmak bedava)', (await gold()) === 250);

// Tekrar okyanus
await ocean.click();
await page.waitForTimeout(500);
check('geri takınca tekrar ödeme YOK', (await gold()) === 250, `🪙 ${await gold()}`);
check('tema tekrar uygulandı', (await skin()) === 'ocean');

console.log('\n4) SATIN ALMA — yetersiz altın');
console.log('─'.repeat(72));

// Rozet sekmesine geç, Kupa (300) — bakiye 250, alınamamalı
await page.locator('.tab', { hasText: 'Rozetler' }).click();
await page.waitForTimeout(300);
const trophy = page.locator('.item', { hasText: 'Kupa' });
check('pahalı ürün kilitli görünüyor', (await trophy.getAttribute('class'))?.includes('locked'));

const before = await gold();
await trophy.click({ force: true });
await page.waitForTimeout(500);
check('yetersiz altında satın ALINMADI', !(await owned()).includes('badge.trophy'));
check('altın değişmedi', (await gold()) === before, `🪙 ${await gold()}`);

console.log('\n5) KALICILIK + PROFİLDE KULLANIM');
console.log('─'.repeat(72));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

check('okyanus teması yenilemeden sonra HÂLÂ uygulanıyor', (await skin()) === 'ocean', await skin());
check('sahiplik korundu', (await owned()).includes('theme.ocean'));

// Bir avatar al ve profilde göründüğünü doğrula
await openShop();
await page.locator('.tab', { hasText: 'Avatarlar' }).click();
await page.waitForTimeout(300);
await page.locator('.item', { hasText: 'Ejderha' }).click(); // 120, bakiye 250 → 130
await page.waitForTimeout(600);
check('avatar satın alındı ve kullanıma alındı', (await owned()).includes('avatar.dragon'));

await page.locator('.back').click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Profil' }).first().click();
await page.waitForTimeout(500);

const profileAvatar = await page.evaluate(() => document.querySelector('.ph-emoji')?.textContent?.trim());
check('satın alınan avatar profilde görünüyor', profileAvatar === '🐉', profileAvatar);

console.log('\n6) RESPONSIVE');
console.log('─'.repeat(72));

await page.locator('.back').click();
await page.waitForTimeout(300);
await openShop();

for (const [w, h, ad] of [
  [320, 640, 'küçük telefon'],
  [390, 844, 'telefon'],
  [1440, 900, 'masaüstü'],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(350);
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  check(`${ad.padEnd(15)} ${w}×${h} — yatay kaydırma yok`, !over);
}

check('konsol hatası yok', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();

console.log('\n' + '─'.repeat(72));
if (fail === 0) {
  console.log('\n✅ MAĞAZA SİSTEMİ DOĞRU ÇALIŞIYOR\n');
} else {
  console.log(`\n❌ ${fail} kontrol başarısız\n`);
  process.exit(1);
}
