import {
  ADAPT_START_TOPK,
  ADAPT_WINDOW,
  adaptTierLabel,
  nextAdaptTopK,
  perfScore,
  pushPerf,
  smoothStep,
  targetTopK,
  windowAvg,
} from './ai-adaptive';

/**
 * Uyarlanabilir zorluk — oyuncuya göre bota hedef atama (saf mantık).
 */
describe('Uyarlanabilir zorluk (ai-adaptive)', () => {
  describe('perfScore', () => {
    it('çözülen maç → tahmin sayısı', () => {
      expect(perfScore(3, true)).toBe(3);
      expect(perfScore(1, true)).toBe(1);
    });
    it('çözülemeyen maç → ceza (MAX+1)', () => {
      expect(perfScore(6, false)).toBe(7);
    });
  });

  describe('kayan pencere', () => {
    it('son ADAPT_WINDOW maçı tutar', () => {
      let w: number[] = [];
      for (let i = 0; i < 15; i++) w = pushPerf(w, (i % 6) + 1);
      expect(w.length).toBe(ADAPT_WINDOW);
    });
    it('ortalama boş pencerede null', () => {
      expect(windowAvg([])).toBeNull();
      expect(windowAvg([2, 4])).toBe(3);
    });
  });

  describe('targetTopK — oyuncu ortalaması → bot topK', () => {
    it('güçlü oyuncu (düşük ort) → düşük topK (bot güçlü)', () => {
      expect(targetTopK(2.8)).toBeLessThanOrEqual(3);
    });
    it('zayıf oyuncu (yüksek ort) → yüksek topK (bot rahat), ama sınırlı', () => {
      const weak = targetTopK(6);
      const veryWeak = targetTopK(9);
      expect(weak).toBeGreaterThanOrEqual(100);
      expect(veryWeak).toBe(weak); // 3.3'e kırpılır → aptallaşmaz, sabit "en rahat"
    });
    it('orta oyuncu → orta topK', () => {
      const t = targetTopK(3.1);
      expect(t).toBeGreaterThan(3);
      expect(t).toBeLessThan(100);
    });
    it('monoton: daha zayıf oyuncu ≥ topK', () => {
      expect(targetTopK(3.5)).toBeGreaterThanOrEqual(targetTopK(2.9));
    });
  });

  describe('smoothStep — kademeli, sert sıçrama yok', () => {
    it('tek adımda hedefe FIRLAMAZ (yukarı sınırlı)', () => {
      const next = smoothStep(8, 150);
      expect(next).toBeGreaterThan(8);
      expect(next).toBeLessThan(150); // bir maçta 8→150 olmaz
    });
    it('birkaç adımda hedefe ulaşır', () => {
      let v = 8;
      for (let i = 0; i < 12; i++) v = smoothStep(v, 150);
      expect(v).toBe(150);
    });
    it('hedef eşitse değişmez', () => {
      expect(smoothStep(20, 20)).toBe(20);
    });
  });

  describe('nextAdaptTopK — uçtan uca', () => {
    it('yeni oyuncu (boş geçmiş) → makul başlangıç', () => {
      expect(nextAdaptTopK([], 0)).toBe(ADAPT_START_TOPK);
    });

    it('ÜST ÜSTE KAYIP → bot gözle görülür KOLAYLAŞIR (topK artar), kademeli', () => {
      let topK = ADAPT_START_TOPK;
      let recent: number[] = [];
      const steps: number[] = [];
      for (let i = 0; i < 8; i++) {
        recent = pushPerf(recent, 7); // oyuncu hep kaybediyor (kötü performans)
        topK = nextAdaptTopK(recent, topK);
        steps.push(topK);
      }
      expect(steps[steps.length - 1]).toBeGreaterThan(ADAPT_START_TOPK * 3); // belirgin kolaylaştı
      // Kademeli: her adım bir öncekinden çok büyük sıçramamalı (en fazla ~%60+3)
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + Math.max(3, steps[i - 1] * 0.6) + 0.5);
      }
    });

    it('ÜST ÜSTE KAZANÇ → bot ZORLAŞIR (topK azalır)', () => {
      let topK = 120; // rahat bir yerden başla
      let recent: number[] = [];
      for (let i = 0; i < 10; i++) {
        recent = pushPerf(recent, 2); // oyuncu hep 2 tahminde çözüyor (çok iyi)
        topK = nextAdaptTopK(recent, topK);
      }
      expect(topK).toBeLessThanOrEqual(5); // sertçe zorlaştı (en güçlüye yaklaştı)
    });
  });

  describe('adaptTierLabel', () => {
    it('topK bandına göre etiket', () => {
      expect(adaptTierLabel(1)).toBe('hard');
      expect(adaptTierLabel(10)).toBe('medium');
      expect(adaptTierLabel(120)).toBe('easy');
    });
  });
});
