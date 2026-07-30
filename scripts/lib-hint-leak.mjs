/**
 * Türkçe ipucu sızıntı denetimi (ortak kütüphane).
 * checkLeak(word, hint) → açıklama cevabı ele veriyorsa true.
 *
 * Türkçe SONEKLİDİR: çekim/türev ekleri kelimenin SONUNA gelir, önüne değil. Yani
 * bir sızıntı her zaman bir sözcüğün BAŞINDA belirir (KİTAP→"kitaplık", EV→"evde").
 * Bu yüzden her sözcüğün başını, kelimenin kendisi ve ünsüz-yumuşamalı biçimiyle
 * karşılaştırırız (KİTAP→KİTAB, AĞAÇ→AĞAC, RENK→RENG ...).
 */

// Son ünsüz yumuşaması (p→b, ç→c, t→d, k→ğ/g)
const SOFTEN = { P: 'B', Ç: 'C', T: 'D', K: 'Ğ', G: 'Ğ' };

/** Bir kelimenin yasak öneklerini (kendisi + yumuşamış biçim) üretir. */
export function forbiddenStems(word) {
  const W = (word || '').toLocaleUpperCase('tr');
  const set = new Set();
  if (W.length >= 3) set.add(W);
  const last = W[W.length - 1];
  if (SOFTEN[last] && W.length >= 4) set.add(W.slice(0, -1) + SOFTEN[last]);
  // 'k' çift biçim: KÖPEK→KÖPEĞ ve KÖPEG olası; ikisini de ekle
  if (last === 'K' && W.length >= 4) set.add(W.slice(0, -1) + 'G');
  return set;
}

/** Açıklama, kelimeyi/kökünü/çekimini içeriyor mu? */
export function checkLeak(word, hint) {
  const stems = forbiddenStems(word);
  if (!stems.size || !hint) return false;
  const tokens = (hint || '')
    .toLocaleUpperCase('tr')
    .split(/[^A-ZÇĞİÖŞÜ]+/) // Türkçe harf dışı her şey ayraç (İ ve I dahil)
    .filter(Boolean);
  for (const tok of tokens) {
    for (const s of stems) {
      if (tok.startsWith(s)) return true; // sözcük başı = çekim eki sızıntısı
    }
  }
  return false;
}
