/**
 * OTOMATİK ÜRETİLDİ — scripts/build-ai-openers.mjs (elle düzenleme).
 *
 * YZ açılış kelimeleri: her dil × kelime uzunluğu için EN YÜKSEK ENTROPİLİ ilk
 * tahmin. Derleme zamanında hesaplanır → çalışma zamanında ilk tur gecikmesi yok.
 * Yeniden üretmek: node scripts/build-ai-openers.mjs
 */
export const AI_OPENERS: Record<'tr' | 'en', Record<number, string>> = {
  tr: { 4: 'KARA', 5: 'MERAK', 6: 'MARTİN', 7: 'KARİDES' },
  en: { 4: 'LATE', 5: 'TEARS', 6: 'SENIOR', 7: 'PARTIES' },
};
