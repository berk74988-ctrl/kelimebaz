import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResultModal } from './result-modal';
import { GameStatus } from '../../models/game.model';

describe('ResultModal — sonuç ekranı', () => {
  function render(status: GameStatus, answer = 'KALEM', attempts = 3) {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const fixture: ComponentFixture<ResultModal> = TestBed.createComponent(ResultModal);
    fixture.componentRef.setInput('status', status);
    fixture.componentRef.setInput('answer', answer);
    fixture.componentRef.setInput('attempts', attempts);
    fixture.detectChanges();
    return fixture;
  }

  describe('kazanınca', () => {
    it('kutlama mesajı gösterilir', () => {
      const el = render('won').nativeElement as HTMLElement;

      expect(el.querySelector('.head')?.textContent).toContain('Tebrikler');
      // Kazanma/kaybetme artık modalın kendisinde işaretli — başlık rengi,
      // üstteki renk sızıntısı ve cevap kutuları hep bu tek sınıftan besleniyor.
      expect(el.querySelector('.modal')?.classList.contains('won')).toBe(true);
    });

    it('kaç tahminde bulunduğu yazar', () => {
      const el = render('won', 'KALEM', 3).nativeElement as HTMLElement;
      expect(el.querySelector('.sub')?.textContent).toContain('3/6');
    });
  });

  describe('kaybedince', () => {
    it('kaybetme mesajı gösterilir', () => {
      const el = render('lost').nativeElement as HTMLElement;

      expect(el.querySelector('.head')?.textContent).toContain('olmadı');
      expect(el.querySelector('.modal')?.classList.contains('won')).toBe(false);
    });

    it('DOĞRU KELİME gösterilir', () => {
      const el = render('lost', 'ÇİÇEK', 6).nativeElement as HTMLElement;
      expect(el.querySelector('.answer')?.textContent?.trim()).toBe('ÇİÇEK');
    });
  });

  describe('butonlar', () => {
    it('"Yeni Oyun" butonu playAgain olayını yayar', () => {
      const fixture = render('lost');
      let fired = 0;
      fixture.componentInstance.playAgain.subscribe(() => fired++);

      const btn = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.btn'),
      ).find((b) => b.textContent?.includes('Yeni Oyun'));

      btn?.click();
      expect(fired).toBe(1);
    });

    it('kapatma butonu close olayını yayar (tahtayı inceleyebilmek için)', () => {
      const fixture = render('won');
      let fired = 0;
      fixture.componentInstance.close.subscribe(() => fired++);

      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.x')?.click();
      expect(fired).toBe(1);
    });
  });

  it('istatistik paneli gösterilir', () => {
    // Paneli çizmek StatsPanel'in işi (kendi testleri var); burada
    // sonuç ekranının onu yerleştirdiğini doğruluyoruz.
    const el = render('won').nativeElement as HTMLElement;
    expect(el.querySelector('app-stats-panel')).toBeTruthy();
  });
});
