import { GameMode, GameStatus, Guess, LetterState } from '../models/game.model';
import { Lang } from './lang';
import { MESSAGES } from './messages';

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
  /** Aktif dil — başlık buna göre çevrilir. share.ts saf çekirdek olduğu için
   *  LanguageService enjekte edilemez; dil parametre olarak gelir. */
  lang: Lang;
}

/** Mod → başlık i18n anahtarı (günlük hariç; günlük gün numarası içerir). */
const MODE_KEY: Record<Exclude<GameMode, 'daily'>, string> = {
  practice: 'share.practice',
  room: 'share.room',
  vsai: 'share.vsai',
};

/** Moda ve dile göre paylaşım başlığı. Marka adı ("Kelimebaz") iki dilde de aynı. */
function shareTitle(info: ShareInfo): string {
  if (info.mode === 'daily') return `Kelimebaz #${info.dayIndex}`;
  return MESSAGES[MODE_KEY[info.mode]][info.lang];
}

/**
 * Paylaşılacak tam metni üretir (aktif dile göre).
 *
 * Günlük:   "Kelimebaz #193 3/6"
 * Serbest:  TR "Kelimebaz (serbest) 3/6" · EN "Kelimebaz (free play) 3/6"
 * Arkadaş:  TR "Kelimebaz (arkadaş yarışı)" · EN "Kelimebaz (friend match)"
 * YZ:       TR "Kelimebaz (YZ'ye karşı)" · EN "Kelimebaz (vs AI)"
 * Kayıp:    "... X/6"
 */
export function buildShareText(info: ShareInfo): string {
  const title = shareTitle(info);
  const score = info.status === 'won' ? `${info.attempts}/${info.maxAttempts}` : `X/${info.maxAttempts}`;
  const grid = buildShareGrid(info.guesses);

  return `${title} ${score}\n\n${grid}`;
}
