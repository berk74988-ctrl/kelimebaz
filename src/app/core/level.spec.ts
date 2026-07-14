import { levelInfo, pointsForLevel, STEP } from './level';

describe('Seviye', () => {
  describe('eşikler', () => {
    it('1. seviye sıfır puanda başlar', () => {
      expect(pointsForLevel(1)).toBe(0);
    });

    it('her seviye bir öncekinden PAHALIDIR', () => {
      // 100, 300, 600, 1000... — aradaki farklar 100, 200, 300, 400
      const gaps = [2, 3, 4, 5].map((l) => pointsForLevel(l) - pointsForLevel(l - 1));
      expect(gaps).toEqual([STEP * 1, STEP * 2, STEP * 3, STEP * 4]);
    });

    it('bilinen eşikler', () => {
      expect(pointsForLevel(2)).toBe(100);
      expect(pointsForLevel(3)).toBe(300);
      expect(pointsForLevel(4)).toBe(600);
      expect(pointsForLevel(5)).toBe(1000);
    });
  });

  describe('puandan seviye', () => {
    it('sıfır puan → seviye 1', () => {
      const l = levelInfo(0);
      expect(l.level).toBe(1);
      expect(l.into).toBe(0);
      expect(l.need).toBe(100);
      expect(l.progress).toBe(0);
      expect(l.remaining).toBe(100);
    });

    it('eşiğin BİR ALTI hâlâ eski seviye', () => {
      expect(levelInfo(99).level).toBe(1);
      expect(levelInfo(299).level).toBe(2);
    });

    it('eşiğe TAM ulaşınca seviye atlar', () => {
      expect(levelInfo(100).level).toBe(2);
      expect(levelInfo(300).level).toBe(3);
      expect(levelInfo(1000).level).toBe(5);
    });

    it('seviye içindeki ilerleme doğru hesaplanır', () => {
      // Seviye 2: 100'de başlar, 3. seviye 300'de → 200 puanlık aralık
      const l = levelInfo(200);
      expect(l.level).toBe(2);
      expect(l.into).toBe(100);
      expect(l.need).toBe(200);
      expect(l.progress).toBeCloseTo(0.5);
      expect(l.remaining).toBe(100);
    });

    it('ilerleme her zaman 0–1 arasındadır', () => {
      for (const p of [0, 1, 99, 100, 555, 1234, 99_999]) {
        const l = levelInfo(p);
        expect(l.progress).toBeGreaterThanOrEqual(0);
        expect(l.progress).toBeLessThanOrEqual(1);
      }
    });

    it('bozuk girdi çökertmez', () => {
      // localStorage bozulursa puan NaN/negatif gelebilir — seviye 1'e düşmeli
      expect(levelInfo(NaN).level).toBe(1);
      expect(levelInfo(-500).level).toBe(1);
      expect(levelInfo(undefined as unknown as number).level).toBe(1);
    });
  });
});
