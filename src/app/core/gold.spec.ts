import { DAILY_BONUS, goldForGame, LOSS_GOLD, WIN_GOLD } from './gold';

describe('Altın ödülü', () => {
  it('erken bulmak daha çok altın getirir', () => {
    const g = [1, 2, 3, 4, 5, 6].map((t) => goldForGame(true, t, false));

    for (let i = 1; i < g.length; i++) {
      expect(g[i]).toBeLessThan(g[i - 1]);
    }
    expect(g[0]).toBe(45); // 20 temel + 5 × 5 hız
    expect(g[5]).toBe(WIN_GOLD); // son tahminde sadece temel
  });

  it('günün kelimesi ekstra ödüllendirilir', () => {
    expect(goldForGame(true, 3, true)).toBe(goldForGame(true, 3, false) + DAILY_BONUS);
  });

  it('kaybedince de az bir şey verilir', () => {
    expect(goldForGame(false, 6, false)).toBe(LOSS_GOLD);
  });

  it('kaybedince hız/günlük bonusu YOKTUR', () => {
    expect(goldForGame(false, 1, true)).toBe(LOSS_GOLD);
  });

  it('aralık dışı tahmin sayısı saçma altın üretmez', () => {
    expect(goldForGame(true, 0, false)).toBe(goldForGame(true, 1, false));
    expect(goldForGame(true, 99, false)).toBe(goldForGame(true, 6, false));
  });
});
