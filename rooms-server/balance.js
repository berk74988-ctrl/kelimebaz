'use strict';

/**
 * DENGE AYARLARI — ekonomi/zorluk geçersiz kılma deposu (sunucu tarafı).
 *
 * ŞEMA, src/app/core/balance.ts ile AYNIDIR (parity testiyle doğrulanır). Aralık
 * denetimi HEM BURADA hem istemcide yapılır: aralık dışı değer REDDEDİLİR (clamp
 * değil — panelden hatalı giriş engellensin). Değişiklikler GERİ ALINABİLİR
 * (reset) ve GEÇMİŞE yazılır. Override'lar diske KALICI (restart'ta korunur).
 *
 * KAPSAM (dar): altın oranları + tek YZ zorluk kolu. Bağımlılıksız, saf Node.
 */

const fs = require('fs');
const path = require('path');

const SPEC = [
  { key: 'winGold', def: 20, min: 0, max: 200, int: true },
  { key: 'speedGold', def: 5, min: 0, max: 100, int: true },
  { key: 'dailyBonus', def: 10, min: 0, max: 200, int: true },
  { key: 'lossGold', def: 2, min: 0, max: 100, int: true },
  { key: 'levelGold', def: 4, min: 0, max: 50, int: true },
  { key: 'levelGoldCap', def: 40, min: 0, max: 500, int: true },
  { key: 'aiTopKMul', def: 1, min: 0.25, max: 4, int: false },
];
const BY = new Map(SPEC.map((p) => [p.key, p]));

function open(opts = {}) {
  const file = opts.file || path.join(__dirname, 'balance-overrides.json');
  const state = { overrides: {}, history: [] };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.overrides = d.overrides || {};
    state.history = d.history || [];
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

  return {
    spec: SPEC,
    /** İstemciye sunulacak override haritası (yalnız değiştirilmiş anahtarlar). */
    overrides() {
      return { ...state.overrides };
    },
    /** Son değişiklikler (geri alma/denetim için). */
    history() {
      return state.history.slice(-50).reverse();
    },
    /** Panel için: her parametre + varsayılan + aralık + mevcut + override mı. */
    schema() {
      return SPEC.map((p) => {
        const ov = state.overrides[p.key];
        return { ...p, current: ov != null ? ov : p.def, overridden: ov != null };
      });
    },
    /** Değer ata — ARALIK DIŞI reddedilir ({error}). Başarı → {ok, value}. */
    set(key, value, at) {
      const p = BY.get(key);
      if (!p) return { error: 'unknown_key' };
      if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max) {
        return { error: 'out_of_range' };
      }
      const v = p.int ? Math.round(value) : value;
      const from = state.overrides[key] != null ? state.overrides[key] : p.def;
      state.overrides[key] = v;
      state.history.push({ key, from, to: v, at });
      if (state.history.length > 200) state.history = state.history.slice(-200);
      save();
      return { ok: true, value: v };
    },
    /** Tek anahtarı varsayılana döndür (geri al). */
    reset(key, at) {
      const p = BY.get(key);
      if (!p) return { error: 'unknown_key' };
      if (state.overrides[key] == null) return { ok: true }; // zaten varsayılan
      const from = state.overrides[key];
      delete state.overrides[key];
      state.history.push({ key, from, to: p.def, at, reset: true });
      save();
      return { ok: true };
    },
    /** Tüm override'ları varsayılana döndür (tek tık geri al). */
    resetAll(at) {
      for (const k of Object.keys(state.overrides)) {
        const p = BY.get(k);
        state.history.push({
          key: k,
          from: state.overrides[k],
          to: p ? p.def : null,
          at,
          reset: true,
        });
      }
      state.overrides = {};
      save();
      return { ok: true };
    },
  };
}

module.exports = { open, SPEC };
