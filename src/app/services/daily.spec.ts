import { TestBed } from '@angular/core/testing';
import { GameService } from './game.service';
import { WordService } from './word.service';
import { formatCountdown } from '../components/countdown/countdown';

describe('Günün Kelimesi', () => {
  let game: GameService;
  let words: WordService;

  /** Servisleri sıfırdan kurar — sayfa yenilenmesini taklit eder. */
  function reload(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    game = TestBed.inject(GameService);
    words = TestBed.inject(WordService);
  }

  beforeEach(() => {
    localStorage.clear();
    reload();
  });

  function play(word: string): void {
    for (const ch of word) game.type(ch);
    game.submit();
  }

  function wrongWords(answer: string): string[] {
    const pool = ['KALEM', 'KİTAP', 'ÇORBA', 'DENİZ', 'GÜNEŞ', 'MASAL', 'TAVUK', 'ŞEKER'];
    return pool.filter((w) => w !== answer).slice(0, 6);
  }

  describe('deterministik seçim', () => {
    it('aynı gün AYNI cevap gelir', () => {
      const today = new Date(2026, 6, 13);

      expect(words.wordOfTheDay(today)).toBe(words.wordOfTheDay(today));
      expect(words.wordOfTheDay(today)).toBe(words.wordOfTheDay(new Date(2026, 6, 13, 23, 59)));
    });

    it('günün saatinden bağımsızdır', () => {
      const sabah = new Date(2026, 6, 13, 0, 1);
      const gece = new Date(2026, 6, 13, 23, 58);

      expect(words.wordOfTheDay(sabah)).toBe(words.wordOfTheDay(gece));
    });

    it('gün değişince kelime de değişir', () => {
      const gun1 = words.dayIndex(new Date(2026, 6, 13));
      const gun2 = words.dayIndex(new Date(2026, 6, 14));

      expect(gun2).toBe(gun1 + 1);
      // Havuzda 200+ kelime var; ardışık günler farklı sıraya düşer
      expect(words.wordOfTheDay(new Date(2026, 6, 13))).not.toBe(
        words.wordOfTheDay(new Date(2026, 6, 14)),
      );
    });

    it('sayfa yenilense de aynı kelime gelir', () => {
      game.start('daily');
      const answer = game.answer();

      reload();
      game.start('daily');

      expect(game.answer()).toBe(answer);
    });
  });

  describe('günde tek oyun', () => {
    it('bitirilmiş günlük oyun tekrar oynanamaz — tahta korunur', () => {
      game.start('daily');
      const answer = game.answer();
      play(answer); // kazandı

      expect(game.dailyDone()).toBe(true);

      // tekrar girmeye çalış
      game.start('daily');

      expect(game.status()).toBe('won'); // yeni oyun başlamadı
      expect(game.rowIndex()).toBe(1); // eski tahta duruyor
      expect(game.answer()).toBe(answer);
    });

    it('SERBEST OYUN, günlük kaydı EZMEZ (regresyon)', () => {
      // Bu bir hataydı: tek kayıt anahtarı kullanılıyordu, serbest oyun
      // günlük kaydın üstüne yazıyordu ve günlük tekrar oynanabiliyordu.
      game.start('daily');
      const dailyAnswer = game.answer();
      play(dailyAnswer); // günlük bitti
      expect(game.dailyDone()).toBe(true);

      game.reset('practice'); // "Tekrar oyna"
      play(game.answer()); // serbest oyunu da bitir
      game.reset('practice'); // bir tane daha

      // günlük moda geri dön
      game.start('daily');

      expect(game.dailyDone()).toBe(true); // HÂLÂ bitmiş sayılmalı
      expect(game.status()).toBe('won'); // sıfırdan başlamamalı
      expect(game.answer()).toBe(dailyAnswer);
    });

    it('sayfa yenilense de bitmiş günlük oyun korunur', () => {
      game.start('daily');
      const answer = game.answer();
      for (const w of wrongWords(answer)) play(w); // kaybetti
      expect(game.status()).toBe('lost');

      reload();

      expect(game.dailyDone()).toBe(true);
      expect(game.dailySnapshot()?.status).toBe('lost');
    });

    it('yarım kalan günlük oyun kaldığı yerden devam eder', () => {
      game.start('daily');
      const answer = game.answer();
      play(wrongWords(answer)[0]); // 1 tahmin yapıldı

      reload();
      game.start('daily');

      expect(game.status()).toBe('playing');
      expect(game.rowIndex()).toBe(1); // tahmin korundu
      expect(game.dailyDone()).toBe(false); // bitmedi, oynanabilir
    });

    it('serbest oyun sınırsız oynanabilir', () => {
      game.reset('practice');
      play(game.answer());
      expect(game.status()).toBe('won');

      game.reset('practice'); // tekrar
      expect(game.status()).toBe('playing');

      play(game.answer());
      expect(game.status()).toBe('won'); // sorun yok
    });
  });

  describe('geri sayım', () => {
    it('gece yarısına kalan süreyi hesaplar', () => {
      // 13 Temmuz 23:00 → gece yarısına 1 saat
      const ms = words.msUntilNextDay(new Date(2026, 6, 13, 23, 0, 0));
      expect(ms).toBe(60 * 60 * 1000);
    });

    it('gün başında neredeyse 24 saat gösterir', () => {
      const ms = words.msUntilNextDay(new Date(2026, 6, 13, 0, 0, 0));
      expect(ms).toBe(24 * 60 * 60 * 1000);
    });

    it('SS:DD:SS olarak biçimlenir', () => {
      expect(formatCountdown(0)).toBe('00:00:00');
      expect(formatCountdown(1000)).toBe('00:00:01');
      expect(formatCountdown(61_000)).toBe('00:01:01');
      expect(formatCountdown(3_661_000)).toBe('01:01:01');
      expect(formatCountdown(23 * 3600_000 + 59 * 60_000 + 59_000)).toBe('23:59:59');
    });

    it('negatif süreyi sıfır gösterir', () => {
      expect(formatCountdown(-5000)).toBe('00:00:00');
    });
  });
});
