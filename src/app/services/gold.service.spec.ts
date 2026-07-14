import { TestBed } from '@angular/core/testing';
import { GoldService } from './gold.service';

describe('GoldService — altın kasası', () => {
  function fresh(): GoldService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(GoldService);
  }

  let gold: GoldService;

  beforeEach(() => {
    localStorage.clear();
    gold = fresh();
  });

  it('sıfır bakiyeyle başlar', () => {
    expect(gold.balance()).toBe(0);
    expect(gold.earned()).toBe(0);
  });

  describe('kazanma', () => {
    it('altın eklenir ve toplam kazanç sayılır', () => {
      gold.earn(30);
      gold.earn(20);

      expect(gold.balance()).toBe(50);
      expect(gold.earned()).toBe(50);
    });

    it('negatif/bozuk miktar yok sayılır (bakiye düşürülemez)', () => {
      gold.earn(50);

      gold.earn(-100);
      gold.earn(NaN);
      gold.earn(0);

      expect(gold.balance()).toBe(50);
    });
  });

  describe('harcama (mağaza bunu çağıracak)', () => {
    it('yeterli bakiyede harcanır', () => {
      gold.earn(100);

      expect(gold.spend(40)).toBe(true);
      expect(gold.balance()).toBe(60);
      expect(gold.spent()).toBe(40);
    });

    it('YETERSİZ bakiyede hiçbir şey değişmez', () => {
      gold.earn(30);

      expect(gold.spend(50)).toBe(false);
      expect(gold.balance()).toBe(30); // dokunulmadı
      expect(gold.spent()).toBe(0);
    });

    it('harcamak TOPLAM KAZANCI düşürmez (o bir başarım)', () => {
      gold.earn(100);
      gold.spend(80);

      expect(gold.balance()).toBe(20);
      expect(gold.earned()).toBe(100); // harcansa da düşmez
    });

    it('canAfford satın alma butonunu doğru kilitler', () => {
      gold.earn(50);

      expect(gold.canAfford(50)).toBe(true);
      expect(gold.canAfford(51)).toBe(false);
    });
  });

  describe('kalıcılık', () => {
    it('altın sayfa yenilenince korunur', () => {
      gold.earn(120);
      gold.spend(45);

      const reloaded = fresh();

      expect(reloaded.balance()).toBe(75);
      expect(reloaded.earned()).toBe(120);
      expect(reloaded.spent()).toBe(45);
    });

    it('bozuk kayıt oyunu çökertmez', () => {
      localStorage.setItem('kelimebaz:gold', '{bozuk');
      expect(fresh().balance()).toBe(0);

      localStorage.setItem('kelimebaz:gold', JSON.stringify({ balance: -5, earned: 'çok' }));
      expect(fresh().balance()).toBe(0);
      expect(fresh().earned()).toBe(0);
    });
  });
});
