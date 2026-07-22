import { Guess, LetterState } from '../models/game.model';
import { Lang } from './lang';

/**
 * Ekran okuyucu metinleri — saf fonksiyonlar.
 *
 * Oyunun tüm bilgisi RENKLE veriliyor. Görme engelli bir oyuncu için
 * renk hiçbir şey ifade etmez; bu yüzden her harfin durumu KELİMEYLE
 * de söylenmek zorunda. Metinler aktif dile (tr/en) göre üretilir.
 */

/** Bir harf durumunun sözlü karşılığı. */
export function stateLabel(state: LetterState, lang: Lang = 'tr'): string {
  const en = lang === 'en';
  switch (state) {
    case 'correct':
      return en ? 'correct spot' : 'doğru yerde';
    case 'present':
      return en ? 'in the word, wrong spot' : 'kelimede var, yeri yanlış';
    case 'absent':
      return en ? 'not in the word' : 'kelimede yok';
    default:
      return '';
  }
}

/** Tek bir kutunun ekran okuyucu etiketi. */
export function tileLabel(letter: string, state: LetterState, lang: Lang = 'tr'): string {
  if (!letter) return lang === 'en' ? 'empty' : 'boş';
  if (state === 'empty') return letter;
  return `${letter}, ${stateLabel(state, lang)}`;
}

/** Gönderilen bir tahminin tamamının sözlü özeti. */
export function guessAnnouncement(guess: Guess, rowNumber: number, lang: Lang = 'tr'): string {
  const parts = guess.tiles.map((t) => `${t.letter} ${stateLabel(t.state, lang)}`);
  return lang === 'en'
    ? `Guess ${rowNumber}: ${parts.join(', ')}`
    : `${rowNumber}. tahmin: ${parts.join(', ')}`;
}

/** Oyun sonucunun sözlü duyurusu. */
export function resultAnnouncement(
  won: boolean,
  attempts: number,
  answer: string,
  lang: Lang = 'tr',
): string {
  if (lang === 'en') {
    return won
      ? `Congratulations, you found the word in ${attempts} guesses. Word: ${answer}`
      : `Game over, you didn't find it. The correct word: ${answer}`;
  }
  return won
    ? `Tebrikler, kelimeyi ${attempts} tahminde buldun. Kelime: ${answer}`
    : `Oyun bitti, bulamadın. Doğru kelime: ${answer}`;
}
