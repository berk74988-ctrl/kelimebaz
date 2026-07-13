/**
 * KELİMEBAZ — responsive doğrulama.
 *
 * Gerçek bir tarayıcı (Chromium) açar, oyunu farklı ekran boyutlarında yükler
 * ve KABUL KRİTERLERİNİ ÖLÇER:
 *   1) Yatay kaydırma var mı?            → scrollWidth > clientWidth
 *   2) Tuşlar parmakla basılabilir mi?   → tuş yüksekliği >= 44px
 *   3) Dikey taşma var mı?               → içerik ekrana sığıyor mu
 *   4) Tahta ortalı mı?                  → sol/sağ boşluk farkı
 *
 * Kullanım:  node scripts/responsive-check.mjs [url]
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:4200';

const DEVICES = [
  { name: 'iPhone SE (küçük)', width: 375, height: 667 },
  { name: 'Android küçük', width: 360, height: 640 },
  { name: 'Çok dar telefon', width: 320, height: 568 },
  { name: 'iPhone 14 Pro', width: 393, height: 852 },
  { name: 'Telefon yatay', width: 740, height: 360 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Dizüstü', width: 1366, height: 768 },
  { name: 'Masaüstü', width: 1920, height: 1080 },
];

const browser = await chromium.launch();
let failures = 0;

console.log(`\nHedef: ${URL}\n`);
console.log(
  'Cihaz'.padEnd(22) +
    'Ekran'.padEnd(12) +
    'YatayKaydırma'.padEnd(15) +
    'MinTuş'.padEnd(9) +
    'Sığıyor'.padEnd(9) +
    'Ortalı',
);
console.log('─'.repeat(80));

for (const d of DEVICES) {
  const page = await browser.newPage({
    viewport: { width: d.width, height: d.height },
    hasTouch: true,
    isMobile: d.width < 640,
  });

  await page.goto(URL, { waitUntil: 'networkidle' });

  // Başlık ekranından oyuna gir
  await page.getByRole('button', { name: /Günün Kelimesi/ }).click();
  await page.waitForSelector('app-board');
  await page.waitForTimeout(300);

  const r = await page.evaluate(() => {
    const doc = document.documentElement;

    // 1) Yatay kaydırma
    const hScroll = doc.scrollWidth - doc.clientWidth;

    // 2) En kısa tuş
    const keys = [...document.querySelectorAll('.key')];
    const minKeyH = Math.min(...keys.map((k) => Math.round(k.getBoundingClientRect().height)));

    // 3) Dikey taşma
    const vScroll = doc.scrollHeight - doc.clientHeight;

    // 4) Tahta ortalı mı (sol/sağ boşluk farkı)
    const board = document.querySelector('.board').getBoundingClientRect();
    const left = board.left;
    const right = doc.clientWidth - board.right;
    const offCenter = Math.abs(left - right);

    return { hScroll, minKeyH, vScroll, offCenter, keys: keys.length };
  });

  const okH = r.hScroll <= 0;
  const okKey = r.minKeyH >= 44;
  const okFit = r.vScroll <= 1;
  const okCenter = r.offCenter <= 2;

  if (!okH || !okKey || !okFit || !okCenter) failures++;

  console.log(
    d.name.padEnd(22) +
      `${d.width}×${d.height}`.padEnd(12) +
      (okH ? '✓ yok' : `✗ ${r.hScroll}px`).padEnd(15) +
      (okKey ? `✓ ${r.minKeyH}px` : `✗ ${r.minKeyH}px`).padEnd(9) +
      (okFit ? '✓ evet' : `✗ +${r.vScroll}px`).padEnd(9) +
      (okCenter ? '✓ evet' : `✗ ${r.offCenter}px`),
  );

  await page.close();
}

await browser.close();

console.log('─'.repeat(80));
if (failures === 0) {
  console.log('\n✅ TÜM EKRAN BOYUTLARI GEÇTİ\n');
} else {
  console.log(`\n❌ ${failures} ekran boyutunda sorun var\n`);
  process.exit(1);
}
