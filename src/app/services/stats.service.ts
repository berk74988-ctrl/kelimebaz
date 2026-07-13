import { Injectable, signal } from '@angular/core';
import { EMPTY_STATS, MAX_ATTEMPTS, Stats } from '../models/game.model';

const STATS_KEY = 'kelimebaz:stats';

/** Boş bir dağılım dizisi (her seferinde yeni referans). */
function emptyDistribution(): number[] {
  return Array.from({ length: MAX_ATTEMPTS }, () => 0);
}

function emptyStats(): Stats {
  return { ...EMPTY_STATS, distribution: emptyDistribution() };
}

/**
 * Oyuncu istatistikleri — localStorage'da kalıcı.
 * Sayfa yenilense, tarayıcı kapansa bile korunur.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly _stats = signal<Stats>(this.load());
  readonly stats = this._stats.asReadonly();

  /** Bir oyunun sonucunu işler. Her oyun bitiminde TAM BİR KEZ çağrılır. */
  record(won: boolean, attempts: number): void {
    const s = this._stats();
    const streak = won ? s.currentStreak + 1 : 0;

    const next: Stats = {
      played: s.played + 1,
      won: s.won + (won ? 1 : 0),
      currentStreak: streak,
      maxStreak: Math.max(s.maxStreak, streak),
      distribution: [...s.distribution],
      lastWinAttempts: won ? attempts : s.lastWinAttempts,
    };

    if (won && attempts >= 1 && attempts <= MAX_ATTEMPTS) {
      next.distribution[attempts - 1]++;
    }

    this._stats.set(next);
    this.persist(next);
  }

  /** Kazanma yüzdesi (tam sayı). Hiç oynanmadıysa 0. */
  winRate(): number {
    const s = this._stats();
    return s.played === 0 ? 0 : Math.round((s.won / s.played) * 100);
  }

  /** Dağılım grafiğindeki en yüksek sütun — çubuk genişliği bunun oranıdır. */
  maxInDistribution(): number {
    return Math.max(1, ...this._stats().distribution);
  }

  /** Hiç oyun oynanmadı mı? (boş durum ekranı için) */
  isEmpty(): boolean {
    return this._stats().played === 0;
  }

  reset(): void {
    const fresh = emptyStats();
    this._stats.set(fresh);
    this.persist(fresh);
  }

  private persist(s: Stats): void {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(s));
    } catch {
      /* depolama kapalıysa sessizce geç — oyun yine de oynanır */
    }
  }

  /** Kayıtlı veriyi okur; bozuk/eksik veriye karşı dayanıklıdır. */
  private load(): Stats {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return emptyStats();

      const parsed = JSON.parse(raw) as Partial<Stats>;
      const dist = parsed.distribution;

      return {
        ...emptyStats(),
        ...parsed,
        // Eski/bozuk kayıtlarda dağılım dizisi hatalı olabilir
        distribution:
          Array.isArray(dist) && dist.length === MAX_ATTEMPTS ? [...dist] : emptyDistribution(),
        lastWinAttempts: parsed.lastWinAttempts ?? null,
      };
    } catch {
      return emptyStats();
    }
  }
}
