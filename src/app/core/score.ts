import { MAX_ATTEMPTS } from '../models/game.model';

/**
 * PUAN — saf fonksiyon, Angular'dan bağımsız.
 *
 * Üç bileşen:
 *   TEMEL      kazanınca sabit 100
 *   HIZ        erken bulmak ödüllendirilir: kalan her hak +20
 *              (1. tahminde 200, 6. tahminde 100)
 *   SERİ       üst üste kazanmak ödüllendirilir: seri × 5, en fazla +50
 *
 * Kaybedince 10 puan verilir — sıfır vermek, kaybeden oyuncunun profilini
 * tamamen ölü bırakırdı; oynamanın kendisi de bir şeydir.
 */
export const WIN_BASE = 100;
export const SPEED_BONUS = 20;
export const STREAK_BONUS = 5;
export const MAX_STREAK_BONUS = 50;
export const LOSS_POINTS = 10;

/**
 * Bir oyunun puanı.
 *
 * @param won       kazanıldı mı
 * @param attempts  kaç tahminde (1–6)
 * @param streak    oyun SONRASI güncel seri (kazanınca artmış hâli)
 */
export function scoreFor(won: boolean, attempts: number, streak: number): number {
  if (!won) return LOSS_POINTS;

  const tries = Math.max(1, Math.min(MAX_ATTEMPTS, attempts));
  const speed = (MAX_ATTEMPTS - tries) * SPEED_BONUS;
  const bonus = Math.min(MAX_STREAK_BONUS, Math.max(0, streak) * STREAK_BONUS);

  return WIN_BASE + speed + bonus;
}
