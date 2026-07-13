/**
 * KELİMEBAZ — paylaşım doğrulama (gerçek tarayıcı).
 *
 * Kritik soru: canlı site HTTP üzerinden yayında. Orada navigator.clipboard
 * TANIMLI DEĞİLDİR. Kopyalama gerçekten çalışıyor mu?
 *
 * Bu script gerçek Chromium'da oyunu oynayıp bitiriyor, "Sonucu paylaş"a
 * basıyor ve PANONUN İÇİNİ okuyup doğruluyor:
 *   1) Panoya bir şey yazıldı mı?
 *   2) Yazılan metin harf içeriyor mu (spoiler)?
 *   3) Izgara ekrandaki sonuca uyuyor mu?
 *
 * Kullanım: node scripts/share-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

const browser = await chromium.launch();
const context = await browser.newContext({
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();

console.log(`\nHedef: ${TARGET}`);
console.log(`Protokol: ${new URL(TARGET).protocol}  ${new URL(TARGET).protocol === 'http:' ? '(güvensiz bağlam — navigator.clipboard YOK)' : ''}\n`);

await page.goto(TARGET, { waitUntil: 'networkidle' });

// navigator.clipboard gerçekten var mı?
const hasModern = await page.evaluate(() => !!navigator.clipboard?.writeText);
console.log(`navigator.clipboard mevcut mu : ${hasModern ? 'EVET' : 'HAYIR → yedek yöntem devrede'}`);

// Serbest oyuna gir ve 6 tahmin yaparak oyunu bitir
await page.getByRole('button', { name: /Serbest Oyna/ }).click();
await page.waitForSelector('app-board');

// Türkçe harfleri fiziksel klavyeyle basmak zor (İ, Ş, Ğ...) →
// oyuncunun yaptığı gibi EKRAN KLAVYESİNE tıklıyoruz.
const WORDS = ['KALEM', 'KİTAP', 'ÇORBA', 'DENİZ', 'GÜNEŞ', 'MASAL'];
for (const w of WORDS) {
  const over = await page.evaluate(() => !!document.querySelector('app-result-modal'));
  if (over) break;

  for (const ch of w) {
    await page.locator(`.key[aria-label="${ch}"]`).click();
  }
  await page.locator('.key[aria-label="ENTER"]').click();
  await page.waitForTimeout(1100); // flip animasyonu bitsin
}

// app-result-modal host'unun kendi boyutu yok (içi position:fixed) →
// görünür olan iç elemanı bekle.
await page.waitForSelector('.preview', { state: 'visible', timeout: 8000 });
await page.waitForTimeout(500);

// Ekrandaki ızgara önizlemesi
const onScreen = (await page.locator('.preview').textContent()).trim();

await page.getByRole('button', { name: /Sonucu paylaş/ }).click();
await page.waitForTimeout(400);

// Buton geri bildirimi
const feedback = (await page.locator('.actions .ghost').textContent()).trim();

/**
 * PANONUN İÇİNİ OKU.
 * navigator.clipboard.readText de HTTPS ister → HTTP'de yok.
 * Bu yüzden gerçek bir kullanıcı gibi davranıyoruz: bir textarea'ya
 * odaklanıp Ctrl+V ile YAPIŞTIRIYORUZ. Bu, işletim sisteminin gerçek
 * panosunu okur — yani kopyalamanın gerçekten olduğunu kanıtlar.
 */
await page.evaluate(() => {
  const ta = document.createElement('textarea');
  ta.id = '__paste_probe';
  Object.assign(ta.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '320px',
    height: '160px',
    zIndex: '999999',
  });
  document.body.appendChild(ta);
  ta.focus();
});

await page.keyboard.press('Control+V');
await page.waitForTimeout(300);

const clip = await page.$eval('#__paste_probe', (el) => el.value);

console.log(`Buton geri bildirimi          : ${feedback}`);
console.log(`\n--- PANODAKİ METİN ---\n${clip}\n----------------------\n`);

// --- Doğrulamalar ---
const HAS_LETTER = /\p{Letter}/u;
const lines = clip.split('\n');
const header = lines[0] ?? '';
const gridLines = lines.slice(2).filter(Boolean);

const checks = [
  ['Panoya bir şey yazıldı', clip.length > 0],
  ['Geri bildirim "Kopyalandı"', feedback.includes('Kopyalandı')],
  ['Başlık doğru biçimde', /^Kelimebaz .* [\dX]\/6$/.test(header)],
  ['Izgarada HİÇ harf yok (spoiler yok)', gridLines.length > 0 && !gridLines.some((l) => HAS_LETTER.test(l))],
  ['Izgara ekrandakiyle birebir aynı', gridLines.join('\n') === onScreen],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fail++;
}

await browser.close();

if (fail === 0) {
  console.log('\n✅ PAYLAŞIM ÇALIŞIYOR\n');
} else {
  console.log(`\n❌ ${fail} kontrol başarısız\n`);
  process.exit(1);
}
