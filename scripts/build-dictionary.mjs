/**
 * KELİMEBAZ — sözlük üretici (ÇOK UZUNLUKLU: 4, 5, 6, 7 harf).
 *
 * ===========================================================================
 * ÜÇ KATMANLI SÖZLÜK — hepsi İNSAN ELİYLE DOĞRULANMIŞ ya da METİNDE KANITLANMIŞ
 *
 * 1) SÖZLÜK KATMANI — açık kaynak Türkçe kelime listeleri (TDK/Zemberek/Hunspell)
 * 2) WIKTIONARY KATMANI — Vikisözlük madde başları + resmi çekim tabloları
 * 3) KORPUS KATMANI — OpenSubtitles frekans listesi, biçimbilim süzgeciyle
 *
 * Kelime UYDURULMAZ (gerekçe turkish-morph.mjs içinde).
 *
 * TAHMİN SÖZLÜĞÜ ile CEVAP HAVUZU AYRIDIR:
 *   CEVAPLAR (words.json)  → her uzunlukta bilinen kelimeler
 *                            (5 harfliler ELLE SEÇİLMİŞ, korunur; 4/6/7 en sık
 *                             geçen sözlük madde başlarından üretilir)
 *   GEÇERLİ TAHMİNLER (valid-words.json) → sözlüklerdeki HER 4-7 harfli kelime
 *
 * DEĞİŞİKLİK (çok uzunluk): eski sürüm yalnızca 5 harf üretiyordu. Artık
 * 4-7 harf destekleniyor; oyun uzunluğu oyuncu seviyesine göre seçilir.
 *
 * Kullanım: node scripts/build-dictionary.mjs
 * ===========================================================================
 */
import { writeFile, readFile } from 'node:fs/promises';
import { analyze, buildRoots } from './turkish-morph.mjs';

const SOURCES = [
  ['TDK tabanlı liste', 'https://raw.githubusercontent.com/mertemin/turkish-word-list/master/words.txt'],
  ['Türkçe kelime listesi', 'https://raw.githubusercontent.com/CanNuhlar/Turkce-Kelime-Listesi/master/turkce_kelime_listesi.txt'],
  ['Hunspell TR sözlüğü', 'https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/tr/index.dic'],
  ['Zemberek ana sözlük', 'https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/master/morphology/src/main/resources/tr/master-dictionary.dict'],
  ['Zemberek ek sözlük', 'https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/master/morphology/src/main/resources/tr/non-tdk.dict'],
  ['Eş anlamlı sözlük', 'https://raw.githubusercontent.com/maidis/mythes-tr/master/th_tr_TR_v2.dat'],
];
const WIKTIONARY = ['Vikisözlük (Wiktionary)', 'https://kaikki.org/dictionary/Turkish/kaikki.org-dictionary-Turkish.jsonl'];
const CORPUS = ['OpenSubtitles frekans', 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/tr/tr_full.txt'];

const MIN_FREQ = 20;

/** Desteklenen kelime uzunlukları. */
const LENGTHS = [4, 5, 6, 7];
/** 4/6/7 için üretilecek cevap sayısı (5 elle seçili, korunur). */
const ANSWER_TARGET = { 4: 150, 6: 240, 7: 240 };

const TR_ALPHABET = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ';
const TR_SET = new Set(TR_ALPHABET);

const trUpper = (s) => s.toLocaleUpperCase('tr');
const chars = (s) => [...s];
const len = (w) => chars(w).length;
const isTurkish = (w) => w.length > 0 && chars(w).every((c) => TR_SET.has(c));
const inRange = (w) => len(w) >= 4 && len(w) <= 7;

async function lines(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.text()).split(/\r?\n/);
}

const n = (x) => x.toLocaleString('tr');

// ---------------------------------------------------------------------------
// 1. KATMAN — sözlükler
// ---------------------------------------------------------------------------
console.log('\n📥 Sözlükler indiriliyor...\n');

const dictWords = []; // her uzunlukta — kök havuzu ve madde başları bundan

