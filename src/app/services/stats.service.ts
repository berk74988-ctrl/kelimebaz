import { Injectable, signal } from '@angular/core';
import { EMPTY_STATS, MAX_ATTEMPTS, Stats } from '../models/game.model';

const STATS_KEY = 'kelimebaz:stats';

/** Oyuncu istatistikleri — localStorage'da kalıcı. */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly _stats = signal<Stats>(this.load());
  readonly stats = this._stats.asReadonly();

  /** Bir oyunun sonucunu işler. */
  record(won: boolean, attempts: number): void {
    const s = this._stats();
    const next: Stats = {
      played: s.played + 1,
      won: s.won + (won ? 1 : 0),
      currentStreak: won ? s.currentStreak + 1 : 0,
      maxStreak: won ? Math.max(s.maxStreak, s.currentStreak + 1) : s.maxStreak,
      distribution: [...s.distribution],
    };
    if (won && attempts >= 1 && attempts <= MAX_ATTEMPTS) {
      next.distribution[attempts - 1]++;
    }
    this._stats.set(next);
    this.persist(next);
  }

  /** Kazanma yüzdesi. */
  winRate(): number {
    const s = this._stats();
    return s.played === 0 ? 0 : Math.round((s.won / s.played) * 100);
  }

  /** Dağılım grafiğinde en yüksek sütun (bar genişliği için). */
  maxInDistribution(): number {
    return Math.max(1, ...this._stats().distribution);
  }

  reset(): void {
    this._stats.set({ ...EMPTY_STATS, distribution: [0, 0, 0, 0, 0, 0] });
    this.persist(this._stats());
  }

  private persist(s: Stats): void {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(s));
    } catch {
      /* depolama kapalıysa sessizce geç */
    }
  }

  private load(): Stats {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return { ...EMPTY_STATS, distribution: [0, 0, 0, 0, 0, 0] };
      const parsed = JSON.parse(raw) as Stats;
      return {
        ...EMPTY_STATS,
        ...parsed,
        distribution: parsed.distribution?.length === MAX_ATTEMPTS
          ? parsed.distribution
          : [0, 0, 0, 0, 0, 0],
      };
    } catch {
      return { ...EMPTY_STATS, distribution: [0, 0, 0, 0, 0, 0] };
    }
  }
}
