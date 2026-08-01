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

const COLUMNS = [
  'type',
  'ts',
  'mode',
  'lang',
  'wlen',
  'word',
  'result',
  'attempts',
  'duration_ms',
  'code',
];

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
  // ts üzerinde indeks: pano sorguları tarih ARALIĞIYLA filtreler (30 günde <1 sn).
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts)`);
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
    readRange(from, to) {
      return db.prepare(`SELECT * FROM events WHERE ts >= ? AND ts < ?`).all(from, to);
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
    readRange(from, to) {
      const out = [];
      for (const l of readLines()) {
        try {
          const o = JSON.parse(l);
          if (o.ts >= from && o.ts < to) out.push(o);
        } catch {
          /* bozuk satır atla */
        }
      }
      return out;
    },
  };
}

// --- Pano özeti: ham satırlardan metrikleri hesapla (saf, arka uçtan bağımsız) ---
function aggregate(rows, from, to, at) {
  const starts = rows.filter((r) => r.type === 'game_start');
  const ends = rows.filter((r) => r.type === 'game_end');
  const errors = rows.filter((r) => r.type === 'error').length;
  // vsai bir YARIŞ (tahmin anlamı farklı) → "genel" metriklerden ayrılır.
  const solo = ends.filter((r) => r.mode !== 'vsai');
  const vsai = ends.filter((r) => r.mode === 'vsai');

  const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  const days = {};
  const bump = (d, k) => ((days[d] = days[d] || { starts: 0, completed: 0 })[k]++, void 0);
  for (const r of starts) bump(dayKey(r.ts), 'starts');
  for (const r of ends) bump(dayKey(r.ts), 'completed');
  const activity = Object.keys(days)
    .sort()
    .map((day) => ({ day, ...days[day] }));

  const tally = (arr, key, pred) => {
    const m = {};
    for (const r of arr) {
      if (pred && !pred(r)) continue;
      const k = r[key];
      if (k == null) continue;
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  };

  // Tahmin dağılımı (yalnız solo): kazanılanlar tur sayısına göre, kayıp = fail.
  const guessDist = { fail: 0 };
  for (let i = 1; i <= 6; i++) guessDist[i] = 0;
  for (const r of solo) {
    if (r.result === 'won' && r.attempts) guessDist[Math.min(6, Math.max(1, r.attempts))]++;
    else if (r.result === 'lost') guessDist.fail++;
  }

  // Kelime uzunluğu performansı (solo): oyun sayısı, kazanma oranı, ort. tahmin.
  const lenMap = {};
  for (const r of solo) {
    if (!r.wlen) continue;
    const m = (lenMap[r.wlen] = lenMap[r.wlen] || { games: 0, won: 0, att: 0, attN: 0 });
    m.games++;
    if (r.result === 'won') m.won++;
    if (r.attempts) {
      m.att += r.attempts;
      m.attN++;
    }
  }
  const byLength = Object.keys(lenMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((wlen) => {
      const m = lenMap[wlen];
      return {
        wlen,
        games: m.games,
        winRate: m.games ? m.won / m.games : 0,
        avgAttempts: m.attN ? m.att / m.attN : 0,
      };
    });

  // YZ modu: zorluk (code=tier) dağılımı + tier başına oyuncu kazanma oranı.
  const tierMap = {};
  for (const r of vsai) {
    const t = r.code || '?';
    const m = (tierMap[t] = tierMap[t] || { games: 0, won: 0 });
    m.games++;
    if (r.result === 'won') m.won++;
  }
  const vsaiByTier = Object.entries(tierMap).map(([tier, m]) => ({
    tier,
    games: m.games,
    winRate: m.games ? m.won / m.games : 0,
  }));

  const soloWon = solo.filter((r) => r.result === 'won').length;
  const vsaiWon = vsai.filter((r) => r.result === 'won').length;

  return {
    range: { from, to },
    generatedAt: at,
    totals: { starts: starts.length, completed: ends.length, errors },
    activity,
    modes: tally(starts, 'mode'),
    langs: tally(starts, 'lang'),
    winRate: solo.length ? soloWon / solo.length : 0,
    soloGames: solo.length,
    guessDist,
    byLength,
    vsai: {
      totalGames: vsai.length,
      winRate: vsai.length ? vsaiWon / vsai.length : 0,
      byTier: vsaiByTier,
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

    /** Pano özeti: [from, to) aralığındaki metrikler (boş aralıkta güvenli). */
    summary(from, to, at) {
      return aggregate(store.readRange(from, to), from, to, at);
    },

    /** Kelime bazlı istatistik + havuz önerileri (LLM zorluğuyla karşılaştırmalı). */
    wordStats(from, to, difficulty, minSample) {
      const rows = aggregateWords(store.readRange(from, to), difficulty, minSample);
      return {
        minSample: minSample || 30,
        rows,
        recommendations: wordRecommendations(rows, minSample),
      };
    },

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

// --- Kelime bazlı istatistik: havuzu veriyle yönetmek için (en değerli çıktı) ---
// Her (kelime,dil) için: oynanma (başlangıç), tamamlanma, kazanma oranı, ort.
// tahmin, TERK oranı. vsai HARİÇ (yarış — havuz zorluğunu yansıtmaz).
// difficulty: { tr:{KELİME:1..5}, en:{...} } (LLM zorluk puanı; karşılaştırma için).
function aggregateWords(rows, difficulty, minSample) {
  difficulty = difficulty || {};
  minSample = minSample || 30;
  const map = new Map();
  for (const r of rows) {
    if (r.mode === 'vsai' || !r.word) continue;
    if (r.type !== 'game_start' && r.type !== 'game_end') continue;
    const lang = r.lang || '';
    const k = r.word + ' ' + lang;
    let m = map.get(k);
    if (!m) {
      m = {
        word: r.word,
        lang: r.lang || null,
        wlen: r.wlen || [...r.word].length,
        starts: 0,
        ends: 0,
        wins: 0,
        attSum: 0,
        attN: 0,
      };
      map.set(k, m);
    }
    if (r.type === 'game_start') m.starts++;
    else {
      m.ends++;
      if (r.result === 'won') m.wins++;
      if (r.attempts) {
        m.attSum += r.attempts;
        m.attN++;
      }
    }
  }
  const out = [];
  for (const m of map.values()) {
    out.push({
      word: m.word,
      lang: m.lang,
      wlen: m.wlen,
      plays: m.starts,
      completed: m.ends,
      winRate: m.ends ? m.wins / m.ends : 0,
      avgAttempts: m.attN ? m.attSum / m.attN : 0,
      abandonRate: m.starts ? Math.max(0, (m.starts - m.ends) / m.starts) : 0,
      difficulty: (difficulty[m.lang] || {})[m.word] ?? null,
      sample: m.ends,
      enough: m.ends >= minSample, // asgari örneklem → karar için güvenilir mi
    });
  }
  return out;
}

/**
 * Havuz iyileştirme önerileri — YALNIZ yeterli örneklemli kelimelerden.
 * Eşikler: çok zor (≤%25), çok kolay (≥%95 & ort≤2.3), LLM↔gerçek uyuşmazlığı,
 * yüksek terk (≥%50). Somut, eyleme dönük kararlar.
 */
function wordRecommendations(wordRows, minSample) {
  minSample = minSample || 30;
  const recs = [];
  const base = (r, kind, msg) => ({
    word: r.word,
    lang: r.lang,
    kind,
    msg,
    winRate: r.winRate,
    avgAttempts: r.avgAttempts,
    abandonRate: r.abandonRate,
    difficulty: r.difficulty,
    sample: r.sample,
  });
  for (const r of wordRows) {
    // Kazanma-oranı temelli kurallar: yeterli TAMAMLANMA (n≥min) gerektirir.
    if (r.enough) {
      if (r.winRate <= 0.25)
        recs.push(base(r, 'too_hard', 'Çok zor — havuzdan çıkar veya yalnız yüksek seviyeye ver'));
      else if (r.winRate >= 0.95 && r.avgAttempts <= 2.3)
        recs.push(base(r, 'too_easy', 'Çok kolay — günlük kelime olarak kullanma'));
      if (r.difficulty != null) {
        if (r.difficulty <= 2 && r.winRate < 0.4)
          recs.push(
            base(r, 'llm_underrated', 'LLM "kolay" demiş ama gerçekte zor (küratörlük yanılmış)'),
          );
        else if (r.difficulty >= 4 && r.winRate > 0.85)
          recs.push(
            base(r, 'llm_overrated', 'LLM "zor" demiş ama gerçekte kolay (küratörlük yanılmış)'),
          );
      }
    }
    // Terk kuralı: yeterli OYNANMA (plays≥min) gerektirir (tamamlanma değil —
    // asıl sinyal zaten yarıda bırakılması). Az tamamlanmış olsa bile geçerli.
    if (r.abandonRate >= 0.5 && r.plays >= minSample) {
      recs.push(base(r, 'high_abandon', 'Yüksek terk oranı — oyuncular bu kelimede pes ediyor'));
    }
  }
  return recs;
}

/** Kelime satırlarını CSV'ye çevir (dışa aktarma). */
function wordsToCsv(rows) {
  const cols = [
    'word',
    'lang',
    'wlen',
    'plays',
    'completed',
    'winRate',
    'avgAttempts',
    'abandonRate',
    'difficulty',
    'sample',
    'enough',
  ];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => (typeof r[c] === 'number' ? Math.round(r[c] * 1e4) / 1e4 : esc(r[c])))
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  open,
  normalizeEvent,
  aggregate,
  aggregateWords,
  wordRecommendations,
  wordsToCsv,
};
