import { Injectable, signal } from '@angular/core';
import {
  AiBehavior,
  AI_BEHAVIOR_DEFAULTS,
  adaptiveParams,
  AdaptiveParams,
  hintCoach,
  HintCoach,
  mergeAiBehavior,
  personaEnabled,
  personaWeightOverride,
} from '../core/ai-behavior';
import { serverBase } from '../core/server-base';

/**
 * ===========================================================================
 * YZ DAVRANIŞ SERVİSİ — rakip gücü + ipucu koçu ayarlarını sunucudan okur.
 *
 * KATMAN: gömülü VARSAYILAN → (varsa) sunucu geçersiz kılması (aralığa sıkıştırılır).
 * SAĞLAMLIK: oyun ASLA beklemez; değerler senkron okunur (önbellekten). Sunucu
 * erişilemezse gömülü varsayılan → oyun etkilenmez. İstek oturum başına bir kez
 * atılır + localStorage'a önbelleklenir. (balance.service.ts ile aynı desen.)
 *
 * ÖNEMLİ: Süren maçlar ETKİLENMEZ — AiSolver config'i maç başında sabitlenir;
 * override değişikliği yalnız SONRAKİ maçlara/istemlere yansır.
 * ===========================================================================
 */
const KEY = 'kelimebaz:ai-behavior';

@Injectable({ providedIn: 'root' })
export class AiBehaviorService {
  private readonly _behavior = signal<AiBehavior>(mergeAiBehavior(this.loadCache()));
  readonly behavior = this._behavior.asReadonly();

  /** Test ortamında ağ isteğini kapatır. */
  static skipNetwork = false;

  constructor() {
    if (!AiBehaviorService.skipNetwork) void this.refresh();
  }

  /** Karakter panelden AÇIK mı? */
  personaEnabled(id: string): boolean {
    return personaEnabled(this._behavior(), id);
  }
  /** Karaktere uygulanacak ağırlık override'ı (biasWeight/gamble). */
  personaWeightOverride(id: string): { biasWeight?: number; gamble?: number } {
    return personaWeightOverride(this._behavior(), id);
  }
  /** Uyarlanabilir zorluk eşikleri. */
  adaptive(): AdaptiveParams {
    return adaptiveParams(this._behavior());
  }
  /** İpucu koçu ayarları. */
  hint(): HintCoach {
    return hintCoach(this._behavior());
  }

  /** Sunucudan override'ları çek (best-effort). Hata → gömülü varsayılan. */
  async refresh(): Promise<void> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(this.base() + '/ai-behavior', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const data = (await res.json()) as { overrides?: Partial<AiBehavior> };
      this._behavior.set(mergeAiBehavior(data.overrides)); // aralığa sıkıştırılır
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

  private loadCache(): Partial<AiBehavior> | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw).overrides as Partial<AiBehavior>) : null;
    } catch {
      return null;
    }
  }

  /** Test yardımcısı: override'ları doğrudan ayarla (ağ olmadan). */
  setForTest(overrides: Partial<AiBehavior> | null): void {
    this._behavior.set(mergeAiBehavior(overrides));
  }
}

export { AI_BEHAVIOR_DEFAULTS };
