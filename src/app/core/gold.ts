import { MAX_ATTEMPTS } from '../models/game.model';

/**
 * ALTIN — saf fonksiyonlar, Angular'dan bağımsız.
 *
 * Puandan (core/score.ts) FARKLI bir para birimi:
 *   PUAN   → seviye ilerlemesi. Harcanmaz, sadece birikir.
 *   ALTIN  → mağaza parası. Harcanır, azalır.
 *
 * İkisini ayrı tutmak şart: altını harcayınca seviyenin düşmesi saçma olurdu.
 */
export const WIN_GOLD = 20; // kazanınca temel
export const SPEED_GOLD = 5; // kalan her hak için ek
export const DAILY_BONUS = 10; // günün kelimesi ekstra ödüllendirilir
export const LOSS_GOLD = 2; // kaybedince de az bir şey

/** Bir oyunun sonunda kazanılan altın. */
export function goldForGame(won: boolean, attempts: number, isDaily: boolean): number {
  if (!won) return LOSS_GOLD;

  const tries = Math.max(1, Math.min(MAX_ATTEMPTS, attempts));
  const speed = (MAX_ATTEMPTS - tries) * SPEED_GOLD;

  return WIN_GOLD + speed + (isDaily ? DAILY_BONUS : 0);
}
