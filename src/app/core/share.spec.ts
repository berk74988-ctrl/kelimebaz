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

  describe('SPOILER YOK — çıktı harf içermez (her dilde)', () => {
    /** Türkçe dahil hiçbir harf olmamalı. */
    const HAS_LETTER = /\p{Letter}/u;

    it('ızgarada harf yoktur', () => {
      const grid = buildShareGrid([
        guess('KİTAP', [G, B, Y, B, G]),
        guess('ÇİÇEK', [G, G, G, G, G]),
      ]);

      expect(HAS_LETTER.test(grid)).toBe(false);
    });

    it('cevap ve tahmin kelimeleri metnin hiçbir yerinde geçmez (tr + en)', () => {
      for (const lang of ['tr', 'en'] as const) {
        const text = buildShareText({
          mode: 'daily',
          dayIndex: 193,
          status: 'won',
          attempts: 2,
          maxAttempts: 6,
          guesses: [guess('KİTAP', [B, B, B, B, B]), guess('ÇİÇEK', [G, G, G, G, G])],
          lang,
        });
        expect(text).not.toContain('ÇİÇEK'); // cevap sızmıyor
        expect(text).not.toContain('KİTAP'); // tahminler de sızmıyor
      }
    });

    it('ızgara satırları HER MODDA ve HER DİLDE tamamen emojidir', () => {
      for (const lang of ['tr', 'en'] as const) {
        for (const mode of ['daily', 'practice', 'room', 'vsai'] as const) {
          const text = buildShareText({
            mode,
            dayIndex: 193,
            status: 'won',
            attempts: 1,
            maxAttempts: 6,
            guesses: [guess('KALEM', [G, G, G, G, G])],
            lang,
          });
          const [, , ...gridLines] = text.split('\n');
          for (const line of gridLines) {
            expect(HAS_LETTER.test(line)).toBe(false);
          }
        }
      }
    });
  });

  describe('başlık — Türkçe (geriye dönük uyumlu)', () => {
    it('günlük modda gün numarası ve deneme sayısı içerir', () => {
      const text = buildShareText({
        mode: 'daily', dayIndex: 193, status: 'won', attempts: 3, maxAttempts: 6, guesses: [], lang: 'tr',
      });
      expect(text.split('\n')[0]).toBe('Kelimebaz #193 3/6');
    });

    it('serbest modda "(serbest)", gün numarası YOKTUR', () => {
      const text = buildShareText({
        mode: 'practice', dayIndex: 193, status: 'won', attempts: 4, maxAttempts: 6, guesses: [], lang: 'tr',
      });
      expect(text.split('\n')[0]).toBe('Kelimebaz (serbest) 4/6');
      expect(text).not.toContain('#193');
    });

    it('kaybedince skor X/6 olur', () => {
      const text = buildShareText({
        mode: 'daily', dayIndex: 193, status: 'lost', attempts: 6, maxAttempts: 6, guesses: [], lang: 'tr',
      });
      expect(text.split('\n')[0]).toBe('Kelimebaz #193 X/6');
    });

    it('oda ve YZ modlarının anlamlı başlıkları vardır', () => {
      const room = buildShareText({
        mode: 'room', dayIndex: 0, status: 'won', attempts: 3, maxAttempts: 6, guesses: [], lang: 'tr',
      });
      const vsai = buildShareText({
        mode: 'vsai', dayIndex: 0, status: 'won', attempts: 3, maxAttempts: 6, guesses: [], lang: 'tr',
      });
      expect(room.split('\n')[0]).toBe('Kelimebaz (arkadaş yarışı) 3/6');
      expect(vsai.split('\n')[0]).toBe("Kelimebaz (YZ'ye karşı) 3/6");
    });
  });

  describe('başlık — İngilizce (tamamen çevrili)', () => {
    it('günlük: gün numarası (marka adı korunur)', () => {
      const text = buildShareText({
        mode: 'daily', dayIndex: 193, status: 'won', attempts: 3, maxAttempts: 6, guesses: [], lang: 'en',
      });
      expect(text.split('\n')[0]).toBe('Kelimebaz #193 3/6');
    });

    it('serbest → "(free play)"', () => {
      const text = buildShareText({
        mode: 'practice', dayIndex: 0, status: 'won', attempts: 4, maxAttempts: 6, guesses: [], lang: 'en',
      });
      expect(text.split('\n')[0]).toBe('Kelimebaz (free play) 4/6');
    });

    it('oda → "(friend match)", YZ → "(vs AI)"', () => {
      const room = buildShareText({
        mode: 'room', dayIndex: 0, status: 'won', attempts: 2, maxAttempts: 6, guesses: [], lang: 'en',
      });
      const vsai = buildShareText({
        mode: 'vsai', dayIndex: 0, status: 'lost', attempts: 6, maxAttempts: 6, guesses: [], lang: 'en',
      });
      expect(room.split('\n')[0]).toBe('Kelimebaz (friend match) 2/6');
      expect(vsai.split('\n')[0]).toBe('Kelimebaz (vs AI) X/6');
    });

    it('İngilizce metnin başlığında Türkçe kip metni geçmez', () => {
      const text = buildShareText({
        mode: 'practice', dayIndex: 0, status: 'won', attempts: 4, maxAttempts: 6, guesses: [], lang: 'en',
      });
      expect(text).not.toContain('serbest');
    });
  });

  it('tam çıktı: başlık + boş satır + ızgara', () => {
    const text = buildShareText({
      mode: 'daily', dayIndex: 7, status: 'won', attempts: 2, maxAttempts: 6,
      guesses: [guess('KİTAP', [B, Y, B, B, B]), guess('KALEM', [G, G, G, G, G])],
      lang: 'tr',
    });
    expect(text).toBe('Kelimebaz #7 2/6\n\n⬜🟨⬜⬜⬜\n🟩🟩🟩🟩🟩');
  });
});
