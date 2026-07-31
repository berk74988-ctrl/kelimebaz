import { GameStatus, Guess, LetterState } from '../models/game.model';

/**
 * Paylaşım metni — saf fonksiyonlar, Angular'dan VE çeviri sözlüğünden bağımsız.
 *
 * ÖNEMLİ: Çıktı ASLA harf içermez. Sadece emoji ızgarası + skor.
 * Böylece sonucunu paylaşınca kimseye spoiler vermezsin.
 *
 * Başlık (dile göre çevrili) DIŞARIDAN gelir (GameService hazırlar) — böylece bu
 * saf dosya i18n'e bağımlı kalmaz ve çeviriler tembel yüklenebilir.
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
  /** Dile göre HAZIR başlık (GameService üretir), ör. "Kelimebaz #193" ya da
   *  "Kelimebaz (free play)". Skor bu başlığın sonuna eklenir. */
  title: string;
  status: GameStatus;
  attempts: number;
  maxAttempts: number;
  guesses: readonly Guess[];
}

/**
 * Paylaşılacak tam metni üretir.
 *
 *   "<başlık> 3/6\n\n<emoji ızgarası>"   (kayıpta skor "X/6")
 *
 * Başlık dile göre GameService'te hazırlanır (günlük: "Kelimebaz #193";
 * serbest/oda/YZ: çevrili kip metni). Bu dosya çeviriyi hiç bilmez.
 */
export function buildShareText(info: ShareInfo): string {
  const score =
    info.status === 'won' ? `${info.attempts}/${info.maxAttempts}` : `X/${info.maxAttempts}`;
  const grid = buildShareGrid(info.guesses);

  return `${info.title} ${score}\n\n${grid}`;
}
