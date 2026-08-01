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

console.log(`\ntelemetri: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
