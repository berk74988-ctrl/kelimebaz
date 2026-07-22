import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GameService } from './game.service';
import { WordService } from './word.service';

/**
 * Geçersiz tahmin akışı:
 *  - sözlükte olmayan / eksik kelime kabul edilmez
 *  - uyarı görünür, birkaç saniye sonra kaybolur
 *  - satır kilitlenmez, oyuncu düzeltebilir
 *  - geçerli kelime sorunsuz onaylanır
 */
describe('Tahmin doğrulama ve uyarılar', () => {
  let game: GameService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    // Testler 5 harfli kelime varsayar → serbest modun uzunluğunu sabitle
    vi.spyOn(TestBed.inject(WordService), 'randomWordForLevel').mockReturnValue('KALEM');
    game = TestBed.inject(GameService);
    game.reset('practice');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function type(word: string): void {
    for (const ch of word) game.type(ch);
  }

  describe('sözlükte olmayan kelime', () => {
    it('kabul edilmez ve "Sözlükte yok" uyarısı verir', () => {
      type('ZZZZZ'); // 5 harf ama gerçek kelime değil
      game.submit();

      expect(game.rowIndex()).toBe(0); // satır ilerlemedi
      expect(game.message()).toBe('Sözlükte yok');
    });

    it('satırı sallar (shake sayacı artar)', () => {
      const before = game.invalidShake();

      type('ZZZZZ');
      game.submit();

      expect(game.invalidShake()).toBe(before + 1);
    });

    it('satır KİLİTLENMEZ — oyuncu düzeltip tekrar deneyebilir', () => {
      type('ZZZZZ');
      game.submit();
      expect(game.rowIndex()).toBe(0);

      // harfleri silip geçerli bir kelime yaz
      for (let i = 0; i < 5; i++) game.backspace();
      expect(game.currentGuess()).toBe('');

      type('KALEM');
      game.submit();

      expect(game.rowIndex()).toBe(1); // bu sefer kabul edildi
    });
  });

  describe('eksik kelime', () => {
    it('5 harf dolmadan onaylanmaz, "5 harf girin" uyarısı verir', () => {
      type('KAL');
      game.submit();

      expect(game.rowIndex()).toBe(0);
      expect(game.message()).toBe('5 harf girin');
    });
  });

  describe('uyarının kaybolması', () => {
    it('birkaç saniye sonra kendiliğinden kaybolur', () => {
      vi.useFakeTimers();

      type('ZZZZZ');
      game.submit();
      expect(game.message()).toBe('Sözlükte yok'); // görünür

      vi.advanceTimersByTime(1999);
      expect(game.message()).toBe('Sözlükte yok'); // henüz duruyor

      vi.advanceTimersByTime(1);
      expect(game.message()).toBe(''); // kayboldu
    });

    it('oyuncu yazmaya devam edince hemen kaybolur', () => {
      type('ZZZZZ');
      game.submit();
      expect(game.message()).toBe('Sözlükte yok');

      game.backspace(); // düzeltmeye başladı
      expect(game.message()).toBe('');
    });
  });

  describe('geçerli kelime', () => {
    it('sorunsuz onaylanır: satır ilerler, uyarı çıkmaz', () => {
      type('KALEM');
      game.submit();

      expect(game.rowIndex()).toBe(1);
      expect(game.message()).toBe('');
      expect(game.currentGuess()).toBe('');
    });

    it('sallanma tetiklenmez', () => {
      const before = game.invalidShake();

      type('KALEM');
      game.submit();

      expect(game.invalidShake()).toBe(before); // değişmedi
    });
  });
});
