import { evaluateGuess, keyStatesFrom, strongerState } from './evaluate';
import { Guess, LetterState, Tile } from '../models/game.model';

/** Okunabilirlik: G=🟩 correct, Y=🟨 present, B=⬜ absent */
const G: LetterState = 'correct';
const Y: LetterState = 'present';
const B: LetterState = 'absent';

/** Sonucu emoji dizisi olarak yazar — beklentiler tek bakışta okunur. */
function emoji(states: LetterState[]): string {
  return states.map((s) => (s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬜')).join('');
}

describe('evaluateGuess — renk mantığı (saf fonksiyon)', () => {
  describe('normal durumlar', () => {
    it('tam isabet → hepsi yeşil', () => {
      expect(evaluateGuess('KALEM', 'KALEM')).toEqual([G, G, G, G, G]);
    });

    it('hiç ortak harf yok → hepsi gri', () => {
      expect(evaluateGuess('BULUT', 'ÇEŞME')).toEqual([B, B, B, B, B]);
    });

    it('doğru harfler yanlış yerlerde → hepsi sarı', () => {
      expect(evaluateGuess('MEKAL', 'KALEM')).toEqual([Y, Y, Y, Y, Y]);
    });

    it('karışık: yeşil + sarı + gri', () => {
      // cevap KALEM, tahmin KİTAP
      // K yerinde 🟩 | İ yok ⬜ | T yok ⬜ | A var, yeri yanlış 🟨 | P yok ⬜
      expect(emoji(evaluateGuess('KİTAP', 'KALEM'))).toBe('🟩⬜⬜🟨⬜');
    });
  });

  describe('HARF TEKRARI — kritik kenar durumlar', () => {
    it('cevap KALEM, tahmin ELELE → sadece BİRER E ve L işaretlenir', () => {
      // KALEM'de 1 tane E, 1 tane L var. ELELE'de 3 E, 2 L var.
      // Fazlalıklar çift sayılmamalı.
      const r = evaluateGuess('ELELE', 'KALEM');
      expect(emoji(r)).toBe('🟨🟨⬜⬜⬜');

      const marked = r.filter((s) => s !== 'absent').length;
      expect(marked).toBe(2); // 1 E + 1 L — fazlası yok
    });

    it('cevapta 1 harf, tahminde 3 harf → yalnızca biri sayılır', () => {
      // cevap KALEM'de tek A. Tahmin KAABA: A(1) yerinde → yeşil, diğer A'lar gri.
      const r = evaluateGuess('KAABA', 'KALEM');
      expect(emoji(r)).toBe('🟩🟩⬜⬜⬜');
    });

    it('yeşil önceliklidir: tam isabet, sarıdan önce havuzu tüketir', () => {
      // cevap ÇİÇEK'te 2 Ç var. Tahmin ÇÇÇÇÇ → yalnızca yerinde olan 2 Ç işaretlenir.
      const r = evaluateGuess('ÇÇÇÇÇ', 'ÇİÇEK');
      expect(emoji(r)).toBe('🟩⬜🟩⬜⬜');
      expect(r.filter((s) => s !== 'absent').length).toBe(2);
    });

    it('cevapta çift harf, tahminde tek harf → doğru işaretlenir', () => {
      // cevap EKMEK'te 2 K var. Tahmin KİTAP'ta tek K, yanlış yerde → sarı.
      expect(evaluateGuess('KİTAP', 'EKMEK')[0]).toBe(Y);
    });

    it('işaretli harf sayısı, cevaptaki adedi asla aşmaz', () => {
      // Genel kural: her harf için (yeşil+sarı) ≤ cevaptaki adet
      const cases: [string, string][] = [
        ['ELELE', 'KALEM'],
        ['KEKEM', 'EKMEK'],
        ['AAAAA', 'ARABA'],
        ['ÇİÇEK', 'ÇİÇEK'],
      ];

      for (const [guess, answer] of cases) {
        const r = evaluateGuess(guess, answer);
        const g = [...guess];
        const a = [...answer];

        for (const letter of new Set(g)) {
          const marked = r.filter((s, i) => s !== 'absent' && g[i] === letter).length;
          const available = a.filter((c) => c === letter).length;
          expect(marked).toBeLessThanOrEqual(available);
        }
      }
    });
  });

  describe('Türkçe', () => {
    it('i → İ ve ı → I ayrımı doğru', () => {
      expect(evaluateGuess('kitap', 'KİTAP')).toEqual([G, G, G, G, G]);
      expect(evaluateGuess('altın', 'ALTIN')).toEqual([G, G, G, G, G]);
    });

    it('İ ile I birbirinden farklı harflerdir', () => {
      // ALTIN'da (noktasız) I var; İ (noktalı) yok.
      expect(evaluateGuess('İİİİİ', 'ALTIN')).toEqual([B, B, B, B, B]);
    });
  });
});

describe('klavye renkleri — en güçlü sonuç kazanır', () => {
  function guess(word: string, states: LetterState[]): Guess {
    const tiles: Tile[] = [...word].map((letter, i) => ({ letter, state: states[i] }));
    return { word, tiles };
  }

  it('strongerState: correct > present > absent', () => {
    expect(strongerState('absent', 'present')).toBe('present');
    expect(strongerState('present', 'correct')).toBe('correct');
    expect(strongerState('correct', 'absent')).toBe('correct'); // geriye gitmez
    expect(strongerState('correct', 'present')).toBe('correct'); // geriye gitmez
    expect(strongerState(undefined, 'absent')).toBe('absent');
  });

  it('bir kez yeşil olan tuş, sonraki tahminde sarı çıksa da yeşil kalır', () => {
    const keys = keyStatesFrom([
      guess('KALEM', [G, B, B, B, B]), // K yeşil
      guess('ÇAKIL', [B, B, Y, B, B]), // aynı K burada sarı
    ]);

    expect(keys['K']).toBe(G); // yeşil korunur
  });

  it('gri olan tuş, sonra sarı çıkarsa sarıya yükselir', () => {
    const keys = keyStatesFrom([
      guess('KİTAP', [B, B, B, B, B]), // A gri
      guess('ARABA', [Y, B, B, B, B]), // A sarı
    ]);

    expect(keys['A']).toBe(Y);
  });

  it('her harfin durumu birikerek toplanır', () => {
    const keys = keyStatesFrom([guess('KALEM', [G, Y, B, B, G])]);

    expect(keys['K']).toBe(G);
    expect(keys['A']).toBe(Y);
    expect(keys['L']).toBe(B);
    expect(keys['M']).toBe(G);
    expect(keys['Z']).toBeUndefined(); // hiç denenmemiş harf renksiz
  });
});
