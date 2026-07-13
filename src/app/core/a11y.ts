import { Guess, LetterState } from '../models/game.model';

/**
 * Ekran okuyucu metinleri — saf fonksiyonlar.
 *
 * Oyunun tüm bilgisi RENKLE veriliyor. Görme engelli bir oyuncu için
 * renk hiçbir şey ifade etmez; bu yüzden her harfin durumu KELİMEYLE
 * de söylenmek zorunda.
 */

/** Bir harf durumunun sözlü karşılığı. */
export function stateLabel(state: LetterState): string {
  switch (state) {
    case 'correct':
      return 'doğru yerde';
    case 'present':
      return 'kelimede var, yeri yanlış';
    case 'absent':
      return 'kelimede yok';
    default:
      return '';
  }
}

/** Tek bir kutunun ekran okuyucu etiketi. */
export function tileLabel(letter: string, state: LetterState): string {
  if (!letter) return 'boş';
  if (state === 'empty') return letter;
  return `${letter}, ${stateLabel(state)}`;
}

/** Gönderilen bir tahminin tamamının sözlü özeti. */
export function guessAnnouncement(guess: Guess, rowNumber: number): string {
  const parts = guess.tiles.map((t) => `${t.letter} ${stateLabel(t.state)}`);
  return `${rowNumber}. tahmin: ${parts.join(', ')}`;
}

/** Oyun sonucunun sözlü duyurusu. */
export function resultAnnouncement(won: boolean, attempts: number, answer: string): string {
  return won
    ? `Tebrikler, kelimeyi ${attempts} tahminde buldun. Kelime: ${answer}`
    : `Oyun bitti, bulamadın. Doğru kelime: ${answer}`;
}
