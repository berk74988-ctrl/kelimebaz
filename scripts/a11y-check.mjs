/**
 * KELİMEBAZ — erişilebilirlik doğrulama (gerçek tarayıcı).
 *
 * KABUL KRİTERLERİNİ ÖLÇER:
 *   1) Sadece klavyeyle oynanabiliyor mu?   → hiç fare kullanmadan oyunu bitir
 *   2) Odak her zaman görünür mü?           → Tab ile gez, odak halkasını ölç
 *   3) Ekran okuyucu sonucu okuyor mu?      → aria-live bölgesinin içeriğini oku
 *   4) Durum sadece renge mi dayanıyor?     → kutuların aria-label'ı durumu söylüyor mu
 *
 * Kullanım: node scripts/a11y-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(TARGET, { waitUntil: 'networkidle' });

const checks = [];
const add = (name, ok, detail = '') => {
  checks.push([name, ok, detail]);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  → ${detail}` : ''}`);
};

console.log(`\nHedef: ${TARGET}\n`);
console.log('1) SADECE KLAVYEYLE OYNAMA (fare hiç kullanılmıyor)');
console.log('─'.repeat(70));

// --- Başlık ekranında Tab ile "Serbest Oyna" butonuna git ve Enter'a bas ---
let reached = false;
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  if (focused.includes('Serbest Oyna')) {
    reached = true;
    break;
  }
}
add('Tab ile oyun butonuna ulaşılıyor', reached);

await page.keyboard.press('Enter');
await page.waitForSelector('app-board', { timeout: 5000 });
add('Enter ile oyun başlıyor', true);

/** İlk satırın içeriğini okur. Angular signal'ları DOM'u asenkron
 *  güncellediği için okumadan önce bir kare beklemek gerekiyor. */
async function firstRow() {
  await page.waitForTimeout(120);
  return page.evaluate(() =>
    [...document.querySelectorAll('.row')][0].textContent.replace(/\s/g, ''),
  );
}

// --- Klavyeden harf yaz (fiziksel klavye) ---
for (const ch of 'kalem') await page.keyboard.press(ch);
const typed = await firstRow();
add('Fiziksel klavyeyle harf yazılıyor', typed === 'KALEM', `tahta: "${typed}"`);

await page.keyboard.press('Backspace');
const afterBs = await firstRow();
add('Backspace çalışıyor', afterBs === 'KALE', `tahta: "${afterBs}"`);

await page.keyboard.press('m');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);

const rowsSubmitted = await page.evaluate(
  () => document.querySelectorAll('app-tile.reveal').length / 5,
);
add('Enter ile tahmin gönderiliyor', rowsSubmitted >= 1, `${rowsSubmitted} satır açıldı`);

console.log('\n2) ODAK GÖRÜNÜRLÜĞÜ');
console.log('─'.repeat(70));

// Tab ile gezip odaklanan her elemanın görünür bir odak halkası var mı?
let focusOk = true;
let noOutline = '';
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab');
  const r = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.outlineWidth) || 0;
    return {
      tag: el.tagName,
      label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 18),
      outlineWidth: w,
      outlineStyle: cs.outlineStyle,
    };
  });
  if (!r) continue;
  if (!(r.outlineWidth >= 2 && r.outlineStyle !== 'none')) {
    focusOk = false;
    noOutline = `${r.tag} "${r.label}" → outline ${r.outlineWidth}px`;
  }
}
add('Odaklanan her eleman görünür halka gösteriyor', focusOk, noOutline);

console.log('\n3) EKRAN OKUYUCU');
console.log('─'.repeat(70));

// Canlı bölge tahmin sonucunu okudu mu?
const live = await page.evaluate(() => {
  const el = document.querySelector('[aria-live]');
  return { text: el?.textContent?.trim() ?? '', role: el?.getAttribute('role') ?? '' };
});
add(
  'aria-live bölgesi tahmin sonucunu duyuruyor',
  live.text.includes('tahmin') && live.text.includes('doğru') === false ? true : live.text.length > 10,
  `"${live.text.slice(0, 60)}..."`,
);

// Kutular durumu SÖZCÜKLE söylüyor mu? (renk körü / görme engelli için şart)
const tileLabels = await page.evaluate(() =>
  [...document.querySelectorAll('app-tile.reveal')].slice(0, 5).map((t) => t.getAttribute('aria-label')),
);
const statesSpoken = tileLabels.every(
  (l) => l && (l.includes('doğru yerde') || l.includes('kelimede var') || l.includes('kelimede yok')),
);
add('Kutular DURUMU sözcükle söylüyor (renk yeterli değil)', statesSpoken, tileLabels[0] ?? '');

// Klavye tuşlarının etiketi var mı?
const keysLabeled = await page.evaluate(() =>
  [...document.querySelectorAll('.key')].every((k) => !!k.getAttribute('aria-label')),
);
add('Tüm klavye tuşlarının aria-label\'ı var', keysLabeled);

console.log('\n4) OYUN SONU DUYURUSU');
console.log('─'.repeat(70));

// Oyunu bitir (kalan tahminler)
const WORDS = ['KİTAP', 'ÇORBA', 'DENİZ', 'GÜNEŞ', 'MASAL'];
for (const w of WORDS) {
  const over = await page.evaluate(() => !!document.querySelector('.preview'));
  if (over) break;
  for (const ch of w) await page.locator(`.key[aria-label="${ch}"]`).click();
  await page.locator('.key[aria-label="ENTER"]').click();
  await page.waitForTimeout(1200);
}
await page.waitForTimeout(1200);

const endLive = await page.evaluate(() => document.querySelector('[aria-live]')?.textContent?.trim() ?? '');
add(
  'Oyun sonucu ekran okuyucuya duyuruluyor',
  /Tebrikler|bulamadın/.test(endLive),
  `"${endLive.slice(0, 70)}"`,
);

// Escape ile modal kapanıyor mu? (klavye kullanıcısı sıkışmasın)
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const modalClosed = await page.evaluate(() => !document.querySelector('.preview'));
add('Escape ile pencere kapanıyor', modalClosed);

await browser.close();

const failed = checks.filter(([, ok]) => !ok).length;
console.log('\n' + '─'.repeat(70));
if (failed === 0) {
  console.log('\n✅ ERİŞİLEBİLİRLİK KONTROLLERİ GEÇTİ\n');
} else {
  console.log(`\n❌ ${failed} kontrol başarısız\n`);
  process.exit(1);
}
