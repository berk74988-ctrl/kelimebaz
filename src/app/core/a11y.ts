import { Guess, LetterState } from '../models/game.model';
import { Lang } from './lang';

/**
 * Ekran okuyucu metinleri — saf fonksiyonlar.
 *
 * Oyunun tüm bilgisi RENKLE veriliyor. Görme engelli bir oyuncu için
 * renk hiçbir şey ifade etmez; bu yüzden her harfin durumu KELİMEYLE
 * de söylenmek zorunda. Metinler aktif dile (tr/en/de) göre üretilir.
 */

/** Bir harf durumunun sözlü karşılığı. */
export function stateLabel(state: LetterState, lang: Lang = 'tr'): string {
  switch (state) {
    case 'correct':
      return lang === 'en' ? 'correct spot' : lang === 'de' ? 'richtige Stelle' : 'doğru yerde';
    case 'present':
      return lang === 'en'
        ? 'in the word, wrong spot'
        : lang === 'de'
          ? 'im Wort, falsche Stelle'
          : 'kelimede var, yeri yanlış';
    case 'absent':
      return lang === 'en' ? 'not in the word' : lang === 'de' ? 'nicht im Wort' : 'kelimede yok';
    default:
      return '';
  }
}

/** Tek bir kutunun ekran okuyucu etiketi. */
export function tileLabel(letter: string, state: LetterState, lang: Lang = 'tr'): string {
  if (!letter) return lang === 'en' ? 'empty' : lang === 'de' ? 'leer' : 'boş';
  if (state === 'empty') return letter;
  return `${letter}, ${stateLabel(state, lang)}`;
}

/** Gönderilen bir tahminin tamamının sözlü özeti. */
export function guessAnnouncement(guess: Guess, rowNumber: number, lang: Lang = 'tr'): string {
  const parts = guess.tiles.map((t) => `${t.letter} ${stateLabel(t.state, lang)}`);
  if (lang === 'en') return `Guess ${rowNumber}: ${parts.join(', ')}`;
  if (lang === 'de') return `Versuch ${rowNumber}: ${parts.join(', ')}`;
  return `${rowNumber}. tahmin: ${parts.join(', ')}`;
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
  if (lang === 'de') {
    return won
      ? `Glückwunsch, du hast das Wort in ${attempts} Versuchen gefunden. Wort: ${answer}`
      : `Spiel vorbei, nicht gefunden. Das richtige Wort: ${answer}`;
  }
  return won
    ? `Tebrikler, kelimeyi ${attempts} tahminde buldun. Kelime: ${answer}`
    : `Oyun bitti, bulamadın. Doğru kelime: ${answer}`;
}
