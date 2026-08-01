'use strict';

/**
 * GÜNÜN KELİMESİ — geçersiz kılma (override) deposu + algoritmik önizleme.
 *
 * BELİRLEYİCİLİK: Günün kelimesi dayIndex'ten türetilir; geçersiz kılma da
 * dayIndex+dil ile anahtarlanır → tüm istemcilere AYNI ulaşır. Override YALNIZ
 * GELECEK günler için tanımlanabilir (gün ortasında değişmez).
 *
 * İstemci hâlâ otoritedir: gerçek seçimi gömülü algoritma yapar, sunucu yalnız
 * override listesini sunar + panelde önizleme hesaplar. Sunucu erişilemezse
 * istemci gömülü algoritmaya düşer (oyun her koşulda çalışır).
 *
 * Kalıcılık: override'lar diske yazılır (restart'ta korunur) — tek kalıcı yönetim
 * verisi. Bağımlılıksız, saf Node.
 */

const fs = require('fs');
const path = require('path');
const rot = require('./daily-rotation');

const WORD_LENGTHS = [4, 5, 6, 7];
const upFor = (s, lang) =>
  lang === 'tr' ? String(s).toLocaleUpperCase('tr') : String(s).toUpperCase();

/** İstemciyle AYNI formül: 2026-01-01 epoch, yerel takvim günü. */
function dayIndexFor(date) {
  const start = Date.UTC(2026, 0, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.floor((today - start) / 86_400_000));
}
/** dayIndex → 'YYYY-MM-DD' (epoch + gün). */
function dateOf(dayIndex) {
  return new Date(Date.UTC(2026, 0, 1) + dayIndex * 86_400_000).toISOString().slice(0, 10);
}

/** words.json + word-difficulty'den [uzunluk][band] gruplaması (istemciyle aynı). */
function buildBands(lang) {
  try {
    const wf = lang === 'tr' ? 'words.json' : 'words-en.json';
    const df = lang === 'tr' ? 'word-difficulty-tr.json' : 'word-difficulty-en.json';
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, wf), 'utf8'));
    const answers = (raw.words || raw).map((w) => upFor(w, lang));
    let diff = {};
    try {
      diff = JSON.parse(fs.readFileSync(path.join(__dirname, df), 'utf8')).scores || {};
    } catch {
      /* zorluk yoksa hepsi band 3 */
    }
    const byLen = {};
    for (const L of WORD_LENGTHS) {
      const bands = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      for (const w of answers) if ([...w].length === L) (bands[diff[w]] || bands[3]).push(w);
      byLen[L] = bands;
    }
    return { byLen, answerSet: new Set(answers) };
  } catch {
    return null; // words.json yoksa önizleme/doğrulama yapılamaz (override yine çalışır)
  }
}

function open(opts = {}) {
  const file = opts.file || path.join(__dirname, 'daily-overrides.json');
  let overrides = {};
  try {
    overrides = JSON.parse(fs.readFileSync(file, 'utf8')).overrides || {};
  } catch {
    /* dosya yoksa boş başla */
  }
  const pools = { tr: buildBands('tr'), en: buildBands('en') };
  const save = () => {
    try {
      fs.writeFileSync(file, JSON.stringify({ overrides }, null, 2) + '\n');
    } catch {
      /* yazılamazsa bellekte kalır */
    }
  };

  return {
    dayIndexFor,
    dateOf,
    hasPools: !!(pools.tr || pools.en),

    /** Algoritmik (gömülü) günün kelimesi — panel önizlemesi. */
    algoWord(dayIndex, lang) {
      const p = pools[lang];
      if (!p) return null;
      const r = rot.pickDaily(dayIndex, (L, b) => p.byLen[L]?.[b] ?? []);
      return r ? r.word : null;
    },
    /** Kelime o dilin CEVAP havuzunda mı? (override doğrulaması) */
    inPool(word, lang) {
      const p = pools[lang];
      return !!p && p.answerSet.has(upFor(word, lang));
    },
    getOverride(dayIndex, lang) {
      return (overrides[dayIndex] || {})[lang] || null;
    },
    /** Belirli gün penceresi için override haritası (istemciye — spoiler yok). */
    windowMap(fromDay, toDay) {
      const o = {};
      for (let d = fromDay; d <= toDay; d++) if (overrides[d]) o[d] = overrides[d];
      return o;
    },
    setOverride(dayIndex, lang, word) {
      (overrides[dayIndex] = overrides[dayIndex] || {})[lang] = upFor(word, lang);
      save();
    },
    clearOverride(dayIndex, lang) {
      if (!overrides[dayIndex]) return;
      delete overrides[dayIndex][lang];
      if (!Object.keys(overrides[dayIndex]).length) delete overrides[dayIndex];
      save();
    },
  };
}

module.exports = { open, dayIndexFor, dateOf };
