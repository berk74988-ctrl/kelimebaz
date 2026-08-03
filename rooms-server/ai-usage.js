'use strict';

/**
 * YZ KULLANIM SAYAÇLARI — YZ çağrılarının hacmi + maliyeti (sunucu tarafı).
 *
 * GİZLİLİK: Yalnızca TOPLU sayaç. Hangi oyuncunun hangi ipucunu istediği ASLA
 * yazılmaz — IP yok, kimlik yok (mevcut telemetri gizlilik ilkesiyle tutarlı).
 * Kova: gün (YYYY-MM-DD, UTC) × tür (hint|content|test) × model.
 *
 * MALİYET: Fiyat model tablosundan (ai-config.priceOf) gelir — TEK KAYNAK, "iki
 * yerde farklı fiyat olmasın". Maliyet = (giriş/1M × $in) + (çıkış/1M × $out).
 *
 * Diske KALICI. Eski günler budanır (KEEP_DAYS). Bağımlılıksız, saf Node.
 */

const fs = require('fs');
const path = require('path');

const KINDS = ['hint', 'content', 'test']; // oyun içi ipucu · içerik üretimi · panel testi
const KEEP_DAYS = 120;

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const monthKey = (ts) => new Date(ts).toISOString().slice(0, 7); // YYYY-MM

function emptyCell() {
  return { req: 0, inTok: 0, outTok: 0, err: 0, rl: 0, latSum: 0, latN: 0 };
}

/** Bir hücrenin tahmini maliyeti (USD). Fiyat yoksa (bilinmeyen model) 0. */
function cellCost(c, price) {
  if (!price) return 0;
  return (c.inTok / 1e6) * price.inUsd + (c.outTok / 1e6) * price.outUsd;
}

function open(opts = {}) {
  const file = opts.file || path.join(__dirname, 'ai-usage.json');
  const state = { days: {}, budget: { monthlyUsd: 0, autoOff: false } };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.days = d.days || {};
    state.budget = { monthlyUsd: 0, autoOff: false, ...(d.budget || {}) };
  } catch {
    /* dosya yoksa boş başla */
  }
  const save = () => {
    try {
      fs.writeFileSync(file, JSON.stringify(state));
    } catch {
      /* yazılamazsa bellekte kalır */
    }
  };

  function cell(ts, kind, model) {
    const dk = dayKey(ts);
    const day = (state.days[dk] = state.days[dk] || {});
    const k = (day[kind] = day[kind] || {});
    const mm = String(model || 'unknown');
    return (k[mm] = k[mm] || emptyCell());
  }
  function prune() {
    const keys = Object.keys(state.days).sort();
    while (keys.length > KEEP_DAYS) delete state.days[keys.shift()];
  }

  const api = {
    kinds: KINDS,

    /** Bir YZ çağrısını kaydet (başarılı ya da hatalı). kind ∈ hint|content|test. */
    record({ kind, model, inputTokens, outputTokens, latencyMs, error, at }) {
      const c = cell(at || Date.now(), KINDS.includes(kind) ? kind : 'hint', model);
      c.req++;
      c.inTok += Math.max(0, Math.floor(inputTokens || 0));
      c.outTok += Math.max(0, Math.floor(outputTokens || 0));
      if (error) c.err++;
      if (Number.isFinite(latencyMs)) {
        c.latSum += latencyMs;
        c.latN++;
      }
      prune();
      save();
    },

    /** Hız sınırına takılan istek (çağrı atılmadı → yalnız rl sayacı, token yok). */
    recordRateLimited({ kind, at }) {
      const c = cell(at || Date.now(), KINDS.includes(kind) ? kind : 'hint', 'n/a');
      c.rl++;
      save();
    },

    budget() {
      return { ...state.budget };
    },
    /** Aylık bütçe eşiği (USD) + eşik aşımında ipucu koçunu oto-kapat. */
    setBudget({ monthlyUsd, autoOff }) {
      if (monthlyUsd != null && Number.isFinite(monthlyUsd) && monthlyUsd >= 0) {
        state.budget.monthlyUsd = Math.round(monthlyUsd * 100) / 100;
      }
      if (autoOff != null) state.budget.autoOff = !!autoOff;
      save();
      return { ok: true, budget: { ...state.budget } };
    },

    /** Bu ayın toplam tahmini maliyeti (priceOf ile). */
    monthCostUsd(priceOf, at) {
      const mk = monthKey(at || Date.now());
      let cost = 0;
      for (const [dk, day] of Object.entries(state.days)) {
        if (!dk.startsWith(mk)) continue;
        for (const kind of Object.keys(day))
          for (const [model, c] of Object.entries(day[kind])) cost += cellCost(c, priceOf(model));
      }
      return +cost.toFixed(4);
    },

    /** Aylık bütçe aşıldı mı? (eşik 0 → sınırsız). */
    budgetExceeded(priceOf, at) {
      const t = state.budget.monthlyUsd;
      return t > 0 && api.monthCostUsd(priceOf, at) >= t;
    },

    /** Son N günün özeti: tür başına toplam (istek/token/maliyet/gecikme/hata/rl) + günlük seri. */
    summary(priceOf, days = 30, at) {
      const now = at || Date.now();
      const from = dayKey(now - (days - 1) * 86400000);
      const totals = {};
      const series = {}; // dk → { kind → {req, costUsd} }
      for (const k of KINDS) totals[k] = { ...emptyCell(), costUsd: 0 };
      for (const [dk, day] of Object.entries(state.days)) {
        if (dk < from) continue;
        series[dk] = series[dk] || {};
        for (const kind of Object.keys(day)) {
          const t = totals[kind] || (totals[kind] = { ...emptyCell(), costUsd: 0 });
          let dayCost = 0;
          let dayReq = 0;
          for (const [model, c] of Object.entries(day[kind])) {
            t.req += c.req;
            t.inTok += c.inTok;
            t.outTok += c.outTok;
            t.err += c.err;
            t.rl += c.rl;
            t.latSum += c.latSum;
            t.latN += c.latN;
            const cost = cellCost(c, priceOf(model));
            t.costUsd += cost;
            dayCost += cost;
            dayReq += c.req;
          }
          series[dk][kind] = { req: dayReq, costUsd: +dayCost.toFixed(4) };
        }
      }
      const out = {};
      for (const [k, t] of Object.entries(totals)) {
        out[k] = {
          req: t.req,
          inTok: t.inTok,
          outTok: t.outTok,
          err: t.err,
          rl: t.rl,
          avgLatMs: t.latN ? Math.round(t.latSum / t.latN) : 0,
          errRate: t.req ? +((t.err / t.req) * 100).toFixed(1) : 0,
          costUsd: +t.costUsd.toFixed(4),
        };
      }
      return { from, days, kinds: out, series };
    },
  };
  return api;
}

module.exports = { open };
