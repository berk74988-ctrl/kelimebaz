import { effect, inject, Injectable, signal } from '@angular/core';
import { Lang } from '../core/lang';
import { THEME_MASTER_BADGE, THEME_REWARD_GOLD, THEMES } from '../core/themes';
import { GoldService } from './gold.service';
import { InventoryService } from './inventory.service';
import { LanguageService } from './language.service';

const KEY = 'kelimebaz:themes';

interface Progress {
  /** `${lang}:${themeId}` → bulunan kelimeler. */
  found: Record<string, string[]>;
  /** Ödülü ödenmiş temalar: `${lang}:${themeId}`. */
  claimed: string[];
}

/**
 * TEMA MODU — tema başına ilerleme + tamamlama ödülü. Kelime setleri tembel iner.
 *
 * CASUAL: tema modu ligi/istatistiği etkilemez (YZ modu gibi) — bkz. GameService.
 * Tema tamamlanınca altın (bir kez, `claimed` ile korunur); tümü tamamlanınca
 * özel rozet. İlerleme cihazda (`kelimebaz:themes`).
 */
@Injectable({ providedIn: 'root' })
export class ThemeModeService {
  private readonly langSvc = inject(LanguageService);
  private readonly gold = inject(GoldService);
  private readonly inventory = inject(InventoryService);

  /** Aktif dilin tema→kelimeler haritası (tembel inince dolar). */
  private readonly _words = signal<Record<string, string[]> | null>(null);
  readonly ready = signal(false);

  private readonly loaded = new Map<Lang, Record<string, string[]>>();
  private readonly _progress = signal<Progress>(this.load());

  constructor() {
    effect(() => {
      const lang = this.langSvc.lang();
      void this.ensure(lang);
    });
  }

  /** Aktif dilin tema verisi inene kadar bekler (testler + gerekli akışlar). */
  async whenReady(): Promise<void> {
    await this.ensure(this.langSvc.lang());
  }

  private async ensure(lang: Lang): Promise<void> {
    if (this.loaded.has(lang)) {
      this._words.set(this.loaded.get(lang)!);
      this.ready.set(true);
      return;
    }
    this.ready.set(false);
    try {
      const mod =
        lang === 'tr'
          ? await import('../data/themes-tr.json')
          : await import('../data/themes-en.json');
      const data = ((mod as { default?: unknown }).default ?? mod) as {
        themes: Record<string, string[]>;
      };
      this.loaded.set(lang, data.themes);
      if (this.langSvc.lang() === lang) {
        this._words.set(data.themes);
        this.ready.set(true);
      }
    } catch {
      this.ready.set(false);
    }
  }

  private lk(themeId: string): string {
    return `${this.langSvc.lang()}:${themeId}`;
  }

  /** Bu temadaki toplam kelime (aktif dil; inmemişse 0). */
  total(themeId: string): number {
    return this._words()?.[themeId]?.length ?? 0;
  }

  /** Bu temada bulunan kelime sayısı (aktif dil). */
  foundCount(themeId: string): number {
    return this._progress().found[this.lk(themeId)]?.length ?? 0;
  }

  /** İlerleme 0..1. */
  progress(themeId: string): number {
    const t = this.total(themeId);
    return t ? this.foundCount(themeId) / t : 0;
  }

  isComplete(themeId: string): boolean {
    const t = this.total(themeId);
    return t > 0 && this.foundCount(themeId) >= t;
  }

  /** Oynanacak bir sonraki kelime: henüz bulunmamış rastgele (hepsi bulunduysa herhangi). */
  nextWord(themeId: string): string {
    const all = this._words()?.[themeId] ?? [];
    if (!all.length) return '';
    const found = new Set(this._progress().found[this.lk(themeId)] ?? []);
    const remaining = all.filter((w) => !found.has(w));
    const pool = remaining.length ? remaining : all;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Bir kelime bulundu → ilerlemeye ekle. Tema tamamlandıysa ödülü BİR KEZ öde;
   * tüm temalar tamamlandıysa özel rozeti ver.
   */
  markFound(themeId: string, word: string): void {
    const all = this._words()?.[themeId] ?? [];
    if (!all.includes(word)) return; // temaya ait değil → yoksay
    const key = this.lk(themeId);
    const p = this._progress();
    const found = new Set(p.found[key] ?? []);
    if (found.has(word)) return; // zaten var
    found.add(word);

    const next: Progress = {
      found: { ...p.found, [key]: [...found] },
      claimed: [...p.claimed],
    };

    // Tema tamamlandı mı → ödül (bir kez).
    if (found.size >= all.length && !next.claimed.includes(key)) {
      next.claimed.push(key);
      this.gold.earn(THEME_REWARD_GOLD);
      // Tüm temalar (aktif dil) tamamlandıysa usta rozeti.
      const lang = this.langSvc.lang();
      const allDone = THEMES.every((t) => next.claimed.includes(`${lang}:${t.id}`));
      if (allDone) this.inventory.grant(THEME_MASTER_BADGE);
    }

    this._progress.set(next);
    this.save(next);
  }

  reset(): void {
    const empty: Progress = { found: {}, claimed: [] };
    this._progress.set(empty);
    this.save(empty);
  }

  private load(): Progress {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { found: {}, claimed: [] };
      const p = JSON.parse(raw) as Partial<Progress>;
      return {
        found: p.found && typeof p.found === 'object' ? p.found : {},
        claimed: Array.isArray(p.claimed) ? p.claimed : [],
      };
    } catch {
      return { found: {}, claimed: [] };
    }
  }

  private save(p: Progress): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* depolama kapalı */
    }
  }
}
