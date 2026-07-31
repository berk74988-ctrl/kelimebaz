/**
 * PWA İKON ÜRETİCİ — favicon.svg'den PNG ikonlar (playwright/chromium ile).
 *
 * Üretilenler (public/icons/):
 *   icon-192.png, icon-512.png            → "any" amac (yuvarlak köşeli logo)
 *   icon-192-maskable.png, icon-512-...   → "maskable" (tam-taşan zemin + %72 güvenli alan)
 *   apple-touch-icon.png (180)            → iOS ana ekran (opak kare, iOS kendi yuvarlar)
 *
 * Kaynak logo tek yer: public/favicon.svg. Değişirse burayı yeniden çalıştır:
 *   npm run build:icons
 */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/icons/', ROOT);
await mkdir(OUT, { recursive: true });

// Logonun iç içeriği (dış yuvarlak zemin HARİÇ) — maskable/apple için yeniden kullanılır.
const INNER = `
  <rect x="6" y="6" width="24" height="24" rx="6" fill="#4caf82"/>
  <rect x="34" y="6" width="24" height="24" rx="6" fill="#d9a441"/>
  <rect x="6" y="34" width="24" height="24" rx="6" fill="#3a4150"/>
  <rect x="34" y="34" width="24" height="24" rx="6" fill="#4caf82"/>
  <text x="18" y="24" font-family="Segoe UI, system-ui, sans-serif" font-size="17" font-weight="800" text-anchor="middle" fill="#062012">K</text>
  <text x="46" y="24" font-family="Segoe UI, system-ui, sans-serif" font-size="17" font-weight="800" text-anchor="middle" fill="#2a1d05">E</text>
  <text x="18" y="52" font-family="Segoe UI, system-ui, sans-serif" font-size="17" font-weight="800" text-anchor="middle" fill="#eef2f7">L</text>
  <text x="46" y="52" font-family="Segoe UI, system-ui, sans-serif" font-size="17" font-weight="800" text-anchor="middle" fill="#062012">İ</text>`;

// "any": mevcut yuvarlak köşeli logo (köşeler saydam kalır)
const anySvg = await readFile(fileURLToPath(new URL('public/favicon.svg', ROOT)), 'utf8');

// "maskable": tam-taşan zemin + içerik merkeze %72 ölçekli (güvenli alan içinde)
const maskable = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#10131a"/>
  <g transform="translate(32,32) scale(${scale}) translate(-32,-32)">${INNER}</g>
</svg>`;

const jobs = [
  { file: 'icon-192.png', size: 192, svg: anySvg, transparent: true },
  { file: 'icon-512.png', size: 512, svg: anySvg, transparent: true },
  { file: 'icon-192-maskable.png', size: 192, svg: maskable(0.72), transparent: false },
  { file: 'icon-512-maskable.png', size: 512, svg: maskable(0.72), transparent: false },
  // iOS maskelemediği için içeriği biraz büyük (0.82) ver, opak kare
  { file: 'apple-touch-icon.png', size: 180, svg: maskable(0.82), transparent: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, svg, transparent } of jobs) {
  const html = `<!doctype html><meta charset="utf-8">
    <style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px}
    svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: fileURLToPath(new URL(file, OUT)), omitBackground: transparent });
  console.log(`✓ ${file} (${size}×${size})`);
}
await browser.close();
console.log('Bitti → public/icons/');
