/**
 * KELİMEBAZ — kontrast doğrulama (WCAG).
 *
 * "Her iki temada da renkler okunaklı" iddiasını ÖLÇER.
 * Gerçek sayfadan hesaplanmış CSS değişkenlerini okur ve
 * WCAG kontrast oranlarını hesaplar.
 *
 * Eşikler (WCAG AA):
 *   - normal metin      : 4.5:1
 *   - büyük/kalın metin : 3.0:1   (kutu harfleri ~24px+ kalın)
 *
 * Kullanım: node scripts/contrast-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

/** "#rrggbb" veya "rgb(r, g, b)" → [r,g,b] */
function parseColor(c) {
  const s = c.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full = h.length === 3 ? [...h].map((x) => x + x).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`renk çözümlenemedi: ${c}`);
  return m[1].split(',').slice(0, 3).map((x) => parseFloat(x));
}

/** WCAG bağıl parlaklık */
function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG kontrast oranı (1:1 – 21:1) */
function contrast(fg, bg) {
  const a = luminance(parseColor(fg));
  const b = luminance(parseColor(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// [ad, ön plan değişkeni, arka plan değişkeni, eşik]
const PAIRS = [
  ['Gövde metni / zemin', '--text', '--bg', 4.5],
  ['Gövde metni / kart', '--text', '--surface', 4.5],
  ['Soluk metin / kart', '--text-muted', '--surface', 4.5],
  ['Soluk metin / zemin', '--text-muted', '--bg', 4.5],
  ['Kutu: DOĞRU (yeşil)', '--on-correct', '--correct', 3.0],
  ['Kutu: VAR (sarı)', '--on-present', '--present', 3.0],
  ['Kutu: YOK (gri)', '--on-absent', '--absent', 3.0],
  ['Klavye tuşu metni', '--text', '--key-bg', 4.5],
  ['Toast metni', '--on-toast', '--toast-bg', 4.5],
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(TARGET, { waitUntil: 'networkidle' });

let failures = 0;

// Normal + yüksek kontrast (renk körü) modu, her iki temada
const MODES = [
  { theme: 'dark', high: false },
  { theme: 'light', high: false },
  { theme: 'dark', high: true },
  { theme: 'light', high: true },
];

for (const { theme, high } of MODES) {
  await page.evaluate(
    ({ t, h }) => {
      document.documentElement.dataset.theme = t;
      if (h) document.documentElement.dataset.contrast = 'high';
      else delete document.documentElement.dataset.contrast;
    },
    { t: theme, h: high },
  );
  await page.waitForTimeout(150);

  const vars = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const n of names) out[n] = cs.getPropertyValue(n).trim();
    return out;
  }, [...new Set(PAIRS.flatMap(([, f, b]) => [f, b]))]);

  const themeName = theme === 'dark' ? '🌙 KARANLIK' : '☀️ AYDINLIK';
  console.log(`\n${themeName} TEMA${high ? '  +  👁 YÜKSEK KONTRAST (renk körü)' : ''}`);
  console.log('─'.repeat(64));

  for (const [name, fgVar, bgVar, min] of PAIRS) {
    const fg = vars[fgVar];
    const bg = vars[bgVar];
    const ratio = contrast(fg, bg);
    const ok = ratio >= min;
    if (!ok) failures++;

    console.log(
      `${ok ? '✓' : '✗'} ${name.padEnd(24)} ${ratio.toFixed(2).padStart(5)}:1  (en az ${min})  ${fg} / ${bg}`,
    );
  }
}

await browser.close();

console.log('\n' + '─'.repeat(64));
if (failures === 0) {
  console.log('\n✅ HER İKİ TEMADA DA TÜM RENKLER OKUNAKLI (WCAG AA)\n');
} else {
  console.log(`\n❌ ${failures} renk çifti eşiğin altında\n`);
  process.exit(1);
}
