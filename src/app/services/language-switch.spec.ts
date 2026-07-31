import '../test-seed';
import { TestBed } from '@angular/core/testing';
import { GameService } from './game.service';
import { LanguageService } from './language.service';
import { WordService } from './word.service';

/**
 * DİL DEĞİŞİMİ — oyunla ve paylaşımla etkileşim.
 *
 * Diller AYRI kelime havuzuna sahiptir; bu yüzden dil değişince eski dilde
 * kaydedilmiş oyun SÜRDÜRÜLMEZ (aksi hâlde başka dilin cevabıyla çelişirdi).
 * Paylaşım başlığı da aktif dile göre gelir.
 */
describe('Dil değişimi — oyun ve paylaşım', () => {
  let game: GameService;
  let words: WordService;
  let lang: LanguageService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    game = TestBed.inject(GameService);
    words = TestBed.inject(WordService);
    lang = TestBed.inject(LanguageService);
  });

  function seedDailySave(savedLang: 'tr' | 'en'): void {
    localStorage.setItem(
      'kelimebaz:game:daily',
      JSON.stringify({
        mode: 'daily',
        dayIndex: words.dayIndex(),
        answer: 'KALEM',
        guesses: [{ word: 'KİTAP', tiles: [] }],
        status: 'playing',
        lang: savedLang,
      }),
    );
  }

  describe('kaydedilmiş oyunun davranışı', () => {
    it('kayıt AKTİF dille eşleşiyorsa günlük oyun sürdürülür', () => {
      seedDailySave('tr'); // aktif dil tr
      expect(game.dailySnapshot()).not.toBeNull();
    });

    it('kayıt BAŞKA dildeyse sürdürülmez (dile göre farklı kelime havuzu)', async () => {
      seedDailySave('tr');
      lang.set('en');
      await lang.whenReady();
      expect(game.dailySnapshot()).toBeNull(); // tr kaydı en'de yüklenmez
    });

    it('start(): dil değişince kayıtlı oyun yüklenmez, taze başlar', async () => {
      seedDailySave('tr'); // 1 tahminli kayıt
      lang.set('en');
      await lang.whenReady();
      game.start('daily');
      expect(game.rowIndex()).toBe(0); // kaydedilen tahmin YÜKLENMEDİ → taze
      expect(game.status()).toBe('playing');
    });
  });

  describe('paylaşım metni aktif dile göre', () => {
    it('serbest oyun başlığı dil değişince güncellenir', async () => {
      game.start('practice');
      expect(game.shareText().split('\n')[0]).toContain('Kelimebaz (serbest)');

      lang.set('en');
      await lang.whenReady();
      expect(game.shareText().split('\n')[0]).toContain('Kelimebaz (free play)');
    });
  });
});
