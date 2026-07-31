import '../test-seed';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GameService } from './game.service';
import { StatsService } from './stats.service';
import { WordService } from './word.service';
import { MAX_ATTEMPTS } from '../models/game.model';

/**
 * Oyun bitişi: kazanma, kaybetme ve temiz yeniden başlatma.
 */
describe('Oyun bitişi', () => {
  let game: GameService;
  let words: WordService;
  let stats: StatsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    words = TestBed.inject(WordService);
    // 5 harfli deterministik oyun: hem serbest hem günlük kelimeyi sabitle
    vi.spyOn(words, 'randomWordForLevel').mockReturnValue('KALEM');
    vi.spyOn(words, 'wordOfTheDay').mockReturnValue('KALEM');
    game = TestBed.inject(GameService);
    stats = TestBed.inject(StatsService);
    game.reset('practice');
  });

  function type(word: string): void {
    for (const ch of word) game.type(ch);
  }

  function guess(word: string): void {
    type(word);
    game.submit();
  }

  /** Cevaptan farklı, sözlükte geçerli 6 kelime. */
  function wrongWords(answer: string): string[] {
    const pool = ['KALEM', 'KİTAP', 'ÇORBA', 'DENİZ', 'GÜNEŞ', 'MASAL', 'TAVUK', 'ŞEKER'];
    return pool.filter((w) => w !== answer).slice(0, MAX_ATTEMPTS);
  }

  describe('kazanma', () => {
    it('doğru tahminde oyun kazanılır', () => {
      guess(game.answer());

      expect(game.status()).toBe('won');
      expect(game.isOver()).toBe(true);
    });

    it('kaçıncı tahminde kazanıldığı bilinir', () => {
      const answer = game.answer();
      guess(wrongWords(answer)[0]);
      guess(answer); // 2. tahmin

      expect(game.status()).toBe('won');
      expect(game.rowIndex()).toBe(2);
    });

    it('kazanılan satırın tüm kutuları yeşildir', () => {
      const answer = game.answer();
      guess(answer);

      const row = game.board()[0];
      for (const tile of row) {
        expect(tile.state).toBe('correct');
      }
    });

    it('istatistiklere kazanma olarak işlenir', () => {
      guess(game.answer());

      expect(stats.stats().played).toBe(1);
      expect(stats.stats().won).toBe(1);
      expect(stats.stats().currentStreak).toBe(1);
      expect(stats.stats().distribution[0]).toBe(1); // 1. tahminde
    });
  });

  describe('kaybetme', () => {
    it('6 hak bitince oyun kaybedilir', () => {
      const answer = game.answer();
      for (const w of wrongWords(answer)) guess(w);

      expect(game.rowIndex()).toBe(MAX_ATTEMPTS);
      expect(game.status()).toBe('lost');
      expect(game.isOver()).toBe(true);
    });

    it('kaybedince doğru kelime bilinir (ekranda gösterilir)', () => {
      const answer = game.answer();
      for (const w of wrongWords(answer)) guess(w);

      expect(game.status()).toBe('lost');
      expect(game.answer()).toBe(answer); // sonuç ekranı bunu gösterir
      expect(words.isValid(game.answer())).toBe(true);
    });

    it('5. tahminden sonra oyun hâlâ sürer (erken bitmez)', () => {
      const answer = game.answer();
      const wrong = wrongWords(answer);
      for (let i = 0; i < 5; i++) guess(wrong[i]);

      expect(game.status()).toBe('playing');
      expect(game.isOver()).toBe(false);
    });

    it('istatistiklere kayıp olarak işlenir, seri sıfırlanır', () => {
      const answer = game.answer();
      for (const w of wrongWords(answer)) guess(w);

      expect(stats.stats().played).toBe(1);
      expect(stats.stats().won).toBe(0);
      expect(stats.stats().currentStreak).toBe(0);
    });
  });

  describe('YZ (vsai) modu — ANA ilerlemeyi cezalandırmaz', () => {
    // NOT: YZ maçının SONUCU (vsaiPlayed/vsaiWon + karakter kaydı) VsaiScreen'de
    // GERÇEK yarış sonucuna göre işlenir (sıra tabanlı: daha az tahminde bulan kazanır).
    // GameService yalnız ana istatistiğe DOKUNMADIĞINI garanti eder — burada o test edilir.
    beforeEach(() => {
      guess(game.answer()); // önce SERBEST modda bir galibiyet → ana seri 1
      expect(stats.stats().currentStreak).toBe(1);
      game.startRoom('KALEM', 'vsai'); // sonra bir YZ maçı başlat
    });

    it('YZ maçında kelimeyi bulmak ana oynanan/seriyi ARTIRMAZ', () => {
      const anaOynanan = stats.stats().played;

      guess('KALEM'); // YZ maçında çöz

      expect(game.status()).toBe('won');
      expect(stats.stats().played).toBe(anaOynanan); // ana oynanan DEĞİŞMEDİ
      expect(stats.stats().won).toBe(anaOynanan); // ana kazanılan DEĞİŞMEDİ
      expect(stats.stats().currentStreak).toBe(1); // ANA SERİ artmadı
    });

    it('YZ maçında 6 hakkı bitirmek kazanma serisini SIFIRLAMAZ', () => {
      for (const w of wrongWords('KALEM')) guess(w); // 6 yanlış

      expect(game.status()).toBe('lost');
      expect(stats.stats().currentStreak).toBe(1); // ANA SERİ korundu
      expect(stats.stats().played).toBe(1); // ana oynanan artmadı
    });

    it('rakip ÖNCE çözünce oyun "lost" değil "ended" olur, ana seri korunur', () => {
      guess(wrongWords('KALEM')[0]); // oyuncunun daha tahmin hakkı var

      game.endVsaiMatch(); // 🤖 bot önce çözdü → oyuncunun oyunu kapanır

      expect(game.status()).toBe('ended'); // 'lost' DEĞİL → kalan haklar cezaya dönüşmez
      expect(game.isOver()).toBe(true);
      expect(stats.stats().currentStreak).toBe(1); // ANA SERİ korundu
    });
  });

  describe('tekrar oyna', () => {
    it('oyunu TEMİZ başlatır: tahta boş, durum playing', () => {
      guess(game.answer()); // kazan
      expect(game.isOver()).toBe(true);

      game.reset('practice'); // "Tekrar oyna"

      expect(game.status()).toBe('playing');
      expect(game.isOver()).toBe(false);
      expect(game.rowIndex()).toBe(0);
      expect(game.currentGuess()).toBe('');

      // tahtadaki 30 kutunun hepsi boş
      const tiles = game.board().flat();
      expect(tiles.length).toBe(30);
      for (const t of tiles) {
        expect(t.letter).toBe('');
        expect(t.state).toBe('empty');
      }
    });

    it('klavye renkleri sıfırlanır', () => {
      guess('KALEM');
      expect(Object.keys(game.keyStates()).length).toBeGreaterThan(0);

      game.reset('practice');

      expect(Object.keys(game.keyStates()).length).toBe(0);
    });

    it('yeni oyundan sonra tekrar oynanabilir', () => {
      for (const w of wrongWords(game.answer())) guess(w); // kaybet
      game.reset('practice');

      guess(game.answer()); // yeni oyunu kazan
      expect(game.status()).toBe('won');
      expect(stats.stats().played).toBe(2); // iki oyun oynandı
    });

    it('günlük oyundan sonra tekrar oynayınca YENİ kelime gelir (aynısı değil)', () => {
      game.reset('daily');
      const dailyWord = game.answer();
      expect(dailyWord).toBe(words.wordOfTheDay());

      guess(dailyWord); // günün kelimesini bul
      game.reset('practice'); // "Tekrar oyna" → serbest mod

      expect(game.mode()).toBe('practice');
      expect(game.status()).toBe('playing');
      // Serbest mod rastgele seçer; kritik olan modun değişmesi ve oyunun temiz olması
      expect(game.rowIndex()).toBe(0);
    });
  });
});
