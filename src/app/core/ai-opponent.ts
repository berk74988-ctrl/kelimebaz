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
 * ZORLUK = OYUN GÜCÜ. Bot her zorlukta MANTIKLI oynar (asla ipuçlarıyla çelişen
 * tahmin yapmaz); sadece optimallikten uzaklaşır. Ölçü: entropi sıralamasında
 * kaçıncı en iyi tahmini seçtiği (`topK`).
 *   - Zor  (topK 1)  → hep en iyi tahmin (en çok eleyen).
 *   - Orta (topK ~6) → ilk birkaç iyi tahminden biri.
 *   - Kolay(topK ~24)→ ilk yirmi küsur tahminden biri — hâlâ geçerli, ama daha
 *     az bilgi çıkaran → daha çok tur harcar (zayıf ama tutarlı bir oyuncu gibi).
 * Düşünme SÜRESİ (nextDelay) artık zorluğun kaynağı DEĞİL — yalnız tempo hissi.
 * ============================================================
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Aday sayısı bunu aşarsa entropi örneklemeyle tahmin edilir (tarayıcıda < 100 ms). */
const SAMPLE_THRESHOLD = 300;

export interface AiConfig {
  minMs: number; // düşünme aralığı alt sınır (ms) — yalnız tempo
  maxMs: number; // üst sınır (ms)
  /** Entropi sıralamasında İLK KAÇ aday arasından seçim yapılır (1 = hep en iyi). */
  topK: number;
  /**
   * KARAKTER STRATEJİSİ (opsiyonel — botlara kişilik verir):
   *   bias        — tahminleri hangi harf tipine kayırsın: 'vowel' (ünlü yoğun) veya
   *                 'frequent' (havuzda sık harf). Yok → saf entropi.
   *   biasWeight  — kayırmanın gücü (entropiye eklenir; 0 = sonraki turlarda etkisiz).
   *   openerBias  — açılış kelimesi de bias'a göre seçilsin mi (Ünlü Avcısı: true).
   *   gamble      — erken turda (çok aday varken) doğrudan bir cevabı deneme olasılığı
   *                 (0..1). Tutarsa hızlı kazanır, tutmazsa tur harcar (Kumarbaz).
   */
  bias?: 'vowel' | 'frequent';
  biasWeight?: number;
  openerBias?: boolean;
  gamble?: number;
}

/** Ünlü harfler (TR üst kümesi EN'i de kapsar: A E I İ O Ö U Ü). */
const VOWELS = new Set([...'AEIİOÖUÜ']);

// topK, ULAŞILABİLİR hedef ortalamaya göre kalibre edildi (scripts/vsai-solver-test.mjs,
// 5 harfli TR havuz, 500 maç): Kolay ≈ 3.15 · Orta ≈ 2.9 · Zor ≈ 2.75.
// NOT: Yalnız-tutarlı (ipuçlarına uyan) oyunla ulaşılabilir tavan bu havuzda ~3.3'tür;
// daha yüksek "Kolay" ortalaması ancak botun ipucunu boşa harcamasıyla (anlamsız
// tahmin) olurdu — bilinçli olarak yapılmadı. Fark ~0.4 tahmin; hız/tempo destekler.
export const AI_CONFIG: Record<Difficulty, AiConfig> = {
  easy: { minMs: 3200, maxMs: 5200, topK: 140 }, // geniş seçim → zayıf ama HÂLÂ tutarlı
  medium: { minMs: 2400, maxMs: 3600, topK: 8 }, // ilk ~8'den biri → dengeli
  hard: { minMs: 1700, maxMs: 2600, topK: 1 }, // hep en iyi → zorlu ama adil
};

