/**
 * İngilizce ipucu sızıntı denetimi (ortak kütüphane).
 * checkLeakEn(word, hint) → açıklama cevabı/kökünü/çekimini/türevini ele veriyorsa true.
 *
 * İngilizce çekimi büyük ölçüde DÜZENLİ soneklerdir: -s, -es, -ed, -ing, -er, -est,
 * ünsüz ikizleşmesi (run→running), -y→-ies (baby→babies), ve yaygın türev sonekleri
 * (-ion, -ly, -ness, -ful, -ment, -al). Bu yüzden kelimenin OLASI biçimlerini üretip
 * açıklamadaki bir SÖZCÜĞÜN TAM EŞLEŞMESİNİ ararız (startsWith DEĞİL: "art"→"article"
 * gibi rastlantısal önek yanlış-pozitif verirdi). Düzensiz biçimler (spoke, gave, ran)
 * bu üretimle yakalanmaz — istem, cevabı hiç kullanmama kuralıyla bunu da kapatır.
 */

const VOWEL = /[AEIOU]/;
const SUFFIXES = [
  'S',
  'ES',
  'ED',
  'ING',
  'ER',
  'EST',
  'D',
  'RS',
  'ION',
  'IONS',
  'LY',
  'NESS',
  'FUL',
  'MENT',
  'AL',
  'ANCE',
  'ENCE',
  'ITY',
];

/** Bir kelimenin yasak biçimlerini (kendisi + çekim/türev) üretir (TAM EŞLEŞME için). */
export function forbiddenFormsEn(word) {
  const W = (word || '').toUpperCase();
  const set = new Set();
  if (!W) return set;
  const stems = new Set([W]);
  if (W.endsWith('E') && W.length > 3) stems.add(W.slice(0, -1)); // make→mak, give→giv
  for (const s of stems) {
    set.add(s);
    for (const suf of SUFFIXES) set.add(s + suf);
    // Ünsüz ikizleşmesi (CVC sonu): run→running/runned, stop→stopping
    if (s.length >= 3) {
      const a = s[s.length - 3],
        b = s[s.length - 2],
        c = s[s.length - 1];
      if (!VOWEL.test(a) && VOWEL.test(b) && !VOWEL.test(c) && !'WXY'.includes(c)) {
        const d = s + c;
        set.add(d + 'ING');
        set.add(d + 'ED');
        set.add(d + 'ER');
      }
    }
    // -y → -ies / -ied / -ier (baby→babies, carry→carried)
    if (s.endsWith('Y') && s.length >= 3) {
      const b = s.slice(0, -1);
      set.add(b + 'IES');
      set.add(b + 'IED');
      set.add(b + 'IER');
    }
  }
  return set;
}

/** Açıklama, kelimeyi/kökünü/çekimini/türevini ele veriyor mu? */
export function checkLeakEn(word, hint) {
  const forms = forbiddenFormsEn(word);
  if (!forms.size || !hint) return false;
  const tokens = (hint || '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  for (const tok of tokens) if (forms.has(tok)) return true;
  return false;
}
