import { guessAnnouncement, resultAnnouncement, stateLabel, tileLabel } from './a11y';
import { Guess, LetterState, Tile } from '../models/game.model';

function guess(word: string, states: LetterState[]): Guess {
  const tiles: Tile[] = [...word].map((letter, i) => ({ letter, state: states[i] }));
  return { word, tiles };
}

describe('Ekran okuyucu metinleri', () => {
  describe('durum sözcüğe çevrilir (renk yeterli değil)', () => {
    it('her durumun sözlü karşılığı vardır', () => {
      expect(stateLabel('correct')).toBe('doğru yerde');
      expect(stateLabel('present')).toBe('kelimede var, yeri yanlış');
      expect(stateLabel('absent')).toBe('kelimede yok');
    });
  });

  describe('kutu etiketi', () => {
    it('boş kutu "boş" der', () => {
      expect(tileLabel('', 'empty')).toBe('boş');
    });

    it('yazılmış ama değerlendirilmemiş kutu sadece harfi söyler', () => {
      expect(tileLabel('K', 'empty')).toBe('K');
    });

    it('değerlendirilmiş kutu harfi VE durumunu söyler', () => {
      expect(tileLabel('K', 'correct')).toBe('K, doğru yerde');
      expect(tileLabel('A', 'present')).toBe('A, kelimede var, yeri yanlış');
      expect(tileLabel('Z', 'absent')).toBe('Z, kelimede yok');
    });
  });

  describe('tahmin duyurusu', () => {
    it('tüm harfleri ve durumlarını okur', () => {
      const text = guessAnnouncement(
        guess('KALEM', ['correct', 'present', 'absent', 'absent', 'correct']),
        1,
      );

      expect(text).toBe(
        '1. tahmin: K doğru yerde, A kelimede var, yeri yanlış, L kelimede yok, E kelimede yok, M doğru yerde',
      );
    });

    it('kaçıncı tahmin olduğunu söyler', () => {
      const text = guessAnnouncement(guess('KİTAP', ['absent', 'absent', 'absent', 'absent', 'absent']), 4);
      expect(text.startsWith('4. tahmin:')).toBe(true);
    });
  });

  describe('sonuç duyurusu', () => {
    it('kazanınca tebrik eder ve kaç tahminde olduğunu söyler', () => {
      expect(resultAnnouncement(true, 3, 'KALEM')).toBe(
        'Tebrikler, kelimeyi 3 tahminde buldun. Kelime: KALEM',
      );
    });

    it('kaybedince DOĞRU KELİMEYİ okur', () => {
      const text = resultAnnouncement(false, 6, 'ÇİÇEK');

      expect(text).toContain('bulamadın');
      expect(text).toContain('ÇİÇEK'); // ekran okuyucu cevabı duyurur
    });
  });
});
