import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/kb-mobile';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let fail = 0;

// Bir ekrandaki interaktif öğeler KAYDIRARAK ekrana getirilebiliyor mu? (erişilebilir mi)
async function reach(page) {
  return page.evaluate(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      const st = getComputedStyle(e);
      return r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    const els = [...document.querySelectorAll('main button, main input, main label, main a, .modal button, .modal input')].filter(vis);
    const ih = window.innerHeight;
    const bad = [];
    for (const e of els) {
      // öğeyi (varsa kaydırma kabında) görünüre getirmeyi dene
      e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = e.getBoundingClientRect();
      // hâlâ ekranın dışındaysa ERİŞİLEMEZ
      if (r.bottom > ih + 2 || r.top < -2) {
        bad.push({ txt: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 22), top: Math.round(r.top), bottom: Math.round(r.bottom) });
      }
    }
    return { ih, total: els.length, bad };
  });
}

async function check(name, width, height, nav) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  try { await nav(page); } catch (e) { console.log(`  ✗ ${name} nav: ${e.message}`); await ctx.close(); fail++; return; }
  await page.waitForTimeout(450);
  const r = await reach(page);
  const ok = r.bad.length === 0;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${name} ${width}×${height} — ${r.total} öğe · ${ok ? 'hepsi erişilebilir' : `${r.bad.length} ERİŞİLEMEZ: ${r.bad.map((b) => b.txt + '(alt ' + b.bottom + '/' + r.ih + ')').join(', ')}`}`);
  await ctx.close();
}

const tool = (p, i) => p.locator('.tools .tool').nth(i).click(); // 0=🛒 1=👤 2=⚙️
const nav = {
  'profil-stat': async (p) => { await tool(p, 1); },
  'profil-görev': async (p) => { await tool(p, 1); await p.getByRole('button', { name: /Görevler/ }).click(); },
  'profil-avatar': async (p) => { await tool(p, 1); await p.getByRole('button', { name: /Avatar/ }).click(); },
  'magaza-avatar': async (p) => { await tool(p, 0); await p.locator('.tab', { hasText: 'Avatar' }).click(); },
  'ayarlar': async (p) => { await tool(p, 2); },
  'oda': async (p) => { await p.locator('.mode', { hasText: 'Arkadaşlarla' }).click(); },
  'lig': async (p) => { await p.locator('.mode', { hasText: 'LP' }).click(); },
};

console.log(`\nErişilebilirlik kontrolü (ekran dışı buton var mı?)\n`);
for (const [w, h] of [[360, 640], [320, 568]]) {
  for (const [name, fn] of Object.entries(nav)) await check(name, w, h, fn);
  console.log('');
}
await browser.close();
console.log(fail === 0 ? '✅ tüm ekranlarda her buton/bilgi erişilebilir\n' : `❌ ${fail} durumda erişilemeyen içerik var\n`);
process.exit(fail === 0 ? 0 : 1);
