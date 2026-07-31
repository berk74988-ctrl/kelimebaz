import { inject, Injectable, signal } from '@angular/core';
import { LanguageService } from './language.service';

/** Bir tahmin: kelime + renk deseni ('2'=yeşil,'1'=sarı,'0'=gri). */
export interface HintGuess {
  word: string;
  pattern: string;
}

const PROBE_TIMEOUT = 4000;
const HINT_TIMEOUT = 15000;

/**
 * 🆘 ÇALIŞMA ZAMANI YZ İPUCU — "Takıldım" yardımı (rooms-server üzerinden).
 *
 * Bu, oyunun tek ÇALIŞMA ZAMANI MALİYETLİ özelliğidir. API anahtarı ASLA tarayıcıda
 * durmaz — istek rooms-server'daki POST /hint'e gider, anahtar orada env'dedir.
 *
 * Erişilebilirlik: açılışta GET /health çekilir; sunucu `hint:true` demezse
 * (anahtar yok ya da sunucu kapalı) özellik SESSİZCE gizlenir — oyun hiç bozulmaz.
 */
@Injectable({ providedIn: 'root' })
export class AiHintService {
  private readonly lang = inject(LanguageService);
  private readonly base = this.resolveBase();

  /** Özellik kullanılabilir mi? (sunucu ayakta + anahtar tanımlı) */
  private readonly _available = signal(false);
  readonly available = this._available.asReadonly();

  constructor() {
    void this.probe();
  }

  /** RoomService ile aynı köken çözümü: canlıda /berk/rooms, yerelde :4243. */
  private resolveBase(): string {
    if (typeof location === 'undefined') return 'http://localhost:4243';
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4243';
    return '/berk/rooms';
  }

  /** Sağlık kontrolü — sunucu YZ ipucunu destekliyor mu? */
  private async probe(): Promise<void> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
      const res = await fetch(this.base + '/health', { signal: ctrl.signal });
      clearTimeout(timer);
      const data = (await res.json()) as { hint?: boolean };
      this._available.set(res.ok && data?.hint === true);
    } catch {
      this._available.set(false); // sunucu erişilemez → özellik gizli
    }
  }

  /**
   * İpucu iste. Girdi cevabı İÇERİR ama bu yalnızca sunucunun sızıntı denetimi
   * içindir (istemci zaten cevabı biliyor); modele cevap gönderilmez.
   * Hata durumunda throw eder → çağıran altını iade eder.
   */
  async requestHint(input: {
    length: number;
    guesses: HintGuess[];
    answer: string;
  }): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HINT_TIMEOUT);
    let res: Response;
    try {
      res = await fetch(this.base + '/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, lang: this.lang.lang() }),
        signal: ctrl.signal,
      });
    } catch {
      throw new Error('network');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error('http_' + res.status);
    const data = (await res.json()) as { hint?: string };
    const hint = String(data?.hint || '').trim();
    if (!hint) throw new Error('empty');
    return hint;
  }
}
