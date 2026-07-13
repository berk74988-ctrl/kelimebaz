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

/** Oyun modu. */
export type GameMode = 'daily' | 'practice';

/** localStorage'a yazılan oyun durumu. */
export interface SavedGame {
  mode: GameMode;
  dayIndex: number; // günlük modda hangi güne ait (serbest modda -1)
  answer: string;
  guesses: string[];
  status: GameStatus;
}

/** Oyuncu istatistikleri. */
export interface Stats {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  /** distribution[i] = (i+1) tahminde kazanılan oyun sayısı */
  distribution: number[];
}

export const EMPTY_STATS: Stats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0, 0, 0, 0],
};

export const WORD_LENGTH = 5;
export const MAX_ATTEMPTS = 6;
