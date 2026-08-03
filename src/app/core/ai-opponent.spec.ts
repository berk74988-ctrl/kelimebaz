import { AI_CONFIG, aiOpeners, AiSolver, Difficulty, guessEntropy } from './ai-opponent';
import { evaluateGuess } from './evaluate';
import { LetterState } from '../models/game.model';
import wordsTr from '../data/words.json';

/**
 * Entropi tabanlı YZ çözücü — saf mantık, doğrudan test edilir.
 */
describe('YZ çözücü (entropi tabanlı)', () => {
  const pool = (wordsTr.words as string[])
    .map((w) => w.toLocaleUpperCase('tr'))
    .filter((w) => [...w].length === 5);
  const openers = aiOpeners('tr', 5);

  /** Deterministik RNG — testler tekrarlanabilir olsun. */
  function seeded(s = 987654321) {
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  describe('guessEntropy — Shannon entropisi', () => {
    it('adayları DÖRT eşit desene bölen tahmin 2 bit verir', () => {
      expect(guessEntropy('AA', ['AA', 'AB', 'BA', 'BB'])).toBeCloseTo(2, 9);
    });
    it('adayları ÜÇ eşit desene bölen tahmin log₂(3) ≈ 1.585 bit verir', () => {
      expect(guessEntropy('AA', ['AA', 'AB', 'BB'])).toBeCloseTo(Math.log2(3), 9);
    });
    it('tüm adayları TEK kovaya sokan tahmin 0 bit (hiç ayırmıyor)', () => {
      expect(guessEntropy('ZZ', ['AA', 'AB', 'BA'])).toBe(0);
    });
    it('tek aday kaldıysa entropi 0', () => {
      expect(guessEntropy('KALEM', ['KALEM'])).toBe(0);
    });
    it('daha dengeli bölen tahminin entropisi daha yüksektir', () => {
      const cands = ['AAAA', 'AAAB', 'AABB', 'ABBB', 'BBBB'];
      expect(guessEntropy('AABB', cands)).toBeGreaterThan(guessEntropy('ZZZZ', cands));
    });
  });

  describe('eleme doğruluğu (candidate elimination)', () => {
    it('bir tahminden sonra elenmiş havuzdan seçer → sonraki tahmin ipucuyla TUTARLI', () => {
      const answer = 'KALEM';
      const s = new AiSolver(answer, pool, AI_CONFIG.hard, 6, seeded(1), openers);
      s.step(); // ilk tahmin + adayları ele
      const first = s.guesses[0];
      if (!first.solved) {
        s.step();
        const second = s.guesses[1];
        // İkinci tahmin, ilk tahmine BAKILDIĞINDA aynı ipucunu üretmeli
        // (üretmiyorsa tutarsız aday elenmemiş demektir).
        expect(evaluateGuess(first.word, second.word)).toEqual(first.pattern);
      }
    });

    it('doğru kelime aday havuzunda kalır (yanlışlıkla elenmez) → çözer', () => {
      const answer = pool[7];
      const s = new AiSolver(answer, pool, AI_CONFIG.hard, 6, seeded(3), openers);
      while (!s.done) s.step();
      expect(s.solved).toBe(true); // cevap hiçbir turda elenmediği için bulunur
    });
  });

  describe('sıralı açılış listesi', () => {
    it('her uzunluk için sıralı açılış listesi vardır (TR + EN)', () => {
      for (const L of [4, 5, 6, 7]) {
        expect(aiOpeners('tr', L).length).toBeGreaterThan(1);
        expect(aiOpeners('en', L).length).toBeGreaterThan(1);
        expect([...aiOpeners('tr', L)[0]].length).toBe(L); // ilk açılış o uzunlukta
      }
    });
    it('bilinmeyen uzunlukta boş liste (çökmesin)', () => {
      expect(aiOpeners('tr', 9)).toEqual([]);
    });
  });

  describe('havuzun TAMAMINI çözer (Zor)', () => {
    it('havuz dolu (5 harfli TR cevaplar)', () => {
      expect(pool.length).toBeGreaterThan(100);
    });

    it('ZOR her kelimeyi ≤ 6 hakta çözer, ortalama ≤ 3.4', () => {
      const rnd = seeded();
      let total = 0;
      let maxAtt = 0;
      let fails = 0;
      for (const answer of pool) {
        const s = new AiSolver(answer, pool, AI_CONFIG.hard, 6, rnd, openers);
        while (!s.done) s.step();
        if (!s.solved) fails++;
        total += s.attempts;
        maxAtt = Math.max(maxAtt, s.attempts);
      }
      expect(fails).toBe(0); // Zor hiçbir havuz-içi kelimede çözümsüz kalmaz
      expect(maxAtt).toBeLessThanOrEqual(6);
      expect(total / pool.length).toBeLessThanOrEqual(3.4);
    });
  });

  describe('zorluk = oyun gücü (regresyon koruması)', () => {
    // ULAŞILABİLİR hedefler (700 kelimelik 5 harfli TR havuz, band tabanlı seçim; ölçülen
    // aralık ~3.1–4.46): scripts/vsai-solver-test.mjs. YETKİLİ ölçüm 500 maç ile orada
    // yapılır (Kolay−Zor farkı 1.36 ≥ 1.2 orada doğrulanır — `npm run check:vsai`).
    // Buradaki spec daha HAFİF/HIZLI bir alt-küme ölçümüdür (deterministik) → regresyonu
    // yakalar ama toleransı daha geniştir; band tabanlı estimatör farkı daha sıkışık ölçer.
    const TARGET: Record<Difficulty, number> = { easy: 4.46, medium: 3.63, hard: 3.1 };
    // Hız için havuzun deterministik alt kümesi (zayıf botlar tur başına pahalı örnekler).
    const SAMPLE = pool.filter((_, i) => i % 10 === 0);

    /** Alt kümedeki her kelimeyi çöz, ortalama tahmin sayısı (deterministik). */
    function avgFor(diff: Difficulty): number {
      const rnd = seeded(diff === 'hard' ? 111 : diff === 'medium' ? 222 : 333);
      let total = 0;
      for (const answer of SAMPLE) {
        const s = new AiSolver(answer, pool, AI_CONFIG[diff], 6, rnd, openers);
        while (!s.done) s.step();
        total += s.attempts;
      }
      return total / SAMPLE.length;
    }

    const avg = { easy: avgFor('easy'), medium: avgFor('medium'), hard: avgFor('hard') };

    it('her zorluk hedef ortalamasının ±0.4 bandında (hafif estimatör)', () => {
      for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
        expect(Math.abs(avg[d] - TARGET[d])).toBeLessThanOrEqual(0.4);
      }
    });

    it('oyun gücü sıralı: Kolay > Orta > Zor', () => {
      expect(avg.easy).toBeGreaterThan(avg.medium);
      expect(avg.medium).toBeGreaterThan(avg.hard);
    });

    it('Kolay–Zor gücü arasında gerçek fark var (bu hafif ölçümde ≥ 1.0; yetkili ≥1.2 check:vsai)', () => {
      expect(avg.easy - avg.hard).toBeGreaterThanOrEqual(1.0);
    });

    it('bot HER zorlukta yalnız TUTARLI (havuzdaki, ipuçlarıyla çelişmeyen) kelime tahmin eder', () => {
      const poolSet = new Set(pool);
      const rnd = seeded(42);
      for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
        for (let i = 0; i < 12; i++) {
          const answer = pool[Math.floor(rnd() * pool.length)];
          const s = new AiSolver(answer, pool, AI_CONFIG[diff], 6, rnd, openers);
          const prior: { word: string; pattern: LetterState[] }[] = [];
          while (!s.done) {
            s.step();
            const g = s.guesses[s.guesses.length - 1];
            // (1) Tahmin GEÇERLİ bir havuz kelimesi (uydurma değil).
            expect(poolSet.has(g.word)).toBe(true);
            // (2) Önceki HER ipucuyla TUTARLI — çelişen (anlamsız) tahmin yok.
            for (const p of prior) {
              expect(evaluateGuess(p.word, g.word)).toEqual(p.pattern);
            }
            prior.push({ word: g.word, pattern: g.pattern });
            if (g.solved) break;
          }
        }
      }
    }, 20000); // zayıf botlar çok tur oynar → gerçek iş; 5sn varsayılan yetmez
  });
});
