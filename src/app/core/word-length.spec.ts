import { lengthWeights, pickLength, WORD_LENGTHS } from './word-length';

/**
 * Uzunluk seçimi: düşük seviye kısa, yüksek seviye uzun eğilimli; her uzunluk
 * daima mümkün (çeşitlilik).
 */
describe('word-length — seviyeye göre uzunluk', () => {
  describe('lengthWeights', () => {
    it('her uzunluk için pozitif ağırlık üretir (hiçbiri sıfır olmaz)', () => {
      for (const lv of [1, 3, 7, 13, 30]) {
        const w = lengthWeights(lv);
        for (const L of WORD_LENGTHS) expect(w[L]).toBeGreaterThan(0);
      }
    });

    it('düşük seviyede KISA kelime ağır basar (4 > 7)', () => {
      const w = lengthWeights(1);
      expect(w[4]).toBeGreaterThan(w[7]);
      expect(w[5]).toBeGreaterThan(w[7]);
    });

    it('yüksek seviyede UZUN kelime ağır basar (7 > 4)', () => {
      const w = lengthWeights(15);
      expect(w[7]).toBeGreaterThan(w[4]);
      expect(w[6]).toBeGreaterThan(w[4]);
    });

    it('bozuk/eksik seviye girdisi çökertmez', () => {
      for (const bad of [0, -5, NaN, undefined as unknown as number]) {
        const w = lengthWeights(bad);
        for (const L of WORD_LENGTHS) expect(w[L]).toBeGreaterThan(0);
      }
    });
  });

  describe('pickLength', () => {
    it('her zaman 4-7 aralığında döner', () => {
      for (let i = 0; i <= 100; i++) {
        const L = pickLength(5, i / 100);
        expect(WORD_LENGTHS).toContain(L);
      }
    });

    it('r=0 en kısa (ağırlıkça ilk) uzunluğu verir', () => {
      expect(pickLength(1, 0)).toBe(4);
    });

    it('r→1 en uzun uzunluğu verir', () => {
      expect(pickLength(20, 0.999)).toBe(7);
    });

    it('düşük seviyede 4 harf, yüksek seviyede 7 harf daha SIK gelir', () => {
      const N = 4000;
      const count = (level: number, target: number) => {
        let c = 0;
        for (let i = 0; i < N; i++) if (pickLength(level, (i + 0.5) / N) === target) c++;
        return c;
      };
      // seviye 1: 4 harf, 7 harften çok daha sık
      expect(count(1, 4)).toBeGreaterThan(count(1, 7));
      // seviye 15: 7 harf, 4 harften çok daha sık
      expect(count(15, 7)).toBeGreaterThan(count(15, 4));
    });
  });
});
