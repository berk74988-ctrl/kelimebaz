import {
  DAILY_BONUS,
  goldForGame,
  LEVEL_GOLD,
  LEVEL_GOLD_CAP,
  levelBonus,
  LOSS_GOLD,
  WIN_GOLD,
} from './gold';

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

  describe('seviye ödülü', () => {
    it('seviye 1 bonus vermez (temel ile aynı)', () => {
      expect(levelBonus(1)).toBe(0);
    });

    it('her seviye KADEMELİ artar', () => {
      expect(levelBonus(2)).toBe(LEVEL_GOLD); // +4
      expect(levelBonus(3)).toBe(LEVEL_GOLD * 2); // +8
      expect(levelBonus(4)).toBe(LEVEL_GOLD * 3); // +12
    });

    it('bir tavanda durur (sonsuza gitmez)', () => {
      expect(levelBonus(999)).toBe(LEVEL_GOLD_CAP);
      // Tavana ulaşan seviyeden sonrası hep aynı
      const capLevel = LEVEL_GOLD_CAP / LEVEL_GOLD + 1;
      expect(levelBonus(capLevel)).toBe(LEVEL_GOLD_CAP);
      expect(levelBonus(capLevel + 5)).toBe(LEVEL_GOLD_CAP);
    });

    it('bozuk seviye girdisi çökertmez', () => {
      expect(levelBonus(0)).toBe(0);
      expect(levelBonus(-3)).toBe(0);
      expect(levelBonus(NaN)).toBe(0);
      expect(levelBonus(undefined as unknown as number)).toBe(0);
    });

    it('yüksek seviye oyuncusu KAZANINCA daha çok altın alır', () => {
      const lvl1 = goldForGame(true, 3, false, 1);
      const lvl5 = goldForGame(true, 3, false, 5);

      expect(lvl5).toBe(lvl1 + levelBonus(5)); // aynı oyun, sadece seviye farkı
      expect(lvl5).toBeGreaterThan(lvl1);
    });

    it('seviye bonusu KAYBEDİNCE verilmez', () => {
      expect(goldForGame(false, 6, false, 10)).toBe(LOSS_GOLD);
      expect(goldForGame(false, 1, true, 20)).toBe(LOSS_GOLD);
    });

    it('seviye belirtilmezse bonus 0 (geriye uyum)', () => {
      expect(goldForGame(true, 3, false)).toBe(goldForGame(true, 3, false, 1));
    });

    it('bonus temel kazancı en fazla ~2 katına çıkarır (ekonomi korunur)', () => {
      // En yüksek temel kazanç: 1. tahminde günlük = 20 + 25 + 10 = 55
      const maxBase = goldForGame(true, 1, true, 1);
      const withCap = goldForGame(true, 1, true, 999);
      expect(withCap - maxBase).toBe(LEVEL_GOLD_CAP);
      expect(withCap).toBeLessThan(maxBase * 2); // 95 < 110
    });
  });
});
