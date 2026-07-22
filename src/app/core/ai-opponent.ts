import { LetterState } from '../models/game.model';
import { evaluateGuess } from './evaluate';

/**
 * ============================================================
 * 🤖 YAPAY ZEKÂ RAKİP — Wordle çözücü.
 *
 * Angular'a bağımlı değil (saf sınıf) → doğrudan test edilebilir.
 * Gerçek bir oyuncu gibi tahmin eder: her tahminden gelen renk
 * ipuçlarıyla aday kelimeleri eler, giderek yaklaşır.
 *
 * ZORLUK iki koldan gelir:
 *   1. HIZ  — düşünme aralığı (nextDelay): kolay yavaş, zor hızlı.
 *   2. AKIL — `smart`: filtrelenmiş adaydan tahmin etme olasılığı.
 *      Düşükse ara sıra aday-DIŞI (tutarsız) kelime dener → tur harcar,
 *      yani daha zayıf oynar (kolay seviye).
 * ============================================================
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface AiConfig {
  minMs: number; // düşünme aralığı alt sınır (ms)
  maxMs: number; // üst sınır (ms)
  smart: number; // 0..1 — filtrelenmiş adaydan tahmin etme olasılığı
}

export const AI_CONFIG: Record<Difficulty, AiConfig> = {
  easy: { minMs: 4200, maxMs: 6800, smart: 0.35 }, // yavaş + sık hata → rahat yenilir (~çözüm 18-27s)
  medium: { minMs: 2800, maxMs: 4300, smart: 0.85 }, // dengeli (~çözüm 11-16s)
  hard: { minMs: 1900, maxMs: 2900, smart: 1.0 }, // hızlı + hep en iyi aday → zorlu ama adil (~çözüm 8-11s)
};

/** İki renk deseni birebir aynı mı? */
function samePattern(a: readonly LetterState[], b: readonly LetterState[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface AiGuess {
  pattern: LetterState[];
  solved: boolean;
}

export class AiSolver {
  private candidates: string[];
  readonly guesses: AiGuess[] = [];
  solved = false;

  constructor(
    private readonly answer: string,
    private readonly pool: readonly string[], // aynı uzunluktaki tüm cevaplar
    private readonly cfg: AiConfig,
    private readonly maxAttempts: number,
    private readonly rnd: () => number = Math.random,
  ) {
    this.candidates = pool.length ? [...pool] : [answer];
  }

  get attempts(): number {
    return this.guesses.length;
  }
  get done(): boolean {
    return this.solved || this.attempts >= this.maxAttempts;
  }

  /** Bir sonraki düşünme süresi (ms) — zorluğa göre. */
  nextDelay(): number {
    return Math.round(this.cfg.minMs + this.rnd() * (this.cfg.maxMs - this.cfg.minMs));
  }

  /** Bir tahmin yap; renk desenini kaydet ve adayları ele. */
  step(): void {
    if (this.done) return;
    const pick = this.pickGuess();
    const pattern = evaluateGuess(pick, this.answer);
    const solved = pick === this.answer;
    this.guesses.push({ pattern, solved });
    if (solved) {
      this.solved = true;
      return;
    }
    // İpucuna göre adayları ele — aday-dışı (kötü) tahmin bile bilgi verir.
    this.candidates = this.candidates.filter((c) => samePattern(evaluateGuess(pick, c), pattern));
    if (!this.candidates.length) this.candidates = [...this.pool]; // güvenlik: hiç kalmazsa sıfırla
  }

  private pickGuess(): string {
    const c = this.candidates;
    // Son düzlükte (az aday) ya da "akıllı" karar → filtrelenmiş adaydan seç.
    if (c.length <= 3 || this.rnd() < this.cfg.smart) {
      return c.length
        ? c[Math.floor(this.rnd() * c.length)]
        : this.pool[Math.floor(this.rnd() * this.pool.length)];
    }
    // "Hata": aday olmayan rastgele bir kelime → tur harcar (kolay YZ daha zayıf oynar).
    return this.pool[Math.floor(this.rnd() * this.pool.length)];
  }
}
