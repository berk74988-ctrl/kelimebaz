import { LetterState } from '../models/game.model';
import { guessEntropy } from './ai-opponent';
import { evaluateGuess } from './evaluate';
import { Lang } from './lang';

/**
 * ===========================================================================
 * 🔎 MAÇ SONU TAHMİN ANALİZİ — her tahminin kalitesini entropiyle ölçer (saf).
 *
 * Oyun bittikten sonra, oyuncunun yaptığı her tahmin için:
 *   - o tur KAÇ olası cevap adayı vardı (candidatesBefore),
 *   - tahmin bunların KAÇINI eledi (eliminated),
 *   - tahminin bilgi değeri (entropy, bit) ve o turun EN İYİ alternatifi (bestWord),
 *   - buradan bir kalite etiketi (optimal/great/good/fair/weak).
 *
 * "Aday" = standart cevap havuzundan, o ana dek verilen ipuçlarıyla TUTARLI kalan
 * kelimeler (tıpkı bir çözücünün elediği gibi). Entropi hesabı YZ rakibiyle aynı
 * (bkz. core/ai-opponent.ts guessEntropy). Angular'a bağımlı değil → doğrudan test.
 * OYUN-186 (entropi çözücü) üzerine kurulur.
 * ===========================================================================
 */

export type GuessQuality = 'optimal' | 'great' | 'good' | 'fair' | 'weak';

export interface GuessAnalysis {
  /** Tahmin edilen kelime. */
  word: string;
  /** Bu tahminden ÖNCE kalan olası cevap sayısı. */
  candidatesBefore: number;
  /** Bu tahminin ELEDİĞİ aday sayısı. */
  eliminated: number;
  /** Tahminin bilgi değeri (Shannon entropisi, bit). */
  entropy: number;
  /** O turun en bilgilendirici alternatifi (kalan adaylar arasından). */
  bestWord: string;
  /** En iyi alternatifin entropisi (bit). */
  bestEntropy: number;
  /** Kalite etiketi (en iyiye göreli). */
  quality: GuessQuality;
  /** Bu tahmin cevabı buldu mu (kazanan tahmin)? */
  solved: boolean;
}

/** Bir tahminin bir kelimeye karşı ürettiği renk deseni (aday elemesi için anahtar). */
function patternKey(guess: string, word: string, lang: Lang): string {
  const p = evaluateGuess(guess, word, lang);
  let k = '';
  for (const s of p) k += s === 'correct' ? '2' : s === 'present' ? '1' : '0';
  return k;
}

/** Entropi oranından kalite etiketi. Az aday kaldıysa (endgame) cömert davran. */
function rate(entropy: number, bestEntropy: number, before: number, solved: boolean): GuessQuality {
  if (solved) return 'optimal'; // cevabı bulan tahmin — her hâlükârda en iyi sonuç
  if (before <= 2) return 'good'; // 1-2 aday: doğru tahmin zaten kaçınılmaz, ceza yok
  const ratio = bestEntropy > 0 ? entropy / bestEntropy : 1;
  if (ratio >= 0.97) return 'optimal';
  if (ratio >= 0.85) return 'great';
  if (ratio >= 0.65) return 'good';
  if (ratio >= 0.4) return 'fair';
  return 'weak';
}

/**
 * Bir maçtaki tahminleri sırayla analiz eder.
 * @param answer  cevap kelimesi (büyük harf, pool ile aynı uzayda)
 * @param guesses oyuncunun tahminleri (sırayla, büyük harf)
 * @param pool    o uzunluktaki standart cevap havuzu (aday evreni)
 * @param lang    renk mantığı için dil (büyük-harf kuralı)
 */
export function analyzeGuesses(
  answer: string,
  guesses: readonly string[],
  pool: readonly string[],
  lang: Lang = 'tr',
): GuessAnalysis[] {
  // Aday evreni: havuz + (garanti) cevabın kendisi.
  let candidates = pool.includes(answer) ? [...pool] : [answer, ...pool];
  const out: GuessAnalysis[] = [];

  for (const guess of guesses) {
    const before = candidates;
    const solved = guess === answer;

    // O turun en iyi alternatifi + bu tahminin entropisi (kalan adaylar üstünden).
    let bestWord = guess;
    let bestEntropy = -1;
    for (const w of before) {
      const h = guessEntropy(w, before, lang);
      if (h > bestEntropy) {
        bestEntropy = h;
        bestWord = w;
      }
    }
    const entropy = before.length > 1 ? guessEntropy(guess, before, lang) : 0;

    // Bu tahminin GERÇEK deseniyle adayları ele (cevaba karşı ürettiği desen).
    const key = patternKey(guess, answer, lang);
    const after = before.filter((c) => patternKey(guess, c, lang) === key);

    out.push({
      word: guess,
      candidatesBefore: before.length,
      eliminated: before.length - after.length,
      entropy,
      bestWord,
      bestEntropy: Math.max(0, bestEntropy),
      quality: rate(entropy, bestEntropy, before.length, solved),
      solved,
    });

    candidates = after.length ? after : before; // güvenlik: hiç kalmazsa sıfırlama
    if (solved) break; // cevap bulununca analiz biter
  }

  return out;
}
