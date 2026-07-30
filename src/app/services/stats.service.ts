import { Injectable, signal } from '@angular/core';
import { ADAPT_START_TOPK, nextAdaptTopK, perfScore, pushPerf } from '../core/ai-adaptive';
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
      // YZ sayaçlarına ANA oyun dokunmaz — olduğu gibi korunur
      vsaiPlayed: s.vsaiPlayed,
      vsaiWon: s.vsaiWon,
      vsaiByPersona: s.vsaiByPersona,
      vsaiRecent: s.vsaiRecent,
      vsaiAdaptTopK: s.vsaiAdaptTopK,
      aiHintsUsed: s.aiHintsUsed,
    };

    if (won && attempts >= 1 && attempts <= MAX_ATTEMPTS) {
      next.distribution[attempts - 1]++;
    }

    this._stats.set(next);
    this.persist(next);
  }

  /**
   * YZ (vsai) maç sonucunu işler — ANA istatistiklere DOKUNMAZ.
   *
   * Kazanma serisi, oynanan/kazanılan, dağılım ve puan ETKİLENMEZ; yalnız
   * ayrı YZ sayaçları güncellenir. YZ modu eğlenceli bir yan moddur; oyuncunun
   * 20 maçlık serisi, bot 2 saniye hızlı diye sıfırlanmamalı.
   */
  recordVsai(won: boolean, personaId?: string, perf?: { attempts: number; solved: boolean }): void {
    const s = this._stats();
    const byPersona = { ...s.vsaiByPersona };
    if (personaId) {
      const cur = byPersona[personaId] || { played: 0, won: 0 };
      byPersona[personaId] = { played: cur.played + 1, won: cur.won + (won ? 1 : 0) };
    }

    // 🎯 Uyarlanabilir zorluk: oyuncunun bu maçtaki performansını pencereye ekle,
    // bot ayarını (topK) KADEMELİ güncelle (tek maçta sert sıçrama yok).
    let vsaiRecent = s.vsaiRecent;
    let vsaiAdaptTopK = s.vsaiAdaptTopK || ADAPT_START_TOPK;
    if (perf) {
      vsaiRecent = pushPerf(s.vsaiRecent, perfScore(perf.attempts, perf.solved, MAX_ATTEMPTS));
      vsaiAdaptTopK = nextAdaptTopK(vsaiRecent, vsaiAdaptTopK);
    }

    const next: Stats = {
      ...s,
      distribution: [...s.distribution],
      vsaiPlayed: s.vsaiPlayed + 1,
      vsaiWon: s.vsaiWon + (won ? 1 : 0),
      vsaiByPersona: byPersona,
      vsaiRecent,
      vsaiAdaptTopK,
    };
    this._stats.set(next);
    this.persist(next);
  }

  /** YZ'ye karşı kazanma yüzdesi (tam sayı). Hiç oynanmadıysa 0. */
  vsaiWinRate(): number {
    const s = this._stats();
    return s.vsaiPlayed === 0 ? 0 : Math.round((s.vsaiWon / s.vsaiPlayed) * 100);
  }

  /** Bir karaktere karşı karşılaşma kaydı (oynanan/kazanılan). */
  vsaiRecord(personaId: string): { played: number; won: number } {
    return this._stats().vsaiByPersona[personaId] || { played: 0, won: 0 };
  }

  /**
   * 🆘 "Takıldım" YZ ipucu kullanıldı — yalnızca sayaç artar. Galibiyet/seri/puan
   * BOZULMAZ (yardım alınan oyun geçerli sayılır); bu, kaç kez yardım istendiğini
   * gösteren şeffaf bir sayaçtır.
   */
  recordAiHint(): void {
    const s = this._stats();
    const next: Stats = { ...s, aiHintsUsed: (s.aiHintsUsed || 0) + 1 };
    this._stats.set(next);
    this.persist(next);
  }

  /** 🎯 Uyarlanabilir modun güncel bot ayarı (topK). */
  adaptiveTopK(): number {
    return this._stats().vsaiAdaptTopK || ADAPT_START_TOPK;
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
        vsaiPlayed: num(parsed.vsaiPlayed),
        vsaiWon: num(parsed.vsaiWon),
        // Karakter kaydı: bozuk/eksikse boş nesne (eski kayıtlarda yoktu)
        vsaiByPersona:
          parsed.vsaiByPersona && typeof parsed.vsaiByPersona === 'object'
            ? parsed.vsaiByPersona
            : {},
        // 🎯 Uyarlanabilir zorluk: kayan pencere + güncel bot ayarı (eski kayıtlarda yok)
        vsaiRecent: Array.isArray(parsed.vsaiRecent)
          ? parsed.vsaiRecent.filter((n) => typeof n === 'number' && Number.isFinite(n))
          : [],
        vsaiAdaptTopK: num(parsed.vsaiAdaptTopK) || ADAPT_START_TOPK,
        aiHintsUsed: num(parsed.aiHintsUsed),
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
