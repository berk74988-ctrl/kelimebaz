'use strict';

/**
 * YZ DAVRANIŞ DEPOSU — rakip gücü + ipucu koçu ayarları (sunucu tarafı).
 *
 * balance.js deseni: her parametre {min,max} aralıklı, aralık dışı REDDEDİLİR
 * (clamp değil), değişiklikler geçmişe yazılır, GERİ ALINABİLİR, diske KALICI.
 *
 * KAPSAM: zorluk bandları + tempo, karakter (persona) aç/kapa + ağırlık,
 * uyarlanabilir zorluk eşikleri, ipucu koçu (hak/maliyet/hız sınırı/açık).
 *
 * SPEC, src/app/core/ai-behavior.ts ile parity içindir (istemci aynı şemayla
 * okur; sunucu erişilemezse istemci gömülü varsayılana düşer). Persona bandları
 * kod içinde SABİT (ai-personas.ts) — panelden yalnız aç/kapa + ağırlık ayarlanır.
 */

const fs = require('fs');
const path = require('path');

// { key, def, min, max, int, label, group }
const SPEC = [
  // --- Zorluk: band ([lo,hi]∈[0,1]) + tempo (ms) ---
  { key: 'bandHardLo', def: 0, min: 0, max: 1, int: false, label: 'Zor band alt', group: 'diff' },
  { key: 'bandHardHi', def: 0, min: 0, max: 1, int: false, label: 'Zor band üst', group: 'diff' },
  { key: 'bandMedLo', def: 0.4, min: 0, max: 1, int: false, label: 'Orta band alt', group: 'diff' },
  { key: 'bandMedHi', def: 0.65, min: 0, max: 1, int: false, label: 'Orta band üst', group: 'diff' },
  { key: 'bandEasyLo', def: 0.85, min: 0, max: 1, int: false, label: 'Kolay band alt', group: 'diff' }, // prettier-ignore
  { key: 'bandEasyHi', def: 1, min: 0, max: 1, int: false, label: 'Kolay band üst', group: 'diff' },
  { key: 'tempoHardMin', def: 1700, min: 200, max: 8000, int: true, label: 'Zor tempo alt (ms)', group: 'diff' }, // prettier-ignore
  { key: 'tempoHardMax', def: 2600, min: 200, max: 8000, int: true, label: 'Zor tempo üst (ms)', group: 'diff' }, // prettier-ignore
  { key: 'tempoMedMin', def: 2400, min: 200, max: 8000, int: true, label: 'Orta tempo alt (ms)', group: 'diff' }, // prettier-ignore
  { key: 'tempoMedMax', def: 3600, min: 200, max: 8000, int: true, label: 'Orta tempo üst (ms)', group: 'diff' }, // prettier-ignore
  { key: 'tempoEasyMin', def: 3200, min: 200, max: 8000, int: true, label: 'Kolay tempo alt (ms)', group: 'diff' }, // prettier-ignore
  { key: 'tempoEasyMax', def: 5200, min: 200, max: 8000, int: true, label: 'Kolay tempo üst (ms)', group: 'diff' }, // prettier-ignore
  // --- Karakterler: aç/kapa + ağırlık ---
  { key: 'pOnTemkinli', def: 1, min: 0, max: 1, int: true, label: 'Temkinli açık', group: 'persona' }, // prettier-ignore
  { key: 'pOnUnlu', def: 1, min: 0, max: 1, int: true, label: 'Ünlü Avcısı açık', group: 'persona' },
  { key: 'pOnHarfsayar', def: 1, min: 0, max: 1, int: true, label: 'Harf Sayar açık', group: 'persona' }, // prettier-ignore
  { key: 'pOnKumarbaz', def: 1, min: 0, max: 1, int: true, label: 'Kumarbaz açık', group: 'persona' },
  { key: 'pwUnlu', def: 1.5, min: 0, max: 5, int: false, label: 'Ünlü kayırma gücü', group: 'persona' }, // prettier-ignore
  { key: 'pwHarfsayar', def: 2.5, min: 0, max: 5, int: false, label: 'Harf-sıklığı gücü', group: 'persona' }, // prettier-ignore
  { key: 'pgKumarbaz', def: 0.5, min: 0, max: 1, int: false, label: 'Kumar olasılığı', group: 'persona' }, // prettier-ignore
  // --- Uyarlanabilir zorluk eşikleri ---
  { key: 'adaptStartPos', def: 0.45, min: 0, max: 1, int: false, label: 'Başlangıç konumu', group: 'adapt' }, // prettier-ignore
  { key: 'adaptStep', def: 0.15, min: 0.01, max: 1, int: false, label: 'Maç başına adım', group: 'adapt' }, // prettier-ignore
  { key: 'adaptChallenge', def: 0.2, min: 0, max: 2, int: false, label: 'Zorlama payı', group: 'adapt' }, // prettier-ignore
  { key: 'adaptAvgLo', def: 3.1, min: 1, max: 6, int: false, label: 'En güçlü ortalama', group: 'adapt' }, // prettier-ignore
  { key: 'adaptAvgHi', def: 4.46, min: 1, max: 7, int: false, label: 'En zayıf ortalama', group: 'adapt' }, // prettier-ignore
  { key: 'adaptWindow', def: 10, min: 1, max: 50, int: true, label: 'Pencere (maç)', group: 'adapt' },
  // --- İpucu koçu ---
  { key: 'hintPerGame', def: 2, min: 0, max: 10, int: true, label: 'Oyun başına hak', group: 'hint' },
  { key: 'hintGoldCost', def: 20, min: 0, max: 500, int: true, label: 'Altın maliyeti', group: 'hint' }, // prettier-ignore
  { key: 'hintRlPerMin', def: 8, min: 1, max: 120, int: true, label: 'IP hız sınırı (dk)', group: 'hint' }, // prettier-ignore
  { key: 'hintOn', def: 1, min: 0, max: 1, int: true, label: 'İpucu koçu açık', group: 'hint' },
];
const BY = new Map(SPEC.map((p) => [p.key, p]));

