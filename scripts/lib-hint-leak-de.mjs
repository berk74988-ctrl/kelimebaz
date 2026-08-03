/**
 * Almanca ipucu sızıntı denetimi (ortak kütüphane).
 * checkLeakDe(word, hint) → açıklama cevabı/kökünü/çekimini ele veriyorsa true.
 *
 * Almanca Türkçe'den farklı: çekim hem SONEK (laufen→läuft, Haus→Häuser) hem ÖNEK
 * (ge-laufen partisip) alır ve UMLAUT değişir (a→ä, o→ö, u→ü, au→äu). Bu yüzden:
 *   - kökü çıkar (yaygın ekleri at: -en, -ern, -eln, -e, -er, -es, -em, -n, -s, -t, -st),
 *   - kökün umlaut'lu biçimlerini VE ge- önekli (partisip) biçimini üret,
 *   - açıklamadaki bir SÖZCÜK bu köklerden biriyle BAŞLIYORSA sızıntı say.
 * Neden "başlıyorsa" (içeriyorsa DEĞİL): "içerir" denetimi yaygın Almanca alt-dizgelerde
 * yanlış-pozitif verir (mög-LICHT ≠ Licht, zu-SAMM-en ≠ sammeln). "başlar" ise gerçek
 * türev/çekimi yakalar (MÄNN-liche → Mann, GE-LAUF-en → laufen) ama rastlantısal son-eki
 * yakalamaz. Kök en az 4 harf; kelimenin KENDİSİ tam-eşleşmeyle her uzunlukta yasak.
 */

const UML = { A: 'Ä', O: 'Ö', U: 'Ü' };
const DEUML = { Ä: 'A', Ö: 'O', Ü: 'U' };

/** Umlaut'suz biçim (Ä→A …). */
function deUmlaut(s) {
  return s.replace(/[ÄÖÜ]/g, (c) => DEUML[c]);
}

/** Kökün olası umlaut'lu biçimleri (çekimde umlaut EKLENİR: LAUF→LÄUF, HAUS→HÄUS). */
function umlautVariants(s) {
  const out = new Set([s, deUmlaut(s)]);
  // au → äu (sık)
  if (s.includes('AU')) out.add(s.replace(/AU/g, 'ÄU'));
  // son tek A/O/U → umlaut
  for (const [k, v] of Object.entries(UML)) {
    const i = s.lastIndexOf(k);
    if (i >= 0) out.add(s.slice(0, i) + v + s.slice(i + 1));
  }
  return [...out];
}

const ENDINGS = ['ERN', 'ELN', 'EN', 'EST', 'EM', 'ES', 'ER', 'ST', 'E', 'N', 'S', 'T'];

/** Bir kelimenin yasak öneklerini (kök + umlaut + ge-partisip biçimleri) üretir (≥4 harf). */
export function forbiddenStemsDe(word) {
  const W = (word || '').toUpperCase(); // veri zaten büyük harf (ß→SS)
  const stems = new Set([W]);
  for (const e of ENDINGS) {
    if (W.endsWith(e) && W.length - e.length >= 4) stems.add(W.slice(0, -e.length));
  }
  const set = new Set();
  for (const s of stems) {
    if (s.length < 4) continue;
    for (const v of umlautVariants(s)) {
      set.add(v); // kök + umlaut biçimi (läuft, Häuser…)
      set.add('GE' + v); // ge- önekli partisip (gelaufen, gesammelt…)
    }
  }
  return set;
}

/** Açıklama, kelimeyi/kökünü/çekimini/türevini ele veriyor mu? */
export function checkLeakDe(word, hint) {
  const W = (word || '').toUpperCase();
  if (!W || !hint) return false;
  const stems = forbiddenStemsDe(word);
  const tokens = (hint || '')
    .toUpperCase()
    .split(/[^A-ZÄÖÜ]+/)
    .filter(Boolean);
  for (const tok of tokens) {
    if (tok === W) return true; // kelimenin kendisi (kısa kelimeler dâhil)
    for (const s of stems) if (tok.startsWith(s)) return true; // kök/çekim/türev (sözcük başında)
  }
  return false;
}
