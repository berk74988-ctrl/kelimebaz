'use strict';

/**
 * KELİMEBAZ — LLM İÇERİK ÜRETİMİ · Faz B (üretim + maliyet + bütçe + ön denetim).
 *
 * balance.js / ai-config.js ile AYNI desen: saf yardımcılar + disk-kalıcı store
 * (şema + geçmiş). Ağ YOK burada → server.js callAnthropicRaw ile çağırır, sonuç
 * bu modülün store'una + ön denetimine verilir. Böylece maliyet/bütçe/ön denetim/
 * ayrıştırma mantığı sunucu ayağa kalkmadan test edilebilir (content-gen.test.mjs).
 *
 * MİMARİ: docs/yz-icerik-panel-karari.md — üretim yalnız EKSİK kelimeler için,
 * parti parti; üretilen içerik "taslak" olarak diske yazılır (Faz C onay kuyruğu
 * bunu okuyup overlay'e/depoya taşıyacak). Difficulty algoritmik, theme küratörlü
 * → ÜRETİLMEZ; yalnız ipucu (hint) ve kart (card) LLM ile üretilir.
 *
 * GÜVENLİK: API anahtarı burada YOK. Üretilen içerik kelimeyi ELE VERMEMELİ →
 * ön denetim (leaksAnswer) sızdıran/boş/kısa içeriği "reddedildi" işaretler.
 */

const fs = require('fs');
const path = require('path');
const hintUtil = require('./hint-util');

/** Üretilebilir kategoriler (content-index.json id'leriyle aynı). */
const CATS = {
  'tr.hint': { lang: 'tr', type: 'hint' },
  'en.hint': { lang: 'en', type: 'hint' },
  'de.hint': { lang: 'de', type: 'hint' },
  'tr.card': { lang: 'tr', type: 'card' },
  'en.card': { lang: 'en', type: 'card' },
};

/** Tür başına ortalama token (maliyet TAHMİNİ için — onay ekranında gösterilir). */
const AVG_TOKENS = {
  hint: { in: 260, out: 80 },
  card: { in: 320, out: 200 },
};

const BATCH_MAX = 15; // tek istekte en fazla kelime (parti üst sınırı)
const DAILY_BUDGET_DEFAULT = 2; // USD/gün varsayılan üretim tavanı
const REJECT_REASONS = ['empty', 'too_short', 'leak', 'parse'];

function isGeneratable(catId) {
  return Object.prototype.hasOwnProperty.call(CATS, catId);
}
function categories() {
  return Object.keys(CATS).map((id) => ({ id, ...CATS[id] }));
}

/**
 * Maliyet TAHMİNİ — seçili model fiyatı (ai-config priceOf) × kelime sayısı ×
 * ortalama token. Onay öncesi gösterilir; gerçek maliyet üretimde token'dan hesaplanır.
 */
function estimateCost(catId, count, model, priceOf) {
  const cat = CATS[catId];
  if (!cat) return { error: 'bad_category' };
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const avg = AVG_TOKENS[cat.type];
  const price = (priceOf && priceOf(model)) || { inUsd: 0, outUsd: 0 };
  const estInputTokens = avg.in * n;
  const estOutputTokens = avg.out * n;
  const usd = (estInputTokens / 1e6) * price.inUsd + (estOutputTokens / 1e6) * price.outUsd;
  return {
    category: catId,
    count: n,
    model,
    estInputTokens,
    estOutputTokens,
    estUsd: Math.round(usd * 100000) / 100000,
  };
}

/* ─────────────────────────── İstemler ─────────────────────────── */

const HINT_SYS = {
  tr: `Sen bir Türkçe kelime sözlüğü yazarısın. Sana TEK bir kelime verilir. O kelime için:
- "c": kelimenin türü/kategorisi TEK kelimeyle (İsim, Fiil, Sıfat, Zarf, Kişi, Yer, Zaman, Sayı...),
- "h": kelimeyi ELE VERMEDEN anlamını çağrıştıran, tek cümlelik kısa ipucu.
KATI KURAL: "h" içinde kelimenin KENDİSİ ya da kökü GEÇMESİN. Yalnızca şu JSON'u döndür:
{"c":"...","h":"..."} — başka hiçbir metin, açıklama ya da etiket yazma.`,
  en: `You are an English dictionary writer. You are given ONE word. For that word produce:
- "c": the part of speech in ONE word (Noun, Verb, Adjective, Adverb, Pronoun, Place, Time...),
- "h": a single short sentence hinting at its meaning WITHOUT revealing the word.
STRICT RULE: "h" must not contain the word itself or its stem. Return ONLY this JSON:
{"c":"...","h":"..."} — no other text, explanation or tags.`,
  de: `Du bist ein deutscher Wörterbuchautor. Dir wird EIN Wort gegeben. Für dieses Wort erzeuge:
- "c": die Wortart in EINEM Wort (Nomen, Verb, Adjektiv, Adverb, Pronomen, Ort, Zeit...),
- "h": einen kurzen Satz, der die Bedeutung andeutet, OHNE das Wort zu nennen.
STRIKTE REGEL: "h" darf das Wort selbst oder seinen Stamm nicht enthalten. Gib NUR dieses JSON zurück:
{"c":"...","h":"..."} — keinen weiteren Text.`,
};

