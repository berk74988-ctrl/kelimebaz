import { Injectable, computed, signal } from '@angular/core';

const KEY = 'kelimebaz:gold';

interface Purse {
  /** Harcanabilir altın. */
  balance: number;
  /** Şimdiye kadar kazanılan TOPLAM altın (harcansa da düşmez). */
  earned: number;
  /** Şimdiye kadar harcanan toplam. */
  spent: number;
}

const EMPTY: Purse = { balance: 0, earned: 0, spent: 0 };

/**
 * 🪙 ALTIN KASASI — localStorage'da kalıcı.
 *
 * Bakiyenin YANINDA "toplam kazanılan" da tutuluyor. Sadece bakiye tutsaydık,
 * oyuncu altınını harcayınca "şimdiye kadar ne kadar kazandım" bilgisi
 * kaybolurdu — bu, profilde gösterilecek gerçek bir başarım.
 *
 * MAĞAZA İÇİN HAZIR: `spend()` yeterli bakiye yoksa false döner ve kasaya
 * dokunmaz. Mağaza sadece bunu çağıracak.
 */
@Injectable({ providedIn: 'root' })
export class GoldService {
  private readonly _purse = signal<Purse>(this.load());

  readonly balance = computed(() => this._purse().balance);
  readonly earned = computed(() => this._purse().earned);
  readonly spent = computed(() => this._purse().spent);

  /** Altın ekler. Negatif/bozuk miktarlar yok sayılır. */
  earn(amount: number): void {
    const n = Math.floor(amount);
    if (!Number.isFinite(n) || n <= 0) return;

    const p = this._purse();
    this.commit({ ...p, balance: p.balance + n, earned: p.earned + n });
  }

  /**
   * Altın harcar (mağaza bunu çağıracak).
   * @returns başarılı mı — yetersiz bakiyede HİÇBİR ŞEY değişmez
   */
  spend(amount: number): boolean {
    const n = Math.floor(amount);
    if (!Number.isFinite(n) || n <= 0) return false;

    const p = this._purse();
    if (p.balance < n) return false;

    this.commit({ ...p, balance: p.balance - n, spent: p.spent + n });
    return true;
  }

  /** Bu fiyatı karşılayabilir mi? (mağazada butonu kilitlemek için) */
  canAfford(price: number): boolean {
    return this._purse().balance >= Math.floor(price);
  }

  reset(): void {
    this.commit({ ...EMPTY });
  }

  private commit(p: Purse): void {
    this._purse.set(p);
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* depolama kapalı — oyun yine oynanır */
    }
  }

  /** Bozuk/eksik kayda dayanıklı okuma. */
  private load(): Purse {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...EMPTY };

      const p = JSON.parse(raw) as Partial<Purse>;
      const num = (v: unknown) =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

      return { balance: num(p.balance), earned: num(p.earned), spent: num(p.spent) };
    } catch {
      return { ...EMPTY };
    }
  }
}
