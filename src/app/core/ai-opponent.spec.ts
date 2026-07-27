import { AI_CONFIG, aiOpener, AiSolver, guessEntropy } from './ai-opponent';
import wordsTr from '../data/words.json';

/**
 * Entropi tabanlı YZ çözücü — saf mantık, doğrudan test edilir.
 */
describe('YZ çözücü (entropi tabanlı)', () => {
  describe('guessEntropy — Shannon entropisi', () => {
    it('adayları DÖRT eşit desene bölen tahmin 2 bit verir', () => {
      // 'AA' → AA:22, AB:20, BA:02, BB:00 → 4 kova × 1/4 → -4·(¼·log₂¼) = 2
      expect(guessEntropy('AA', ['AA', 'AB', 'BA', 'BB'])).toBeCloseTo(2, 9);
    });

    it('adayları ÜÇ eşit desene bölen tahmin log₂(3) ≈ 1.585 bit verir', () => {
      // 'AA' → AA:22, AB:20, BB:00 → 3 kova × 1/3
      expect(guessEntropy('AA', ['AA', 'AB', 'BB'])).toBeCloseTo(Math.log2(3), 9);
    });

    it('tüm adayları TEK kovaya sokan tahmin 0 bit (hiç ayırmıyor)', () => {
      expect(guessEntropy('ZZ', ['AA', 'AB', 'BA'])).toBe(0);
    });

    it('tek aday kaldıysa entropi 0 (belirsizlik yok)', () => {
      expect(guessEntropy('KALEM', ['KALEM'])).toBe(0);
    });

    it('daha dengeli bölen tahminin entropisi daha yüksektir', () => {
      const cands = ['AAAA', 'AAAB', 'AABB', 'ABBB', 'BBBB'];
      const dengeli = guessEntropy('AABB', cands); // farklı desenlere yayar
      const zayif = guessEntropy('ZZZZ', cands); // hepsi aynı desen (0)
      expect(dengeli).toBeGreaterThan(zayif);
    });
  });

  describe('açılış kelimesi', () => {
    it('her uzunluk için derleme zamanı açılışı vardır (TR + EN)', () => {
      for (const L of [4, 5, 6, 7]) {
        expect(aiOpener('tr', L)).toBeTruthy();
        expect(aiOpener('en', L)).toBeTruthy();
        expect([...(aiOpener('tr', L) as string)].length).toBe(L);
      }
    });
    it('bilinmeyen uzunlukta null döner (çökmesin)', () => {
      expect(aiOpener('tr', 9)).toBeNull();
    });
  });

  describe('havuzun TAMAMINI çözer', () => {
    const pool = (wordsTr.words as string[])
      .map((w) => w.toLocaleUpperCase('tr'))
      .filter((w) => [...w].length === 5);
    const opener = aiOpener('tr', 5);

    // Deterministik RNG — test tekrarlanabilir olsun.
    function seeded() {
      let s = 987654321;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    }

    it('havuz dolu (5 harfli TR cevaplar)', () => {
      expect(pool.length).toBeGreaterThan(100);
    });

    it('ZOR (entropi) her kelimeyi ≤ 6 hakta çözer ve ortalama ≤ 2.9', () => {
      const rnd = seeded();
      let total = 0;
      let maxAtt = 0;
      let fails = 0;
      for (const answer of pool) {
        const s = new AiSolver(answer, pool, AI_CONFIG.hard, 6, rnd, opener);
        while (!s.done) s.step();
        if (!s.solved) fails++;
        total += s.attempts;
        maxAtt = Math.max(maxAtt, s.attempts);
      }
      const avg = total / pool.length;
      expect(fails).toBe(0); // hiçbir maçta çözümsüz kalmıyor
      expect(maxAtt).toBeLessThanOrEqual(6);
      expect(avg).toBeLessThanOrEqual(2.9); // kabul kriteri
    });

    it('açılış kelimesi ilk turda kullanılır (havuzda, geçerli uzunlukta)', () => {
      const s = new AiSolver(pool[0], pool, AI_CONFIG.hard, 6, seeded(), opener);
      s.step();
      expect(s.guesses.length).toBe(1);
      // ilk tahmin açılış kelimesidir → deseni açılışın cevaba karşı deseniyle aynı
      expect(pool).toContain(opener);
    });
  });
});
