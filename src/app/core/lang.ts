/**
 * Dil yardımcıları — saf, Angular'dan bağımsız.
 */
export type Lang = 'tr' | 'en';

/**
 * Dile göre büyük harf.
 *   TR: 'i'→'İ', 'ı'→'I'  (toLocaleUpperCase('tr'))
 *   EN: 'i'→'I'           (düz toUpperCase)
 * Kelime oyununda harf gösterimi/doğrulaması aktif dilin kurallarına uymalı.
 */
export function upperFor(s: string, lang: Lang): string {
  return lang === 'tr' ? s.toLocaleUpperCase('tr') : s.toUpperCase();
}
