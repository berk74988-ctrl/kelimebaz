/**
 * 🤖 YZ YARIŞI — kazanan kuralı (saf, Angular'dan bağımsız → doğrudan test edilir).
 *
 * Yarış SIRA TABANLIDIR: oyuncu ve bot dönüşümlü tahmin yapar, ikisi de aynı
 * sayıda hak kullanır. Kazanan, kelimeyi DAHA AZ tahminde bulandır. İkisi de
 * aynı turda bulduysa (aynı tahmin sayısı) berabere. Süre/hız kazananı belirlemez.
 */
export type RaceOutcome = 'win' | 'lose' | 'draw';

export interface RaceSide {
  solved: boolean;
  /** Kullanılan tahmin sayısı (çözüldüyse kaçıncı turda). */
  attempts: number;
}

/** Oyuncu (me) ve bot (ai) sonuçlarına göre yarışın sonucu. */
export function raceOutcome(me: RaceSide, ai: RaceSide): RaceOutcome {
  if (me.solved && ai.solved) {
    // İkisi de çözdü → daha az tahminde bulan kazanır; eşitse berabere.
    if (me.attempts < ai.attempts) return 'win';
    if (me.attempts > ai.attempts) return 'lose';
    return 'draw';
  }
  if (me.solved) return 'win'; // yalnız oyuncu çözdü
  if (ai.solved) return 'lose'; // yalnız bot çözdü
  return 'draw'; // ikisi de çözemedi
}
