import { Injectable } from '@angular/core';
import wordData from '../data/words.json';
import { WORD_LENGTH } from '../models/game.model';

/** Türkçe büyük harfe çevirir (i → İ, ı → I). */
export function trUpper(s: string): string {
  return s.toLocaleUpperCase('tr');
}

/**
 * Kelime havuzuna erişim: rastgele kelime, günün kelimesi, tahmin doğrulama.
 * Havuz JSON'dan derleme zamanında gelir — backend yok.
 */
@Injectable({ providedIn: 'root' })
export class WordService {
  /** Havuzdaki tüm kelimeler (büyük harf, 5 harfli). */
  private readonly words: readonly string[] = (wordData.words as string[])
    .map(trUpper)
    .filter((w) => [...w].length === WORD_LENGTH);

  /** Hızlı arama için küme. */
  private readonly wordSet = new Set(this.words);

  get size(): number {
    return this.words.length;
  }

  /** Rastgele bir cevap kelimesi (serbest mod). */
  randomWord(): string {
    return this.words[Math.floor(Math.random() * this.words.length)];
  }

  /**
   * Günün kelimesi — tarihe göre belirlenir, herkes aynı kelimeyi görür.
   * Aynı gün içinde her zaman aynı sonucu döndürür.
   */
  wordOfTheDay(date = new Date()): string {
    return this.words[this.dayIndex(date) % this.words.length];
  }

  /** Sabit bir başlangıç gününden bu yana geçen gün sayısı. */
  dayIndex(date = new Date()): number {
    const start = Date.UTC(2026, 0, 1); // 1 Ocak 2026
    const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(0, Math.floor((today - start) / 86_400_000));
  }

  /** Tahmin, havuzdaki geçerli bir kelime mi? */
  isValid(guess: string): boolean {
    return this.wordSet.has(trUpper(guess));
  }
}
