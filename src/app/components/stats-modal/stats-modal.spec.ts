import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatsModal } from './stats-modal';

describe('StatsModal — 📊 istatistik ekranı', () => {
  function render() {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const fixture: ComponentFixture<StatsModal> = TestBed.createComponent(StatsModal);
    fixture.detectChanges();
    return fixture;
  }

  it('istatistik paneli BURADA yaşıyor (058c850 ile sonuç ekranından taşındı)', () => {
    // OYUN-329'un öbür yarısı: panel sonuç ekranından çıkarıldı (result-modal.spec)
    // → yeni evi 📊 modalı. Panelin GERÇEKTEN burada olduğunu doğruluyoruz ki
    //   "nerede olduğu" bilgisi teste yazılı olsun (boşa alınmış test olmasın).
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('app-stats-panel')).toBeTruthy();
  });
});
