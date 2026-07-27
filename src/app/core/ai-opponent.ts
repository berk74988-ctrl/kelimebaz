import { LetterState } from '../models/game.model';
import { evaluateGuess } from './evaluate';
import { AI_OPENERS } from './ai-openers';
import { Lang } from './lang';

/**
 * ============================================================
 * 🤖 YAPAY ZEKÂ RAKİP — ENTROPİ TABANLI Wordle çözücü.
 *
 * Angular'a bağımlı değil (saf sınıf) → doğrudan test edilebilir.
 * Gerçek bir çözücü gibi oynar: her tur, kalan adaylar arasından "hangi
 * tahmin ortalamada en çok eler" sorusunu Shannon entropisiyle yanıtlar
 * (bkz. guessEntropy). Rastgele aday seçmez — en bilgilendirici olanı seçer.
 *
 * ZORLUK iki koldan gelir:
 *   1. HIZ  — düşünme aralığı (nextDelay): kolay yavaş, zor hızlı.
 *   2. AKIL — `smart`: entropiye göre en iyi tahmini yapma olasılığı.
 *      Düşükse ara sıra aday-DIŞI (tutarsız) kelime dener → tur harcar,
 *      yani daha zayıf oynar (kolay seviye).
 * ============================================================
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Aday sayısı bunu aşarsa entropi örneklemeyle tahmin edilir (tarayıcıda < 100 ms). */
const SAMPLE_THRESHOLD = 300;

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

/** evaluateGuess sonucunu kompakt bir desen anahtarına çevirir (0=gri, 1=sarı, 2=yeşil). */
function patternKey(guess: string, answer: string): string {
  const p = evaluateGuess(guess, answer);
  let k = '';
  for (const s of p) k += s === 'correct' ? '2' : s === 'present' ? '1' : '0';
  return k;
}

/**
 * SHANNON ENTROPİSİ (bit) — bir tahmin, aday havuzunu renk desenlerine göre kaç
 * "kovaya" böler ve bu bölünme ne kadar dengeli?  H = -Σ p·log₂(p).
 *
 * Yüksek entropi = tahmin adayları daha eşit/çok parçaya ayırıyor = ortalamada
 * daha çok eliyor. Çözücü her tur en yüksek entropili tahmini seçer. Saf fonksiyon.
 */
export function guessEntropy(guess: string, candidates: readonly string[]): number {
  const n = candidates.length;
  if (n <= 1) return 0;
  const buckets = new Map<string, number>();
  for (const c of candidates) {
    const k = patternKey(guess, c);
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  let h = 0;
  for (const count of buckets.values()) {
    const p = count / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Derleme zamanında hesaplanmış açılış kelimesi (ilk tur gecikmesiz). */
export function aiOpener(lang: Lang, length: number): string | null {
  return AI_OPENERS[lang]?.[length] ?? null;
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
    /** Derleme zamanında hesaplanmış açılış kelimesi — ilk tur gecikmesiz. */
    private readonly opener: string | null = null,
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
    // Son düzlük: 1-2 aday kaldıysa doğrudan dene (biri cevaptır).
    if (c.length <= 2) {
      return c.length ? c[0] : this.pool[Math.floor(this.rnd() * this.pool.length)];
    }
    // "Akıllı" oynuyorsa entropiye göre en çok eleyen tahmini seç.
    if (this.rnd() < this.cfg.smart) {
      // İlk tur: açılış kelimesi derleme zamanında hesaplandı → hesap yok, gecikme yok.
      if (this.attempts === 0 && this.opener) return this.opener;
      return this.bestGuess();
    }
    // "Hata" (kolay YZ): aday olmayan rastgele kelime → tur harcar, zayıf oynar.
    return this.pool[Math.floor(this.rnd() * this.pool.length)];
  }

  /**
   * ENTROPİ TABANLI SEÇİM — adaylar arasından havuzu en çok bölen (en yüksek
   * entropili) tahmini seçer. Beraberlikte cevap havuzunda olanı tercih eder
   * (o tur kazanma şansı). Aday çoksa örnekleme yapar → tarayıcıda < 100 ms.
   */
  private bestGuess(): string {
    const c = this.candidates;
    // Aday çoksa hem tahmin hem skorlama kümesini örnekle → maliyet O(SAMPLE²).
    // (İlk tur zaten önceden hesaplanmış açılışı kullanır; buraya sonraki, küçük
    //  aday kümeleriyle gelinir — örnekleme pratikte devreye girmez, güvenlik ağı.)
    const guesses = c.length > SAMPLE_THRESHOLD ? this.sample(c, SAMPLE_THRESHOLD) : c;
    const scoreSet = c.length > SAMPLE_THRESHOLD ? this.sample(c, SAMPLE_THRESHOLD) : c;
    const answerPool = this.poolSet();

    let best = guesses[0];
    let bestH = -1;
    let bestInPool = false;
    for (const g of guesses) {
      const h = guessEntropy(g, scoreSet);
      const inPool = answerPool.has(g);
      // Daha yüksek entropi kazanır; eşit entropide cevap havuzundaki tercih edilir.
      if (h > bestH + 1e-9 || (Math.abs(h - bestH) <= 1e-9 && inPool && !bestInPool)) {
        best = g;
        bestH = h;
        bestInPool = inPool;
      }
    }
    return best;
  }

  private _poolSet: Set<string> | null = null;
  private poolSet(): Set<string> {
    return (this._poolSet ??= new Set(this.pool));
  }

  /** Listeden tekrarsız k öğe örnekle (aday çok olduğunda entropi maliyetini sınırlar). */
  private sample(list: readonly string[], k: number): string[] {
    if (list.length <= k) return [...list];
    const out: string[] = [];
    const seen = new Set<number>();
    while (out.length < k) {
      const i = Math.floor(this.rnd() * list.length);
      if (!seen.has(i)) {
        seen.add(i);
        out.push(list[i]);
      }
    }
    return out;
  }
}
