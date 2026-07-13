import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';
const THEME_KEY = 'kelimebaz:theme';

/** Karanlık / aydınlık mod — <html data-theme="..."> üzerinden. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.load());
  readonly theme = this._theme.asReadonly();

  constructor() {
    this.apply(this._theme());
  }

  toggle(): void {
    const next: Theme = this._theme() === 'dark' ? 'light' : 'dark';
    this._theme.set(next);
    this.apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* yoksay */
    }
  }

  private apply(t: Theme): void {
    document.documentElement.dataset['theme'] = t;
  }

  private load(): Theme {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* yoksay */
    }
    // Kayıt yoksa sistem tercihine uy
    const prefersLight =
      typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }
}
