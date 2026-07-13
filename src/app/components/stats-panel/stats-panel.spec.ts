import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatsPanel } from './stats-panel';
import { StatsService } from '../../services/stats.service';

describe('StatsPanel — istatistik ekranı', () => {
  let stats: StatsService;

  function render(highlight: number | null = null): HTMLElement {
    const fixture: ComponentFixture<StatsPanel> = TestBed.createComponent(StatsPanel);
    fixture.componentRef.setInput('highlight', highlight);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    stats = TestBed.inject(StatsService);
  });

  describe('boş durum', () => {
    it('hiç oyun yokken "henüz istatistik yok" gösterir', () => {
      const el = render();

      expect(el.querySelector('.empty')).toBeTruthy();
      expect(el.querySelector('.empty .t')?.textContent).toContain('Henüz istatistik yok');
      expect(el.querySelector('.grid')).toBeNull(); // sayılar gösterilmez
      expect(el.querySelector('.dist')).toBeNull(); // grafik gösterilmez
    });
  });

  describe('veri varken', () => {
    beforeEach(() => {
      stats.record(true, 3);
      stats.record(true, 3);
      stats.record(false, 6);
      stats.record(true, 5);
    });

    it('sayılar doğru gösterilir', () => {
      const el = render();
      const values = Array.from(el.querySelectorAll('.stat b')).map((b) => b.textContent?.trim());

      expect(el.querySelector('.empty')).toBeNull();
      expect(values).toEqual(['4', '75%', '1', '2']); // oynanan, kazanma, seri, en iyi seri
    });

    it('dağılım grafiği 6 satır çizer ve sayıları doğru yazar', () => {
      const el = render();
      const bars = el.querySelectorAll('.bar');

      expect(el.querySelectorAll('.dist-row').length).toBe(6);
      expect(bars[2].textContent?.trim()).toBe('2'); // 3. tahminde 2 kez kazanıldı
      expect(bars[4].textContent?.trim()).toBe('1'); // 5. tahminde 1 kez
      expect(bars[0].textContent?.trim()).toBe('0'); // 1. tahminde hiç
    });

    it('kazanılmamış satırlar "zero" olarak işaretlenir', () => {
      const el = render();
      const bars = el.querySelectorAll('.bar');

      expect(bars[0].classList.contains('zero')).toBe(true); // 1. tahmin: hiç
      expect(bars[2].classList.contains('zero')).toBe(false); // 3. tahmin: var
    });

    it('DOĞRU SATIRI vurgular', () => {
      const el = render(3); // 3 tahminde kazanıldı
      const bars = el.querySelectorAll('.bar');

      expect(bars[2].classList.contains('hit')).toBe(true); // 3. satır vurgulu
      expect(bars[0].classList.contains('hit')).toBe(false);
      expect(bars[4].classList.contains('hit')).toBe(false);
    });

    it('vurgu yoksa hiçbir satır vurgulanmaz', () => {
      const el = render(null);

      for (const bar of Array.from(el.querySelectorAll('.bar'))) {
        expect(bar.classList.contains('hit')).toBe(false);
      }
    });

    it('en yüksek sütun %100 genişlikte, diğerleri orantılı', () => {
      const el = render();
      const bars = el.querySelectorAll<HTMLElement>('.bar');

      expect(bars[2].style.width).toBe('100%'); // en yüksek (2 kazanma)
      expect(bars[4].style.width).toBe('50%'); // yarısı (1 kazanma)
    });
  });
});
