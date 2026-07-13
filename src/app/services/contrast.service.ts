import { Injectable, signal } from '@angular/core';

export const CONTRAST_KEY = 'kelimebaz:contrast';

/**
 * Yüksek kontrast (renk körü) modu.
 *
 * NEDEN: Oyunun tüm bilgisi yeşil/sarı ayrımına dayanıyor. Kırmızı-yeşil renk
 * körlüğü olan kişiler (erkeklerin ~%8'i) bu ikisini ayırt edemez — yani oyun
 * onlar için oynanamaz hâle gelir.
 *
 * Bu mod, ayırt edilmesi kolay MAVİ/TURUNCU paletine geçer.
 * Tema (koyu/açık) tercihinden BAĞIMSIZDIR; ikisi birlikte kullanılabilir.
 */
@Injectable({ providedIn: 'root' })
export class ContrastService {
  private readonly _high = signal<boolean>(this.load());
  readonly high = this._high.asReadonly();

  constructor() {
    this.apply(this._high());
  }

  toggle(): void {
    this.set(!this._high());
  }

  set(high: boolean): void {
    this._high.set(high);
    this.apply(high);

    try {
      localStorage.setItem(CONTRAST_KEY, high ? '1' : '0');
    } catch {
      /* depolama kapalıysa mod yine çalışır, sadece hatırlanmaz */
    }
  }

  private apply(high: boolean): void {
    const root = document.documentElement;
    if (high) {
      root.dataset['contrast'] = 'high';
    } else {
      delete root.dataset['contrast'];
    }
  }

  private load(): boolean {
    try {
      return localStorage.getItem(CONTRAST_KEY) === '1';
    } catch {
      return false;
    }
  }
}
