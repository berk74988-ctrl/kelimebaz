import { Injectable, signal } from '@angular/core';
import { LevelInfo, levelInfo } from '../core/level';
import { scoreFor } from '../core/score';
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
      // Puan, oyun SONRASI seriye göre hesaplanır — üst üste kazanmak ödüllendirilir
      points: s.points + scoreFor(won, attempts, streak),
      guesses: s.guesses + attempts,
    };

    if (won && attempts >= 1 && attempts <= MAX_ATTEMPTS) {
      next.distribution[attempts - 1]++;
    }

    this._stats.set(next);
    this.persist(next);
  }

  /** Puandan hesaplanan seviye ve ilerleme (core/level.ts). */
  level(): LevelInfo {
    return levelInfo(this._stats().points);
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

  /**
   * Kayıtlı veriyi okur; bozuk/eksik veriye karşı dayanıklıdır.
   *
   * GÖÇ GEREKTİRMEZ: puan/kelime alanları sonradan eklendi. Eski kayıtlarda
   * bu anahtarlar yok; yayılım (spread) onları emptyStats'taki varsayılanla
   * bırakır. `num()` ise null/NaN/metin gibi bozuk değerleri de temizler —
   * `{...parsed}` tek başına `points: null` gibi bir çöpü olduğu gibi geçirirdi.
   */
  private load(): Stats {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return emptyStats();

      const parsed = JSON.parse(raw) as Partial<Stats>;
      const dist = parsed.distribution;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

      return {
        ...emptyStats(),
        ...parsed,
        played: num(parsed.played),
        won: num(parsed.won),
        currentStreak: num(parsed.currentStreak),
        maxStreak: num(parsed.maxStreak),
        points: num(parsed.points),
        guesses: num(parsed.guesses),
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
