import {
  ADAPT_START_POS,
  ADAPT_WINDOW,
  adaptBand,
  adaptTierLabel,
  nextAdaptPos,
  perfScore,
  pushPerf,
  smoothStep,
  targetPos,
  windowAvg,
} from './ai-adaptive';

/**
 * Uyarlanabilir zorluk — oyuncuya göre bota hedef atama (saf mantık).
 * Bot ayarı artık entropi sıralamasındaki YÜZDELİK KONUM (pos ∈ [0,1]):
 * 0 = en güçlü (band [0,0]) · 1 = en zayıf.
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

  describe('targetPos — oyuncu ortalaması → bot konumu', () => {
    it('güçlü oyuncu (düşük ort) → pos 0 (bot en güçlü)', () => {
      expect(targetPos(2.8)).toBe(0);
    });
    it('zayıf oyuncu (yüksek ort) → pos 1 (bot en rahat), ama sınırlı (kırpılır)', () => {
      const weak = targetPos(6);
      const veryWeak = targetPos(9);
      expect(weak).toBe(1);
      expect(veryWeak).toBe(weak); // en rahat uca kırpılır → sabit kalır (aptallaşmaz)
    });
    it('orta oyuncu → orta konum (0 ile 1 arası)', () => {
      const t = targetPos(3.9);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
    });
    it('monoton: daha zayıf oyuncu ≥ pos', () => {
      expect(targetPos(4.2)).toBeGreaterThanOrEqual(targetPos(3.6));
    });
  });

  describe('smoothStep — kademeli, sert sıçrama yok', () => {
    it('tek adımda hedefe FIRLAMAZ (yukarı sınırlı)', () => {
      const next = smoothStep(0.2, 1);
      expect(next).toBeGreaterThan(0.2);
      expect(next).toBeLessThan(1); // bir maçta 0.2→1 olmaz
    });
    it('birkaç adımda hedefe ulaşır', () => {
      let v = 0.2;
      for (let i = 0; i < 12; i++) v = smoothStep(v, 1);
      expect(v).toBe(1);
    });
    it('hedef eşitse değişmez', () => {
      expect(smoothStep(0.5, 0.5)).toBe(0.5);
    });
  });

  describe('nextAdaptPos — uçtan uca', () => {
    it('yeni oyuncu (boş geçmiş) → makul başlangıç', () => {
      expect(nextAdaptPos([], 0)).toBe(ADAPT_START_POS);
    });

    it('ÜST ÜSTE KAYIP → bot gözle görülür KOLAYLAŞIR (pos artar), kademeli', () => {
      let pos = ADAPT_START_POS;
      let recent: number[] = [];
      const steps: number[] = [];
      for (let i = 0; i < 8; i++) {
        recent = pushPerf(recent, 7); // oyuncu hep kaybediyor (kötü performans)
        pos = nextAdaptPos(recent, pos);
        steps.push(pos);
      }
      expect(steps[steps.length - 1]).toBeGreaterThan(ADAPT_START_POS); // belirgin kolaylaştı
      expect(steps[steps.length - 1]).toBeGreaterThan(0.8); // en rahat uca yaklaştı
      // Kademeli: her adım bir öncekinden en fazla ~0.15 büyür
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + 0.15 + 1e-9);
      }
    });

    it('ÜST ÜSTE KAZANÇ → bot ZORLAŞIR (pos azalır)', () => {
      let pos = 0.9; // rahat bir yerden başla
      let recent: number[] = [];
      for (let i = 0; i < 10; i++) {
        recent = pushPerf(recent, 2); // oyuncu hep 2 tahminde çözüyor (çok iyi)
        pos = nextAdaptPos(recent, pos);
      }
      expect(pos).toBeLessThanOrEqual(0.05); // sertçe zorlaştı (en güçlüye yaklaştı)
    });
  });

  describe('adaptBand — konumu çözücü bandına çevirir', () => {
    it('pos 0 → en güçlü uç (band ≈ [0, .05])', () => {
      const [lo, hi] = adaptBand(0);
      expect(lo).toBe(0);
      expect(hi).toBeCloseTo(0.05, 9);
    });
    it('pos 1 → en zayıf uç (band ≈ [.95, 1])', () => {
      const [lo, hi] = adaptBand(1);
      expect(lo).toBeCloseTo(0.95, 9);
      expect(hi).toBe(1);
    });
    it('geçerli band: lo ≤ hi, [0,1] içinde', () => {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const [lo, hi] = adaptBand(p);
        expect(lo).toBeLessThanOrEqual(hi);
        expect(lo).toBeGreaterThanOrEqual(0);
        expect(hi).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('adaptTierLabel', () => {
    it('konum bandına göre etiket', () => {
      expect(adaptTierLabel(0)).toBe('hard');
      expect(adaptTierLabel(0.5)).toBe('medium');
      expect(adaptTierLabel(0.9)).toBe('easy');
    });
  });
});