const CARD_SYS = {
  tr: `Sen bir Türkçe sözlük yazarısın. Verilen kelime için bir "kelime kartı" üret:
- "t": kısa ve net tanım (tek cümle),
- "e": kelimeyi doğal kullanan bir örnek cümle,
- "s": en fazla 2 eşanlamlı (yoksa []),
- "z": en fazla 2 zıt anlamlı (yoksa []).
KURAL: TANIM ("t") kelimenin kendisini içermesin (örnek cümle içerebilir). Yalnızca JSON döndür:
{"t":"...","e":"...","s":[...],"z":[...]} — başka metin yazma.`,
  en: `You are an English dictionary writer. For the given word produce a "word card":
- "t": a short, clear definition (one sentence),
- "e": an example sentence that uses the word naturally,
- "s": up to 2 synonyms (or []),
- "z": up to 2 antonyms (or []).
RULE: the DEFINITION ("t") must not contain the word itself (the example may). Return ONLY JSON:
{"t":"...","e":"...","s":[...],"z":[...]} — no other text.`,
};

/** Sistem istemi (dile + türe göre). */
function genSystem(lang, type) {
  if (type === 'hint') return HINT_SYS[lang] || HINT_SYS.en;
  return CARD_SYS[lang] || CARD_SYS.en;
}
/** Kullanıcı mesajı — yalnız kelime. */
function genUser(word, lang, type) {
  const w = String(word || '').trim();
  if (lang === 'tr') return `Kelime: ${w}`;
  if (lang === 'de') return `Wort: ${w}`;
  return `Word: ${w}`;
}

/**
 * Model çıktısını güvenle ayrıştır — JSON bekler; etrafındaki metni temizler.
 * Dönüş: { ok, content } | { error:'parse' }
 */
function parseOutput(type, text) {
  const raw = String(text || '');
  const m = raw.match(/\{[\s\S]*\}/); // ilk {...} bloğu
  if (!m) return { error: 'parse' };
  let obj;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return { error: 'parse' };
  }
  if (!obj || typeof obj !== 'object') return { error: 'parse' };
  if (type === 'hint') {
    const c = String(obj.c || '').trim();
    const h = String(obj.h || '').trim();
    if (!h) return { error: 'parse' };
    return { ok: true, content: { c, h } };
  }
  // card
  const t = String(obj.t || '').trim();
  const e = String(obj.e || '').trim();
  const s = Array.isArray(obj.s) ? obj.s.map((x) => String(x).trim()).filter(Boolean).slice(0, 2) : [];
  const z = Array.isArray(obj.z) ? obj.z.map((x) => String(x).trim()).filter(Boolean).slice(0, 2) : [];
  if (!t) return { error: 'parse' };
  return { ok: true, content: { t, e, s, z } };
}

/**
 * ÖN DENETİM — üretilen içerik yayına uygun mu? Sızdıran/boş/kısa → reddet.
 * Dönüş: { ok:true } | { rejected:true, reason }
 */
function precheck(word, type, content) {
  if (!content) return { rejected: true, reason: 'empty' };
  if (type === 'hint') {
    const h = String(content.h || '');
    const c = String(content.c || '');
    if (h.length < 8) return { rejected: true, reason: 'too_short' };
    if (hintUtil.leaksAnswer(word, h) || hintUtil.leaksAnswer(word, c)) {
      return { rejected: true, reason: 'leak' };
    }
    return { ok: true };
  }
  // card: yalnız TANIM sızıntı denetlenir (örnek cümle kelimeyi içerebilir).
  const t = String(content.t || '');
  if (t.length < 8) return { rejected: true, reason: 'too_short' };
  if (hintUtil.leaksAnswer(word, t)) return { rejected: true, reason: 'leak' };
  return { ok: true };
}

/** Gün anahtarı (YYYY-MM-DD, UTC) — günlük bütçe sayacı için. */
function dayKey(at) {
  return new Date(at || Date.now()).toISOString().slice(0, 10);
}

/* ─────────────────────────── Store ─────────────────────────── */

/**
 * Taslak + günlük bütçe deposu (diske kalıcı).
 *   drafts[cat::WORD] = { category, word, status:'generated'|'rejected', content,
 *                         reason, inputTokens, outputTokens, costUsd, at }
 *   spentByDay[YYYY-MM-DD] = toplam USD
 *   config = { dailyBudgetUsd, batchMax }
 */
