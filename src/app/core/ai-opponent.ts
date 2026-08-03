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
 * hangi YÜZDELİK DİLİMDEN seçtiği (`band` = [lo, hi], 0 = en iyi entropi … 1 = en
 * zayıf tutarlı aday). topK (sabit sayı) yerine dilim → HAVUZ BÜYÜKLÜĞÜNDEN BAĞIMSIZ.
 *   - Zor  [0, 0]      → hep en iyi tahmin (en çok eleyen).
 *   - Orta [0.4, 0.65] → orta güçte adaylardan biri.
 *   - Kolay[0.85, 1]   → en zayıf dilimden — hâlâ geçerli (ipuçlarına uyar), ama
 *                        çok az bilgi çıkarır → belirgin biçimde daha çok tur harcar.
 * GÜVENLİK FRENİ: son 2 hakta bot EN İYİ tutarlı adayı seçer → çıkmaza girmez
 * (zayıflık erken/orta turda kalır; hiçbir zorluk maçları çözümsüz bırakmaz).
 * Düşünme SÜRESİ (nextDelay) artık zorluğun kaynağı DEĞİL — yalnız tempo hissi.
 * ============================================================
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Aday sayısı bunu aşarsa entropi örneklemeyle tahmin edilir (tarayıcıda < 100 ms). */
const SAMPLE_THRESHOLD = 300;

/** Yüzdelik dilim: [lo, hi] ∈ [0,1]. 0 = en iyi (en çok eleyen), 1 = en zayıf. */
export type Band = readonly [number, number];

export interface AiConfig {
  minMs: number; // düşünme aralığı alt sınır (ms) — yalnız tempo
  maxMs: number; // üst sınır (ms)
  /** Entropi sıralamasında seçim dilimi ([0,0] = hep en iyi; [0.85,1] = en zayıf). */
  band: Band;
  /**
   * KARAKTER STRATEJİSİ (opsiyonel — botlara kişilik verir):
   *   bias        — tahminleri hangi harf tipine kayırsın: 'vowel' (ünlü yoğun) veya
   *                 'frequent' (havuzda sık harf). Yok → saf entropi.
   *   biasWeight  — kayırmanın gücü (entropiye eklenir; açılış dâhil her turda etkili).
   *   gamble      — erken turda (çok aday varken) doğrudan bir cevabı deneme olasılığı
   *                 (0..1). Tutarsa hızlı kazanır, tutmazsa tur harcar (Kumarbaz).
   */
  bias?: 'vowel' | 'frequent';
  biasWeight?: number;
  gamble?: number;
}

/** Ünlü harfler (TR üst kümesi EN'i de kapsar: A E I İ O Ö U Ü). */
const VOWELS = new Set([...'AEIİOÖUÜ']);

// Band, ULAŞILABİLİR hedeflere göre ÖLÇÜLEREK kalibre edildi (scripts/vsai-solver-test.mjs,
// 5 harfli TR havuz = 700 kelime, 500 maç/band, güvenlik freni açık):
//   Zor [0,0] = 3.10 · Orta [0.4,0.65] = 3.63 · Kolay [0.85,1] = 4.46 · Kolay−Zor = 1.36
//   Çözememe: Zor %0 · Orta %0 · Kolay %1.6 (hepsi ≤ %3 kabul sınırında).
// ESKİ YORUM DÜZELTİLDİ: "yalnız-tutarlı tavan ~3.3" İDDİASI ÖLÇÜLEREK ÇÜRÜTÜLDÜ.
// Sıralamanın ALT ucundan (anti-entropi yönü) seçmek, botun hiç anlamsız tahmin
// yapmadan (hep ipuçlarına uyar) Kolay'ı ~4.46'ya çıkarır. Aşırı zayıflığın çözümsüz
// maça dönmesini "son 2 tur en iyi" freni engeller (çözememe %1.6).
export const AI_CONFIG: Record<Difficulty, AiConfig> = {
  easy: { minMs: 3200, maxMs: 5200, band: [0.85, 1] }, // en zayıf dilim → belirgin zayıf, HÂLÂ tutarlı
  medium: { minMs: 2400, maxMs: 3600, band: [0.4, 0.65] }, // orta dilim → dengeli
  hard: { minMs: 1700, maxMs: 2600, band: [0, 0] }, // hep en iyi → zorlu ama adil
};

