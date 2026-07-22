import { TestBed } from '@angular/core/testing';
import { WordService } from './word.service';

/**
 * Cevap havuzu ile geçerli tahmin sözlüğü AYRI olmalı.
 *
 * Önceden ikisi aynıydı: oyuncu yalnızca cevap havuzundaki ~200 kelimeyi
 * tahmin edebiliyordu. Yani "SÜRAT" gibi apaçık Türkçe bir kelime
 * "Sözlükte yok" diye reddediliyordu — oyun oynanamaz hâldeydi.
 */
describe('WordService — sözlük', () => {
  let words: WordService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    words = TestBed.inject(WordService);
  });

  describe('sözlük kapsamı', () => {
    it('binlerce geçerli kelime kabul ediyor', () => {
      expect(words.dictionarySize).toBeGreaterThan(3000);
    });

    it('cevap havuzu sözlükten çok daha küçük (adil gizli kelimeler)', () => {
      expect(words.size).toBeLessThan(words.dictionarySize / 10);
      expect(words.size).toBeGreaterThan(100);
    });
  });

  describe('geçerli tahminler', () => {
    it('cevap havuzunda OLMAYAN gerçek kelimeleri kabul eder', () => {
      // Bunlar gizli kelime olarak seçilmez ama tahmin olarak geçerlidir
      for (const w of ['BEYİN', 'ERKEK', 'GÜNAH', 'YANAK', 'DELİK']) {
        expect(words.isValid(w)).toBe(true);
      }
    });

    it('cevap havuzundaki her kelime tahmin olarak da geçerlidir', () => {
      for (const w of ['KALEM', 'KİTAP', 'ÇİÇEK', 'ŞEKER', 'ÖRDEK', 'KAĞIT']) {
        expect(words.isValid(w)).toBe(true);
      }
    });

    it('küçük harf girilse de kabul eder (Türkçe büyük harf dönüşümü)', () => {
      expect(words.isValid('kalem')).toBe(true);
      expect(words.isValid('kitap')).toBe(true); // i → İ
    });
  });

  describe('geçersiz tahminler', () => {
    it('uydurma harf dizilerini reddeder', () => {
      for (const w of ['ZZZZZ', 'ABCDE', 'QQQQQ', 'XXXXX']) {
        expect(words.isValid(w)).toBe(false);
      }
    });

    it('4-7 harf aralığı dışını reddeder, içindeki gerçek kelimeleri kabul eder', () => {
      expect(words.isValid('KAL')).toBe(false); // 3 harf — çok kısa
      expect(words.isValid('KALEMLER')).toBe(false); // 8 harf — çok uzun
      expect(words.isValid('')).toBe(false);
      // 4-7 harf gerçek kelimeler kabul edilir
      expect(words.isValid('ADAM')).toBe(true); // 4
      expect(words.isValid('DOKTOR')).toBe(true); // 6
      expect(words.isValid('TELEFON')).toBe(true); // 7
    });
  });

  describe('gizli kelime seçimi', () => {
    it('gizli kelime 4-7 harflidir ve sözlükte geçerlidir', () => {
      for (let i = 0; i < 50; i++) {
        const w = words.randomWord();
        expect([...w].length).toBeGreaterThanOrEqual(4);
        expect([...w].length).toBeLessThanOrEqual(7);
        expect(words.isValid(w)).toBe(true); // sözlükte de var
      }
    });

    it('seviyeye göre seçilen kelime de geçerlidir (düşük seviye = kısa eğilimli)', () => {
      for (let i = 0; i < 50; i++) {
        const w = words.randomWordForLevel(1);
        expect([...w].length).toBeGreaterThanOrEqual(4);
        expect([...w].length).toBeLessThanOrEqual(7);
        expect(words.isValid(w)).toBe(true);
      }
    });

    it('günün kelimesi de cevap havuzundan gelir (4-7 harf)', () => {
      const w = words.wordOfTheDay();
      expect([...w].length).toBeGreaterThanOrEqual(4);
      expect([...w].length).toBeLessThanOrEqual(7);
      expect(words.isValid(w)).toBe(true);
    });
  });
});