function open(opts = {}) {
  const file = opts.file || path.join(__dirname, 'content-gen.json');
  const state = {
    drafts: {},
    spentByDay: {},
    config: { dailyBudgetUsd: DAILY_BUDGET_DEFAULT, batchMax: BATCH_MAX },
    history: [],
  };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (d.drafts) state.drafts = d.drafts;
    if (d.spentByDay) state.spentByDay = d.spentByDay;
    if (d.config) state.config = { ...state.config, ...d.config };
    state.history = d.history || [];
  } catch {
    /* dosya yoksa varsayılan */
  }
  const save = () => {
    try {
      fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
    } catch {
      /* yazılamazsa bellekte kalır */
    }
  };
  const key = (cat, word) => `${cat}::${String(word || '').toLocaleUpperCase('tr')}`;

  const api = {
    batchMax: () => Math.floor(state.config.batchMax) || BATCH_MAX,
    dailyBudgetUsd: () => Number(state.config.dailyBudgetUsd) || 0,

    hasDraft(cat, word) {
      return !!state.drafts[key(cat, word)];
    },
    getDraft(cat, word) {
      return state.drafts[key(cat, word)] || null;
    },
    /** Bir taslağı yaz (üretilen ya da reddedilen). */
    addDraft(d) {
      const k = key(d.category, d.word);
      state.drafts[k] = {
        category: d.category,
        word: String(d.word || '').toLocaleUpperCase('tr'),
        status: d.status === 'rejected' ? 'rejected' : 'generated',
        content: d.content || null,
        reason: d.reason || null,
        inputTokens: Math.max(0, Math.floor(d.inputTokens || 0)),
        outputTokens: Math.max(0, Math.floor(d.outputTokens || 0)),
        costUsd: Math.max(0, Number(d.costUsd) || 0),
        at: d.at || Date.now(),
      };
      save();
      return state.drafts[k];
    },
    /** Kategori taslakları (Faz C onay kuyruğu bunu okuyacak). */
    listDrafts(cat, status) {
      return Object.values(state.drafts).filter(
        (d) => (!cat || d.category === cat) && (!status || d.status === status),
      );
    },
    counts(cat) {
      const list = api.listDrafts(cat);
      return {
        generated: list.filter((d) => d.status === 'generated').length,
        rejected: list.filter((d) => d.status === 'rejected').length,
      };
    },

    /* --- Günlük bütçe --- */
    dailySpent(at) {
      return Number(state.spentByDay[dayKey(at)]) || 0;
    },
    /** Bugüne harcama ekle (üretim sonrası gerçek maliyet). */
    addSpend(usd, at) {
      const k = dayKey(at);
      state.spentByDay[k] = (Number(state.spentByDay[k]) || 0) + (Number(usd) || 0);
      // 90 günden eski günleri buda (bugünü asla silme)
      const cutoff = dayKey(Date.now() - 90 * 864e5);
      for (const day of Object.keys(state.spentByDay)) {
        if (day < cutoff && day !== k) delete state.spentByDay[day];
      }
      save();
      return state.spentByDay[k];
    },
    /** Bu harcama günlük tavanı aşar mı? (tavan 0 → sınırsız değil, KAPALI sayılır) */
    wouldExceedDaily(addUsd, at) {
      const cap = api.dailyBudgetUsd();
      return api.dailySpent(at) + (Number(addUsd) || 0) > cap;
    },
    setBudget({ dailyUsd, batchMax }, at) {
      const from = { ...state.config };
      if (dailyUsd != null && Number.isFinite(Number(dailyUsd)) && Number(dailyUsd) >= 0) {
        state.config.dailyBudgetUsd = Math.round(Number(dailyUsd) * 100) / 100;
      }
      if (batchMax != null && Number.isFinite(Number(batchMax))) {
        state.config.batchMax = Math.max(1, Math.min(50, Math.floor(Number(batchMax))));
      }
      state.history.push({ kind: 'budget', from, to: { ...state.config }, at: at || Date.now() });
      if (state.history.length > 200) state.history = state.history.slice(-200);
      save();
      return { ok: true, config: { ...state.config } };
    },

    /** Panel şeması: config + bugünkü harcama + kategori-başı taslak sayıları. */
    schema(at) {
      const perCat = {};
      for (const id of Object.keys(CATS)) perCat[id] = api.counts(id);
      return {
        config: { ...state.config },
        today: { day: dayKey(at), spentUsd: api.dailySpent(at) },
        drafts: perCat,
        generatable: Object.keys(CATS),
      };
    },
    history() {
      return state.history.slice(-50).reverse();
    },
  };
  return api;
}

module.exports = {
  open,
  categories,
  isGeneratable,
  estimateCost,
  genSystem,
  genUser,
  parseOutput,
  precheck,
  dayKey,
  CATS,
  AVG_TOKENS,
  BATCH_MAX,
  DAILY_BUDGET_DEFAULT,
  REJECT_REASONS,
};