// Persona bandları kod içinde SABİT (ai-personas.ts ile aynı). Panelden yalnız
// aç/kapa + ağırlık gelir; band buradan.
const PERSONA_BANDS = {
  temkinli: [0, 0],
  unlu: [0.4, 0.65],
  harfsayar: [0.45, 0.7],
  kumarbaz: [0.85, 1],
};
// Ölçüm hedef bandı (zorluk başına ulaşılabilir ortalama; panelde hedef-dışı uyarısı).
const DIFF_TARGET = { hard: 3.1, medium: 3.6, easy: 4.2 };
const TARGET_TOL = 0.4;

function valueOf(overrides, key) {
  const p = BY.get(key);
  const ov = overrides[key];
  return ov != null ? ov : p.def;
}

function open(opts = {}) {
  const file = opts.file || path.join(__dirname, 'ai-behavior.json');
  const state = { overrides: {}, history: [], lastMeasure: null };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.overrides = d.overrides || {};
    state.history = d.history || [];
    state.lastMeasure = d.lastMeasure || null;
  } catch {
    /* dosya yoksa boş başla */
  }
  const save = () => {
    try {
      fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
    } catch {
      /* yazılamazsa bellekte kalır */
    }
  };
  const v = (k) => valueOf(state.overrides, k);

  const api = {
    spec: SPEC,
    personaBands: PERSONA_BANDS,
    diffTarget: DIFF_TARGET,
    targetTol: TARGET_TOL,

    overrides() {
      return { ...state.overrides };
    },
    history() {
      return state.history.slice(-50).reverse();
    },
    lastMeasure() {
      return state.lastMeasure;
    },
    /** Panel için: her parametre + varsayılan + aralık + mevcut + override mı. */
    schema() {
      return SPEC.map((p) => {
        const ov = state.overrides[p.key];
        return { ...p, current: ov != null ? ov : p.def, overridden: ov != null };
      });
    },
    /** Ölçüm için çözücü config'leri: 3 zorluk bandı + AÇIK karakterler. */
    measureConfigs() {
      const cfg = {
        'diff.hard': { band: [v('bandHardLo'), v('bandHardHi')] },
        'diff.medium': { band: [v('bandMedLo'), v('bandMedHi')] },
        'diff.easy': { band: [v('bandEasyLo'), v('bandEasyHi')] },
      };
      if (v('pOnTemkinli')) cfg['persona.temkinli'] = { band: PERSONA_BANDS.temkinli };
      if (v('pOnUnlu'))
        cfg['persona.unlu'] = { band: PERSONA_BANDS.unlu, bias: 'vowel', biasWeight: v('pwUnlu') };
      if (v('pOnHarfsayar'))
        cfg['persona.harfsayar'] = {
          band: PERSONA_BANDS.harfsayar,
          bias: 'frequent',
          biasWeight: v('pwHarfsayar'),
        };
      if (v('pOnKumarbaz'))
        cfg['persona.kumarbaz'] = { band: PERSONA_BANDS.kumarbaz, gamble: v('pgKumarbaz') };
      return cfg;
    },
    /** Değer ata — ARALIK DIŞI reddedilir ({error}). */
    set(key, value, at) {
      const p = BY.get(key);
      if (!p) return { error: 'unknown_key' };
      if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max) {
        return { error: 'out_of_range' };
      }
      const val = p.int ? Math.round(value) : value;
      const from = state.overrides[key] != null ? state.overrides[key] : p.def;
      state.overrides[key] = val;
      state.history.push({ key, from, to: val, at });
      if (state.history.length > 200) state.history = state.history.slice(-200);
      save();
      return { ok: true, value: val };
    },
    /** Tek anahtarı varsayılana döndür. */
    reset(key, at) {
      const p = BY.get(key);
      if (!p) return { error: 'unknown_key' };
      if (state.overrides[key] == null) return { ok: true };
      const from = state.overrides[key];
      delete state.overrides[key];
      state.history.push({ key, from, to: p.def, at, reset: true });
      save();
      return { ok: true };
    },
    /** Tüm override'ları varsayılana döndür (tek tık). */
    resetAll(at) {
      for (const k of Object.keys(state.overrides)) {
        const p = BY.get(k);
        state.history.push({ key: k, from: state.overrides[k], to: p ? p.def : null, at, reset: true }); // prettier-ignore
      }
      state.overrides = {};
      save();
      return { ok: true };
    },
    /** Son ölçüm sonucunu sakla (persona ortalaması otomatik güncellensin). */
    saveMeasure(results, at) {
      state.lastMeasure = { at, results };
      save();
      return { ok: true };
    },
  };
  return api;
}

module.exports = { open, SPEC, PERSONA_BANDS, DIFF_TARGET, TARGET_TOL };
