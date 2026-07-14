import { TestBed } from '@angular/core/testing';
import { StatsService } from './stats.service';

/**
 * İstatistikler: hesaplama + localStorage kalıcılığı.
 */
describe('StatsService', () => {
  let stats: StatsService;

  /** Servisi sıfırdan kurar — sayfa yenilenmesini taklit eder. */
  function freshService(): StatsService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(StatsService);
  }

  beforeEach(() => {
    localStorage.clear();
    stats = freshService();
  });

  describe('boş durum (ilk oyun)', () => {
    it('hiç oyun yokken her şey sıfırdır', () => {
      const s = stats.stats();

      expect(stats.isEmpty()).toBe(true);
      expect(s.played).toBe(0);
      expect(s.won).toBe(0);
      expect(s.currentStreak).toBe(0);
      expect(s.maxStreak).toBe(0);
      expect(s.distribution).toEqual([0, 0, 0, 0, 0, 0]);
      expect(s.lastWinAttempts).toBeNull();
    });

    it('kazanma yüzdesi sıfıra bölmez', () => {
      expect(stats.winRate()).toBe(0);
    });
  });

  describe('kazanma yüzdesi', () => {
    it('doğru hesaplanır', () => {
      stats.record(true, 3);
      stats.record(true, 4);
      stats.record(false, 6);
      stats.record(true, 2);

      expect(stats.stats().played).toBe(4);
      expect(stats.stats().won).toBe(3);
      expect(stats.winRate()).toBe(75); // 3/4
    });

    it('yuvarlanır', () => {
      stats.record(true, 3);
      stats.record(false, 6);
      stats.record(false, 6);

      expect(stats.winRate()).toBe(33); // 1/3 = %33.33 → 33
    });
  });

  describe('seri', () => {
    it('üst üste kazanınca artar', () => {
      stats.record(true, 3);
      stats.record(true, 2);
      stats.record(true, 5);

      expect(stats.stats().currentStreak).toBe(3);
      expect(stats.stats().maxStreak).toBe(3);
    });

    it('kaybedince SIFIRLANIR ama en iyi seri korunur', () => {
      stats.record(true, 3);
      stats.record(true, 2);
      stats.record(false, 6); // seri kırıldı

      expect(stats.stats().currentStreak).toBe(0);
      expect(stats.stats().maxStreak).toBe(2); // en iyi seri hatırlanır
    });

    it('yeni seri eskisini geçerse en iyi seri güncellenir', () => {
      stats.record(true, 3);
      stats.record(true, 3);
      stats.record(false, 6); // seri: 2

      stats.record(true, 3);
      stats.record(true, 3);
      stats.record(true, 3); // seri: 3

      expect(stats.stats().currentStreak).toBe(3);
      expect(stats.stats().maxStreak).toBe(3);
    });
  });

  describe('tahmin dağılımı', () => {
    it('kaçıncı tahminde kazanıldığı sayılır', () => {
      stats.record(true, 1);
      stats.record(true, 3);
      stats.record(true, 3);
      stats.record(true, 6);

      expect(stats.stats().distribution).toEqual([1, 0, 2, 0, 0, 1]);
    });

    it('kayıplar dağılıma girmez', () => {
      stats.record(false, 6);
      stats.record(false, 6);

      expect(stats.stats().distribution).toEqual([0, 0, 0, 0, 0, 0]);
      expect(stats.stats().played).toBe(2);
    });

    it('son kazanılan oyunun satırı hatırlanır (grafikte vurgulanır)', () => {
      stats.record(true, 4);
      expect(stats.stats().lastWinAttempts).toBe(4);

      stats.record(true, 2);
      expect(stats.stats().lastWinAttempts).toBe(2); // güncellenir

      stats.record(false, 6);
      expect(stats.stats().lastWinAttempts).toBe(2); // kayıp değiştirmez
    });
  });

  describe('kalıcılık (sayfa yenilense de korunur)', () => {
    it('sayfa yenilenince istatistikler geri gelir', () => {
      stats.record(true, 3);
      stats.record(true, 2);
      stats.record(false, 6);

      // sayfa yenilendi → servis sıfırdan kuruluyor
      const reloaded = freshService();
      const s = reloaded.stats();

      expect(s.played).toBe(3);
      expect(s.won).toBe(2);
      expect(s.currentStreak).toBe(0);
      expect(s.maxStreak).toBe(2);
      expect(s.distribution).toEqual([0, 1, 1, 0, 0, 0]);
      expect(reloaded.winRate()).toBe(67);
    });

    it('bozuk kayıt oyunu çökertmez, boş durumla başlar', () => {
      localStorage.setItem('kelimebaz:stats', '{bozuk json');

      const reloaded = freshService();

      expect(reloaded.isEmpty()).toBe(true);
      expect(reloaded.stats().distribution).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('eksik alanlı eski kayıt güvenle tamamlanır', () => {
      localStorage.setItem('kelimebaz:stats', JSON.stringify({ played: 5, won: 3 }));

      const reloaded = freshService();
      const s = reloaded.stats();

      expect(s.played).toBe(5);
      expect(s.won).toBe(3);
      expect(s.distribution).toEqual([0, 0, 0, 0, 0, 0]); // eksikti, tamamlandı
      expect(s.lastWinAttempts).toBeNull();
      expect(reloaded.winRate()).toBe(60);
    });

    it('PUAN/KELİME alanları sonradan eklendi — eski kayıtlar göç istemez', () => {
      // Puan sistemi gelmeden önce kaydedilmiş bir oyuncu
      localStorage.setItem(
        'kelimebaz:stats',
        JSON.stringify({ played: 9, won: 7, currentStreak: 2, maxStreak: 4 }),
      );

      const reloaded = freshService();
      const s = reloaded.stats();

      expect(s.points).toBe(0); // alan yoktu → sıfırdan başlar
      expect(s.guesses).toBe(0);
      expect(reloaded.level().level).toBe(1);
      expect(s.played).toBe(9); // eski veri KORUNUR
      expect(s.maxStreak).toBe(4);
    });

    it('bozuk sayı alanları sıfıra çekilir (oyun sessizce saçmalamaz)', () => {
      localStorage.setItem(
        'kelimebaz:stats',
        JSON.stringify({ played: 3, points: null, guesses: 'çok', maxStreak: -7 }),
      );

      const s = freshService().stats();

      expect(s.points).toBe(0);
      expect(s.guesses).toBe(0);
      expect(s.maxStreak).toBe(0);
    });
  });

  describe('puan ve seviye', () => {
    it('kazanınca puan birikir, kaybedince de az da olsa artar', () => {
      stats.record(true, 1); // 100 temel + 100 hız + 5 seri(1) = 205
      expect(stats.stats().points).toBe(205);

      stats.record(false, 6); // +10
      expect(stats.stats().points).toBe(215);
    });

    it('seri büyüdükçe aynı tahmin daha çok puan getirir', () => {
      stats.record(true, 3);
      const ilk = stats.stats().points;

      stats.record(true, 3); // seri 2 → bonus arttı
      const ikinci = stats.stats().points - ilk;

      expect(ikinci).toBeGreaterThan(ilk);
    });

    it('yazılan kelime sayısı her oyunun tahminlerini toplar', () => {
      stats.record(true, 3); // 3 kelime yazıldı
      stats.record(false, 6); // 6 kelime daha

      expect(stats.stats().guesses).toBe(9);
    });

    it('puan biriktikçe seviye atlanır', () => {
      expect(stats.level().level).toBe(1);

      // 100 puan → seviye 2
      stats.record(true, 6); // 100 + 5 = 105
      expect(stats.level().level).toBe(2);
      expect(stats.level().progress).toBeGreaterThan(0);
    });

    it('puan sayfa yenilenince korunur', () => {
      stats.record(true, 2);
      const beklenen = stats.stats().points;

      expect(freshService().stats().points).toBe(beklenen);
    });
  });

  describe('sıfırlama', () => {
    it('istatistikleri temizler ve kalıcı yazar', () => {
      stats.record(true, 3);
      stats.reset();

      expect(stats.isEmpty()).toBe(true);
      expect(freshService().isEmpty()).toBe(true); // yenilendiğinde de boş
    });
  });
});
