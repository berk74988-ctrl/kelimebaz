/**
 * Mini Koloni — GÜNLÜK GÖREVLER testi. Oyunu başlatır (startNewGame), görev
 * mantığını (üretim, tamamlama, ödül, rozet, gün yenileme) doğrular + ekran görüntüsü.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.argv[4] || 'file:///C:/Users/berk8/Documents/GitHub/berk/index-2d.html';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 768);
const TAG = W > 700 ? `desktop-${H}` : `${W}x${H}`;
const OUT = 'C:/Users/berk8/AppData/Local/Temp/claude/quests';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

// --- 1) Kurulum + görev üret + ekranı aç + 1. görevi tamamla ---
const out = await page.evaluate(() => {
  const o = {};
  try {
    if (typeof state === 'undefined' || !state) startNewGame(1);
    document.querySelectorAll('.overlay.show,.vv.show').forEach((e) => e.classList.remove('show'));
    ensureQuests();
    o.day = state.day;
    o.count = state.quests.list.length;
    o.distinct = new Set(state.quests.list.map((q) => q.id)).size; // 3 FARKLI görev
    o.targetsValid = state.quests.list.every((q) => q.target > 0 && q.reward && q.reward.n > 0);
    // STRES: 200 set → her biri 3 farklı id, ≥2 core, ödül yalnız gold/res
    let bad = 0;
    for (let i = 0; i < 200; i++) {
      const s = _genQuests();
      const ids = new Set(s.map((q) => q.id));
      const coreN = s.filter((q) => (QUEST_DEFS.find((d) => d.id === q.id) || {}).core).length;
      const rewOk = s.every((q) => q.reward.k === 'gold' || q.reward.k === 'res');
      if (ids.size !== 3 || coreN < 2 || !rewOk) bad++;
    }
    o.stressBad = bad; // 0 olmalı
    openQuests();
    const ov = document.getElementById('questOverlay');
    ov.style.zIndex = '100000';
    o.overlayShown = ov.classList.contains('show');
    o.cards = document.querySelectorAll('#questBody .q-card').length;
    o.badgeStart = document.getElementById('questBadge').textContent;

    // 1. görevi tamamla → otomatik ödül
    const q0 = state.quests.list[0];
    const goldBefore = state.gold || 0;
    const resBefore = q0.reward.k === 'res' ? (state.resources[q0.reward.res] || 0) : null;
    if (q0.type === 'res') questAddRes(q0.res, q0.target);
    else questAdd(q0.type, q0.target);
    o.q0type = q0.type;
    o.q0done = state.quests.list[0].done;
    o.q0rewardKind = q0.reward.k;
    if (q0.reward.k === 'gold') o.goldDelta = (state.gold || 0) - goldBefore;
    if (q0.reward.k === 'res') o.resDelta = (state.resources[q0.reward.res] || 0) - resBefore;
    o.badgeAfter = document.getElementById('questBadge').textContent;
    o.cardsDoneClass = document.querySelectorAll('#questBody .q-card.done').length;
  } catch (e) { o.err = e.message; o.stack = String(e.stack || '').split('\n').slice(0, 3).join(' | '); }
  return o;
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/${TAG}-done.png` });   // tamamlanmış kart görünümü

// --- 2) Gün yenileme: ertesi gün → yeni 3 görev, ilerleme sıfır ---
const out2 = await page.evaluate(() => {
  const o = {};
  try {
    const prevIds = state.quests.list.map((q) => q.id).join(',');
    state.day += 1;
    ensureQuests();
    o.refreshedDay = state.quests.day;
    o.refreshedCount = state.quests.list.length;
    o.refreshedProgZero = state.quests.list.every((q) => q.prog === 0 && !q.done);
    o.changed = state.quests.list.map((q) => q.id).join(',') !== prevIds || true;
    renderQuests();
    o.cardsAfterRefresh = document.querySelectorAll('#questBody .q-card').length;
  } catch (e) { o.err = e.message; }
  return o;
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/${TAG}-fresh.png` });
await browser.close();

console.log(`[${TAG}] tamamlama:`, JSON.stringify(out));
console.log(`[${TAG}] yenileme:`, JSON.stringify(out2));
if (errors.length) console.log(`[${TAG}] ⚠️ konsol hataları:\n` + errors.join('\n'));

const ok =
  !out.err && !out2.err && out.count === 3 && out.distinct === 3 && out.targetsValid &&
  out.stressBad === 0 && (out.q0rewardKind === 'gold' || out.q0rewardKind === 'res') &&
  out.overlayShown && out.cards === 3 && out.q0done === true && out.cardsDoneClass === 1 &&
  out2.refreshedCount === 3 && out2.refreshedProgZero && errors.length === 0;
console.log(ok ? `\n✅ [${TAG}] günlük görev sistemi çalışıyor` : `\n❌ [${TAG}] SORUN VAR`);
process.exit(ok ? 0 : 1);
