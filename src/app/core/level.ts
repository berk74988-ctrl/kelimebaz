/**
 * SEVİYE — saf fonksiyon, Angular'dan bağımsız.
 *
 * Her seviye bir öncekinden PAHALIDIR: n. seviyeden (n+1)'e geçmek için
 * `STEP × n` puan gerekir.
 *
 *   Seviye 2 →   100 puan
 *   Seviye 3 →   300   (100 + 200)
 *   Seviye 4 →   600   (+300)
 *   Seviye 5 → 1.000   (+400)
 *
 * Kapalı biçim: L seviyesine ulaşmak için gereken toplam = STEP × L × (L−1) / 2
 * Artan maliyet, ilk seviyelerin hızlı geçmesini ama ilerlemenin anlam
 * kazanmasını sağlar.
 */
export const STEP = 100;

/** L seviyesine ulaşmak için gereken TOPLAM puan. */
export function pointsForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (STEP * l * (l - 1)) / 2;
}

export interface LevelInfo {
  /** Ulaşılan seviye (1'den başlar). */
  level: number;
  /** Bu seviyede biriken puan. */
  into: number;
  /** Sonraki seviye için bu seviyede gereken toplam puan. */
  need: number;
  /** Sonraki seviyeye ilerleme, 0–1 arası. */
  progress: number;
  /** Sonraki seviyeye kalan puan. */
  remaining: number;
}

/**
 * Puandan seviye ve ilerleme.
 *
 * Karesel denklemi çözmek yerine döngü kullanıyorum: okunur, test edilebilir
 * ve kayan nokta yuvarlama hatası riski yok. Seviye sayısı küçük olduğu için
 * maliyeti de yok.
 */
export function levelInfo(points: number): LevelInfo {
  const p = Math.max(0, Math.floor(points || 0));

  let level = 1;
  while (pointsForLevel(level + 1) <= p) level++;

  const base = pointsForLevel(level);
  const need = pointsForLevel(level + 1) - base;
  const into = p - base;

  return {
    level,
    into,
    need,
    progress: need === 0 ? 0 : into / need,
    remaining: need - into,
  };
}
