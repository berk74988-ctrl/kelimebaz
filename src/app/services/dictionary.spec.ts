import { TestBed } from '@angular/core/testing';
import { WordService } from './word.service';
import { TR_LETTERS } from '../components/keyboard/keyboard';

/**
 * Sözlüğün GERÇEK içeriğini sınar — sahte veriyle değil, oyunun kullandığı
 * valid-words.json ile. Sözlük yeniden üretildiğinde (scripts/build-dictionary.mjs)
 * bu testler bozulursa üretim boru hattında bir gerileme var demektir.
 */
describe('Sözlük — kapsam ve kalite', () => {
  let words: WordService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    words = TestBed.inject(WordService);
  });

  it('cevap havuzundaki her kelime tahmin sözlüğünde de vardır', () => {
    // Aksi hâlde oyun kendi gizli kelimesini "Sözlükte yok" diye reddederdi.
    // Havuz 230 kelime; 400 gün gezerek hepsine uğruyoruz.
    for (let day = 0; day < 400; day++) {
      const answer = words.wordOfTheDay(new Date(2026, 0, 1 + day));
      expect(words.isValid(answer)).toBe(true);
    }
  });

  describe('kök kelimeler', () => {
    for (const w of ['KALEM', 'ARABA', 'ÇİÇEK', 'EKMEK', 'ŞEKER', 'GÜNEŞ', 'BEYİN', 'ALKOL']) {
      it(`${w} kabul edilir`, () => expect(words.isValid(w)).toBe(true));
    }
  });

  describe('çekimli biçimler — hiçbir kök sözlüğünde yoktur, biçimbilimle geldi', () => {
    // Oyuncu tahtaya "GEL" değil "GELDİ" yazar. Bunlar reddedilirse oyun,
    // dilin en sık kullanılan kelimelerini yok saymış olur.
    for (const w of ['GELDİ', 'OLSUN', 'BABAM', 'YERDE', 'EVDEN', 'ALDIM', 'YOKTU', 'ADINI', 'MUSUN']) {
      it(`${w} kabul edilir`, () => expect(words.isValid(w)).toBe(true));
    }
  });

  describe('geçersiz diziler reddedilir', () => {
    for (const w of ['ZZZZZ', 'ABCDE', 'AAAAA', 'ÇÇÇÇÇ']) {
      it(`${w} reddedilir`, () => expect(words.isValid(w)).toBe(false));
    }
  });

  describe('yazım hataları reddedilir', () => {
    // Altyazı korpusunun klasik hataları — Türkçe harf yerine ASCII karşılığı.
    // Doğru yazımları kabul edilir, hatalı hâlleri edilmez.
    const PAIRS: [string, string][] = [
      ['ALDİM', 'ALDIM'],
      ['SİMDİ', 'ŞİMDİ'],
      ['DEGİL', 'DEĞİL'],
    ];
    for (const [wrong, right] of PAIRS) {
      it(`${wrong} reddedilir, ${right} kabul edilir`, () => {
        expect(words.isValid(wrong)).toBe(false);
        expect(words.isValid(right)).toBe(true);
      });
    }
  });

  describe('kurallara aykırı türetmeler reddedilir', () => {
    // MOR bir isimdir; -an sıfat-fiil eki yalnızca FİİLE gelir.
    // JET bir isimdir; -er geniş zaman eki yalnızca FİİLE gelir.
    for (const w of ['MORAN', 'JETER']) {
      it(`${w} reddedilir`, () => expect(words.isValid(w)).toBe(false));
    }
  });

  describe('İngilizce özel adlar reddedilir', () => {
    for (const w of ['PETER', 'FROST', 'JAMES', 'ANGEL']) {
      it(`${w} reddedilir`, () => expect(words.isValid(w)).toBe(false));
    }
  });

  it('Türk alfabesindeki 29 harfin her biri en az bir kelimede geçer', () => {
    // "Tüm harfler destekleniyor" iddiası ancak her harf gerçekten
    // OYNANABİLİRSE doğrudur — klavyede olması yetmez.
    const unusable = [...TR_LETTERS].filter((ch) => !words.hasLetter(ch));
    expect(unusable).toEqual([]);
  });

  it('sözlük en az 10.000 kelime içerir', () => {
    expect(words.dictionarySize).toBeGreaterThanOrEqual(10_000);
  });
});
