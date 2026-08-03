'use strict';

/**
 * YZ AYARLARI — çalışma zamanı Claude modeli + çağrı parametreleri deposu.
 *
 * balance.js ile AYNI desen: şema + doğrulama + geçmiş + geri alma, diske kalıcı.
 * Fark: model/thinking/effort BİRBİRİNE BAĞLI alanlardır (model ailesi kuralları),
 * bu yüzden tek tek anahtar yerine TÜM config bir bütün olarak doğrulanır.
 *
 * GÜVENLİK: API anahtarı burada YOK. Anahtar yalnız server.js'te env'de durur;
 * bu depo yalnız model seçimini ve çağrı parametrelerini yönetir.
 *
 * Model kimlikleri SABİT dizelerdir — tarih eki EKLENMEZ (claude-opus-5, asla
 * claude-opus-5-2026...). Geçerlilik kuralları (2026 API):
 *  - temperature/top_p/top_k gönderilmez (bu modellerde 400) → panelde YOK.
 *  - budget_tokens kaldırıldı (derinlik effort ile) → panelde YOK.
 *  - thinking 'disabled' YALNIZCA effort ≤ modelin sınırı ise kabul (opus-5: high;
 *    fable/haiku: hiç). Aşımda 400.
 *  - haiku thinking/output_config almaz → bu alanlar gönderilmez.
 */

const fs = require('fs');
const path = require('path');

