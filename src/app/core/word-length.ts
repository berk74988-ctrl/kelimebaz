/**
 * KELİMEBAZ — kelime uzunluğu seçimi (saf çekirdek, Angular'dan bağımsız).
 *
 * Oyun artık 4, 5, 6 ve 7 harfli kelimeler kullanır. Uzunluk oyuncunun
 * SEVİYESİNE göre olasılıksal seçilir:
 *   - Düşük seviyelerde kısa kelimeler (4-5) ağır basar.
 *   - Seviye yükseldikçe uzun kelime (6-7) olasılığı KADEMELİ artar.
 *   - Her uzunluğun daima >0 şansı vardır → hiçbir bölüm hep aynı uzunlukta
 *     olmaz (çeşitlilik ve tekrar oynanabilirlik).
 *
 * Ağırlık şekli bir "çadır" (tent): merkez uzunluk seviyeyle 4.3'ten 6.7'ye
 * kayar; merkeze yakın uzunluklar ağır, uzak olanlar taban değere iner.
 */

export const WORD_LENGTHS = [4, 5, 6, 7] as const;
export type WordLength = (typeof WORD_LENGTHS)[number];

const SLOPE = 0.7; // çadırın eğimi — merkezden uzaklaştıkça ağırlık düşüşü
const FLOOR = 0.08; // en düşük ağırlık — asla sıfır olmaz (çeşitlilik)

/** Seviyeye göre her uzunluğun (normalize edilmemiş) ağırlığı. */
export function lengthWeights(level: number): Record<number, number> {
  const lv = Math.max(1, Math.floor(level || 1));
  const d = Math.min(1, (lv - 1) / 12); // 0 (sv1) → 1 (sv13+)
  const target = 4.3 + d * 2.4; // 4.3 → 6.7
  const w: Record<number, number> = {};
  for (const L of WORD_LENGTHS) {
    w[L] = Math.max(FLOOR, 1 - Math.abs(L - target) * SLOPE);
  }
  return w;
}

/**
 * Seviyeye göre bir kelime uzunluğu seç.
 * @param r [0,1) test için sabitlenebilir rastgele değer.
 */
export function pickLength(level: number, r: number = Math.random()): WordLength {
  const w = lengthWeights(level);
  const total = WORD_LENGTHS.reduce((s, L) => s + w[L], 0);
  let x = Math.min(0.999999, Math.max(0, r)) * total;
  for (const L of WORD_LENGTHS) {
    if (x < w[L]) return L;
    x -= w[L];
  }
  return 5;
}
