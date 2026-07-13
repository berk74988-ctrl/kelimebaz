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

  describe('SPOILER YOK — çıktı harf içermez', () => {
    /** Türkçe dahil hiçbir harf olmamalı. */
    const HAS_LETTER = /\p{Letter}/u;

    it('ızgarada harf yoktur', () => {
      const grid = buildShareGrid([
        guess('KİTAP', [G, B, Y, B, G]),
        guess('ÇİÇEK', [G, G, G, G, G]),
      ]);

      expect(HAS_LETTER.test(grid)).toBe(false);
    });

    it('cevap ve tahmin kelimeleri metnin hiçbir yerinde geçmez', () => {
      const text = buildShareText({
        mode: 'daily',
        dayIndex: 193,
        status: 'won',
        attempts: 2,
        maxAttempts: 6,
        guesses: [guess('KİTAP', [B, B, B, B, B]), guess('ÇİÇEK', [G, G, G, G, G])],
      });

      expect(text).not.toContain('ÇİÇEK'); // cevap sızmıyor
      expect(text).not.toContain('KİTAP'); // tahminler de sızmıyor

      // Not: başlıkta oyun adı ("Kelimebaz") geçer — bu spoiler değil.
      // Asıl kural: ızgara satırlarında HİÇ harf olmamalı (aşağıdaki test).
    });

    it('sadece başlıkta oyun adı geçer, ızgara kısmı tamamen emojidir', () => {
      const text = buildShareText({
        mode: 'daily',
        dayIndex: 193,
        status: 'won',
        attempts: 1,
        maxAttempts: 6,
        guesses: [guess('KALEM', [G, G, G, G, G])],
      });

      const [header, , ...gridLines] = text.split('\n');

      expect(header).toBe('Kelimebaz #193 1/6');
      for (const line of gridLines) {
        expect(HAS_LETTER.test(line)).toBe(false);
      }
    });
  });

  describe('başlık', () => {
    it('günlük modda gün numarası ve deneme sayısı içerir', () => {
      const text = buildShareText({
        mode: 'daily',
        dayIndex: 193,
        status: 'won',
        attempts: 3,
        maxAttempts: 6,
        guesses: [],
      });

      expect(text.split('\n')[0]).toBe('Kelimebaz #193 3/6');
    });

    it('serbest modda gün numarası YOKTUR', () => {
      const text = buildShareText({
        mode: 'practice',
        dayIndex: 193,
        status: 'won',
        attempts: 4,
        maxAttempts: 6,
        guesses: [],
      });

      expect(text.split('\n')[0]).toBe('Kelimebaz (serbest) 4/6');
      expect(text).not.toContain('#193');
    });

    it('kaybedince skor X/6 olur', () => {
      const text = buildShareText({
        mode: 'daily',
        dayIndex: 193,
        status: 'lost',
        attempts: 6,
        maxAttempts: 6,
        guesses: [],
      });

      expect(text.split('\n')[0]).toBe('Kelimebaz #193 X/6');
    });
  });

  it('tam çıktı: başlık + boş satır + ızgara', () => {
    const text = buildShareText({
      mode: 'daily',
      dayIndex: 7,
      status: 'won',
      attempts: 2,
      maxAttempts: 6,
      guesses: [guess('KİTAP', [B, Y, B, B, B]), guess('KALEM', [G, G, G, G, G])],
    });

    expect(text).toBe('Kelimebaz #7 2/6\n\n⬜🟨⬜⬜⬜\n🟩🟩🟩🟩🟩');
  });
});