/** Bir yüzdelik dilim bandından rastgele indeks (0 = en iyi … n−1 = en zayıf). */
export function bandIndex(band: Band, n: number, rnd: () => number): number {
  if (n <= 1) return 0;
  const a = Math.floor(band[0] * (n - 1));
  const b = Math.floor(band[1] * (n - 1));
  return Math.min(n - 1, a + Math.floor(rnd() * (b - a + 1)));
}

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
    /**
     * Derleme zamanı TAM SIRALI açılış listesi (en iyi entropi → en zayıf). İlk tur
     * band bu listeden seçer → gecikmesiz VE zayıf uç erişilebilir (Kolay merdiveni).
     */
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
    // 🛑 GÜVENLİK FRENİ: son 2 hakta EN İYİ tutarlı adayı seç → bot çıkmaza girmez
    // (zayıf zorluklar bile maçı bitirir; çözememe oranı düşük kalır).
    if (this.attempts >= this.maxAttempts - 2) return this.rankedGuess(true);
    // İlk tur: açılış derleme zamanında TAM SIRALI hesaplandı → band'dan seç, gecikme yok.
    // (Tam liste zayıf ucu da içerir → Kolay zayıf açılış yapabilir, gerçek merdiven.)
    if (this.attempts === 0 && this.openers.length) return this.pickOpener();
    // 🎲 Kumarbaz: erken/orta turda (çok aday) doğrudan bir cevabı dene.
    if (this.cfg.gamble && c.length > 8 && this.rnd() < this.cfg.gamble) {
      return c[Math.floor(this.rnd() * c.length)]; // rastgele aday = "cevabı deneme"
    }
    // Sonraki turlar: entropi (+ karakter kayırması) sıralamasında BANDDAN seç.
    return this.rankedGuess(false);
  }

  /** İlk tur: derleme zamanı TAM SIRALI açılış listesinden band ile seç (bias'a göre yeniden sırala). */
  private pickOpener(): string {
    let list: readonly string[] = this.openers;
    if (this.cfg.bias) {
      // Kayıran karakter (Ünlü Avcısı / Harf Sayar) açılışı da harf tipine göre sıralar.
      const bw = this.cfg.biasWeight || 0;
      list = [...this.openers]
        .map((w, i) => ({ w, rank: i - bw * this.letterScore(w) })) // düşük rank = üstte
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.w);
    }
    return list[bandIndex(this.cfg.band, list.length, this.rnd)];
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
   * ölçüsüne göre sıralar, entropi sırasında YÜZDELİK DİLİM (band) içinden RASTGELE
   * birini seçer. Band, havuz büyüklüğünden bağımsızdır (0 = en iyi/en yüksek entropi,
   * 1 = en zayıf).
   *   band [0,0]      → hep en iyi tahmin (Zor).
   *   band [0.4,0.65] → orta güçte tahmin (Orta).
   *   band [0.85,1]   → zayıf tahmin (Kolay) — hâlâ MANTIKLI (ipuçlarıyla çelişmez),
   *                     sadece daha az bilgi çıkarır → daha çok tur.
   * `best=true` ise band'ı yok say, EN İYİ tutarlı adayı seç (güvenlik freni — son 2
   * hakta çağrılır → bot çıkmaza girmez). Beraberlikte cevap havuzunda olan üste alınır
   * (o tur kazanma şansı). Aday çoksa örnekleme yapar → tarayıcıda < 100 ms.
   */
  private rankedGuess(best: boolean): string {
    const c = this.candidates;
    // Aday çoksa hem tahmin hem skorlama kümesini örnekle → maliyet O(SAMPLE²).
    // İlk tur tüm havuzla (aday elenmemiş) gelir; örnekleme burada devreye girer.
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

    if (best) return scored[0].g; // güvenlik freni: en iyi tutarlı aday
    return scored[bandIndex(this.cfg.band, scored.length, this.rnd)].g;
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
