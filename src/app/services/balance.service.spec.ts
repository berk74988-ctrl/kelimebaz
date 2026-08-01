import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BalanceService } from './balance.service';
import { GoldService } from './gold.service';

/**
 * Denge servisi — VARSAYILAN → sunucu override; sunucu erişilemezse gömülü.
 * Kritik: oyuncunun MEVCUT altını ayar değişiminden ETKİLENMEZ.
 */
describe('BalanceService', () => {
  beforeEach(() => {
    localStorage.clear();
    BalanceService.skipNetwork = true; // otomatik refresh kapalı — kontrollü test
    TestBed.configureTestingModule({});
  });
  afterEach(() => vi.restoreAllMocks());

  it('sunucu yokken gömülü varsayılanları verir', () => {
    const b = TestBed.inject(BalanceService);
    expect(b.get('winGold')).toBe(20);
    expect(b.goldConfig()).toEqual({
      winGold: 20,
      speedGold: 5,
      dailyBonus: 10,
      lossGold: 2,
      levelGold: 4,
      levelGoldCap: 40,
    });
    expect(b.aiTopKMul()).toBe(1);
  });

  it('refresh sunucu override’ını uygular (aralığa sıkıştırarak)', async () => {
    const b = TestBed.inject(BalanceService);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ overrides: { winGold: 60, lossGold: 999999 } }),
        }),
      ),
    );
    await b.refresh();
    expect(b.get('winGold')).toBe(60);
    expect(b.get('lossGold')).toBe(100); // 999999 → aralığa sıkıştırıldı
  });

  it('fetch hata verirse gömülü varsayılanda kalır (oyun etkilenmez)', async () => {
    const b = TestBed.inject(BalanceService);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await b.refresh();
    expect(b.get('winGold')).toBe(20);
  });

  it('önceki oturumun önbelleği senkron yüklenir', () => {
    localStorage.setItem('kelimebaz:balance', JSON.stringify({ overrides: { winGold: 45 } }));
    const b = TestBed.inject(BalanceService);
    expect(b.get('winGold')).toBe(45); // yapıcıda önbellekten
  });

  it('ayar değişimi oyuncunun MEVCUT altınını ETKİLEMEZ', async () => {
    const gold = TestBed.inject(GoldService);
    gold.earn(500);
    const before = gold.balance();
    const b = TestBed.inject(BalanceService);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ overrides: { winGold: 200 } }) }),
      ),
    );
    await b.refresh();
    expect(gold.balance()).toBe(before); // altın bakiyesi aynı
  });
});
