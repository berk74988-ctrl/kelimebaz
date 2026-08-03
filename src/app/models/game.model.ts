/** KELİMEBAZ — oyun tipleri */

/** Bir harfin tahmin sonrası durumu. */
export type LetterState =
  | 'correct' // 🟩 harf doğru, yeri doğru
  | 'present' // 🟨 harf kelimede var, yeri yanlış
  | 'absent' // ⬜ harf kelimede yok
  | 'empty'; // henüz değerlendirilmedi

/** Tahtadaki tek bir harf kutusu. */
export interface Tile {
  letter: string;
  state: LetterState;
}

/** Değerlendirilmiş tek bir tahmin satırı. */
export interface Guess {
  word: string;
  tiles: Tile[];
}

/**
 * Oyunun genel durumu.
 * 'ended' = maç, oyuncu KAYBETMEDEN sona erdi (YZ modunda rakip önce çözünce).
 *           'lost' değildir: oyuncunun kalan hakları mağlubiyete/cezaya dönüşmez.
 */
export type GameStatus = 'playing' | 'won' | 'lost' | 'ended';

/** Oyun modu. 'room' = çok oyunculu oda; 'vsai' = YZ rakip; 'theme' = tema modu. */
export type GameMode = 'daily' | 'practice' | 'room' | 'vsai' | 'theme';

/** localStorage'a yazılan oyun durumu. */
export interface SavedGame {
  mode: GameMode;
  dayIndex: number; // günlük modda hangi güne ait (serbest modda -1)
  answer: string;
  guesses: string[];
  status: GameStatus;
  /** Kaydın dili — dil değişince eski dildeki oyun sürdürülmez, taze başlar. */
  lang?: 'tr' | 'en' | 'de';
}

/**
 * Oyuncu istatistikleri — localStorage şeması ("kelimebaz:stats").
 *
 * {
 *   played: 12,                          // oynanan oyun
 *   won: 9,                              // kazanılan oyun
 *   currentStreak: 3,                    // şu anki kazanma serisi
 *   maxStreak: 5,                        // en uzun seri
 *   distribution: [1,2,3,2,1,0],         // kaçıncı tahminde kazanıldığı
 *   lastWinAttempts: 4                   // son kazanılan oyun kaç tahminde (grafikte vurgulanır)
 * }
 */
/**
 * Oyuncu istatistikleri.
 *
 * YENİ ALAN EKLERKEN: buraya bir alan, EMPTY_STATS'a varsayılanı, ve
 * core/profile-stats.ts'e bir kayıt yeter. Eski kayıtlar StatsService.load()
 * tarafından varsayılanla tamamlanır — göç kodu yazmaya gerek yok.
 */
export interface Stats {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  /** distribution[i] = (i+1). tahminde kazanılan oyun sayısı */
  distribution: number[];
  /** Son kazanılan oyunun tahmin sayısı; hiç kazanılmadıysa null. */
  lastWinAttempts: number | null;
  /** Toplam puan — seviye bundan hesaplanır (core/level.ts). */
  points: number;
  /** Şimdiye kadar tahtaya yazılan geçerli kelime sayısı (kazanılan + kaybedilen). */
  guesses: number;
  /**
   * YZ (vsai) modu AYRI tutulur — ana ilerlemeyi (seri/oynanan/puan) etkilemez.
   * Yapay zekâya karşı oynanan maç sayısı.
   */
  vsaiPlayed: number;
  /** YZ'ye karşı KAZANILAN maç sayısı. */
  vsaiWon: number;
  /** Karakter bazlı karşılaşma kaydı: id → { oynanan, kazanılan } (örn. "Kumarbaz'a karşı 3-1"). */
  vsaiByPersona: Record<string, { played: number; won: number }>;
  /** 🎯 Uyarlanabilir zorluk: son N YZ maçındaki oyuncu tahmin sayıları (kayan pencere). */
  vsaiRecent: number[];
  /** 🎯 Uyarlanabilir modun güncel bot ayarı (entropi yüzdelik konumu 0..1) — kademeli güncellenir. */
  vsaiAdaptPos: number;
  /**
   * 🆘 Toplam kullanılan "Takıldım" YZ ipucu sayısı. Galibiyet/seri BOZULMAZ
   * (yardım alınan oyun da geçerli sayılır) — yalnızca kaç kez yardım istendiğini
   * gösteren şeffaf bir sayaçtır (profilde görünür).
   */
  aiHintsUsed: number;
}

export const EMPTY_STATS: Stats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0, 0, 0, 0],
  lastWinAttempts: null,
  points: 0,
  guesses: 0,
  vsaiPlayed: 0,
  vsaiWon: 0,
  vsaiByPersona: {},
  vsaiRecent: [],
  vsaiAdaptPos: 0.45,
  aiHintsUsed: 0,
};

/** Varsayılan/yedek uzunluk. Oyun artık 4-7 harf kullanır (bkz. core/word-length.ts);
    her oyunun uzunluğu cevabın harf sayısından türetilir. */
export const WORD_LENGTH = 5;
export const MIN_WORD_LENGTH = 4;
export const MAX_WORD_LENGTH = 7;
export const MAX_ATTEMPTS = 6;
