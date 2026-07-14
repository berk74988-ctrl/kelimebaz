/**
 * KELİMEBAZ — sözlük üretici.
 *
 * ===========================================================================
 * ÜÇ KATMANLI SÖZLÜK — hepsi İNSAN ELİYLE DOĞRULANMIŞ ya da METİNDE KANITLANMIŞ
 *
 * 1) SÖZLÜK KATMANI — açık kaynak Türkçe kelime listeleri
 *    TDK tabanlı listeler + Zemberek + Hunspell. Koşulsuz kabul.
 *
 * 2) WIKTIONARY KATMANI — Vikisözlük'ün Türkçe dökümü (kaikki.org)
 *    Madde başları + maddelerin RESMİ ÇEKİM TABLOLARI. İnsan yazmış.
 *
 *    ÖZEL ADLAR TAMAMEN DIŞARIDA (pos='name'): PETER, PARİS, RİVNE gibi
 *    girdiler ve onların çekimleri sözlüğe girmez — oyuncunun "kelime" diye
 *    yazacağı şeyler değiller ve korpustaki en büyük çöp kaynağı bunlar.
 *
 * 3) KORPUS KATMANI — OpenSubtitles frekans listesi, biçimbilim süzgecinden
 *    geçirilmiş. Kök sözlükleri "GEL" içerir ama oyuncu "GELDİ" yazar;
 *    çekimli biçimlerin çoğu buradan gelir.
 *
 *    Ham korpus çöp doludur (FROST, MİKEY / ALDİM, DEGİL), bu yüzden
 *    turkish-morph.mjs her adayı çözümler: kelime, bilinen bir kökten geçerli
 *    bir ekle — ünlü uyumu, ünsüz benzeşmesi, sözcük türü ve ek sırasına
 *    uyarak — türetilebiliyor mu?
 *
 * KELİME UYDURULMAZ. Kuralları ileri yönde çalıştırıp biçim ÜRETMEK denendi ve
 * reddedildi (gerekçesi turkish-morph.mjs içinde): isabeti %60-70'te tavan
 * yapıyor ve JELDİ, ÇÖLÜZ, ABIYI gibi sahte kelimeler sızdırıyordu.
 *
 * TAHMİN SÖZLÜĞÜ ile CEVAP HAVUZU AYRIDIR (Wordle'daki gibi):
 *    CEVAPLAR (words.json)  → elle seçilmiş 230 bilinen kelime
 *    GEÇERLİ TAHMİNLER (bu) → sözlüklerdeki HER 5 harfli kelime
 *
 * Bu ayrım kasıtlı bir asimetri taşır: nadir bir kelimeyi TAHMİN olarak kabul
 * etmenin maliyeti düşüktür (oyuncu zaten onu biliyor ki yazıyor), ama geçerli
 * bir kelimeyi reddetmenin maliyeti yüksektir (oyuncu tıkanır). Bu yüzden
 * tahmin sözlüğü geniş, cevap havuzu dardır.
 * ===========================================================================
 *
 * Kullanım: node scripts/build-dictionary.mjs
 */
import { writeFile, readFile } from 'node:fs/promises';
import { analyze, buildRoots } from './turkish-morph.mjs';

/**
 * Sözlük kaynakları.
 *
 * Biçimler farklı ama hepsinde kelime İLK belirteçtir:
 *   düz liste       →  kitap
 *   hunspell        →  kitap/H          (eğik çizgiden sonrası ek bayrağı)
 *   zemberek        →  alçak [P:Adj]    (köşeli parantezden sonrası etiket)
 */
const SOURCES = [
  ['TDK tabanlı liste', 'https://raw.githubusercontent.com/mertemin/turkish-word-list/master/words.txt'],
  ['Türkçe kelime listesi', 'https://raw.githubusercontent.com/CanNuhlar/Turkce-Kelime-Listesi/master/turkce_kelime_listesi.txt'],
  ['Hunspell TR sözlüğü', 'https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/tr/index.dic'],
  ['Zemberek ana sözlük', 'https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/master/morphology/src/main/resources/tr/master-dictionary.dict'],
  ['Zemberek ek sözlük', 'https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/master/morphology/src/main/resources/tr/non-tdk.dict'],
  ['Eş anlamlı sözlük', 'https://raw.githubusercontent.com/maidis/mythes-tr/master/th_tr_TR_v2.dat'],
];

