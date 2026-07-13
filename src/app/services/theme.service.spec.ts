import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { THEME_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  /** Servisi sıfırdan kurar — sayfa yenilenmesini taklit eder. */
  function freshService(): ThemeService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ThemeService);
  }

  /** Sistem temasını taklit eder. */
  function mockSystem(prefersLight: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      value: (q: string) => ({
        matches: q.includes('light') ? prefersLight : !prefersLight,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    mockSystem(false); // varsayılan: sistem koyu tema istiyor
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('anında geçiş', () => {
    it('toggle temayı değiştirir', () => {
      const theme = freshService();
      expect(theme.theme()).toBe('dark');

      theme.toggle();
      expect(theme.theme()).toBe('light');

      theme.toggle();
      expect(theme.theme()).toBe('dark');
    });

    it('temayı <html data-theme> üzerine yazar (CSS anında tepki verir)', () => {
      const theme = freshService();
      expect(document.documentElement.dataset['theme']).toBe('dark');

      theme.toggle();
      expect(document.documentElement.dataset['theme']).toBe('light');
    });

    it('mobil tarayıcı çubuğunun rengini de günceller', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);

      const theme = freshService();
      expect(meta.getAttribute('content')).toBe('#10131a'); // koyu

      theme.toggle();
      expect(meta.getAttribute('content')).toBe('#f6f7fb'); // açık

      meta.remove();
    });
  });

  describe('tercih sayfa yenilenince korunur', () => {
    it('seçilen tema localStorage a yazılır', () => {
      const theme = freshService();
      theme.toggle(); // light

      expect(localStorage.getItem(THEME_KEY)).toBe('light');
    });

    it('sayfa yenilenince kayıtlı tema geri gelir', () => {
      freshService().toggle(); // light seçildi

      const reloaded = freshService(); // sayfa yenilendi

      expect(reloaded.theme()).toBe('light');
      expect(document.documentElement.dataset['theme']).toBe('light');
    });

    it('kayıtlı tercih SİSTEM temasını ezer', () => {
      mockSystem(true); // sistem aydınlık istiyor
      localStorage.setItem(THEME_KEY, 'dark'); // ama kullanıcı koyu seçmiş

      expect(freshService().theme()).toBe('dark'); // kullanıcı kazanır
    });
  });

  describe('ilk açılışta sistem teması', () => {
    it('kayıt yoksa sistem AYDINLIK ise aydınlık başlar', () => {
      mockSystem(true);
      expect(freshService().theme()).toBe('light');
    });

    it('kayıt yoksa sistem KOYU ise koyu başlar', () => {
      mockSystem(false);
      expect(freshService().theme()).toBe('dark');
    });
  });

  describe('dayanıklılık', () => {
    it('bozuk kayıt sistem temasına düşer', () => {
      localStorage.setItem(THEME_KEY, 'mor'); // geçersiz
      mockSystem(true);

      expect(freshService().theme()).toBe('light');
    });

    it('matchMedia yoksa çökmez, koyu temaya düşer', () => {
      Object.defineProperty(window, 'matchMedia', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      expect(freshService().theme()).toBe('dark');
    });
  });
});
