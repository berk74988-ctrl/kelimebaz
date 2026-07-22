import { lpForResult, seasonReward, softResetLp, tierForLp, tierProgress } from './league';

describe('league — saf lig mantığı', () => {
  describe('tierForLp — LP → lig', () => {
    it('eşiklere göre doğru ligi verir', () => {
      expect(tierForLp(0).id).toBe('bronz');
      expect(tierForLp(299).id).toBe('bronz');
      expect(tierForLp(300).id).toBe('gumus');
      expect(tierForLp(599).id).toBe('gumus');
      expect(tierForLp(600).id).toBe('altin');
      expect(tierForLp(900).id).toBe('platin');
      expect(tierForLp(1200).id).toBe('elmas');
      expect(tierForLp(1500).id).toBe('usta');
      expect(tierForLp(99999).id).toBe('usta');
    });

    it('negatif LP Bronz sayılır (bozuk veriye karşı)', () => {
      expect(tierForLp(-50).id).toBe('bronz');
    });
  });

  describe('tierProgress — lig içi ilerleme', () => {
    it('lig başında 0, ortasında ~0.5, sonunda ~1', () => {
      expect(tierProgress(300)).toBe(0); // Gümüş başı
      expect(tierProgress(450)).toBeCloseTo(0.5, 2); // Gümüş ortası
      expect(tierProgress(599)).toBeCloseTo(0.996, 2);
    });

    it('Usta ligi her zaman dolu (1)', () => {
      expect(tierProgress(1500)).toBe(1);
      expect(tierProgress(3000)).toBe(1);
    });
  });

  describe('lpForResult — maç sonucu LP', () => {
    it('kazanınca pozitif; az tahminle daha çok', () => {
      expect(lpForResult(true, 1, 'daily')).toBe(24 + 12); // 1 tahmin → tam bonus
      expect(lpForResult(true, 6, 'daily')).toBe(24 + 2); // 6 tahmin → az bonus
      expect(lpForResult(true, 1, 'daily')).toBeGreaterThan(lpForResult(true, 6, 'daily'));
    });

    it('serbest mod daha az verir (çiftlik önlenir)', () => {
      expect(lpForResult(true, 3, 'practice')).toBeLessThan(lpForResult(true, 3, 'daily'));
    });

    it('kaybedince negatif', () => {
      expect(lpForResult(false, 6, 'daily')).toBe(-16);
      expect(lpForResult(false, 6, 'practice')).toBe(-12);
    });
  });

  describe('seasonReward — lige göre ödül', () => {
    it('üst ligler daha çok altın + tema/rozet', () => {
      expect(seasonReward('bronz').gold).toBeLessThan(seasonReward('usta').gold);
      expect(seasonReward('bronz').badgeId).toBeUndefined();
      expect(seasonReward('altin').badgeId).toBe('badge.league');
      expect(seasonReward('elmas').themeId).toBe('theme.champion');
      expect(seasonReward('usta').themeId).toBe('theme.champion');
    });
  });

  describe('softResetLp — sezon geçişi yumuşak sıfırlama', () => {
    it('final LP’nin bir kısmı taşınır, negatif olmaz', () => {
      expect(softResetLp(1000)).toBe(350);
      expect(softResetLp(0)).toBe(0);
      expect(softResetLp(-99)).toBe(0);
    });
  });
});