/** İki renk deseni birebir aynı mı? */
function samePattern(a: readonly LetterState[], b: readonly LetterState[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** evaluateGuess sonucunu kompakt bir desen anahtarına çevirir (0=gri, 1=sarı, 2=yeşil). */
function patternKey(guess: string, answer: string, lang: Lang = 'tr'): string {
  const p = evaluateGuess(guess, answer, lang);
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
export function guessEntropy(
  guess: string,
  candidates: readonly string[],
  lang: Lang = 'tr',
): number {
  const n = candidates.length;
  if (n <= 1) return 0;
  const buckets = new Map<string, number>();
  for (const c of candidates) {
    const k = patternKey(guess, c, lang);
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  let h = 0;
  for (const count of buckets.values()) {
    const p = count / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Derleme zamanında hesaplanmış SIRALI açılış listesi (ilk tur gecikmesiz). */
export function aiOpeners(lang: Lang, length: number): readonly string[] {
  // tr/en için önceden hesaplı açılışlar var; de'de yok → boş (solver normal seçer).
  return (AI_OPENERS as Record<string, Record<number, readonly string[]>>)[lang]?.[length] ?? [];
}

export interface AiGuess {
  /** Tahmin edilen kelime (test/analiz: tutarlılık doğrulanabilir). */
  word: string;
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
    /** Derleme zamanı SIRALI açılış listesi — ilk tur gecikmesiz (topK ile seçilir). */
    private readonly openers: readonly string[] = [],
    /** Renk mantığında büyük-harf kuralı için dil (varsayılan 'tr', geriye dönük). */
    private readonly lang: Lang = 'tr',
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
    const pattern = evaluateGuess(pick, this.answer, this.lang);
    const solved = pick === this.answer;
    this.guesses.push({ word: pick, pattern, solved });
    if (solved) {
      this.solved = true;
      return;
    }
    // İpucuna göre adayları ele — aday-dışı (kötü) tahmin bile bilgi verir.
    this.candidates = this.candidates.filter((c) =>
      samePattern(evaluateGuess(pick, c, this.lang), pattern),
    );
    if (!this.candidates.length) this.candidates = [...this.pool]; // güvenlik: hiç kalmazsa sıfırla
  }

  private pickGuess(): string {
    const c = this.candidates;
    // Son düzlük: 1-2 aday kaldıysa doğrudan dene (biri cevaptır).
    if (c.length <= 2)
      return c.length ? c[0] : this.pool[Math.floor(this.rnd() * this.pool.length)];
    // İlk tur: açılış derleme zamanında SIRALI hesaplandı → hesap yok, gecikme yok.
    if (this.attempts === 0 && this.openers.length) return this.pickOpener();
    // 🎲 Kumarbaz: erken/orta turda (çok aday) doğrudan bir cevabı dene.
    if (this.cfg.gamble && c.length > 8 && this.rnd() < this.cfg.gamble) {
      return c[Math.floor(this.rnd() * c.length)]; // rastgele aday = "cevabı deneme"
    }
    // Sonraki turlar: entropi (+ karakter kayırması) sıralamasında ilk topK'dan seç.
    return this.rankedGuess();
  }

  /** Açılış kelimesi — karaktere göre (Ünlü Avcısı ünlü yoğun açar). */
  private pickOpener(): string {
    let list: readonly string[] = this.openers;
    if (this.cfg.openerBias && this.cfg.bias) {
      // Açılış listesi (hepsi zaten yüksek entropi) harf tipine göre yeniden sıralanır.
      list = [...this.openers].sort((a, b) => this.letterScore(b) - this.letterScore(a));
    }
    const k = Math.min(this.cfg.topK, list.length);
    return list[Math.floor(this.rnd() * k)];
  }

  /** Bir kelimenin karakter kayırma skoru (0..1) — 'vowel' ünlü oranı, 'frequent' sık-harf. */
  private letterScore(word: string): number {
    const chars = [...word];
    if (!chars.length) return 0;
    if (this.cfg.bias === 'vowel') {
      let v = 0;
      for (const ch of chars) if (VOWELS.has(ch)) v++;
      return v / chars.length;
    }
    if (this.cfg.bias === 'frequent') {
      const freq = this.letterFreq();
      let s = 0;
      for (const ch of chars) s += freq.get(ch) || 0;
      return s / chars.length;
    }
    return 0;
  }

  private _freq: Map<string, number> | null = null;
  /** Havuzdaki harf sıklığı, 0..1'e normalize (en sık harf = 1). Bir kez hesaplanır. */
  private letterFreq(): Map<string, number> {
    if (this._freq) return this._freq;
    const count = new Map<string, number>();
    for (const w of this.pool) for (const ch of w) count.set(ch, (count.get(ch) || 0) + 1);
    let max = 1;
    for (const v of count.values()) if (v > max) max = v;
    const norm = new Map<string, number>();
    for (const [k, v] of count) norm.set(k, v / max);
    return (this._freq = norm);
  }

  /**
   * ENTROPİ SIRALAMASINDAN SEÇİM — adayları "havuzu ne kadar eler" (entropi)
   * ölçüsüne göre sıralar, ilk `topK` arasından RASTGELE birini seçer.
   *   topK 1  → hep en iyi tahmin (Zor).
   *   topK N  → ilk N iyi tahminden biri (Orta/Kolay) — hâlâ MANTIKLI (ipuçlarıyla
   *             çelişmez), sadece daha az bilgi çıkarır → daha çok tur.
   * Beraberlikte cevap havuzunda olan üste alınır (o tur kazanma şansı). Aday
   * çoksa örnekleme yapar → tarayıcıda < 100 ms.
   */
  private rankedGuess(): string {
    const c = this.candidates;
    // Aday çoksa hem tahmin hem skorlama kümesini örnekle → maliyet O(SAMPLE²).
    // (İlk tur önceden hesaplanmış açılışı kullanır; buraya küçük aday kümeleriyle
    //  gelinir — örnekleme pratikte devreye girmez, güvenlik ağı.)
    const guesses = c.length > SAMPLE_THRESHOLD ? this.sample(c, SAMPLE_THRESHOLD) : c;
    const scoreSet = c.length > SAMPLE_THRESHOLD ? this.sample(c, SAMPLE_THRESHOLD) : c;
    const answerPool = this.poolSet();

    const bw = this.cfg.biasWeight || 0;
    const scored = guesses.map((g) => ({
      // Skor = entropi (+ karakter kayırması). Kayırma yoksa saf entropi.
      s: guessEntropy(g, scoreSet, this.lang) + (bw ? bw * this.letterScore(g) : 0),
      g,
      inPool: answerPool.has(g),
    }));
    // Skor azalan; eşitlikte cevap havuzundaki (kazanma şansı) üstte.
    scored.sort((a, b) => b.s - a.s || Number(b.inPool) - Number(a.inPool));

    const k = Math.min(this.cfg.topK, scored.length);
    return scored[Math.floor(this.rnd() * k)].g;
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
