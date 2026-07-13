import { Injectable } from '@angular/core';
import { trUpper } from '../core/turkish';
import answerData from '../data/words.json';
import validData from '../data/valid-words.json';
import { WORD_LENGTH } from '../models/game.model';

/**
 * Kelime havuzlarına erişim.
 *
 * İKİ AYRI LİSTE VAR — bu ayrım oyunun adil olmasını sağlar:
 *
 *   1) CEVAPLAR (words.json) — gizli kelime buradan seçilir.
 *      Elle seçilmiş, herkesin bildiği kelimeler. Gizli kelime asla
 *      "EBCET" gibi obskür bir şey olmaz.
 *
 *   2) GEÇERLİ TAHMİNLER (valid-words.json) — 5.500+ Türkçe kelime.
 *      Oyuncu SÖZLÜKTEKİ HERHANGİ bir kelimeyi deneyebilir; tahminin
 *      cevap havuzunda olmasına gerek yok. Böylece harf elemek için
 *      istediği kombinasyonu deneyebilir.
 *
 * Her iki liste de derleme zamanında paketlenir — backend yok.
 */
@Injectable({ providedIn: 'root' })
export class WordService {
  /** Gizli kelimelerin seçildiği havuz. */
  private readonly answers: readonly string[] = (answerData.words as string[])
    .map(trUpper)
    .filter((w) => [...w].length === WORD_LENGTH);

  /**
   * Geçerli tahmin sözlüğü.
   * Kompakt biçimde saklanır (boşlukla ayrılmış tek metin) — 5.500 kelimeyi
   * JSON dizisi olarak tutmak gereksiz yer kaplardı.
   */
  private readonly validWords: ReadonlySet<string> = new Set(
    (validData.words as string).split(' ').filter(Boolean),
  );

  /** Cevap havuzundaki kelime sayısı. */
  get size(): number {
    return this.answers.length;
  }

  /** Kabul edilen toplam tahmin sayısı. */
  get dictionarySize(): number {
    return this.validWords.size;
  }

  /**
   * Oyun başlatılabilir mi?
   *
   * Listeler derleme zamanında paketlenir, yani "indirilemedi" diye bir durum
   * yok. Ama JSON bozulursa havuz boş kalabilir — o hâlde oyun başlatılamaz.
   */
  get isReady(): boolean {
    return this.answers.length > 0;
  }

  /** Rastgele bir cevap kelimesi (serbest mod). */
  randomWord(): string {
    if (!this.isReady) return '';
    return this.answers[Math.floor(Math.random() * this.answers.length)];
  }

  /**
   * Günün kelimesi — tarihe göre belirlenir, herkes aynı kelimeyi görür.
   * Aynı gün içinde her zaman aynı sonucu döndürür.
   */
  wordOfTheDay(date = new Date()): string {
    if (!this.isReady) return '';
    return this.answers[this.dayIndex(date) % this.answers.length];
  }

  /** Sabit bir başlangıç gününden bu yana geçen gün sayısı. */
  dayIndex(date = new Date()): number {
    const start = Date.UTC(2026, 0, 1); // 1 Ocak 2026
    const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(0, Math.floor((today - start) / 86_400_000));
  }

  /**
   * Yeni kelimeye kalan süre (ms) — oyuncunun yerel gece yarısına kadar.
   * Gün oyuncunun kendi saat diliminde döner.
   */
  msUntilNextDay(now = new Date()): number {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  /**
   * Tahmin geçerli bir Türkçe kelime mi?
   *
   * Cevap havuzunda olmasına GEREK YOK — sözlükte olması yeterli.
   * (Cevaplar da sözlüğe dahildir; sözlük üretilirken garanti altına alınır.)
   */
  isValid(guess: string): boolean {
    return this.validWords.has(trUpper(guess));
  }
}
