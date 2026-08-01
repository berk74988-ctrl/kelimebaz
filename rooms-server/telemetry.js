'use strict';

/**
 * KELİMEBAZ — Anonim telemetri deposu (bağımlılıksız).
 *
 * GİZLİLİK (pazarlık konusu değil):
 *   • Oyuncu kimliği YOK — kalıcı tanımlayıcı üretilmez/saklanmaz.
 *   • IP YAZILMAZ — yalnızca sunucuda geçici hız sınırı anahtarı (bu dosyaya girmez).
 *   • Kişisel veri / profil adı / avatar HİÇBİR ŞEKİLDE saklanmaz.
 *   • Zaman damgası SUNUCUDA damgalanır (istemci saati/parmak izi sızmaz).
 *
 * DEPO: Node 22.5+ ise yerleşik `node:sqlite`; yoksa (ör. Node 20) AYNI şemalı
 * NDJSON dosyasına düşer. İkisi de aynı arayüzü sunar: normalize/insert/prune/
 * count/backup. Böylece bağımlılık eklemeden, sunucu Node'u yükselince otomatik
 * SQLite'a geçer.
 *
 * SAĞLAMLIK: Bu modül yalnız DEPOLAR. Başlatma/yazma hatası çağırana bırakılır;
 * oda sunucusu telemetri olmadan da sorunsuz çalışır (oyun asla etkilenmez).
 */

const fs = require('fs');
const path = require('path');

// --- Şema alanları ve izinli değerler ---
const TYPES = new Set(['game_start', 'game_end', 'mode_select', 'lang_change', 'error']);
const MODES = new Set(['daily', 'practice', 'room', 'vsai', 'theme']);
const LANGS = new Set(['tr', 'en']);
const RESULTS = new Set(['won', 'lost']);

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
}
function str(v, max) {
  if (v == null) return null;
  const s = String(v).slice(0, max);
  return s || null;
}

/**
 * Tek bir olayı doğrula ve temizle → güvenli kayıt ya da null (atılır).
 * Bilinmeyen alanlar DÜŞER; her alan tür/aralık denetiminden geçer. Zaman
 * damgası dışarıdan ALINMAZ — sunucunun verdiği nowMs kullanılır.
 */
function normalizeEvent(e, nowMs) {
  if (!e || typeof e !== 'object' || !TYPES.has(e.type)) return null;
  return {
    type: e.type,
    ts: nowMs,
    mode: MODES.has(e.mode) ? e.mode : null,
    lang: LANGS.has(e.lang) ? e.lang : null,
    wlen: clampInt(e.wlen, 1, 15),
    word: str(e.word, 20) ? String(e.word).slice(0, 20).toLocaleUpperCase('tr') : null,
    result: RESULTS.has(e.result) ? e.result : null,
    attempts: clampInt(e.attempts, 1, 20),
    duration_ms: clampInt(e.duration_ms, 0, 3_600_000),
    code: str(e.code, 40), // hata kodu / mod detayı
  };
}

const COLUMNS = ['type', 'ts', 'mode', 'lang', 'wlen', 'word', 'result', 'attempts', 'duration_ms', 'code'];

// --- SQLite arka ucu (node:sqlite, Node 22.5+) ---
function sqliteStore(dir) {
  const { DatabaseSync } = require('node:sqlite'); // yoksa throw → NDJSON'a düşülür
  const file = path.join(dir, 'telemetry.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS events(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, ts INTEGER NOT NULL,
    mode TEXT, lang TEXT, wlen INTEGER, word TEXT,
    result TEXT, attempts INTEGER, duration_ms INTEGER, code TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`);
  const ins = db.prepare(
    `INSERT INTO events(${COLUMNS.join(',')}) VALUES(${COLUMNS.map(() => '?').join(',')})`,
  );
  return {
    backend: 'sqlite',
    file,
    insert(e) {
      ins.run(...COLUMNS.map((c) => e[c]));
    },
    prune(cutoff) {
      return db.prepare(`DELETE FROM events WHERE ts < ?`).run(cutoff).changes || 0;
    },
    count() {
      return db.prepare(`SELECT COUNT(*) AS c FROM events`).get().c;
    },
    backup(dest) {
      db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    },
  };
}

// --- NDJSON arka ucu (yedek — bağımlılıksız, her Node'da çalışır) ---
function ndjsonStore(dir) {
  const file = path.join(dir, 'telemetry.ndjson');
  const readLines = () =>
    fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  return {
    backend: 'ndjson',
    file,
    insert(e) {
      fs.appendFileSync(file, JSON.stringify(e) + '\n');
    },
    prune(cutoff) {
      const lines = readLines();
      const keep = [];
      let removed = 0;
      for (const l of lines) {
        try {
          if (JSON.parse(l).ts >= cutoff) keep.push(l);
          else removed++;
        } catch {
          removed++; // bozuk satır → at
        }
      }
      fs.writeFileSync(file, keep.length ? keep.join('\n') + '\n' : '');
      return removed;
    },
    count() {
      return readLines().length;
    },
    backup(dest) {
      if (fs.existsSync(file)) fs.copyFileSync(file, dest);
    },
  };
}

/**
 * Depoyu aç. SQLite denenir; olmazsa NDJSON. Dizin yoksa oluşturulur.
 * Döner: { backend, file, retentionDays, normalize, insert, prune, count,
 *          backup, runMaintenance }
 */
function open(opts = {}) {
  const dir = opts.dir || path.join(__dirname, 'telemetry');
  const retentionDays = Number.isFinite(opts.retentionDays) ? opts.retentionDays : 90;
  fs.mkdirSync(dir, { recursive: true });

  let store;
  if (opts.backend === 'ndjson') {
    store = ndjsonStore(dir); // elle zorlanabilir (test/operatör)
  } else {
    try {
      store = sqliteStore(dir);
    } catch {
      store = ndjsonStore(dir); // Node 20: node:sqlite yok → NDJSON
    }
  }

  const backupsDir = path.join(dir, 'backups');
  const KEEP_BACKUPS = Number(opts.keepBackups || 7);

  return {
    backend: store.backend,
    file: store.file,
    retentionDays,
    normalize: normalizeEvent,
    insert: (e) => store.insert(e),
    prune: (cutoff) => store.prune(cutoff),
    count: () => store.count(),
    backup: (dest) => store.backup(dest),

    /** Günlük bakım: eski kayıtları temizle + yedek al + eski yedekleri buda. */
    runMaintenance(nowMs) {
      let pruned = 0;
      try {
        pruned = store.prune(nowMs - retentionDays * 86_400_000);
      } catch {
        /* temizleme hatası telemetri dışı bir şeyi etkilemez */
      }
      try {
        fs.mkdirSync(backupsDir, { recursive: true });
        const stamp = new Date(nowMs).toISOString().slice(0, 10);
        const ext = store.backend === 'sqlite' ? 'db' : 'ndjson';
        store.backup(path.join(backupsDir, `telemetry-${stamp}.${ext}`));
        // Eski yedekleri buda (en yeni KEEP_BACKUPS tut).
        const files = fs
          .readdirSync(backupsDir)
          .filter((f) => f.startsWith('telemetry-'))
          .sort();
        for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
          try {
            fs.unlinkSync(path.join(backupsDir, f));
          } catch {
            /* yoksay */
          }
        }
      } catch {
        /* yedek hatası kritik değil */
      }
      return { pruned };
    },
  };
}

module.exports = { open, normalizeEvent };