for (const [name, url] of SOURCES) {
  let added = 0;
  for (const line of await lines(url)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const w = trUpper(t.split(/[\s/[]/)[0]);
    if (!isTurkish(w)) continue;
    dictWords.push(w);
    added++;
  }
  console.log(`  ${String(n(added)).padStart(8)} kelime  ←  ${name}`);
}

// ---------------------------------------------------------------------------
// CEVAP LEMMA HAVUZU — Zemberek'in POS ETİKETLİ lemma sözlüğünden.
//
// Neden ayrı: cevaplar SOMUT, BİLİNEN kelimeler olmalı (ARABA, DOKTOR).
// Korpus frekansı tek başına zamir/çekim/dolgu sızdırıyordu (İÇİN, OLDU,
// ADAMIN). Zemberek lemma sözlüğü çekimli biçim İÇERMEZ ve sözcük türü
// etiketlidir → yalnızca isim (etiketsiz / [P:Noun]) ve sıfat ([P:Adj])
// alınır. Fiil mastarları (-mak/-mek) atılır.
// ---------------------------------------------------------------------------
const ZEM_DICTS = [
  'https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/master/morphology/src/main/resources/tr/master-dictionary.dict',
  'https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/master/morphology/src/main/resources/tr/non-tdk.dict',
];
const answerLemmas = new Set();
for (const url of ZEM_DICTS) {
  for (const line of await lines(url)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const w = trUpper(t.split(/[\s/[]/)[0]);
    if (!isTurkish(w) || !inRange(w)) continue;
    const tag = (line.match(/\[P:([^;,\]]+)/) || [])[1]; // etiket yoksa isim
    if (tag && tag !== 'Noun' && tag !== 'Adj') continue; // Adv/Conj/Pron/Verb... atla
    if (w.endsWith('MAK') || w.endsWith('MEK')) continue; // fiil mastarı
    answerLemmas.add(w);
  }
}
console.log(`  ${String(n(answerLemmas.size)).padStart(8)} isim/sıfat lemma  ←  Zemberek (cevap havuzu kaynağı)`);

// ---------------------------------------------------------------------------
// 2. KATMAN — Vikisözlük
// ---------------------------------------------------------------------------
console.log(`\n📥 ${WIKTIONARY[0]} indiriliyor (~34 MB)...`);

const BAD_TAGS = new Set(['error-unrecognized-form', 'alternative', 'romanization', 'obsolete']);

const wiktHeads = new Set();
const wiktFormCands = new Set();
const properNames = new Set();
let wiktEntries = 0;
let wiktNames = 0;

for (const line of await lines(WIKTIONARY[1])) {
  const t = line.trim();
  if (!t) continue;
  let e;
  try {
    e = JSON.parse(t);
  } catch {
    continue;
  }

  const head = trUpper(String(e.word ?? ''));
  const forms = (e.forms ?? []).map((f) => ({ w: trUpper(String(f.form ?? '')), tags: f.tags ?? [] }));

  if (e.pos === 'name') {
    wiktNames++;
    if (inRange(head) && isTurkish(head)) properNames.add(head);
    for (const { w } of forms) if (inRange(w) && isTurkish(w)) properNames.add(w);
    continue;
  }

  wiktEntries++;
  if (inRange(head) && isTurkish(head)) wiktHeads.add(head);

  for (const { w, tags } of forms) {
    if (!inRange(w) || !isTurkish(w)) continue;
    if (tags.some((tg) => BAD_TAGS.has(tg))) continue;
    wiktFormCands.add(w);
  }
}

for (const w of [...wiktHeads, ...wiktFormCands]) properNames.delete(w);

// Vikisözlük'ün UYDURMA/HATALI maddeleri — köke girerse sahte çekim üretir.
// (ör. "kedy" sahte maddesi → KEDYİ. 5 harf filtresi bunu kazara eliyordu;
//  çok uzunluk desteğiyle 4 harfli kök olarak sızıyor, elle eliyoruz.)
const JUNK = new Set(['KEDY', 'KEDYİ', 'KEDYE', 'KEDYYE']);
for (const j of JUNK) {
  wiktHeads.delete(j);
  wiktFormCands.delete(j);
}

console.log(`  ${String(n(wiktEntries)).padStart(8)} madde · ${n(wiktNames)} özel ad atıldı`);

// Kök havuzu: sözlükler + Vikisözlük MADDE BAŞLARI (çekimler değil)
const roots = buildRoots([...dictWords, ...wiktHeads]);

const wiktForms = new Set();
let wiktFormFail = 0;
for (const w of wiktFormCands) {
  if (wiktHeads.has(w)) continue;
  if (analyze(w, roots)) wiktForms.add(w);
  else wiktFormFail++;
}

console.log(`  ${String(n(wiktHeads.size)).padStart(8)} madde başı (4-7 harf, koşulsuz)`);
console.log(`  ${String(n(wiktForms.size)).padStart(8)} çekim biçimi biçimbilimden geçti · ${n(wiktFormFail)} şablon hatası elendi`);

const dictInRange = dictWords.filter(inRange);
const fromDict = new Set([...dictInRange, ...wiktHeads, ...wiktForms].filter((w) => !properNames.has(w)));

console.log(`\n🌳 Kök havuzu: ${n(roots.nouns.size)} isim/sıfat · ${n(roots.verbs.size)} fiil`);
console.log(`📖 Sözlük katmanı toplam (4-7 harf): ${n(fromDict.size)}`);

// ---------------------------------------------------------------------------
// 3. KATMAN — korpus
// ---------------------------------------------------------------------------
console.log(`\n📥 ${CORPUS[0]} indiriliyor...`);

const freq = new Map();
for (const line of await lines(CORPUS[1])) {
  const [w0, c0] = line.trim().split(/\s+/);
  const w = trUpper(w0 ?? '');
  if (inRange(w) && isTurkish(w)) freq.set(w, (freq.get(w) ?? 0) + (Number(c0) || 0));
}
console.log(`  ${n(freq.size)} adet 4-7 harfli biçim bulundu`);

const candidates = [...freq]
  .filter(([w, c]) => c >= MIN_FREQ && !fromDict.has(w) && !properNames.has(w))
  .map(([w]) => w);

const CONFUSABLE = { S: 'Ş', Ş: 'S', C: 'Ç', Ç: 'C', G: 'Ğ', Ğ: 'G', I: 'İ', İ: 'I', O: 'Ö', Ö: 'O', U: 'Ü', Ü: 'U' };
const TYPO_RATIO = 5;

function typoOf(word) {
  const cs = chars(word);
  const f = freq.get(word) ?? 0;
  for (let i = 0; i < cs.length; i++) {
    const alt = CONFUSABLE[cs[i]];
    if (!alt) continue;
    const variant = cs.toSpliced(i, 1, alt).join('');
    if (!fromDict.has(variant)) continue;
    if ((freq.get(variant) ?? 0) >= f * TYPO_RATIO) return variant;
  }
  return null;
}

console.log(`\n🔬 Biçimbilim süzgeci  (eşik ≥${MIN_FREQ}, sözlükte olmayan ${n(candidates.length)} aday)`);

const fromCorpus = new Set();
let rejectedCount = 0;
let typoCount = 0;
for (const w of candidates) {
  if (!analyze(w, roots)) {
    rejectedCount++;
    continue;
  }
  if (typoOf(w)) {
    typoCount++;
    continue;
  }
  fromCorpus.add(w);
}

const pct = ((fromCorpus.size / Math.max(1, candidates.length)) * 100).toFixed(0);
console.log(`  ✅ ${String(n(fromCorpus.size)).padStart(6)} kabul  (%${pct})`);
console.log(`  ❌ ${String(n(rejectedCount)).padStart(6)} çözümlenemedi · ✂️  ${n(typoCount)} yazım hatası`);

// ---------------------------------------------------------------------------
// BİRLEŞTİR — geçerli tahmin sözlüğü
// ---------------------------------------------------------------------------
const words = new Set([...fromDict, ...fromCorpus]);
for (const j of JUNK) words.delete(j); // sahte maddeler kesinlikle çıksın

// ---------------------------------------------------------------------------
// CEVAP HAVUZU — her uzunluk için
//   5 harf: MEVCUT elle seçilmiş liste korunur.
//   4/6/7 : en sık geçen sözlük MADDE BAŞLARINDAN üretilir (bilinen = sık).
// ---------------------------------------------------------------------------
const answersRaw = JSON.parse(await readFile('src/app/data/words.json', 'utf8'));
// Mevcut dosya ister düz dizi (eski) ister uzunluk sözlüğü (yeni) olsun, 5 harflileri çıkar.
const existingList = Array.isArray(answersRaw.words)
  ? answersRaw.words.map(trUpper)
  : Object.values(answersRaw.words).flat().map(trUpper);
const curatedFive = existingList.filter((w) => len(w) === 5);

// Güvenlik ağı: Zemberek'te etiketsiz kalabilen dolgu/işaret sözcükleri cevap olmasın
const STOPLIST = new Set(
  ('ACABA HANİ HADİ İŞTE YANİ PEKİ TABİ TABİİ AMAN EYVAH HAYDİ ÖYLE BÖYLE ŞÖYLE NASIL NİYE NEDEN HANGİ KENDİ BÜTÜN HERKES HİÇBİR BİRÇOK BİRKAÇ BÖYLECE AYRICA ANCAK FAKAT LAKİN ÇÜNKÜ ÜSTELİK YİNE GENE ARTIK SADECE YALNIZ BELKİ SANKİ GALİBA HEMEN DAHA ÇOK GİBİ KADAR SONRA ÖNCE ŞİMDİ BURADA ŞURADA ORADA NEREDE NEREYE BURAYA ORAYA ' +
    // informal/birleşik yazım ve zayıf cevaplar
    'BİRŞEY HERŞEY OLUR EDER BAZI AYNI BERİ GÜNÜ ŞEYİ İŞİN YOLU ONUN BUNU ŞUNU').split(' '),
);

// Aile dostu: argo/müstehcen/hassas kelimeler CEVAP OLMAZ (tahmin olarak kalabilir)
const BLOCKLIST = new Set(
  'SEKS OROSPU KAHPE PUŞT PEZEVENK GAVAT YARAK YARRAK SİKİK SİKİŞ AMCIK GÖT GÖTÜ TAŞAK MEME MEMESİ ORGAZM PORNO ESRAR EROİN KOKAİN İNTİHAR TECAVÜZ FUHUŞ VAJİNA PENİS'.split(' '),
);

const answersByLen = {};
for (const L of LENGTHS) {
  if (L === 5) {
    answersByLen[5] = [...new Set(curatedFive)];
    continue;
  }
  // Yalnızca isim/sıfat lemmaları; korpus frekansına göre sırala (sık = bilinen)
  const cands = [...answerLemmas]
    .filter(
      (w) =>
        len(w) === L && words.has(w) && !properNames.has(w) && !STOPLIST.has(w) && !BLOCKLIST.has(w),
    )
    .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0));
  answersByLen[L] = cands.slice(0, ANSWER_TARGET[L]);
}

