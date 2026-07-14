/**
 * ===========================================================================
 * GÜNLÜK GÖREVLER
 *
 * Görevler bir KAYIT DEFTERİNDEN okunur — şablonda tek tek yazılmaz.
 * Yeni bir görev eklemek:
 *   1. Gerekiyorsa DayProgress'e sayaç ekle (ve gameEnded'da güncelle)
 *   2. QUESTS'e bir satır ekle
 * Bitti — profil sayfası, ilerleme çubukları ve testler kendiliğinden uyar.
 *
 * Görevler her gün sıfırlanır. "Gün" oyuncunun YEREL gününe göre belirlenir
 * (WordService.dayIndex ile aynı) — günün kelimesiyle aynı ritimde döner.
 * ===========================================================================
 */

/** O günkü ilerleme — her yeni günde sıfırlanır. */
export interface DayProgress {
  /** Hangi gün (WordService.dayIndex). Değişince her şey sıfırlanır. */
  day: number;
  /** Bugün oynanan oyun sayısı. */
  played: number;
  /** Bugün kazanılan oyun sayısı. */
  won: number;
  /** Bugün en az kaç tahminde kazanıldı (hiç kazanılmadıysa null). */
  bestAttempts: number | null;
  /** Bugünün kelimesi çözüldü mü. */
  dailySolved: boolean;
  /** Ödülü ALINMIŞ görevlerin kimlikleri — iki kez ödeme yapılmasın diye. */
  claimed: string[];
}

export function emptyDay(day: number): DayProgress {
  return { day, played: 0, won: 0, bestAttempts: null, dailySolved: false, claimed: [] };
}

export interface Quest {
  /** Kararlı kimlik — ödül kaydı buna bağlı, DEĞİŞTİRME. */
  id: string;
  icon: string;
  label: string;
  /** Altın ödülü. */
  reward: number;
  /** Görevin tamamlanması için gereken sayı. */
  goal: number;
  /** O ana kadarki ilerleme. */
  progress: (p: DayProgress) => number;
}

export const QUESTS: readonly Quest[] = [
  {
    id: 'play1',
    icon: '🎲',
    label: 'Bir oyun oyna',
    reward: 10,
    goal: 1,
    progress: (p) => p.played,
  },
  {
    id: 'win1',
    icon: '🎯',
    label: 'Bir oyun kazan',
    reward: 25,
    goal: 1,
    progress: (p) => p.won,
  },
  {
    id: 'daily',
    icon: '📅',
    label: 'Günün kelimesini çöz',
    reward: 30,
    goal: 1,
    progress: (p) => (p.dailySolved ? 1 : 0),
  },
  {
    id: 'fast',
    icon: '⚡',
    label: '4 tahminde veya daha erken kazan',
    reward: 40,
    goal: 1,
    progress: (p) => (p.bestAttempts !== null && p.bestAttempts <= 4 ? 1 : 0),
  },
  {
    id: 'play3',
    icon: '🔁',
    label: '3 oyun oyna',
    reward: 20,
    goal: 3,
    progress: (p) => p.played,
  },
];

/** Görev tamamlandı mı? */
export function isComplete(q: Quest, p: DayProgress): boolean {
  return q.progress(p) >= q.goal;
}

/** Ödülü henüz alınmamış ve tamamlanmış görevler. */
export function pendingRewards(p: DayProgress): Quest[] {
  return QUESTS.filter((q) => isComplete(q, p) && !p.claimed.includes(q.id));
}

/** Bir oyunun sonucunu günlük ilerlemeye işler (saf — yeni nesne döner). */
export function gameEnded(
  p: DayProgress,
  won: boolean,
  attempts: number,
  isDaily: boolean,
): DayProgress {
  return {
    ...p,
    played: p.played + 1,
    won: p.won + (won ? 1 : 0),
    bestAttempts: won ? Math.min(p.bestAttempts ?? Infinity, attempts) : p.bestAttempts,
    dailySolved: p.dailySolved || (won && isDaily),
    claimed: [...p.claimed],
  };
}
