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

/**
 * ALTIN AYARLARI — sunucudan yönetilebilir (bkz. core/balance.ts). Varsayılanlar
 * yukarıdaki gömülü sabitlerdir; `goldForGame`/`levelBonus` isteğe bağlı bir cfg
 * alır (verilmezse gömülü varsayılan). Böylece saf ve geriye uyumlu kalır.
 */
export interface GoldConfig {
  winGold: number;
  speedGold: number;
  dailyBonus: number;
  lossGold: number;
  levelGold: number;
  levelGoldCap: number;
}
export const GOLD_DEFAULTS: GoldConfig = {
  winGold: WIN_GOLD,
  speedGold: SPEED_GOLD,
  dailyBonus: DAILY_BONUS,
  lossGold: LOSS_GOLD,
  levelGold: 4,
  levelGoldCap: 40,
};

/**
 * SEVİYE ÖDÜLÜ — oyuncu seviyesi yükseldikçe her galibiyette KADEMELİ artan bonus.
 *
 *   Seviye 1 → +0    Seviye 2 → +4    Seviye 3 → +8    Seviye 5 → +16 ...
 *
 * Ekonomiyi neden bozmaz:
 *   - Sadece KAZANINCA verilir (kaybedince yok).
 *   - Bir TAVANDA durur (LEVEL_GOLD_CAP); sonsuza gitmez.
 *   - Tavana ulaşmak için ~seviye 11 gerekir; oraya ancak düzinelerce galibiyetle
 *     çıkılır. Yani bonusu hak eden zaten çok oynamış, sadık bir oyuncudur.
 *   - Temel kazanç 20–55; tavan bonus +40 → en fazla ~2 kat, mağaza fiyatlarına
 *     (80–350) göre makul.
 */
export const LEVEL_GOLD = 4; // her seviye için ek
export const LEVEL_GOLD_CAP = 40; // üst sınır (≈ seviye 11'de dolar)

/** Verilen seviyenin galibiyet başına ek altını. */
export function levelBonus(level: number, cfg: GoldConfig = GOLD_DEFAULTS): number {
  const l = Math.max(1, Math.floor(level || 1));
  return Math.min(cfg.levelGoldCap, (l - 1) * cfg.levelGold);
}

/** Bir oyunun sonunda kazanılan altın (seviye ödülü dâhil). */
export function goldForGame(
  won: boolean,
  attempts: number,
  isDaily: boolean,
  level = 1,
  cfg: GoldConfig = GOLD_DEFAULTS,
): number {
  if (!won) return cfg.lossGold;

  const tries = Math.max(1, Math.min(MAX_ATTEMPTS, attempts));
  const speed = (MAX_ATTEMPTS - tries) * cfg.speedGold;

  return cfg.winGold + speed + (isDaily ? cfg.dailyBonus : 0) + levelBonus(level, cfg);
}