// Her cevap tahmin sözlüğünde OLMAK ZORUNDA
for (const L of LENGTHS) for (const a of answersByLen[L]) words.add(a);

const allAnswers = LENGTHS.flatMap((L) => answersByLen[L]);

// ---------------------------------------------------------------------------
// ALFABE DENETİMİ
// ---------------------------------------------------------------------------
const final = [...words].sort((a, b) => a.localeCompare(b, 'tr'));
console.log('\n🔤 Alfabe denetimi — her harf en az bir kelimede geçiyor mu?');
const gaps = TR_ALPHABET.split('').filter((ch) => !final.some((w) => w.includes(ch)));
if (gaps.length) {
  console.log(`  ❌ Hiç geçmeyen: ${gaps.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('  ✅ 29 harfin hepsi oynanabilir.');
}

console.log('\n📊 Uzunluk dağılımı (geçerli tahmin / cevap):');
for (const L of LENGTHS) {
  const v = final.filter((w) => len(w) === L).length;
  console.log(`  ${L} harf:  ${String(n(v)).padStart(7)} tahmin  ·  ${n(answersByLen[L].length)} cevap`);
}

// ---------------------------------------------------------------------------
// YAZ
// ---------------------------------------------------------------------------
const validOut = {
  lengths: LENGTHS,
  count: final.length,
  note: 'Geçerli TAHMİN sözlüğü (4-7 harf). Gizli kelimeler words.json içindedir.',
  words: final.join(' '),
};
await writeFile('src/app/data/valid-words.json', JSON.stringify(validOut) + '\n', 'utf8');

const answersOut = {
  lengths: LENGTHS,
  counts: Object.fromEntries(LENGTHS.map((L) => [L, answersByLen[L].length])),
  note: 'CEVAP havuzu (4-7 harf). 5 harfliler elle seçilmiştir.',
  words: allAnswers,
};
await writeFile('src/app/data/words.json', JSON.stringify(answersOut, null, 0) + '\n', 'utf8');

const kb = (Buffer.byteLength(JSON.stringify(validOut)) / 1024).toFixed(0);
console.log(`\n💾 valid-words.json — ${n(final.length)} kelime, ${kb} KB`);
console.log(`💾 words.json — ${n(allAnswers.length)} cevap (${LENGTHS.map((L) => `${L}h:${answersByLen[L].length}`).join(' ')})\n`);
