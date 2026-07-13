/**
 * Türkçe metin yardımcıları — saf, Angular'dan bağımsız.
 */

/**
 * Türkçe büyük harfe çevirir.
 *
 * Neden gerekli: JavaScript'in varsayılan `toUpperCase()` Türkçeyi yanlış yapar.
 *   'i'.toUpperCase()               → 'I'   ❌ (yanlış)
 *   'i'.toLocaleUpperCase('tr')     → 'İ'   ✅
 *   'ı'.toLocaleUpperCase('tr')     → 'I'   ✅
 */
export function trUpper(s: string): string {
  return s.toLocaleUpperCase('tr');
}
