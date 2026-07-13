/**
 * KELİMEBAZ — Temel oyun tipleri.
 * Oyun mantığı geliştikçe burası genişler.
 */

/** Bir harfin tahmin sonrası durumu. */
export type LetterState =
  | 'correct' // harf doğru, yeri de doğru
  | 'present' // harf kelimede var, yeri yanlış
  | 'absent' // harf kelimede yok
  | 'empty'; // henüz değerlendirilmedi

/** Tahmin edilen tek bir harf kutusu. */
export interface Tile {
  letter: string;
  state: LetterState;
}

/** Tek bir tahmin satırı. */
export type Guess = Tile[];

/** Oyunun genel durumu. */
export type GameStatus = 'idle' | 'playing' | 'won' | 'lost';

/** Bir oyun turunun tamamı. */
export interface GameState {
  answer: string;
  guesses: Guess[];
  currentRow: number;
  status: GameStatus;
}

/** Oyun ayarları. */
export interface GameConfig {
  wordLength: number;
  maxAttempts: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  wordLength: 5,
  maxAttempts: 6,
};
