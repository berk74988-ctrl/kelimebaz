import { EMPTY_STATS, Stats } from '../models/game.model';
import { PROFILE_STATS } from './profile-stats';

/**
 * Kayıt defteri ESNEK olmalı: yeni bir istatistik eklemek tek satır olmalı ve
 * hiçbir şeyi kırmamalı. Bu testler o sözleşmeyi korur.
 */
describe('Profil istatistik kayıt defteri', () => {
  const dolu: Stats = {
    played: 27,
    won: 24,
    currentStreak: 6,
    maxStreak: 11,
    distribution: [1, 3, 8, 7, 4, 1],
    lastWinAttempts: 4,
    points: 3450,
    guesses: 98,
  };

  it('kullanıcının istediği istatistiklerin hepsi var', () => {
    const keys = PROFILE_STATS.map((s) => s.key);

    expect(keys).toContain('played'); // toplam oynanan oyun
    expect(keys).toContain('winRate'); // kazanma oranı
    expect(keys).toContain('maxStreak'); // en uzun seri
    expect(keys).toContain('wordsFound'); // toplam bulunan kelime
    expect(keys).toContain('points'); // toplam puan
  });

  it('anahtarlar BENZERSİZ (kart tekrarı olmaz)', () => {
    const keys = PROFILE_STATS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('her kartın ikonu ve etiketi vardır', () => {
    for (const s of PROFILE_STATS) {
      expect(s.icon.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it('her kart, dolu istatistikten bir DEĞER üretir', () => {
    for (const s of PROFILE_STATS) {
      const v = s.value(dolu);
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('BOŞ istatistikte de çökmez — hepsi sıfır gösterir', () => {
    for (const s of PROFILE_STATS) {
      expect(() => s.value(EMPTY_STATS)).not.toThrow();
    }
    const byKey = (k: string) => PROFILE_STATS.find((s) => s.key === k)!.value(EMPTY_STATS);

    expect(byKey('played')).toBe('0');
    expect(byKey('winRate')).toBe('%0'); // 0/0 → NaN olmamalı
    expect(byKey('points')).toBe('0');
  });

  describe('değerler doğru hesaplanır', () => {
    const byKey = (k: string) => PROFILE_STATS.find((s) => s.key === k)!.value(dolu);

    it('kazanma oranı yuvarlanır', () => expect(byKey('winRate')).toBe('%89')); // 24/27
    it('bulunan kelime = kazanılan oyun', () => expect(byKey('wordsFound')).toBe('24'));
    it('en uzun seri', () => expect(byKey('maxStreak')).toBe('11'));
    it('puan binlik ayraçla yazılır', () => expect(byKey('points')).toBe('3.450'));
    it('yazılan kelime', () => expect(byKey('guesses')).toBe('98'));
  });
});
