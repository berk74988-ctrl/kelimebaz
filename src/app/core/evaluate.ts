import { Guess, LetterState } from '../models/game.model';
import { trUpper } from './turkish';

/**
 * ============================================================
 * OYUNUN KALBİ — renk mantığı.
 *
 * Angular'a hiç bağımlı değil: saf fonksiyonlar. Bu sayede
 * bileşen/servis kurmadan, doğrudan çağırarak test edilebilir.
 * ============================================================
 */

/**
 * Bir tahmini cevapla karşılaştırır ve her harfin rengini döndürür.
 *
 * İKİ GEÇİŞLİ algoritma — harf tekrarlarının doğru çalışmasının tek yolu:
 *
 *   1) ÖNCE tam isabetler (🟩 correct) işaretlenir. İşaretlenen her harf,
 *      cevaptaki "kalan harfler havuzundan" DÜŞÜLÜR.
 *   2) SONRA kalan harfler için: havuzda o harften hâlâ varsa 🟨 (present),
 *      yoksa ⬜ (absent). Sarı verilen her harf de havuzdan düşülür.
 *
 * Bu sıra sayesinde bir harf ASLA iki kez sayılmaz.
 *
 * Örnek — cevap KALEM, tahmin ELELE:
 *   KALEM'de yalnızca 1 tane E ve 1 tane L var.
 *   ELELE'de 3 E ve 2 L var → sadece BİRER tanesi sarı olur, kalanlar gri.
 *   Sonuç: 🟨🟨⬜⬜⬜
 */
export function evaluateGuess(guess: string, answer: string): LetterState[] {
  const g = [...trUpper(guess)];
  const a = [...trUpper(answer)];

  const result: LetterState[] = Array(g.length).fill('absent');
  const pool = new Map<string, number>(); // cevapta HENÜZ eşleşmemiş harfler

  // 1) Tam isabetler → yeşil, harfi havuzdan düş
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) {
      result[i] = 'correct';
    } else {
      pool.set(a[i], (pool.get(a[i]) ?? 0) + 1);
    }
  }

  // 2) Kalanlar → havuzda varsa sarı (ve havuzdan düş), yoksa gri
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue;

    const left = pool.get(g[i]) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      pool.set(g[i], left - 1);
    }
  }

  return result;
}

/** Renk gücü sıralaması: correct > present > absent > empty. */
const RANK: Record<LetterState, number> = {
  empty: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

/**
 * İki durumdan GÜÇLÜ olanı döndürür.
 * Klavye rengi asla geriye gitmemeli: bir harf yeşil olduysa,
 * sonraki tahminde sarı çıksa bile yeşil kalır.
 */
export function strongerState(a: LetterState | undefined, b: LetterState): LetterState {
  if (!a) return b;
  return RANK[b] > RANK[a] ? b : a;
}

/**
 * Tüm tahminlere bakarak klavyedeki her harfin gösterilecek rengini hesaplar.
 * Her harf için o ana kadarki EN GÜÇLÜ sonuç kullanılır.
 */
export function keyStatesFrom(guesses: readonly Guess[]): Record<string, LetterState> {
  const map: Record<string, LetterState> = {};

  for (const guess of guesses) {
    for (const tile of guess.tiles) {
      map[tile.letter] = strongerState(map[tile.letter], tile.state);
    }
  }

  return map;
}
