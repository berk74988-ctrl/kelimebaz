/**
 * İÇERİK KAPSAM DENETİMİ — cevap havuzu ile ona BAĞLI içeriklerin arasını açık bırakma.
 *
 * NEDEN VAR: Faz 2'de havuz 860 → 3.100'e büyütüldü ama ipucu/kart üretimi eski sayıda
 * kaldı → 3.100 kelimenin ~%72'sinde ne ipucu ne kart vardı. Hata SESSİZDİ: testler
 * geçiyordu (kimse kapsamı denetlemiyordu), arayüz eksik kelimede null dönüp bozulmuyordu.
 * Bu betik o sınıfı kapatır: havuz bir daha büyüyüp içerik geride kalırsa CI KIRMIZI olur.
 *
 * NE DENETLER (TR ve EN AYRI):
 *   - Her cevap kelimesi için  → ipucu · kelime kartı · zorluk puanı
 *   - Tema setlerindeki her kelime → geçerli tahmin sözlüğünde var mı
 *
 * EŞİK KARARI — SAYI TABANLI CIRCIR (RATCHET):
 *   %100 kapsam BUGÜN zorunlu değil (ipucu/kart boşluğu OYUN-191/192 ile doldurulacak).
 *   Bunun yerine her kategori için İZİN VERİLEN eksik sayısı bir tabanda (baseline)
 *   dondurulur (content-coverage-baseline.json):
 *     - Gerçek eksik > taban  → REGRESYON (havuz büyümüş / içerik silinmiş) → HATA.
 *       (Kapatmak istediğimiz asıl sınıf budur.)
 *     - Gerçek eksik < taban  → İYİLEŞME (içerik eklenmiş) ama taban güncellenmemiş →
 *       HATA + "tabanı düşür" talimatı → taban HER ZAMAN gerçekle eşit kalır, delik
 *       oluşmaz (yarın biri içeriği silse yakalanır).
 *     - Gerçek eksik = taban  → GEÇER.
 *   Böylece taban tek yönlü aşağı iner; nihai hedef tüm kategorilerde 0.
 *
 * KULLANIM:
 *   node scripts/check-content-coverage.mjs            # denetle (CI kipi) → 0/1 çıkış
 *   node scripts/check-content-coverage.mjs --update   # tabanı gerçek eksiğe eşitle+yaz
 *   node scripts/check-content-coverage.mjs --list      # tüm eksik listesini dosyaya yaz
 *                                                        # (content-coverage-missing.json)
 */
import { readFile, writeFile } from 'node:fs/promises';

const DIR = new URL('../src/app/data/', import.meta.url);
const BASELINE_URL = new URL('./content-coverage-baseline.json', import.meta.url);
const MISSING_URL = new URL('./content-coverage-missing.json', import.meta.url);

const args = new Set(process.argv.slice(2));
const UPDATE = args.has('--update');
const LIST = args.has('--list');

const load = async (name) => JSON.parse(await readFile(new URL(name, DIR), 'utf8'));

// ── Veriyi oku (şemalar: bkz. src/app/data/*.json) ───────────────────────────
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

// ── Denetlenecek kategoriler ─────────────────────────────────────────────────
// DE için yalnız ipucu denetlenir (kart/zorluk-kapsamı DE için ayrı ele alınır;
// word-cards-de yok, word-difficulty-de kaynağı farklı).
const categories = [
  {
    id: 'tr.hint',
    label: 'TR ipucu (hints-tr-native)',
    items: pool(wordsTr),
    covered: (w) => hasHint(hintsTr, w),
  },
  {
    id: 'tr.card',
    label: 'TR kart (word-cards-tr)',
    items: pool(wordsTr),
    covered: (w) => hasCard(cardsTr, w),
  },
  {
    id: 'tr.difficulty',
    label: 'TR zorluk (word-difficulty-tr)',
    items: pool(wordsTr),
    covered: (w) => hasDiff(diffTr, w),
  },
  {
    id: 'en.hint',
    label: 'EN ipucu (hints-en)',
    items: pool(wordsEn),
    covered: (w) => hasHint(hintsEn, w),
  },
  {
    id: 'en.card',
    label: 'EN kart (word-cards-en)',
    items: pool(wordsEn),
    covered: (w) => hasCard(cardsEn, w),
  },
  {
    id: 'en.difficulty',
    label: 'EN zorluk (word-difficulty-en)',
    items: pool(wordsEn),
    covered: (w) => hasDiff(diffEn, w),
  },
  {
    id: 'de.hint',
    label: 'DE ipucu (hints-de)',
    items: pool(wordsDe),
    covered: (w) => hasHint(hintsDe, w),
  },
  {
    id: 'theme.tr',
    label: 'TR tema → sözlük (valid-words)',
    items: themeWords(themesTr),
    covered: (w) => dictTr && dictSetTr.has(w),
  },
  {
    id: 'theme.en',
    label: 'EN tema → sözlük (valid-words-en)',
    items: themeWords(themesEn),
    covered: (w) => dictSetEn.has(w),
  },
];
const dictSetTr = dictSet(dictTr);
const dictSetEn = dictSet(dictEn);

