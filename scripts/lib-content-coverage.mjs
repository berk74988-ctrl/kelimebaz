/**
 * İÇERİK KAPSAM ÇEKİRDEĞİ — kategori tanımları + kapsam hesabı (TEK KAYNAK).
 *
 * Hem CI denetimi (check-content-coverage.mjs) hem panel indeksi
 * (build-content-index.mjs) bunu kullanır → "iki yerde farklı sonuç çıkmaz"
 * (OYUN içerik paketi kararı). Kapsam yüklemleri ve havuz/tema kaynakları
 * TEK yerde tanımlıdır.
 */
import { readFile } from 'node:fs/promises';

const DIR = new URL('../src/app/data/', import.meta.url);
const load = async (name) => JSON.parse(await readFile(new URL(name, DIR), 'utf8'));

/** Cevap havuzu → tekrarsız kelime dizisi (veri zaten TR/EN büyük harf). */
const pool = (w) => [...new Set(w.words)];
/** valid-words: .words tek boşluklu STRING → Set. */
const dictSet = (d) => new Set(String(d.words).split(/\s+/).filter(Boolean));
/** themes: {themes:{tema:[kelime...]}} → tüm kelimeler (tekrarsız). */
const themeWords = (t) => [...new Set(Object.values(t.themes || {}).flat())];

// Kapsam yüklemleri: kelime KAPSANIYOR mu?
const hasHint = (obj, w) => !!(obj[w] && typeof obj[w].h === 'string' && obj[w].h.trim());
const hasCard = (obj, w) => !!(obj[w] && typeof obj[w].t === 'string' && obj[w].t.trim());
const hasDiff = (obj, w) => {
  const s = obj.scores?.[w];
  return typeof s === 'number' && Number.isFinite(s) && s >= 1 && s <= 5;
};

/**
 * Tüm kategorilerin kapsamını hesapla.
 * @returns {Promise<{ results: {id,label,total,missing:string[]}[] }>}
 */
export async function computeCoverage() {
  const [
    wordsTr,
    wordsEn,
    wordsDe,
    hintsTr,
    hintsEn,
    hintsDe,
    cardsTr,
    cardsEn,
    diffTr,
    diffEn,
    themesTr,
    themesEn,
    dictTr,
    dictEn,
  ] = await Promise.all([
    load('words.json'),
    load('words-en.json'),
    load('words-de.json'),
    load('hints-tr-native.json'),
    load('hints-en.json'),
    load('hints-de.json'),
    load('word-cards-tr.json'),
    load('word-cards-en.json'),
    load('word-difficulty-tr.json'),
    load('word-difficulty-en.json'),
    load('themes-tr.json'),
    load('themes-en.json'),
    load('valid-words.json'),
    load('valid-words-en.json'),
  ]);

  const dictSetTr = dictSet(dictTr);
  const dictSetEn = dictSet(dictEn);

  // DE için yalnız ipucu denetlenir (word-cards-de yok, zorluk kaynağı farklı).
  const categories = [
    { id: 'tr.hint', label: 'TR ipucu (hints-tr-native)', items: pool(wordsTr), covered: (w) => hasHint(hintsTr, w) }, // prettier-ignore
    { id: 'tr.card', label: 'TR kart (word-cards-tr)', items: pool(wordsTr), covered: (w) => hasCard(cardsTr, w) }, // prettier-ignore
    { id: 'tr.difficulty', label: 'TR zorluk (word-difficulty-tr)', items: pool(wordsTr), covered: (w) => hasDiff(diffTr, w) }, // prettier-ignore
    { id: 'en.hint', label: 'EN ipucu (hints-en)', items: pool(wordsEn), covered: (w) => hasHint(hintsEn, w) }, // prettier-ignore
    { id: 'en.card', label: 'EN kart (word-cards-en)', items: pool(wordsEn), covered: (w) => hasCard(cardsEn, w) }, // prettier-ignore
    { id: 'en.difficulty', label: 'EN zorluk (word-difficulty-en)', items: pool(wordsEn), covered: (w) => hasDiff(diffEn, w) }, // prettier-ignore
    { id: 'de.hint', label: 'DE ipucu (hints-de)', items: pool(wordsDe), covered: (w) => hasHint(hintsDe, w) }, // prettier-ignore
    { id: 'theme.tr', label: 'TR tema → sözlük (valid-words)', items: themeWords(themesTr), covered: (w) => dictSetTr.has(w) }, // prettier-ignore
    { id: 'theme.en', label: 'EN tema → sözlük (valid-words-en)', items: themeWords(themesEn), covered: (w) => dictSetEn.has(w) }, // prettier-ignore
  ];

  const results = categories.map((c) => ({
    id: c.id,
    label: c.label,
    total: c.items.length,
    missing: c.items.filter((w) => !c.covered(w)),
  }));
  return { results };
}
