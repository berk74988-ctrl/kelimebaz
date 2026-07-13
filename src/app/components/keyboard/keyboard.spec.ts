import { TestBed } from '@angular/core/testing';
import { Keyboard, TR_LETTERS, TR_ROWS } from './keyboard';
import { LetterState } from '../../models/game.model';

describe('Keyboard — Türkçe ekran klavyesi', () => {
  function render(keyStates: Record<string, LetterState> = {}) {
    const fixture = TestBed.createComponent(Keyboard);
    fixture.componentRef.setInput('keyStates', keyStates);
    fixture.detectChanges();
    return fixture;
  }

  function keyByText(el: HTMLElement, text: string): HTMLButtonElement {
    const keys = Array.from(el.querySelectorAll<HTMLButtonElement>('.key'));
    const found = keys.find((k) => k.getAttribute('aria-label') === text);
    if (!found) throw new Error(`"${text}" tuşu bulunamadı`);
    return found;
  }

  describe('düzen', () => {
    it('3 sıradan oluşur', () => {
      const el = render().nativeElement as HTMLElement;
      expect(el.querySelectorAll('.krow').length).toBe(3);
    });

    it('Türkçe alfabenin 29 harfini içerir (Q, W, X yok)', () => {
      expect(TR_LETTERS.size).toBe(29);
      for (const ch of ['Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü', 'I']) {
        expect(TR_LETTERS.has(ch)).toBe(true);
      }
      // Türkçede olmayan harfler klavyede yer almaz
      for (const ch of ['Q', 'W', 'X']) {
        expect(TR_LETTERS.has(ch)).toBe(false);
      }
    });

    it('ENTER ve SİL tuşları vardır', () => {
      const el = render().nativeElement as HTMLElement;
      expect(keyByText(el, 'ENTER')).toBeTruthy();
      expect(keyByText(el, 'Sil')).toBeTruthy();
      // 29 harf + ENTER + SİL = 31 tuş
      expect(el.querySelectorAll('.key').length).toBe(31);
    });

    it('ENTER ve SİL geniş tuştur (parmakla kolay basılsın)', () => {
      const el = render().nativeElement as HTMLElement;
      expect(keyByText(el, 'ENTER').classList.contains('wide')).toBe(true);
      expect(keyByText(el, 'Sil').classList.contains('wide')).toBe(true);
    });
  });

  describe('tuşa basma', () => {
    it('harf tuşu → letter olayı yayar', () => {
      const fixture = render();
      const emitted: string[] = [];
      fixture.componentInstance.letter.subscribe((l) => emitted.push(l));

      const el = fixture.nativeElement as HTMLElement;
      keyByText(el, 'K').click();
      keyByText(el, 'İ').click();
      keyByText(el, 'Ş').click();

      expect(emitted).toEqual(['K', 'İ', 'Ş']);
    });

    it('ENTER → enter olayı yayar', () => {
      const fixture = render();
      let fired = 0;
      fixture.componentInstance.enter.subscribe(() => fired++);
      keyByText(fixture.nativeElement, 'ENTER').click();
      expect(fired).toBe(1);
    });

    it('SİL → backspace olayı yayar', () => {
      const fixture = render();
      let fired = 0;
      fixture.componentInstance.backspace.subscribe(() => fired++);
      keyByText(fixture.nativeElement, 'Sil').click();
      expect(fired).toBe(1);
    });
  });

  describe('renklendirme', () => {
    it('tuşlar tahmin sonucuna göre renk sınıfı alır', () => {
      const el = render({ K: 'correct', A: 'present', Z: 'absent' })
        .nativeElement as HTMLElement;

      expect(keyByText(el, 'K').classList.contains('correct')).toBe(true);
      expect(keyByText(el, 'A').classList.contains('present')).toBe(true);
      expect(keyByText(el, 'Z').classList.contains('absent')).toBe(true);
      // durumu bilinmeyen tuş renksiz kalır
      expect(keyByText(el, 'M').className).not.toMatch(/correct|present|absent/);
    });
  });

  it('düzen sabiti 3 sıra olarak tanımlıdır', () => {
    expect(TR_ROWS.length).toBe(3);
    expect(TR_ROWS[2][0]).toBe('ENTER');
    expect(TR_ROWS[2].at(-1)).toBe('SİL');
  });
});
