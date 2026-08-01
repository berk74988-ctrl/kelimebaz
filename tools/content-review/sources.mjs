/**
 * İÇERİK DENETİM ARACI — kaynak kaydı ve tür adaptörleri.
 *
 * LLM ile üretilen içerik (ipucu, kelime kartı, tema kelimesi, cevap adayı)
 * insan onayından geçmeli. Bu modül, farklı ŞEKİLLERDEKİ veri dosyalarını
 * ortak bir "denetlenebilir kayıt" biçimine indirger:
 *
 *   { id, word, fields: [{ k, label, value }], primary }
 *
 * primary = düzeltme (✎) hangi alanı değiştirir. Ayrıca her tür için:
 *   - preflag(item, lang): otomatik ön işaret (cevabı içeren/boş/çok kısa)
 *   - approvedRaw(raw, decisions, lang, strict): SADECE onaylı içerikle yeni
 *     veri gövdesi üretir (düzeltmeler uygulanır, redler çıkar) → üretim bağı.
 *
 * Angular/bağımlılık YOK — saf Node. Sunucu ve apply-reviews bunu kullanır.
 */
import { readFile } from 'node:fs/promises';

const upper = (s, lang) => (lang === 'tr' ? String(s).toLocaleUpperCase('tr') : String(s).toUpperCase());
const nonEmpty = (s) => typeof s === 'string' && s.trim().length >= 3;

/** İpucunun metni cevabı (kelimeyi) içeriyor mu? — ipucu bunu ELE VERMEMELİ. */
function leaksAnswer(text, word, lang) {
  if (!text) return false;
  return upper(text, lang).includes(upper(word, lang));
}

// ── TÜR ADAPTÖRLERİ ────────────────────────────────────────────────────────

const HINT = {
  extract(raw) {
    return Object.entries(raw).map(([word, v]) => ({
      id: word,
      word,
      primary: 'h',
      fields: [
        { k: 'c', label: 'Kategori', value: v?.c ?? '' },
        { k: 'h', label: 'İpucu', value: v?.h ?? '' },
      ],
    }));
  },
  preflag(item, lang) {
    const flags = [];
    const h = item.fields.find((f) => f.k === 'h')?.value ?? '';
    if (!nonEmpty(h)) flags.push('boş/çok kısa');
    if (leaksAnswer(h, item.word, lang)) flags.push('cevabı içeriyor');
    return flags;
  },
  approvedRaw(raw, decisions, lang, strict) {
    const out = {};
    let kept = 0,
      rejected = 0,
      undecided = 0;
    for (const [word, v] of Object.entries(raw)) {
      const d = decisions[word];
      if (d?.status === 'rejected') {
        rejected++;
        continue;
      }
      if (!d && strict) {
        undecided++;
        continue;
      }
      if (!d) undecided++;
      const h = d?.edited?.h ?? v.h;
      const c = d?.edited?.c ?? v.c;
      out[word] = { c, h };
      kept++;
    }
    return { out, kept, rejected, undecided };
  },
};

const WORDCARD = {
  extract(raw) {
    return Object.entries(raw).map(([word, v]) => ({
      id: word,
      word,
      primary: 't',
      fields: [
        { k: 't', label: 'Tanım', value: v?.t ?? '' },
        { k: 'e', label: 'Örnek', value: v?.e ?? '' },
        { k: 's', label: 'Eş anlamlı', value: (v?.s ?? []).join(', ') },
        { k: 'z', label: 'Zıt anlamlı', value: (v?.z ?? []).join(', ') },
      ],
    }));
  },
  preflag(item) {
    const flags = [];
    const t = item.fields.find((f) => f.k === 't')?.value ?? '';
    if (!nonEmpty(t)) flags.push('tanım boş/çok kısa');
    return flags;
  },
  approvedRaw(raw, decisions, lang, strict) {
    const out = {};
    let kept = 0,
      rejected = 0,
      undecided = 0;
    for (const [word, v] of Object.entries(raw)) {
      const d = decisions[word];
      if (d?.status === 'rejected') {
        rejected++;
        continue;
      }
      if (!d && strict) {
        undecided++;
        continue;
      }
      if (!d) undecided++;
      out[word] = { ...v, t: d?.edited?.t ?? v.t };
      kept++;
    }
    return { out, kept, rejected, undecided };
  },
};