/** Vikisözlük (Wiktionary) Türkçe dökümü — madde başları + çekim tabloları. */
const WIKTIONARY = ['Vikisözlük (Wiktionary)', 'https://kaikki.org/dictionary/Turkish/kaikki.org-dictionary-Turkish.jsonl'];

/** Konuşma dili korpusu — çekimli biçimler buradan gelir. */
const CORPUS = ['OpenSubtitles frekans', 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/tr/tr_full.txt'];

/**
 * Korpus eşiği: bir biçim en az bu kadar kez geçmiş olmalı.
 *
 * Biçimbilim süzgeci asıl kaliteyi sağlıyor; bu eşik ikinci savunma hattı.
 * Nadir yazım hataları bazen tesadüfen çözümlenebilir (ör. gerçek bir kökün
 * yanlış ekiyle) — düşük frekans onları eler.
 */
const MIN_FREQ = 20;

/** Türk alfabesi — 29 harf. Q, W, X yok. */
const TR_ALPHABET = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ';
const TR_SET = new Set(TR_ALPHABET);

const trUpper = (s) => s.toLocaleUpperCase('tr');
const chars = (s) => [...s];
const isTurkish = (w) => w.length > 0 && chars(w).every((c) => TR_SET.has(c));
const isFive = (w) => chars(w).length === 5;

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

const dictWords = []; // her uzunlukta — kök havuzu bundan kurulur

for (const [name, url] of SOURCES) {
  let added = 0;
  for (const line of await lines(url)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const w = trUpper(t.split(/[\s/[]/)[0]); // "kitap/H" ve "alçak [P:Adj]" → KİTAP, ALÇAK
    if (!isTurkish(w)) continue;
    dictWords.push(w);
    added++;
  }
  console.log(`  ${String(n(added)).padStart(8)} kelime  ←  ${name}`);
}

// ---------------------------------------------------------------------------
// 2. KATMAN — Vikisözlük (madde başları + resmi çekim tabloları)
//
// ÖZEL ADLAR (pos='name') TAMAMEN ATILIR. Hem madde başı hem çekimleriyle:
// PETER, PARİS, RİVNE... Oyuncunun "kelime" diye yazacağı şeyler değiller ve
// sözlüğün en büyük çöp kaynağı bunlar olurdu.
// ---------------------------------------------------------------------------
console.log(`\n📥 ${WIKTIONARY[0]} indiriliyor (~34 MB)...`);

/**
 * MADDE BAŞI ile ÇEKİM BİÇİMİ farklı güvenilirlikte:
 *
 *   MADDE BAŞI  — insan açmış bir sözlük sayfası. Koşulsuz kabul.
 *                 (KABZE, ANTRE gibi kökler çözümlenmez ama gerçek kelimedir.)
 *
 *   ÇEKİM BİÇİMİ — Wiktionary'nin ŞABLONU otomatik üretmiş. Çoğu doğru ama
 *                 şablon hata da yapıyor:
 *                     üvez  + iyelik → "ÜVEZM"   ✗ (doğrusu ÜVEZİM)
 *                     kedy  (uydurma madde) → "KEDYİ"  ✗
 *                 Bu yüzden çekimler İKİ kapıdan geçer: bozuk etiket taşımayacak
 *                 ve biçimbilim çözümlemesinden geçecek.
 */
const BAD_TAGS = new Set([
  'error-unrecognized-form', // Wiktionary'nin KENDİSİ hatalı diye işaretlemiş
  'alternative', // ağız / eski yazım: ÇİRAĞ, KOMEŞ, NAPAK
  'romanization',
  'obsolete',
]);

const wiktHeads = new Set(); // madde başları — koşulsuz
const wiktFormCands = new Set(); // çekim biçimleri — sınanacak
const properNames = new Set(); // sadece özel ad olarak geçenler → asla kabul edilmez
let wiktEntries = 0;
let wiktNames = 0;
let badTagged = 0;

for (const line of await lines(WIKTIONARY[1])) {
  const t = line.trim();
  if (!t) continue;

  let e;
  try {
    e = JSON.parse(t);
  } catch {
    continue; // bozuk satır — atla
  }

  const head = trUpper(String(e.word ?? ''));
  const forms = (e.forms ?? []).map((f) => ({
    w: trUpper(String(f.form ?? '')),
    tags: f.tags ?? [],
  }));

  // Özel adlar (PETER, PARİS, RİVNE) — hem maddesi hem çekimleri kara listeye
  if (e.pos === 'name') {
    wiktNames++;
    if (isFive(head) && isTurkish(head)) properNames.add(head);
    for (const { w } of forms) if (isFive(w) && isTurkish(w)) properNames.add(w);
    continue;
  }

  wiktEntries++;
  if (isFive(head) && isTurkish(head)) wiktHeads.add(head);

  for (const { w, tags } of forms) {
    if (!isFive(w) || !isTurkish(w)) continue;
    if (tags.some((tg) => BAD_TAGS.has(tg))) {
      badTagged++;
      continue;
    }
    wiktFormCands.add(w);
  }
}

// Bir kelime hem özel ad hem cins ad olabilir (bir çiçek adı gibi).
// Cins ad girdisi varsa kalır → "yalnızca özel ad olanlar" kara listede.
for (const w of [...wiktHeads, ...wiktFormCands]) properNames.delete(w);

console.log(`  ${String(n(wiktEntries)).padStart(8)} madde · ${n(wiktNames)} özel ad atıldı · ${n(badTagged)} bozuk etiketli biçim atıldı`);

// Kök havuzu: sözlükler + Vikisözlük MADDE BAŞLARI (çekimler değil — onları
// bu havuzla sınayacağız, yoksa kendi kendini doğrulamış olurdu)
const roots = buildRoots([...dictWords, ...wiktHeads]);

// Çekim biçimleri biçimbilimden geçmek ZORUNDA
const wiktForms = new Set();
let wiktFormFail = 0;
for (const w of wiktFormCands) {
  if (wiktHeads.has(w)) continue; // zaten madde başı
  if (analyze(w, roots)) wiktForms.add(w);
  else wiktFormFail++;
}

console.log(`  ${String(n(wiktHeads.size)).padStart(8)} madde başı (5 harfli, koşulsuz)`);
console.log(`  ${String(n(wiktForms.size)).padStart(8)} çekim biçimi biçimbilimden geçti · ${n(wiktFormFail)} şablon hatası elendi`);

// İki sözlük katmanı birleşir. Özel adlar ayıklanır.
const fromDict = new Set(
  [...dictWords.filter(isFive), ...wiktHeads, ...wiktForms].filter((w) => !properNames.has(w)),
);

console.log(`\n🌳 Kök havuzu: ${n(roots.nouns.size)} isim/sıfat · ${n(roots.verbs.size)} fiil (mastarlardan)`);
console.log(`📖 Sözlük katmanı toplam 5 harfli: ${n(fromDict.size)}`);

// ---------------------------------------------------------------------------
// 3. KATMAN — korpus, biçimbilim süzgecinden geçirilerek
// ---------------------------------------------------------------------------
console.log(`\n📥 ${CORPUS[0]} indiriliyor...`);

/**
 * Frekanslar TOPLANIR, üzerine yazılmaz.
 *
 * Korpus "şimdi", "Şimdi", "ŞİMDİ" satırlarını AYRI tutar ve dosya sıklığa
 * göre azalan sıralıdır. Büyük harfe çevirince üçü de aynı anahtara düşer;
 * set() kullanırsak en SONdaki (yani en nadir) satır kazanır ve kelimenin
 * sayısı 500.000'den 2'ye iner. Bu, hem eşik denetimini hem yazım hatası
 * oranını çöpe atardı.
 */
const freq = new Map();
for (const line of await lines(CORPUS[1])) {
  const [w0, c0] = line.trim().split(/\s+/);
  const w = trUpper(w0 ?? '');
  if (isFive(w) && isTurkish(w)) freq.set(w, (freq.get(w) ?? 0) + (Number(c0) || 0));
}
console.log(`  ${n(freq.size)} adet 5 harfli biçim bulundu`);

const candidates = [...freq]
  // Vikisözlük'ün özel ad listesi burada da işe yarıyor: PARİS, DAVİD gibi
  // adlar biçimbilimden kazara geçebilir (PARİS = PAR + İS?). Baştan eleniyorlar.
  .filter(([w, c]) => c >= MIN_FREQ && !fromDict.has(w) && !properNames.has(w))
  .map(([w]) => w);

/**
 * YAZIM HATASI SÜZGECİ.
 *
 * Altyazılar Türkçe harfleri sık sık ASCII karşılığıyla yazar:
 *
 *     ŞİMDİ → SİMDİ      DEĞİL → DEGİL      DOĞRU → DOGRU
 *
 * Bunların bir kısmı biçimbilimden geçer (SİMDİ = SİM + -di, "sim idi"),
 * çünkü kurallı olarak türetilebilirler — ama kimse bu anlamda kullanmıyor.
 *
 * Kural: bir adayın TEK harfi düzeltildiğinde bilinen ve çok daha sık geçen
 * bir kelime çıkıyorsa, aday o kelimenin yazım hatasıdır.
 */
const CONFUSABLE = { S: 'Ş', Ş: 'S', C: 'Ç', Ç: 'C', G: 'Ğ', Ğ: 'G', I: 'İ', İ: 'I', O: 'Ö', Ö: 'O', U: 'Ü', Ü: 'U' };
const TYPO_RATIO = 5; // doğru yazım en az bu kat daha sık geçmeli

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
const rejected = [];
const typos = [];
for (const w of candidates) {
  if (!analyze(w, roots)) {
    rejected.push(w);
    continue;
  }
  const correct = typoOf(w);
  if (correct) {
    typos.push(`${w}→${correct}`);
    continue;
  }
  fromCorpus.add(w);
}

const pct = ((fromCorpus.size / candidates.length) * 100).toFixed(0);
console.log(`  ✅ ${String(n(fromCorpus.size)).padStart(6)} kabul  (%${pct})  ör. ${[...fromCorpus].slice(0, 6).join(', ')}`);
console.log(`  ❌ ${String(n(rejected.length)).padStart(6)} çözümlenemedi   ör. ${rejected.slice(0, 6).join(', ')}`);
console.log(`  ✂️  ${String(n(typos.length)).padStart(6)} yazım hatası    ör. ${typos.slice(0, 6).join(', ')}`);

// ---------------------------------------------------------------------------
// BİRLEŞTİR
// ---------------------------------------------------------------------------
const words = new Set([...fromDict, ...fromCorpus]);

// Cevap havuzundaki her kelime tahmin sözlüğünde OLMAK ZORUNDA —
// yoksa oyun kendi gizli kelimesini reddeder.
const answersRaw = JSON.parse(await readFile('src/app/data/words.json', 'utf8'));
const answers = answersRaw.words.map(trUpper);
const missing = answers.filter((a) => !words.has(a));
if (missing.length) {
  console.log(`\n⚠️  Cevap havuzundaki ${missing.length} kelime sözlükte yoktu, eklendi: ${missing.join(', ')}`);
  for (const m of missing) words.add(m);
}

const final = [...words].sort((a, b) => a.localeCompare(b, 'tr'));

// ---------------------------------------------------------------------------
// ALFABE DENETİMİ — 29 harfin hepsi gerçekten oynanabiliyor mu?
// ---------------------------------------------------------------------------
console.log('\n🔤 Alfabe denetimi — her harf en az bir kelimede geçiyor mu?');
const gaps = [];
for (const ch of TR_ALPHABET) {
  const count = final.filter((w) => w.includes(ch)).length;
  if (count === 0) gaps.push(ch);
}
if (gaps.length) {
  console.log(`  ❌ Hiç kelimede geçmeyen harf: ${gaps.join(', ')}`);
  process.exitCode = 1;
} else {
  const rare = TR_ALPHABET.split('')
    .map((ch) => [ch, final.filter((w) => w.includes(ch)).length])
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4);
  console.log(`  ✅ 29 harfin hepsi oynanabilir. En az geçenler: ${rare.map(([c, k]) => `${c}(${n(k)})`).join(' · ')}`);
}

// ---------------------------------------------------------------------------
// YAZ
// ---------------------------------------------------------------------------
/**
 * Kompakt biçim: kelimeler boşlukla birleştirilmiş TEK bir metin.
 * JSON dizisi olsaydı her kelime için tırnak + virgül fazladan yer kaplardı.
 */
const out = {
  length: 5,
  count: final.length,
  note: 'Geçerli TAHMİN sözlüğü. Gizli kelimeler words.json içindedir.',
  words: final.join(' '),
};

await writeFile('src/app/data/valid-words.json', JSON.stringify(out) + '\n', 'utf8');

const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
console.log(`\n💾 src/app/data/valid-words.json  —  ${n(final.length)} kelime, ${kb} KB`);
console.log(`   sözlükten ${n(fromDict.size)} + korpustan ${n(fromCorpus.size)}`);
console.log(`   Cevap havuzu: ${answers.length} kelime (words.json — değişmedi)\n`);
