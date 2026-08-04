import { Injectable, signal } from '@angular/core';
import { Balance, BALANCE_DEFAULTS, mergeBalance } from '../core/balance';
import { serverBase } from '../core/server-base';
import { GoldConfig } from '../core/gold';

/**
 * ===========================================================================
 * DENGE AYARLARI SERVİSİ — ekonomi/zorluk parametrelerini sunucudan okur.
 *
 * KATMAN: gömülü VARSAYILAN → (varsa) sunucu geçersiz kılması. Değerler her zaman
 * aralığa SIKIŞTIRILIR (core/balance.mergeBalance) → hatalı override oyunu bozamaz.
 *
 * SAĞLAMLIK: Ekonomi ayarı için oyun ASLA beklemez. Değerler senkron okunur
 * (önbellekten). Sunucu erişilemezse gömülü varsayılan kullanılır. İstek oturum
 * başına bir kez atılır (her oyunda DEĞİL) + localStorage'a önbelleklenir.
 *
 * ÖNEMLİ: Bu servis yalnız KAZANÇ ORANLARINI ve YZ zorluğunu ayarlar; oyuncunun
 * MEVCUT altını/envanteri (GoldService/InventoryService) buradan ETKİLENMEZ.
 * ===========================================================================
 */
const KEY = 'kelimebaz:balance';

@Injectable({ providedIn: 'root' })
export class BalanceService {
  private readonly _balance = signal<Balance>(mergeBalance(this.loadCache()));
  readonly balance = this._balance.asReadonly();

  /** Test ortamında ağ isteğini kapatır (test-seed ayarlar). */
  static skipNetwork = false;

  constructor() {
    if (!BalanceService.skipNetwork) void this.refresh(); // üretimde override'ı tazele
  }

  /** Tek bir parametre (aralığa sıkıştırılmış, varsayılana düşer). */
  get(key: string): number {
    return this._balance()[key] ?? BALANCE_DEFAULTS[key];
  }

  /** goldForGame/levelBonus için altın yapılandırması. */
  goldConfig(): GoldConfig {
    const b = this._balance();
    return {
      winGold: b['winGold'],
      speedGold: b['speedGold'],
      dailyBonus: b['dailyBonus'],
      lossGold: b['lossGold'],
      levelGold: b['levelGold'],
      levelGoldCap: b['levelGoldCap'],
    };
  }

  /** YZ zorluk çarpanı (persona bandını entropi diliminde kaydırır; anahtar korunur). */
  aiTopKMul(): number {
    return this.get('aiTopKMul');
  }

  /** Sunucudan override'ları çek (best-effort). Hata → gömülü varsayılan. */
  async refresh(): Promise<void> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(this.base() + '/balance', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const data = (await res.json()) as { overrides?: Partial<Balance> };
      const merged = mergeBalance(data.overrides); // aralığa sıkıştırılır
      this._balance.set(merged);
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ overrides: data.overrides ?? {}, at: Date.now() }),
        );
      } catch {
        /* depolama kapalı — bellekte kalır */
      }
    } catch {
      /* sunucu erişilemez → gömülü varsayılan (oyun etkilenmez) */
    }
  }

  private base(): string {
    return serverBase();
  }

  private loadCache(): Partial<Balance> | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw).overrides as Partial<Balance>) : null;
    } catch {
      return null;
    }
  }
}
