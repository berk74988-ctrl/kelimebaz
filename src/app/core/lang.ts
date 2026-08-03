/**
 * Dil yardımcıları — saf, Angular'dan bağımsız.
 */
export type Lang = 'tr' | 'en' | 'de';

/**
 * Dile göre büyük harf.
 *   TR: 'i'→'İ', 'ı'→'I'  (toLocaleUpperCase('tr'))
 *   EN: 'i'→'I'           (düz toUpperCase)
 *   DE: 'ä'→'Ä' vb.       (düz toUpperCase; ß veri havuzundan hariç tutulur)
 * Kelime oyununda harf gösterimi/doğrulaması aktif dilin kurallarına uymalı.
 */
export function upperFor(s: string, lang: Lang): string {
  return lang === 'tr' ? s.toLocaleUpperCase('tr') : s.toUpperCase();
}
