import { LOSS_POINTS, MAX_STREAK_BONUS, scoreFor, WIN_BASE } from './score';

describe('Puan', () => {
  describe('kazanınca', () => {
    it('erken bulmak daha çok puan getirir', () => {
      const seri = 0;
      const puanlar = [1, 2, 3, 4, 5, 6].map((t) => scoreFor(true, t, seri));

      // Kesinlikle azalan olmalı — 1. tahmin en yüksek
      for (let i = 1; i < puanlar.length; i++) {
        expect(puanlar[i]).toBeLessThan(puanlar[i - 1]);
      }
      expect(puanlar[0]).toBe(200); // 100 temel + 5 × 20 hız
      expect(puanlar[5]).toBe(100); // son tahminde sadece temel
    });

    it('seri puanı ekler', () => {
      const seriz = scoreFor(true, 3, 0);
      const seri5 = scoreFor(true, 3, 5);

      expect(seri5).toBe(seriz + 25); // 5 × 5
    });

    it('seri bonusu bir tavanda durur (sonsuza gitmez)', () => {
      const tavan = scoreFor(true, 6, 10);
      const cokUzun = scoreFor(true, 6, 999);

      expect(cokUzun).toBe(tavan);
      expect(cokUzun).toBe(WIN_BASE + MAX_STREAK_BONUS);
    });
  });

  describe('kaybedince', () => {
    it('küçük de olsa puan verilir — oynamak da bir şeydir', () => {
      expect(scoreFor(false, 6, 0)).toBe(LOSS_POINTS);
    });

    it('kaybedince hız ve seri bonusu YOKTUR', () => {
      expect(scoreFor(false, 1, 99)).toBe(LOSS_POINTS);
    });
  });

  describe('kenar durumlar', () => {
    it('aralık dışı tahmin sayısı sınırlanır, saçma puan üretmez', () => {
      expect(scoreFor(true, 0, 0)).toBe(scoreFor(true, 1, 0));
      expect(scoreFor(true, 99, 0)).toBe(scoreFor(true, 6, 0));
    });

    it('negatif seri bonus düşürmez', () => {
      expect(scoreFor(true, 3, -5)).toBe(scoreFor(true, 3, 0));
    });
  });
});
