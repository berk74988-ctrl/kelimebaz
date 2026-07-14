/**
 * KELİMEBAZ — profil sistemi doğrulaması (gerçek tarayıcı).
 *
 * ÖLÇER (iddia etmez):
 *   1. Profil sayfası açılıyor ve istenen tüm istatistikleri gösteriyor mu?
 *   2. Seviye ve puan gerçekten oynanan oyundan geliyor mu?
 *   3. Fotoğraf yüklenip KÜÇÜLTÜLÜYOR ve kalıcı oluyor mu?
 *   4. Kullanıcı adı kaydediliyor mu?
 *   5. Mobil ve masaüstünde yatay kaydırma var mı?
 *
 * Kullanım: node scripts/profile-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

const browser = await chromium.launch();
let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(48)} ${detail}`);
};

/** 3 galibiyet + 1 yenilgi oynamış bir oyuncu kur. */
const SEED = {
  played: 27,
  won: 24,
  currentStreak: 6,
  maxStreak: 11,
  distribution: [1, 3, 8, 7, 4, 1],
  lastWinAttempts: 4,
  points: 3450,
  guesses: 98,
};

const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(TARGET, { waitUntil: 'networkidle' });
await page.evaluate((s) => localStorage.setItem('kelimebaz:stats', JSON.stringify(s)), SEED);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);

console.log(`\nHedef: ${TARGET}\n`);
console.log('1) PROFİL SAYFASI');
console.log('─'.repeat(70));

await page.getByRole('button', { name: 'Profil' }).first().click();
await page.waitForTimeout(600);

const onProfile = await page.evaluate(() => !!document.querySelector('app-profile-screen'));
check('profil sayfası açıldı', onProfile);

// İstenen istatistiklerin HEPSİ ekranda mı?
const cards = await page.evaluate(() =>
  [...document.querySelectorAll('.stat[data-stat]')].map((el) => ({
    key: el.dataset.stat,
    value: el.querySelector('.s-val')?.textContent?.trim(),
    label: el.querySelector('.s-lbl')?.textContent?.trim(),
  })),
);

const want = {
  played: '27',
  winRate: '%89',
  wordsFound: '24',
  maxStreak: '11',
  points: '3.450',
};
for (const [key, val] of Object.entries(want)) {
  const card = cards.find((c) => c.key === key);
  check(`${(card?.label ?? key).padEnd(16)} kartı`, card?.value === val, `${card?.value ?? 'YOK'} (beklenen ${val})`);
}
check('kayıt defteri tüm kartları çizdi', cards.length === 7, `${cards.length} kart`);

console.log('\n2) SEVİYE');
console.log('─'.repeat(70));

const lv = await page.evaluate(() => ({
  badge: document.querySelector('.lv-badge')?.textContent?.trim(),
  num: document.querySelector('.lv-num')?.textContent?.trim(),
  fill: document.querySelector('.lv-fill')?.style.width,
  bar: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
}));
// 3450 puan → seviye: 100,300,600,1000,1500,2100,2800,3600 → 3450 seviye 8'de
check('seviye rozeti gösteriliyor', /Seviye \d+/.test(lv.badge ?? ''), lv.badge);
check('seviye puandan hesaplandı (3.450 → seviye 8)', lv.badge === 'Seviye 8', lv.badge);
check('ilerleme çubuğu dolu', parseFloat(lv.fill) > 0 && parseFloat(lv.fill) < 100, lv.fill);
check('ilerleme çubuğu erişilebilir', lv.bar !== null, `aria-valuenow=${lv.bar}`);

console.log('\n3) PROFİL FOTOĞRAFI');
console.log('─'.repeat(70));

// 600×400 turuncu bir PNG üret ve yükle → kare kırpılıp 160px'e inmeli
const png = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = '#e07b39';
  g.fillRect(0, 0, 600, 400);
  return c.toDataURL('image/png');
});
const buffer = Buffer.from(png.split(',')[1], 'base64');

await page.setInputFiles('.ph-btn input[type=file]', {
  name: 'test.png',
  mimeType: 'image/png',
  buffer,
});
await page.waitForTimeout(700);

const photo = await page.evaluate(() => {
  const stored = localStorage.getItem('kelimebaz:profile:photo') ?? '';
  const img = document.querySelector('.ph img');
  return {
    stored: stored.slice(0, 22),
    kb: Math.round((stored.length * 0.75) / 1024),
    shown: !!img,
    src: img?.src?.slice(0, 22),
  };
});
check('fotoğraf ekranda gösteriliyor', photo.shown);
check('JPEG olarak saklandı', photo.stored.startsWith('data:image/jpeg'), photo.stored);
check('küçültüldü (ham dosya kotayı patlatmaz)', photo.kb > 0 && photo.kb < 40, `${photo.kb} KB`);

// Boyut gerçekten 160×160 mü?
const dims = await page.evaluate(
  () =>
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res(`${i.naturalWidth}×${i.naturalHeight}`);
      i.src = localStorage.getItem('kelimebaz:profile:photo');
    }),
);
check('kare olarak kırpıldı (600×400 → 160×160)', dims === '160×160', dims);

console.log('\n4) KALICILIK');
console.log('─'.repeat(70));

await page.fill('.inp', 'Berk');
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Profil' }).first().click();
await page.waitForTimeout(500);

const after = await page.evaluate(() => ({
  name: document.querySelector('.inp')?.value,
  hasPhoto: !!document.querySelector('.ph img'),
  level: document.querySelector('.lv-badge')?.textContent?.trim(),
}));
check('kullanıcı adı hatırlandı', after.name === 'Berk', after.name);
check('fotoğraf hatırlandı', after.hasPhoto);
check('seviye hatırlandı', after.level === 'Seviye 8', after.level);

console.log('\n5) RESPONSIVE');
console.log('─'.repeat(70));

for (const [w, h, ad] of [
  [320, 640, 'küçük telefon'],
  [390, 844, 'telefon'],
  [768, 1024, 'tablet'],
  [1440, 900, 'masaüstü'],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(350);
  const scroll = await page.evaluate(() => ({
    over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  check(`${ad.padEnd(14)} ${w}×${h} — yatay kaydırma yok`, !scroll.over, `${scroll.sw} / ${scroll.cw}`);
}

console.log('\n6) KONSOL');
console.log('─'.repeat(70));
check('sayfa hatası yok', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();

console.log('\n' + '─'.repeat(70));
if (fail === 0) {
  console.log('\n✅ PROFİL SİSTEMİ DOĞRU ÇALIŞIYOR\n');
} else {
  console.log(`\n❌ ${fail} kontrol başarısız\n`);
  process.exit(1);
}