const THEMEWORD = {
  extract(raw) {
    const items = [];
    for (const [theme, words] of Object.entries(raw.themes ?? {})) {
      for (const word of words) {
        items.push({
          id: `${theme}::${word}`,
          word,
          primary: 'word', // düzeltme kelimenin yazımını değiştirir
          fields: [{ k: 'theme', label: 'Tema', value: theme }],
        });
      }
    }
    return items;
  },
  preflag() {
    return [];
  },
  approvedRaw(raw, decisions, lang, strict) {
    const themes = {};
    let kept = 0,
      rejected = 0,
      undecided = 0;
    for (const [theme, words] of Object.entries(raw.themes ?? {})) {
      const list = [];
      for (const word of words) {
        const d = decisions[`${theme}::${word}`];
        if (d?.status === 'rejected') {
          rejected++;
          continue;
        }
        if (!d && strict) {
          undecided++;
          continue;
        }
        if (!d) undecided++;
        list.push(d?.edited?.word ?? word);
        kept++;
      }
      themes[theme] = list;
    }
    return { out: { ...raw, themes }, kept, rejected, undecided };
  },
};

const ANSWER = {
  // Cevap adayları — bağlam için (varsa) kelime kartı tanımıyla zenginleştirilir.
  async enrich(cardsFile) {
    try {
      return JSON.parse(await readFile(cardsFile, 'utf8'));
    } catch {
      return {};
    }
  },
  extract(raw, cards = {}) {
    const words = raw.words ?? raw;
    return words.map((word) => ({
      id: word,
      word,
      primary: 'word',
      fields: [{ k: 'def', label: 'Tanım (kart)', value: cards[word]?.t ?? '(kart yok)' }],
    }));
  },
  preflag(item) {
    const n = [...item.word].length;
    return n < 4 || n > 7 ? ['uzunluk 4-7 dışı'] : [];
  },
  approvedRaw(raw, decisions, lang, strict) {
    const words = raw.words ?? raw;
    const out = [];
    let kept = 0,
      rejected = 0,
      undecided = 0;
    for (const word of words) {
      const d = decisions[word];
      if (d?.status === 'rejected') {
        rejected++;
        continue;
      }
      if (!d && strict) {
        undecided++;
        continue;
      }
      if (!d) undecided++;
      out.push(d?.edited?.word ?? word);
      kept++;
    }
    return { out: { ...(raw.words ? raw : {}), words: out }, kept, rejected, undecided };
  },
};

const TYPES = { hint: HINT, wordcard: WORDCARD, themeword: THEMEWORD, answer: ANSWER };

/** DENETLENEBİLİR KAYNAKLAR — var olan veri dosyalarına bağlı. */
export const SOURCES = [
  { key: 'hints-tr', label: 'İpuçları (TR)', type: 'hint', file: 'src/app/data/hints-tr-native.json', lang: 'tr' },
  { key: 'hints-en', label: 'İpuçları (EN)', type: 'hint', file: 'src/app/data/hints-en.json', lang: 'en' },
  { key: 'cards-tr', label: 'Kelime kartları (TR)', type: 'wordcard', file: 'src/app/data/word-cards-tr.json', lang: 'tr' },
  { key: 'cards-en', label: 'Kelime kartları (EN)', type: 'wordcard', file: 'src/app/data/word-cards-en.json', lang: 'en' },
  { key: 'themes-tr', label: 'Tema kelimeleri (TR)', type: 'themeword', file: 'src/app/data/themes-tr.json', lang: 'tr' },
  { key: 'themes-en', label: 'Tema kelimeleri (EN)', type: 'themeword', file: 'src/app/data/themes-en.json', lang: 'en' },
  { key: 'answers-tr', label: 'Cevap adayları (TR)', type: 'answer', file: 'src/app/data/words.json', lang: 'tr', cards: 'src/app/data/word-cards-tr.json' },
];

export function sourceByKey(key) {
  return SOURCES.find((s) => s.key === key) ?? null;
}

export function adapter(type) {
  return TYPES[type];
}

/** Kaynağın denetlenebilir kayıtlarını (ön işaretlerle) döndür. */
export async function loadItems(src) {
  const raw = JSON.parse(await readFile(src.file, 'utf8'));
  const a = adapter(src.type);
  let items;
  if (src.type === 'answer') {
    const cards = await ANSWER.enrich(src.cards);
    items = a.extract(raw, cards);
  } else {
    items = a.extract(raw);
  }
  for (const it of items) it.preflags = a.preflag(it, src.lang);
  return { raw, items };
}
