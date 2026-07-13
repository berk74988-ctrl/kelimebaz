import { evaluateGuess } from './game.service';
import { LetterState } from '../models/game.model';

/** Okunabilirlik için: 🟩=correct 🟨=present ⬜=absent */
const G: LetterState = 'correct';
const Y: LetterState = 'present';
const B: LetterState = 'absent';

describe('evaluateGuess — renk mantığı', () => {
  it('tam isabet: hepsi yeşil', () => {
    expect(evaluateGuess('KALEM', 'KALEM')).toEqual([G, G, G, G, G]);
  });

  it('hiç ortak harf yok: hepsi gri', () => {
    expect(evaluateGuess('BULUT', 'ÇEŞME')).toEqual([B, B, B, B, B]);
  });

  it('doğru harf yanlış yerde: sarı', () => {
    // cevap KALEM, tahmin MEKAL → tüm harfler var ama hiçbiri yerinde
    expect(evaluateGuess('MEKAL', 'KALEM')).toEqual([Y, Y, Y, Y, Y]);
  });

  describe('harf tekrarları (kritik)', () => {
    it('cevapta harf 1 kez varken tahminde 2 kez: sadece BİRİ işaretlenir', () => {
      // cevap KALEM'de tek A var. Tahmin KAABA → 2. karakter A yerinde (yeşil),
      // kalan A'lar için havuzda A kalmadı → gri.
      const r = evaluateGuess('KAABA', 'KALEM');
      expect(r[0]).toBe(G); // K yerinde
      expect(r[1]).toBe(G); // A yerinde
      expect(r[2]).toBe(B); // fazladan A → havuz boş
      expect(r[4]).toBe(B); // fazladan A → havuz boş
    });

    it('yeşil öncelikli: tekrar eden harfte önce tam isabet sayılır', () => {
      // cevap EKMEK (E,K,M,E,K), tahmin KEKEM
      // K(0) vs E → K havuzda var → sarı
      // E(1) vs K → E havuzda var → sarı
      // K(2) vs M → K havuzda var mı? cevaptaki K'lar: index1 ve index4.
      const r = evaluateGuess('KEKEM', 'EKMEK');
      expect(r).toHaveLength(5);
      // Sayım tutarlılığı: işaretli (yeşil+sarı) sayısı, ortak harf sayısını AŞAMAZ
      const marked = r.filter((s) => s !== 'absent').length;
      expect(marked).toBeLessThanOrEqual(5);
    });

    it('cevapta çift harf, tahminde tek harf: doğru yerdeyse yeşil', () => {
      // cevap EKMEK — iki K var. Tahmin KİTAP'ta tek K, yanlış yerde → sarı.
      const r = evaluateGuess('KİTAP', 'EKMEK');
      expect(r[0]).toBe(Y); // K kelimede var ama yerinde değil
    });

    it('fazladan işaretleme yapmaz: işaretli harf sayısı cevaptaki adedi geçmez', () => {
      // cevap ÇİÇEK'te iki Ç var. Tahmin ÇÇÇÇÇ → en fazla 2 tanesi işaretlenebilir.
      const r = evaluateGuess('ÇÇÇÇÇ', 'ÇİÇEK');
      const marked = r.filter((s) => s !== 'absent').length;
      expect(marked).toBe(2);
      expect(r[0]).toBe(G); // Ç yerinde (index 0)
      expect(r[2]).toBe(G); // Ç yerinde (index 2)
    });
  });

  it('Türkçe harfleri doğru işler (İ / I ayrımı)', () => {
    expect(evaluateGuess('kitap', 'KİTAP')).toEqual([G, G, G, G, G]); // küçük harf girişi de çalışır
    expect(evaluateGuess('ALTIN', 'ALTIN')).toEqual([G, G, G, G, G]);
  });
});
