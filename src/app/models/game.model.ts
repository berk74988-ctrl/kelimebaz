/** KELİMEBAZ — oyun tipleri */

/** Bir harfin tahmin sonrası durumu. */
export type LetterState =
  | 'correct' // 🟩 harf doğru, yeri doğru
  | 'present' // 🟨 harf kelimede var, yeri yanlış
  | 'absent' // ⬜ harf kelimede yok
  | 'empty'; // henüz değerlendirilmedi

/** Tahtadaki tek bir harf kutusu. */
export interface Tile {
  letter: string;
  state: LetterState;
}

/** Değerlendirilmiş tek bir tahmin satırı. */
export interface Guess {
  word: string;
  tiles: Tile[];
}

/** Oyunun genel durumu. */
export type GameStatus = 'playing' | 'won' | 'lost';

/** Oyun modu. 'room' = çok oyunculu oda yarışı; 'vsai' = yapay zekâ rakibe karşı tek kişilik yarış. */
export type GameMode = 'daily' | 'practice' | 'room' | 'vsai';

/** localStorage'a yazılan oyun durumu. */
export interface SavedGame {
  mode: GameMode;
  dayIndex: number; // günlük modda hangi güne ait (serbest modda -1)
  answer: string;
  guesses: string[];
  status: GameStatus;
  /** Kaydın dili — dil değişince eski dildeki oyun sürdürülmez, taze başlar. */
  lang?: 'tr' | 'en';
}

/**
 * Oyuncu istatistikleri — localStorage şeması ("kelimebaz:stats").
 *
 * {
 *   played: 12,                          // oynanan oyun
 *   won: 9,                              // kazanılan oyun
 *   currentStreak: 3,                    // şu anki kazanma serisi
 *   maxStreak: 5,                        // en uzun seri
 *   distribution: [1,2,3,2,1,0],         // kaçıncı tahminde kazanıldığı
 *   lastWinAttempts: 4                   // son kazanılan oyun kaç tahminde (grafikte vurgulanır)
 * }
 */
/**
 * Oyuncu istatistikleri.
 *
 * YENİ ALAN EKLERKEN: buraya bir alan, EMPTY_STATS'a varsayılanı, ve
 * core/profile-stats.ts'e bir kayıt yeter. Eski kayıtlar StatsService.load()
 * tarafından varsayılanla tamamlanır — göç kodu yazmaya gerek yok.
 */
export interface Stats {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  /** distribution[i] = (i+1). tahminde kazanılan oyun sayısı */
  distribution: number[];
  /** Son kazanılan oyunun tahmin sayısı; hiç kazanılmadıysa null. */
  lastWinAttempts: number | null;
  /** Toplam puan — seviye bundan hesaplanır (core/level.ts). */
  points: number;
  /** Şimdiye kadar tahtaya yazılan geçerli kelime sayısı (kazanılan + kaybedilen). */
  guesses: number;
}

export const EMPTY_STATS: Stats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0, 0, 0, 0],
  lastWinAttempts: null,
  points: 0,
  guesses: 0,
};

/** Varsayılan/yedek uzunluk. Oyun artık 4-7 harf kullanır (bkz. core/word-length.ts);
    her oyunun uzunluğu cevabın harf sayısından türetilir. */
export const WORD_LENGTH = 5;
export const MIN_WORD_LENGTH = 4;
export const MAX_WORD_LENGTH = 7;
export const MAX_ATTEMPTS = 6;