// ── Eksikleri hesapla ────────────────────────────────────────────────────────
const results = categories.map((c) => {
  const missing = c.items.filter((w) => !c.covered(w));
  return { id: c.id, label: c.label, total: c.items.length, missing };
});

// ── --update: tabanı gerçek eksiğe eşitle ve yaz ─────────────────────────────
if (UPDATE) {
  const allowed = {};
  for (const r of results) allowed[r.id] = r.missing.length;
  const baseline = {
    note:
      'İçerik kapsamı CIRCIR (ratchet) tabanı — her kategori için İZİN VERİLEN eksik sayısı. ' +
      'Gerçek eksik bunu AŞARSA CI kırmızı olur (havuz büyümüş/içerik silinmiş). İçerik eklenince ' +
      'bu sayıları düşür: `node scripts/check-content-coverage.mjs --update`. Hedef: hepsi 0.',
    updatedFrom: 'node scripts/check-content-coverage.mjs --update',
    allowed,
  };
  await writeFile(BASELINE_URL, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log('✅ Taban güncellendi → scripts/content-coverage-baseline.json');
  for (const r of results)
    console.log(`   ${r.id.padEnd(15)} eksik=${r.missing.length}/${r.total}`);
  process.exit(0);
}

// ── --list: tüm eksik listesini makine-okur dosyaya yaz (OYUN-191/192 girdisi) ─
if (LIST) {
  const out = { generatedBy: 'scripts/check-content-coverage.mjs --list', categories: {} };
  for (const r of results) out.categories[r.id] = { total: r.total, missing: r.missing };
  await writeFile(MISSING_URL, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`📝 Eksik listesi yazıldı → scripts/content-coverage-missing.json`);
}

// ── Taban ile karşılaştır ────────────────────────────────────────────────────
let baseline;
try {
  baseline = JSON.parse(await readFile(BASELINE_URL, 'utf8'));
} catch {
  console.error(
    '❌ Taban dosyası yok. Önce oluştur: node scripts/check-content-coverage.mjs --update',
  );
  process.exit(1);
}
const allowed = baseline.allowed || {};

console.log('İÇERİK KAPSAM DENETİMİ (cevap havuzu ↔ ipucu/kart/zorluk + tema→sözlük)\n');
console.log('Kategori                          | Toplam | Kapsanan | Eksik | İzinli | Durum');
console.log('----------------------------------|--------|----------|-------|--------|--------');

let regression = false;
let improvement = false;
for (const r of results) {
  const allow = allowed[r.id] ?? 0;
  const miss = r.missing.length;
  let durum;
  if (miss > allow) {
    durum = '❌ REGRESYON';
    regression = true;
  } else if (miss < allow) {
    durum = '⚠️ İYİLEŞME';
    improvement = true;
  } else {
    durum = '✅';
  }
  console.log(
    `${r.label.padEnd(33)} | ${String(r.total).padStart(6)} | ${String(r.total - miss).padStart(8)} | ` +
      `${String(miss).padStart(5)} | ${String(allow).padStart(6)} | ${durum}`,
  );
}

// Eksik örnekleri (ilk 8) — sorunu görünür kıl.
for (const r of results) {
  if (r.missing.length) {
    const ex = r.missing.slice(0, 8).join(', ');
    console.log(
      `\n  ${r.id} eksik (${r.missing.length}): ${ex}${r.missing.length > 8 ? ', …' : ''}`,
    );
  }
}

console.log('');
if (regression) {
  console.log(
    '❌ REGRESYON: bir kategoride eksik, izin verilenden FAZLA. Havuz büyümüş veya içerik\n' +
      '   silinmiş olabilir → eksik içeriği üret. (Bilerek gevşetmek istiyorsan tabanı\n' +
      '   güncelle: node scripts/check-content-coverage.mjs --update — ama sadece kasıtlıysa.)',
  );
  process.exit(1);
}
if (improvement) {
  console.log(
    '⚠️ İYİLEŞME: bir kategoride eksik, izin verilenden AZ (içerik eklenmiş 👍). Tabanı\n' +
      '   gerçeğe indir ki kazanım kilitlensin: node scripts/check-content-coverage.mjs --update',
  );
  process.exit(1);
}
console.log('✅ Tüm kategoriler taban ile uyumlu — kapsam boşluğu genişlemedi.');
process.exit(0);
