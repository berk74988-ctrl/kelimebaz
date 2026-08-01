import { Lang, upperFor } from './lang';

/**
 * ===========================================================================
 * SESLİ GİRİŞ — saf metin→harf indirgeme (Angular yok, doğrudan test edilir).
 *
 * Web Speech API'nin döndürdüğü serbest metni oyunun harf alfabesine indirger:
 * aktif dile göre BÜYÜK harf yapar, alfabe DIŞI her şeyi (boşluk, noktalama,
 * rakam, yabancı harf) atar ve kelime uzunluğuna kırpar.
 *
 * Boşlukların atılması iki söyleme biçimini de destekler:
 *   "kalem"      → KALEM
 *   "k a l e m"  → KALEM   (harf harf söyleme)
 *
 * GİZLİLİK/GÜVENLİK: bu fonksiyon yalnız metni dönüştürür; hiçbir gönderim/işlem
 * yapmaz. Tanınan kelime çağıran tarafça TAHTAYA yazılır, GÖNDERİLMEZ.
 * ===========================================================================
 */

/** Oyunun geçerli harfleri (klavye alfabesiyle aynı; TR: Q/W/X yok). */
const LETTERS: Record<Lang, ReadonlySet<string>> = {
  tr: new Set([...'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ']),
  en: new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']),
};

/**
 * Tanınan metni oyunun harflerine indir. `maxLen` verilirse o kadar harfe kırpar
 * (kelime uzunluğu); boş/geçersizse boş dönerz — çağıran "anlaşılamadı" gösterir.
 */
export function voiceToLetters(transcript: string, lang: Lang, maxLen = Infinity): string {
  const set = LETTERS[lang];
  const letters = [...upperFor(transcript ?? '', lang)].filter((c) => set.has(c));
  return letters.slice(0, maxLen).join('');
}