// Fiyatlar: 1M token başına USD (girdi/çıktı) — panelde bilinçli maliyet kararı için.
// disabledMaxEffort: thinking='disabled' hangi en yüksek effort'a kadar kabul edilir
//   (null → hiç: modelde düşünme zorunlu açık, disabled 400 verir).
// effortLevels: modelin desteklediği output_config.effort seviyeleri.
const MODELS = [
  {
    id: 'claude-opus-5',
    label: 'Opus 5',
    inUsd: 5,
    outUsd: 25,
    effort: true,
    thinkingDefaultOn: true,
    disabledMaxEffort: 'high',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'claude-opus-4-8',
    label: 'Opus 4.8',
    inUsd: 5,
    outUsd: 25,
    effort: true,
    thinkingDefaultOn: false,
    disabledMaxEffort: 'max',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    inUsd: 5,
    outUsd: 25,
    effort: true,
    thinkingDefaultOn: false,
    disabledMaxEffort: 'max',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    inUsd: 3,
    outUsd: 15,
    effort: true,
    thinkingDefaultOn: false,
    disabledMaxEffort: 'max',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    inUsd: 3,
    outUsd: 15,
    effort: true,
    thinkingDefaultOn: false,
    disabledMaxEffort: 'max',
    effortLevels: ['low', 'medium', 'high', 'max'], // xhigh 4.7 ile geldi
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    inUsd: 1,
    outUsd: 5,
    effort: false, // thinking/output_config almaz
    thinkingDefaultOn: false,
    disabledMaxEffort: null,
    effortLevels: [],
  },
  {
    id: 'claude-fable-5',
    label: 'Fable 5',
    inUsd: 10,
    outUsd: 50,
    effort: true,
    thinkingDefaultOn: true,
    disabledMaxEffort: null, // düşünme daima açık; disabled her effort'ta 400
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
];
const MODEL_BY = new Map(MODELS.map((m) => [m.id, m]));
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_RANK = new Map(EFFORTS.map((e, i) => [e, i]));

// Varsayılan = mevcut çalışma zamanı davranışı (ucuz, tek cümlelik iş).
const DEFAULTS = { model: 'claude-opus-5', thinking: 'disabled', effort: 'low', maxTokens: 400 };

/**
 * Model FİYATI (1M token başına USD giriş/çıkış) — TEK KAYNAK (model tablosu).
 * Maliyet izleme paketi bunu kullanır → "iki yerde farklı fiyat olmasın".
 * Bilinmeyen model → null (maliyet hesabı 0 sayar, ama tokeni yine gösterir).
 */
function priceOf(modelId) {
  const m = MODEL_BY.get(String(modelId || ''));
  return m ? { inUsd: m.inUsd, outUsd: m.outUsd, label: m.label } : null;
}
const MAX_TOKENS_MIN = 64;
const MAX_TOKENS_MAX = 2000;

/**
 * Config doğrula + geçerlilik kurallarını uygula (hem UI hem sunucu bunu kullanır).
 * Dönüş: { error } | { ok, cfg, request }
 *   cfg     — normalize edilmiş, diske yazılacak config
 *   request — Anthropic /messages gövdesinin parametreleri (model + max_tokens
 *             + gerekiyorsa thinking + output_config). system/messages çağıran ekler.
 */
function validate(raw) {
  const model = String((raw && raw.model) || '');
  const m = MODEL_BY.get(model);
  if (!m) return { error: 'bad_model' };

  const maxTokens = Math.floor(Number(raw && raw.maxTokens));
  if (!Number.isFinite(maxTokens) || maxTokens < MAX_TOKENS_MIN || maxTokens > MAX_TOKENS_MAX) {
    return { error: 'bad_max_tokens' };
  }

  const request = { model, max_tokens: maxTokens };

  // Model thinking/output_config desteklemiyorsa (haiku): bu alanlar YOK sayılır.
  if (!m.effort) {
    return { ok: true, cfg: { model, thinking: 'n/a', effort: 'n/a', maxTokens }, request };
  }

  const thinking = String((raw && raw.thinking) || '');
  const effort = String((raw && raw.effort) || '');
  if (thinking !== 'adaptive' && thinking !== 'disabled') return { error: 'bad_thinking' };
  if (!m.effortLevels.includes(effort)) return { error: 'bad_effort' };

  if (thinking === 'disabled') {
    // fable: hiçbir effort'ta disabled kabul edilmez.
    if (m.disabledMaxEffort == null) return { error: 'disabled_not_allowed' };
    // opus-5: disabled yalnız effort ≤ high; xhigh/max → 400.
    if (EFFORT_RANK.get(effort) > EFFORT_RANK.get(m.disabledMaxEffort)) {
      return { error: 'disabled_effort_too_high' };
    }
    request.thinking = { type: 'disabled' };
  } else {
    request.thinking = { type: 'adaptive' };
  }
  request.output_config = { effort };

  return { ok: true, cfg: { model, thinking, effort, maxTokens }, request };
}

function open(opts = {}) {
  const file = opts.file || path.join(__dirname, 'ai-config.json');
  const state = { config: null, history: [] };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (d.config) state.config = d.config;
    state.history = d.history || [];
  } catch {
    /* dosya yoksa varsayılanla başla */
  }
  const save = () => {
    try {
      fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
    } catch {
      /* yazılamazsa bellekte kalır */
    }
  };

  const api = {
    models: MODELS,
    efforts: EFFORTS,
    defaults: DEFAULTS,
    maxTokensRange: { min: MAX_TOKENS_MIN, max: MAX_TOKENS_MAX },

    /** Etkin config (override yoksa varsayılan). */
    current() {
      return state.config ? { ...state.config } : { ...DEFAULTS };
    },
    /** Etkin config için doğrulanmış Anthropic istek parametreleri (fallback güvenli). */
    request() {
      const v = validate(api.current());
      return v.ok ? v.request : validate(DEFAULTS).request; // depo hep geçerli; yine de düş
    },
    overridden() {
      return state.config != null;
    },
    /** Son değişiklikler (geri alma/denetim için). */
    history() {
      return state.history.slice(-50).reverse();
    },
    /** Panel şeması: katalog + mevcut + varsayılan + aralık + override mı. */
    schema() {
      return {
        models: MODELS,
        efforts: EFFORTS,
        current: api.current(),
        defaults: DEFAULTS,
        overridden: state.config != null,
        maxTokensRange: { min: MAX_TOKENS_MIN, max: MAX_TOKENS_MAX },
      };
    },
    /** Config ata — GEÇERSİZ config reddedilir ({error}). */
    set(raw, at) {
      const v = validate(raw);
      if (v.error) return { error: v.error };
      const from = api.current();
      state.config = v.cfg;
      state.history.push({ from, to: v.cfg, at });
      if (state.history.length > 200) state.history = state.history.slice(-200);
      save();
      return { ok: true, config: v.cfg };
    },
    /** Varsayılana döndür (tek tık geri al). */
    reset(at) {
      if (state.config == null) return { ok: true };
      const from = state.config;
      state.config = null;
      state.history.push({ from, to: { ...DEFAULTS }, at, reset: true });
      save();
      return { ok: true };
    },
  };
  return api;
}

module.exports = { open, validate, priceOf, MODELS, EFFORTS, DEFAULTS };
