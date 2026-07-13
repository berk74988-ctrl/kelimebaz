import { GameMode, GameStatus, Guess, LetterState } from '../models/game.model';

/**
 * Paylaşım metni — saf fonksiyonlar, Angular'dan bağımsız.
 *
 * ÖNEMLİ: Çıktı ASLA harf içermez. Sadece emoji ızgarası + skor.
 * Böylece sonucunu paylaşınca kimseye spoiler vermezsin.
 */

/** Bir harf durumunu emojiye çevirir. */
export function toEmoji(state: LetterState): string {
  switch (state) {
    case 'correct':
      return '🟩';
    case 'present':
      return '🟨';
    default:
      return '⬜'; // absent ve empty
  }
}

/** Tahminlerden emoji ızgarası üretir — her satır bir tahmin. */
export function buildShareGrid(guesses: readonly Guess[]): string {
  return guesses.map((g) => g.tiles.map((t) => toEmoji(t.state)).join('')).join('\n');
}

export interface ShareInfo {
  mode: GameMode;
  dayIndex: number;
  status: GameStatus;
  attempts: number;
  maxAttempts: number;
  guesses: readonly Guess[];
}

/**
 * Paylaşılacak tam metni üretir.
 *
 * Günlük:  "Kelimebaz #193 3/6"
 * Serbest: "Kelimebaz (serbest) 3/6"
 * Kayıp:   "... X/6"
 */
export function buildShareText(info: ShareInfo): string {
  const title = info.mode === 'daily' ? `Kelimebaz #${info.dayIndex}` : 'Kelimebaz (serbest)';
  const score = info.status === 'won' ? `${info.attempts}/${info.maxAttempts}` : `X/${info.maxAttempts}`;
  const grid = buildShareGrid(info.guesses);

  return `${title} ${score}\n\n${grid}`;
}
