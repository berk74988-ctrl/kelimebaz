/**
 * telemetri deposu testleri — normalize (gizlilik/doğrulama) + her iki arka uç
 * (sqlite varsa + NDJSON). Kullanım: node rooms-server/telemetry.test.mjs
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const T = require('./telemetry.js');

let pass = 0,
  fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('  ❌', msg);
  }
};

const NOW = 1_700_000_000_000;

// --- normalizeEvent: doğrulama + gizlilik ---
const g = T.normalizeEvent({ type: 'game_end', mode: 'daily', lang: 'tr', wlen: 5, word: 'kalem', result: 'won', attempts: 3, duration_ms: 45000 }, NOW);
ok(g && g.type === 'game_end' && g.word === 'KALEM' && g.attempts === 3, 'geçerli olay normalize edilir');
ok(g.ts === NOW, 'zaman damgası SUNUCUDAN — istemci ts yok sayılır');

ok(T.normalizeEvent({ type: 'bogus' }, NOW) === null, 'bilinmeyen tür atılır');
ok(T.normalizeEvent(null, NOW) === null, 'null olay atılır');
ok(T.normalizeEvent({ type: 'game_start', ts: 5, ip: '1.2.3.4', user: 'berk' }, NOW).ts === NOW, 'dışarıdan ts/ip/kullanıcı alanları GÖRMEZDEN gelinir (kimlik sızmaz)');

const dirty = T.normalizeEvent({ type: 'game_start', mode: 'HACK', lang: 'xx', wlen: 999, word: 'A'.repeat(50), attempts: -3 }, NOW);
ok(dirty.mode === null && dirty.lang === null, 'geçersiz mod/dil → null');
ok(dirty.wlen === 15 && [...dirty.word].length === 20, 'wlen ve word sınırlanır');
ok(dirty.attempts === 1, 'attempts alt sınıra çekilir');

// --- Depo arka uçları ---
function testStore(backend) {
  const dir = mkdtempSync(join(tmpdir(), 'kbtel-'));
  try {
    const store = T.open({ dir, backend, retentionDays: 30, keepBackups: 3 });
    if (backend && store.backend !== backend) {
      // sqlite yoksa (Node 20) 'sqlite' istenirse NDJSON'a düşer — testi atla
      return console.log(`  (arka uç ${backend} yok, atlandı)`);
    }
    store.insert(T.normalizeEvent({ type: 'game_start', mode: 'daily', lang: 'tr' }, NOW));
    store.insert(T.normalizeEvent({ type: 'game_end', result: 'won', attempts: 2 }, NOW));
    ok(store.count() === 2, `${store.backend}: 2 kayıt yazıldı`);

    // Eski kaydı ekle, saklama süresini geçir → temizlensin
    store.insert(T.normalizeEvent({ type: 'error', code: 'old' }, NOW - 60 * 86_400_000));
    ok(store.count() === 3, `${store.backend}: eski kayıt eklendi`);
    const r = store.runMaintenance(NOW); // 30 gün saklama → 60 gün önceki silinir
    ok(r.pruned === 1 && store.count() === 2, `${store.backend}: eski kayıt temizlendi`);
    ok(existsSync(join(dir, 'backups')), `${store.backend}: yedek klasörü oluştu`);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows kilidi — yoksay */
    }
  }
}

testStore('ndjson'); // her Node'da çalışır (yedek yol)
testStore(undefined); // varsayılan (Node 22+ sqlite, yoksa ndjson)

// --- aggregate: pano metrikleri (saf) ---
const NOW2 = 1_700_000_000_000;
const rows = [
  { type: 'game_start', ts: NOW2, mode: 'daily', lang: 'tr' },
  { type: 'game_end', ts: NOW2, mode: 'daily', lang: 'tr', wlen: 5, result: 'won', attempts: 3 },
  { type: 'game_start', ts: NOW2, mode: 'practice', lang: 'en' },
  { type: 'game_end', ts: NOW2, mode: 'practice', lang: 'en', wlen: 7, result: 'lost', attempts: 6 },
  { type: 'game_end', ts: NOW2, mode: 'vsai', lang: 'tr', wlen: 5, result: 'won', attempts: 4, code: 'hard' },
  { type: 'error', ts: NOW2, code: 'x' },
];
const s = T.aggregate(rows, 0, NOW2 + 1, NOW2);
ok(s.totals.starts === 2 && s.totals.completed === 3 && s.totals.errors === 1, 'aggregate: toplamlar');
ok(s.winRate === 0.5, 'aggregate: tekil kazanma oranı vsai HARİÇ (1/2)');
ok(s.modes.daily === 1 && s.modes.practice === 1, 'aggregate: mod dağılımı start’tan');
ok(s.langs.tr === 1 && s.langs.en === 1, 'aggregate: dil dağılımı');
ok(s.guessDist[3] === 1 && s.guessDist.fail === 1, 'aggregate: tahmin dağılımı (kazanılan tur + fail)');
ok(s.byLength.find((x) => x.wlen === 7).winRate === 0, 'aggregate: 7 harf kazanma oranı');
ok(s.vsai.totalGames === 1 && s.vsai.byTier[0].tier === 'hard', 'aggregate: vsai zorluk (tier)');

// --- performans: 30 günlük veride özet < 1 sn ---
// Asıl maliyet aggregate() compute'udur (sqlite readRange tek indeksli sorgu, O(sonuç)).
// 40k satırda (30 günlük yoğun kullanım) compute'u ölçüyoruz.
(function perf() {
  const DAY = 86_400_000;
  const base = NOW2;
  const rows = [];
  for (let i = 0; i < 40_000; i++) {
    rows.push({
      type: i % 2 ? 'game_end' : 'game_start',
      ts: base - (i % 30) * DAY,
      mode: ['daily', 'practice', 'vsai', 'theme'][i % 4],
      lang: i % 3 ? 'tr' : 'en',
      wlen: 4 + (i % 4),
      result: i % 2 ? (i % 5 ? 'won' : 'lost') : null,
      attempts: 1 + (i % 6),
      code: i % 4 === 2 ? 'hard' : null,
    });
  }
  const t0 = process.hrtime.bigint();
  const out = T.aggregate(rows, base - 30 * DAY, base + 1, base);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(out.totals.starts + out.totals.completed > 0, 'perf: özet veri döndü');
  ok(ms < 1000, `perf: 30 gün / 40k olay özeti < 1 sn (${ms.toFixed(0)}ms)`);
  console.log(`  ⏱ aggregate 40k olay: ${ms.toFixed(0)}ms`);
})();

console.log(`\ntelemetri: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
