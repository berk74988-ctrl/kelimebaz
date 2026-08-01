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
const g = T.normalizeEvent(
  {
    type: 'game_end',
    mode: 'daily',
    lang: 'tr',
    wlen: 5,
    word: 'kalem',
    result: 'won',
    attempts: 3,
    duration_ms: 45000,
  },
  NOW,
);
ok(
  g && g.type === 'game_end' && g.word === 'KALEM' && g.attempts === 3,
  'geçerli olay normalize edilir',
);
ok(g.ts === NOW, 'zaman damgası SUNUCUDAN — istemci ts yok sayılır');

ok(T.normalizeEvent({ type: 'bogus' }, NOW) === null, 'bilinmeyen tür atılır');
ok(T.normalizeEvent(null, NOW) === null, 'null olay atılır');
ok(
  T.normalizeEvent({ type: 'game_start', ts: 5, ip: '1.2.3.4', user: 'berk' }, NOW).ts === NOW,
  'dışarıdan ts/ip/kullanıcı alanları GÖRMEZDEN gelinir (kimlik sızmaz)',
);

const dirty = T.normalizeEvent(
  { type: 'game_start', mode: 'HACK', lang: 'xx', wlen: 999, word: 'A'.repeat(50), attempts: -3 },
  NOW,
);
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
  {
    type: 'game_end',
    ts: NOW2,
    mode: 'practice',
    lang: 'en',
    wlen: 7,
    result: 'lost',
    attempts: 6,
  },
  {
    type: 'game_end',
    ts: NOW2,
    mode: 'vsai',
    lang: 'tr',
    wlen: 5,
    result: 'won',
    attempts: 4,
    code: 'hard',
  },
  { type: 'error', ts: NOW2, code: 'x' },
];
const s = T.aggregate(rows, 0, NOW2 + 1, NOW2);
ok(
  s.totals.starts === 2 && s.totals.completed === 3 && s.totals.errors === 1,
  'aggregate: toplamlar',
);
ok(s.winRate === 0.5, 'aggregate: tekil kazanma oranı vsai HARİÇ (1/2)');
ok(s.modes.daily === 1 && s.modes.practice === 1, 'aggregate: mod dağılımı start’tan');
ok(s.langs.tr === 1 && s.langs.en === 1, 'aggregate: dil dağılımı');
ok(
  s.guessDist[3] === 1 && s.guessDist.fail === 1,
  'aggregate: tahmin dağılımı (kazanılan tur + fail)',
);
ok(s.byLength.find((x) => x.wlen === 7).winRate === 0, 'aggregate: 7 harf kazanma oranı');
ok(s.vsai.totalGames === 1 && s.vsai.byTier[0].tier === 'hard', 'aggregate: vsai zorluk (tier)');

// --- kelime bazlı istatistik + öneriler ---
function wrows(word, lang, wlen, starts, endsSpec) {
  // endsSpec: [{result, attempts}]
  const rs = [];
  for (let i = 0; i < starts; i++)
    rs.push({ type: 'game_start', ts: NOW2, mode: 'daily', lang, wlen, word });
  for (const e of endsSpec)
    rs.push({
      type: 'game_end',
      ts: NOW2,
      mode: 'daily',
      lang,
      wlen,
      word,
      result: e.result,
      attempts: e.attempts,
    });
  return rs;
}
const wr = [
  // ADAM: 40 oyun, 8 kazanma → %20 (çok zor); LLM=1 (kolay) → hafife almış
  ...wrows(
    'ADAM',
    'tr',
    4,
    40,
    Array.from({ length: 40 }, (_, i) => ({
      result: i < 8 ? 'won' : 'lost',
      attempts: i < 8 ? 4 : 6,
    })),
  ),
  // MASA: 40 oyun hepsi 2 tahminde → çok kolay
  ...wrows(
    'MASA',
    'tr',
    4,
    40,
    Array.from({ length: 40 }, () => ({ result: 'won', attempts: 2 })),
  ),
  // KEDI: 5 oyun → yetersiz örneklem
  ...wrows(
    'KEDI',
    'tr',
    4,
    5,
    Array.from({ length: 5 }, () => ({ result: 'won', attempts: 3 })),
  ),
  // BULUT: 40 başlangıç, 15 bitiş → terk %62 (yeterli oynanma)
  ...wrows(
    'BULUT',
    'tr',
    5,
    40,
    Array.from({ length: 15 }, () => ({ result: 'won', attempts: 3 })),
  ),
];
const diff = { tr: { ADAM: 1, MASA: 2 } };
const ws = T.aggregateWords(wr, diff, 30);
const get = (w) => ws.find((x) => x.word === w);
ok(
  get('ADAM').winRate === 0.2 && Math.abs(get('ADAM').avgAttempts - 5.6) < 0.01,
  'kelime: ADAM kazanma/ort tahmin',
);
ok(
  get('ADAM').enough === true && get('KEDI').enough === false,
  'kelime: asgari örneklem işareti (30)',
);
ok(Math.abs(get('BULUT').abandonRate - 25 / 40) < 0.01, 'kelime: terk oranı (start-end)/start');
ok(get('ADAM').difficulty === 1 && get('BULUT').difficulty == null, 'kelime: LLM zorluk eşleşmesi');

const recs = T.wordRecommendations(ws, 30);
const kinds = (w) => recs.filter((r) => r.word === w).map((r) => r.kind);
ok(
  kinds('ADAM').includes('too_hard') && kinds('ADAM').includes('llm_underrated'),
  'öneri: ADAM çok zor + LLM hafife almış',
);
ok(kinds('MASA').includes('too_easy'), 'öneri: MASA çok kolay');
ok(kinds('KEDI').length === 0, 'öneri: yetersiz örneklem → öneri yok');
ok(kinds('BULUT').includes('high_abandon'), 'öneri: BULUT yüksek terk (oynanmaya dayalı)');

const csv = T.wordsToCsv(ws);
ok(
  csv.split('\n')[0] ===
    'word,lang,wlen,plays,completed,winRate,avgAttempts,abandonRate,difficulty,sample,enough',
  'CSV başlığı',
);
ok(csv.includes('ADAM,tr,4,40,40,0.2,5.6,0,1,40,true'), 'CSV veri satırı');

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
