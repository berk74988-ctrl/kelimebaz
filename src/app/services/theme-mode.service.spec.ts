import { TestBed } from '@angular/core/testing';
import { THEMES } from '../core/themes';
import { GoldService } from './gold.service';
import { InventoryService } from './inventory.service';
import { ThemeModeService } from './theme-mode.service';

/**
 * Tema modu — ilerleme, tamamlama ödülü (bir kez), rozet, kalıcılık.
 */
describe('ThemeModeService — tema ilerlemesi', () => {
  function fresh(): ThemeModeService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ThemeModeService);
  }

  let svc: ThemeModeService;

  beforeEach(async () => {
    localStorage.clear();
    svc = fresh();
    await svc.whenReady(); // tema kelimeleri (tr) insin
  });

  /** Bir temayı bulunmamış kelimelerini işaretleyerek tamamlar. */
  function complete(id: string): void {
    let guard = 0;
    while (!svc.isComplete(id) && guard++ < 200) svc.markFound(id, svc.nextWord(id));
  }

  it('her tema en az 40 kelimeyle yükleniyor', () => {
    for (const t of THEMES) expect(svc.total(t.id)).toBeGreaterThanOrEqual(40);
  });

  it('kelime bulundukça ilerleme artar', () => {
    expect(svc.foundCount('kitchen')).toBe(0);
    svc.markFound('kitchen', svc.nextWord('kitchen'));
    expect(svc.foundCount('kitchen')).toBe(1);
    expect(svc.progress('kitchen')).toBeCloseTo(1 / svc.total('kitchen'));
  });

  it('temaya ait olmayan / tekrar kelime ilerlemeyi bozmaz', () => {
    const w = svc.nextWord('kitchen');
    svc.markFound('kitchen', w);
    svc.markFound('kitchen', w); // tekrar → artmaz
    svc.markFound('kitchen', 'ZZZZZ'); // temada yok → yoksay
    expect(svc.foundCount('kitchen')).toBe(1);
  });

  it('tema tamamlanınca altın ödülü YALNIZ BİR KEZ ödenir', () => {
    const gold = TestBed.inject(GoldService);
    const before = gold.balance();
    complete('kitchen');
    expect(svc.isComplete('kitchen')).toBe(true);
    const afterFirst = gold.balance();
    expect(afterFirst).toBe(before + 150);
    // Daha fazla markFound (hepsi zaten bulundu) tekrar ödeme yapmaz
    svc.markFound('kitchen', svc.nextWord('kitchen'));
    expect(gold.balance()).toBe(afterFirst);
  });

  it('TÜM temalar tamamlanınca "Tema Ustası" rozeti verilir', () => {
    const inv = TestBed.inject(InventoryService);
    expect(inv.owns('badge.themeMaster')).toBe(false);
    for (const t of THEMES) complete(t.id);
    expect(inv.owns('badge.themeMaster')).toBe(true);
  });

  it('ilerleme kalıcı (sayfa yenilenince korunur)', async () => {
    svc.markFound('kitchen', svc.nextWord('kitchen'));
    svc.markFound('nature', svc.nextWord('nature'));
    const reloaded = fresh();
    await reloaded.whenReady();
    expect(reloaded.foundCount('kitchen')).toBe(1);
    expect(reloaded.foundCount('nature')).toBe(1);
  });

  it('reset ilerlemeyi temizler', () => {
    svc.markFound('kitchen', svc.nextWord('kitchen'));
    svc.reset();
    expect(svc.foundCount('kitchen')).toBe(0);
  });
});
