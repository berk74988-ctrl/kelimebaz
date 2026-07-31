import { buildShareGrid, buildShareText, toEmoji } from './share';
import { Guess, LetterState, Tile } from '../models/game.model';

function guess(word: string, states: LetterState[]): Guess {
  const tiles: Tile[] = [...word].map((letter, i) => ({ letter, state: states[i] }));
  return { word, tiles };
}

const G: LetterState = 'correct';
const Y: LetterState = 'present';
const B: LetterState = 'absent';

describe('Paylaşım metni', () => {
  it('durumları doğru emojiye çevirir', () => {
    expect(toEmoji('correct')).toBe('🟩');
    expect(toEmoji('present')).toBe('🟨');
    expect(toEmoji('absent')).toBe('⬜');
    expect(toEmoji('empty')).toBe('⬜');
  });

  describe('emoji ızgarası', () => {
    it('sonuca BİREBİR uyar', () => {
      const grid = buildShareGrid([
        guess('KİTAP', [G, B, B, Y, B]),
        guess('KALEM', [G, Y, B, B, G]),
      ]);
      expect(grid).toBe('🟩⬜⬜🟨⬜\n🟩🟨⬜⬜🟩');
    });

    it('her tahmin ayrı satırdır', () => {
      const grid = buildShareGrid([
        guess('KALEM', [B, B, B, B, B]),
        guess('KİTAP', [B, B, B, B, B]),
        guess('ÇİÇEK', [G, G, G, G, G]),
      ]);
      expect(grid.split('\n')).toHaveLength(3);
      expect(grid.split('\n')[2]).toBe('🟩🟩🟩🟩🟩');
    });

    it('hiç tahmin yoksa boş döner', () => {
      expect(buildShareGrid([])).toBe('');
    });
  });

  describe('buildShareText — başlık + skor + ızgara', () => {
    it('verilen başlığı ve kazanma skorunu birleştirir', () => {
      const text = buildShareText({
        title: 'Kelimebaz #193',
        status: 'won',
        attempts: 3,
        maxAttempts: 6,
        guesses: [],
      });
      expect(text.split('\n')[0]).toBe('Kelimebaz #193 3/6');
    });

    it('kaybedince skor X/6 olur', () => {
      const text = buildShareText({
        title: 'Kelimebaz #193',
        status: 'lost',
        attempts: 6,
        maxAttempts: 6,
        guesses: [],
      });
      expect(text.split('\n')[0]).toBe('Kelimebaz #193 X/6');
    });

    it('başlık DİLDEN BAĞIMSIZ geçer — İngilizce başlık aynen korunur', () => {
      const text = buildShareText({
        title: 'Kelimebaz (free play)',
        status: 'won',
        attempts: 4,
        maxAttempts: 6,
        guesses: [],
      });
      expect(text.split('\n')[0]).toBe('Kelimebaz (free play) 4/6');
    });

    it('tam çıktı: başlık + boş satır + ızgara', () => {
      const text = buildShareText({
        title: 'Kelimebaz #7',
        status: 'won',
        attempts: 2,
        maxAttempts: 6,
        guesses: [guess('KİTAP', [B, Y, B, B, B]), guess('KALEM', [G, G, G, G, G])],
      });
      expect(text).toBe('Kelimebaz #7 2/6\n\n⬜🟨⬜⬜⬜\n🟩🟩🟩🟩🟩');
    });
  });

  describe('SPOILER YOK — çıktı harf içermez', () => {
    const HAS_LETTER = /\p{Letter}/u;

    it('ızgarada harf yoktur', () => {
      const grid = buildShareGrid([
        guess('KİTAP', [G, B, Y, B, G]),
        guess('ÇİÇEK', [G, G, G, G, G]),
      ]);
      expect(HAS_LETTER.test(grid)).toBe(false);
    });

    it('ızgara satırlarında (başlık hariç) hiç harf yoktur', () => {
      const text = buildShareText({
        title: 'Kelimebaz #193',
        status: 'won',
        attempts: 2,
        maxAttempts: 6,
        guesses: [guess('KİTAP', [B, B, B, B, B]), guess('ÇİÇEK', [G, G, G, G, G])],
      });
      const [, , ...gridLines] = text.split('\n');
      for (const line of gridLines) {
        expect(HAS_LETTER.test(line)).toBe(false);
      }
      // Cevap/tahmin kelimeleri metnin hiçbir yerinde geçmez
      expect(text).not.toContain('ÇİÇEK');
      expect(text).not.toContain('KİTAP');
    });
  });
});
