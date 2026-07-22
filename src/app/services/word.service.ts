import { inject, Injectable } from '@angular/core';
import { Lang, upperFor } from '../core/lang';
import { pickLength, WORD_LENGTHS } from '../core/word-length';
import answerDataTr from '../data/words.json';
import validDataTr from '../data/valid-words.json';
import answerDataEn from '../data/words-en.json';
import validDataEn from '../data/valid-words-en.json';
import { LanguageService } from './language.service';

/** Bir dilin kelime havuzları — cevaplar (uzunluğa göre) + geçerli tahminler. */
interface Pool {
  answersByLen: Record<number, string[]>;
  answers: readonly string[];
  valid: ReadonlySet<string>;
}

function bucketByLength(words: string[]): Record<number, string[]> {
  const buckets: Record<number, string[]> = { 4: [], 5: [], 6: [], 7: [] };
  for (const w of words) {
    const L = [...w].length;
    if (buckets[L]) buckets[L].push(w);
  }
  return buckets;
}

function buildPool(answerWords: string[], validText: string, lang: Lang): Pool {
  const up = (s: string) => upperFor(s, lang);
  const answersByLen = bucketByLength(answerWords.map(up));
  return {
    answersByLen,
    answers: Object.values(answersByLen).flat(),
    valid: new Set(validText.split(' ').filter(Boolean).map(up)),
  };
}

/**
 * Kelime havuzlarına erişim — TÜRKÇE ve İNGİLİZCE.
 *
 * İki dilin de havuzu derleme zamanında paketlenir; aktif dil LanguageService'ten
 * gelir. Her dilde İKİ liste var: CEVAPLAR (gizli kelime) ve GEÇERLİ TAHMİNLER
 * (oyuncunun deneyebileceği tüm kelimeler). Büyük harf kuralları da dile göre
 * (TR: İ/I; EN: düz).
 */
@Injectable({ providedIn: 'root' })
export class WordService {
  private readonly langSvc = inject(LanguageService);

  private readonly pools: Record<Lang, Pool> = {
    tr: buildPool(answerDataTr.words as string[], validDataTr.words as string, 'tr'),
    en: buildPool(answerDataEn.words as string[], validDataEn.words as string, 'en'),
  };

  private pool(): Pool {
    return this.pools[this.langSvc.lang()];
  }

  private up(s: string): string {
    return upperFor(s, this.langSvc.lang());
  }

  /** O uzunlukta cevap havuzu (boşsa 5'e, o da boşsa tümüne düşer). */
  private poolOf(length: number): readonly string[] {
    const p = this.pool();
    if (p.answersByLen[length]?.length) return p.answersByLen[length];
    if (p.answersByLen[5]?.length) return p.answersByLen[5];
    return p.answers;
  }

  /** Cevap havuzundaki kelime sayısı (aktif dil). */
  get size(): number {
    return this.pool().answers.length;
  }

  /** Kabul edilen toplam tahmin sayısı (aktif dil). */
  get dictionarySize(): number {
    return this.pool().valid.size;
  }

  /** Oyun başlatılabilir mi? (aktif dilin havuzu dolu mu) */
  get isReady(): boolean {
    return this.pool().answers.length > 0;
  }

  /** Rastgele bir cevap (uzunluktan bağımsız). */
  randomWord(): string {
    const a = this.pool().answers;
    return a.length ? a[Math.floor(Math.random() * a.length)] : '';
  }

  /** O uzunluktaki cevap havuzu — YZ rakip aday kelimeleri buradan eler (aktif dil). */
  answersOfLength(length: number): readonly string[] {
    return this.poolOf(length);
  }

  /** SEVİYEYE göre rastgele cevap (serbest mod). */
  randomWordForLevel(level: number): string {
    if (!this.isReady) return '';
    const pool = this.poolOf(pickLength(level));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Günün kelimesi — tarihe göre, herkes (aynı dilde) aynı kelimeyi görür. */
  wordOfTheDay(date = new Date()): string {
    if (!this.isReady) return '';
    const day = this.dayIndex(date);
    const L = WORD_LENGTHS[day % WORD_LENGTHS.length];
    const pool = this.poolOf(L);
    return pool[day % pool.length];
  }

  /** Tohumdan (seed) kelime — çok oyunculu oda için. */
  wordBySeed(seed: number): string {
    if (!this.isReady) return '';
    const s = Math.floor(Math.abs(seed));
    const L = WORD_LENGTHS[s % WORD_LENGTHS.length];
    const pool = this.poolOf(L);
    return pool[Math.floor(s / WORD_LENGTHS.length) % pool.length];
  }

  /** Sabit bir başlangıç gününden bu yana geçen gün sayısı. */
  dayIndex(date = new Date()): number {
    const start = Date.UTC(2026, 0, 1);
    const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(0, Math.floor((today - start) / 86_400_000));
  }

  /** Yeni kelimeye kalan süre (ms) — oyuncunun yerel gece yarısına kadar. */
  msUntilNextDay(now = new Date()): number {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  /** Tahmin aktif dilin geçerli sözlüğünde mi? */
  isValid(guess: string): boolean {
    return this.pool().valid.has(this.up(guess));
  }

  /** Bu harfi içeren en az bir geçerli kelime var mı? (aktif dil) */
  hasLetter(letter: string): boolean {
    const ch = this.up(letter);
    for (const w of this.pool().valid) if (w.includes(ch)) return true;
    return false;
  }
}
