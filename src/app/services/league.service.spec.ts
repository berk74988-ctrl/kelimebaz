import { TestBed } from '@angular/core/testing';
import { GoldService } from './gold.service';
import { InventoryService } from './inventory.service';
import { LeagueService } from './league.service';

describe('LeagueService — lig sistemi', () => {
  function fresh(): LeagueService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(LeagueService);
  }

  let league: LeagueService;

  beforeEach(() => {
    localStorage.clear();
    league = fresh();
  });

  it('sıfır LP, Bronz, Sezon 1 ile başlar', () => {
    expect(league.lp()).toBe(0);
    expect(league.tier().id).toBe('bronz');
    expect(league.season()).toBe(1);
  });

  describe('maç sonucu', () => {
    it('kazanınca LP artar ve galibiyet sayılır', () => {
      const gained = league.recordResult(true, 3, 'daily');
      expect(gained).toBeGreaterThan(0);
      expect(league.lp()).toBe(gained);
      expect(league.wins()).toBe(1);
      expect(league.peakLp()).toBe(gained);
      expect(league.history()[0]).toBe(gained);
    });

    it('yükseldikçe lig değişir', () => {
      for (let i = 0; i < 12; i++) league.recordResult(true, 1, 'daily'); // 12 × 36 = 432
      expect(league.lp()).toBeGreaterThanOrEqual(300);
      expect(league.tier().id).toBe('gumus');
    });

    it('Bronz’da kayıp yumuşatılır ve LP negatife düşmez', () => {
      const lost = league.recordResult(false, 6, 'daily'); // -16 → Bronz koruması yarısı
      expect(league.lp()).toBe(0); // 0'ın altına inmez
      expect(lost).toBe(0); // taban 0'a çarpınca gerçek değişim 0
      expect(league.losses()).toBe(1);
    });

    it('üst ligde kayıp tam uygulanır', () => {
      for (let i = 0; i < 15; i++) league.recordResult(true, 1, 'daily'); // Gümüş+
      const before = league.lp();
      league.recordResult(false, 6, 'daily');
      expect(league.lp()).toBe(before - 16);
    });
  });

  describe('kalıcılık', () => {
    it('LP ve sezon sayfa yenilenince korunur', () => {
      league.recordResult(true, 2, 'daily');
      const lp = league.lp();
      const reloaded = fresh();
      expect(reloaded.lp()).toBe(lp);
      expect(reloaded.wins()).toBe(1);
    });

    it('bozuk kayıt çökertmez', () => {
      localStorage.setItem('kelimebaz:league', '{bozuk');
      expect(fresh().lp()).toBe(0);
    });
  });

  describe('sezon geçişi', () => {
    function withPastSeason(lp: number): LeagueService {
      localStorage.setItem(
        'kelimebaz:league',
        JSON.stringify({
          lp,
          season: 1,
          seasonStart: Date.now() - 20 * 24 * 60 * 60 * 1000, // 20 gün önce → süre doldu
          wins: 30,
          losses: 8,
          peakLp: lp + 50,
          history: [],
        }),
      );
      return fresh();
    }

    it('süre dolunca sezon kapanır: ödül beklemeye alınır, yeni sezon + yumuşak sıfırlama', () => {
      const l = withPastSeason(1300); // Elmas
      expect(l.pending()).toBeTruthy();
      expect(l.pending()!.tierId).toBe('elmas');
      expect(l.season()).toBe(2);
      expect(l.lp()).toBe(Math.round(1300 * 0.35)); // 455
      expect(l.tier().id).toBe('gumus'); // sıfırlanmış LP'nin ligi
    });

    it('ödül talep edilince altın + rozet + tema verilir ve bildirim kapanır', () => {
      const l = withPastSeason(1300); // Elmas ödülü: 480 altın + tema + rozet
      const gold = TestBed.inject(GoldService);
      const inv = TestBed.inject(InventoryService);
      const before = gold.balance();

      l.claimPending();

      expect(l.pending()).toBeNull();
      expect(gold.balance()).toBe(before + 480);
      expect(inv.owns('badge.league')).toBe(true);
      expect(inv.owns('theme.champion')).toBe(true);
    });

    it('düşük ligde sezon ödülü yalnız altın (rozet/tema yok)', () => {
      const l = withPastSeason(200); // Bronz
      const inv = TestBed.inject(InventoryService);
      l.claimPending();
      expect(inv.owns('badge.league')).toBe(false);
    });
  });
});
