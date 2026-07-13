import { Injectable } from '@angular/core';
import { VALID_GUESSES, WORDS_5 } from '../data/words';
import { DEFAULT_CONFIG } from '../models/game.model';

/**
 * KELİMEBAZ — Kelime havuzuna erişim.
 * Oyun mantığı (tahmin değerlendirme, skor vb.) ayrı bir servise gelecek.
 */
@Injectable({ providedIn: 'root' })
export class WordService {
  private readonly words = WORDS_5;

  /** Havuzdan rastgele bir cevap kelimesi seçer. */
  pickAnswer(): string {
    const i = Math.floor(Math.random() * this.words.length);
    return this.words[i];
  }

  /** Girilen tahmin geçerli bir kelime mi? */
  isValidGuess(guess: string): boolean {
    return VALID_GUESSES.includes(guess.toLocaleUpperCase('tr'));
  }

  /** Havuzdaki kelime sayısı. */
  get size(): number {
    return this.words.length;
  }

  /** Oyunun kelime uzunluğu. */
  get wordLength(): number {
    return DEFAULT_CONFIG.wordLength;
  }
}
