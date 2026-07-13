import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

export const THEME_KEY = 'kelimebaz:theme';

/** Mobil tarayıcı çubuğunun rengi. */
const BROWSER_BAR: Record<Theme, string> = {
  dark: '#10131a',
  light: '#f6f7fb',
};

/**
 * Karanlık / aydınlık tema.
 *
 * Tema <html data-theme="..."> üzerinden uygulanır; renkler CSS
 * değişkenleriyle (:root[data-theme=...]) tanımlıdır — yani geçiş anında olur,
 * hiçbir bileşenin yeniden çizilmesi gerekmez.
 *
 * Not: İlk tema index.html'deki küçük script tarafından, Angular yüklenmeden
 * ÖNCE uygulanır (yanıp sönmeyi önlemek için). Bu servis aynı mantığı kullanır.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.initial());
  readonly theme = this._theme.asReadonly();

  constructor() {
    this.apply(this._theme());
  }

  /** Temayı değiştirir ve tercihi saklar. */
  toggle(): void {
    this.set(this._theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this._theme.set(theme);
    this.apply(theme);

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* depolama kapalıysa tema yine de çalışır, sadece hatırlanmaz */
    }
  }

  /** Sistemin tercih ettiği tema. */
  systemTheme(): Theme {
    const prefersLight =
      typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }

  private apply(theme: Theme): void {
    document.documentElement.dataset['theme'] = theme;

    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', BROWSER_BAR[theme]);
  }

  /** Önce kayıtlı tercih; yoksa sistem teması. */
  private initial(): Theme {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* yoksay */
    }
    return this.systemTheme();
  }
}
