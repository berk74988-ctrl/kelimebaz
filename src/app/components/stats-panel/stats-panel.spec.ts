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
      expect(values).toEqual(['4', '%75', '1', '2']); // oynanan, kazanma, seri, en iyi seri
    });

    it('dağılım grafiği 6 satır çizer ve sayıları doğru yazar', () => {
      const el = render();
      // Adet artık çubuğun içinde değil, sağda ayrı sütunda (.c) —
      // kısa çubuklarda sayı dışarı taşıyordu, sıfır satırları okunmuyordu.
      const counts = Array.from(el.querySelectorAll('.dist-row .c')).map((c) => c.textContent?.trim());

      expect(el.querySelectorAll('.dist-row').length).toBe(6);
      expect(counts).toEqual(['0', '0', '2', '0', '1', '0']);
    });

    it('kazanılmamış satırlarda çubuk genişliği sıfırdır', () => {
      const el = render();
      const bars = el.querySelectorAll<HTMLElement>('.bar');

      expect(bars[0].style.width).toBe('0%'); // 1. tahmin: hiç kazanılmamış
      expect(bars[2].style.width).not.toBe('0%'); // 3. tahmin: var
    });

    it('DOĞRU SATIRI vurgular', () => {
      const el = render(3); // 3 tahminde kazanıldı
      const rows = el.querySelectorAll('.dist-row');

      expect(rows[2].classList.contains('hit')).toBe(true); // 3. satır vurgulu
      expect(rows[0].classList.contains('hit')).toBe(false);
      expect(rows[4].classList.contains('hit')).toBe(false);
    });

    it('vurgu yoksa hiçbir satır vurgulanmaz', () => {
      const el = render(null);

      for (const row of Array.from(el.querySelectorAll('.dist-row'))) {
        expect(row.classList.contains('hit')).toBe(false);
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
