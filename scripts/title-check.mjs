import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/kb-mobile';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let fail = 0;

const SIZES = [[320, 568], [360, 640], [375, 667], [393, 852]];

console.log(`\nBaşlık ekranı — çubuk taşması + içerik kırpma kontrolü\n`);
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const tools = [...document.querySelectorAll('.tools .tool, .tools .coin')];
    const maxRight = Math.max(...tools.map((t) => t.getBoundingClientRect().right));
    const minLeft = Math.min(...tools.map((t) => t.getBoundingClientRect().left));
    const c = document.querySelector('.content').getBoundingClientRect();
    return {
      maxRight: Math.round(maxRight), minLeft: Math.round(minLeft), iw: window.innerWidth,
      cTop: Math.round(c.top), cBottom: Math.round(c.bottom), ih: window.innerHeight, tools: tools.length,
    };
  });
  const barOK = r.maxRight <= r.iw + 0.5 && r.minLeft >= -0.5;
  const clipOK = r.cTop >= -0.5 && r.cBottom <= r.ih + 0.5;
  if (!barOK || !clipOK) fail++;
  await page.screenshot({ path: `${OUT}/title-${w}x${h}.png` });
  console.log(`  ${barOK && clipOK ? '✓' : '✗'} ${w}×${h}  çubuk ${barOK ? 'sığar' : `TAŞIYOR(sağ ${r.maxRight}/${r.iw})`} · içerik ${clipOK ? 'tam' : `KIRPIK(üst ${r.cTop}, alt ${r.cBottom}/${r.ih})`}`);
  await ctx.close();
}
await browser.close();
console.log(fail === 0 ? '\n✅ tüm dar/kısa ekranlarda çubuk sığar + içerik kırpılmaz\n' : `\n❌ ${fail} boyutta sorun\n`);
process.exit(fail === 0 ? 0 : 1);
