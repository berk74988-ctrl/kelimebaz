'use strict';

/**
 * BASİT YASAKLI KELİME FİLTRESİ (Türkçe + İngilizce)
 *
 * Amaç: herkese açık oda sohbetini ve oyuncu adlarını kaba küfür/hakaretten
 * korumak (staj projesi vitrini). Dil filtreleri asla mükemmel değildir; bu
 * bilinçli olarak BASİT tutulmuştur.
 *
 * YAKLAŞIM — kelime bazında TAM EŞLEŞME (alt-dize değil):
 *  - Metin sözcüklere ayrılır; her sözcük normalize edilir.
 *  - Normalize: küçük harf (tr) → Türkçe harfler ASCII'ye → leetspeak (0→o,
 *    1→i, 3→e, 4→a, 5/$→s, 7→t, @→a) → harf dışı at (ayraç kaçışını boz:
 *    "s.i.k.t.i.r" → "siktir") → art arda tekrarları tekle ("siktiiir"→"siktir").
 *  - Normalize edilmiş sözcük yasak kümede birebir varsa → küfür.
 *
 * TAM EŞLEŞME neden: Türkçede masum kelimeler küfür KÖKÜ içerir ("sık" = s>
 * sıklıkla, "sıkışık" vb.). Alt-dize araması bunları yanlışlıkla yakalardı;
 * tam eşleşme yalnızca sözcüğün KENDİSİ küfürse yakalar. Bu yüzden listede
 * masum bir kelimeyle çakışan kısa kökler (ör. "sik", "mal") YOKTUR — yalnızca
 * tek anlamı hakaret olan biçimler vardır.
 */

/** Bir sözcüğü karşılaştırma için normalize eder. */
function normalizeToken(word) {
  return String(word || '')
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/[^a-z]/g, '') // harf dışını at → ayraçla kaçışı boz
    .replace(/(.)\1+/g, '$1'); // art arda tekrar harfleri tekle
}

// Doğal yazımıyla listelenir; aynı normalize ile eşleşme kümesine çevrilir.
// (Tek anlamı hakaret olan biçimler; masum bir kelimeyle çakışan kısa kök YOK.)
const RAW = [
  // --- Türkçe ---
  'siktir',
  'sikeyim',
  'sikerim',
  'sikik',
  'siktir git',
  'sikimde',
  'orospu',
  'orospucocugu',
  'oç',
  'oçocuğu',
  'piç',
  'pezevenk',
  'kahpe',
  'kaltak',
  'sürtük',
  'yavşak',
  'gavat',
  'ibne',
  'puşt',
  'top',
  'amcık',
  'amına',
  'amınakoyayım',
  'amuğa',
  'amk',
  'aq',
  'awk',
  'göt',
  'götveren',
  'götoş',
  'götlek',
  'taşşak',
  'yarrak',
  'yarak',
  'salak',
  'aptal',
  'gerizekalı',
  'dangalak',
  'öküz',
  'eşşek',
  'şerefsiz',
  'oğlibne',
  'anan',
  'ananı',
  'avrat',
  // --- İngilizce ---
  'fuck',
  'fucker',
  'fucking',
  'motherfucker',
  'fuckoff',
  'stfu',
  'shit',
  'bullshit',
  'bitch',
  'asshole',
  'ass',
  'bastard',
  'dick',
  'pussy',
  'cunt',
  'whore',
  'slut',
  'nigger',
  'nigga',
  'retard',
  'faggot',
  'fag',
  'cock',
  'wanker',
  'jerk',
];

const BLOCK = new Set(RAW.map(normalizeToken).filter((w) => w.length >= 2));

// ÖNEK kökleri: Türkçe sondan eklemelidir ("aptalsın", "orospular", "fucking")
// → bu kökle BAŞLAYAN sözcük de küfürdür. Buraya YALNIZCA masum bir kelimenin
// başlayamayacağı, uzun ve tek anlamı hakaret olan kökler konur (kısa/belirsiz
// kökler — "sik", "göt", "ass" — yanlış pozitife yol açar, onlar BLOCK'ta kalır).
// Not: "aptal"/"salak" gibi hafif ve masum çekimleri yaygın olanlar ("aptallık
// ettim") ÖNEKTE DEĞİL — yanlış pozitif olmasın diye yalnız tam-eşleşmede (BLOCK)
// tutulur. Önekte yalnızca güçlü, çekiminde de yalnız hakaret olan kökler var.
const PREFIX = [
  'orospu',
  'siktir',
  'sikerim',
  'sikeyim',
  'sikik',
  'yavsak',
  'pezevenk',
  'kahpe',
  'kaltak',
  'surtuk',
  'gerizekal',
  'dangalak',
  'serefsiz',
  'gotveren',
  'gotoş',
  'gotos',
  'ibne',
  'pust',
  'amcik',
  'amina',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'pussy',
  'cunt',
  'whore',
  'slut',
  'faggot',
  'nigger',
  'nigga',
  'motherfuck',
  'wanker',
  'retard',
].map(normalizeToken);

/** Normalize edilmiş sözcük yasaklı mı? (tam eşleşme veya küfür-öneki) */
function isBadToken(norm) {
  if (!norm) return false;
  if (BLOCK.has(norm)) return true;
  return PREFIX.some((root) => norm.startsWith(root));
}

/** Metin küfür/hakaret içeriyor mu? */
function hasProfanity(text) {
  return String(text || '')
    .split(/\s+/)
    .some((w) => isBadToken(normalizeToken(w)));
}

/** Yasaklı sözcükleri aynı uzunlukta yıldızla değiştir; gerisi aynı kalır. */
function mask(text) {
  return String(text || '').replace(/\S+/g, (w) =>
    isBadToken(normalizeToken(w)) ? '*'.repeat([...w].length) : w,
  );
}

module.exports = { normalizeToken, hasProfanity, mask, size: BLOCK.size };
