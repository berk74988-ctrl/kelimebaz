import { analyzeGuesses, GuessAnalysis } from './guess-analysis';

/**
 * Maç sonu tahmin analizi — saf mantık, doğrudan test.
 */
describe('Tahmin analizi (guess-analysis)', () => {
  // 5 harfli küçük sözde-havuz (deterministik).
  const POOL = ['KALEM', 'KADEM', 'KEREM', 'SELAM', 'SALEP', 'MADEN', 'KOLAY'];

  it('boş tahmin listesi → boş sonuç', () => {
    expect(analyzeGuesses('KALEM', [], POOL, 'tr')).toEqual([]);
  });

  it('her tahmin için aday/eleme/entropi/en-iyi alanları döner', () => {
    const a = analyzeGuesses('KALEM', ['SELAM', 'KALEM'], POOL, 'tr');
    expect(a.length).toBe(2); // cevap bulununca durur
    const g0 = a[0];
    expect(g0.word).toBe('SELAM');
    expect(g0.candidatesBefore).toBe(POOL.length); // cevap havuzda → aynı sayı
    expect(g0.eliminated).toBeGreaterThan(0); // bir şeyler eledi
    expect(g0.entropy).toBeGreaterThan(0);
    expect(g0.bestWord.length).toBe(5);
    expect(g0.bestEntropy).toBeGreaterThanOrEqual(g0.entropy - 1e-9); // en iyi ≥ seçilen
    expect(g0.solved).toBe(false);
  });

  it('cevabı bulan tahmin: solved=true ve quality=optimal', () => {
    const a = analyzeGuesses('KALEM', ['SELAM', 'KALEM'], POOL, 'tr');
    const win = a[a.length - 1];
    expect(win.word).toBe('KALEM');
    expect(win.solved).toBe(true);
    expect(win.quality).toBe('optimal');
  });

  it('adaylar her turda azalır (veya sabit kalır), asla artmaz', () => {
    const a = analyzeGuesses('KADEM', ['KOLAY', 'MADEN', 'KADEM'], POOL, 'tr');
    for (let i = 1; i < a.length; i++) {
      expect(a[i].candidatesBefore).toBeLessThanOrEqual(a[i - 1].candidatesBefore);
    }
  });

  it('eliminated = candidatesBefore − (sonraki tur adayları); tutarlı', () => {
    const a = analyzeGuesses('KALEM', ['KOLAY', 'KALEM'], POOL, 'tr');
    // ilk turda kalan − elenmiş = ikinci turun candidatesBefore'u
    expect(a[0].candidatesBefore - a[0].eliminated).toBe(a[1].candidatesBefore);
  });

  it('cevap havuzda olmasa bile aday olarak eklenir (çökme yok)', () => {
    const a = analyzeGuesses('ZZZZZ', ['KALEM'], ['KALEM', 'SELAM'], 'tr');
    expect(a.length).toBe(1);
    expect(a[0].candidatesBefore).toBe(3); // 2 havuz + cevap
  });

  it('geçerli kalite etiketleri üretir', () => {
    const a: GuessAnalysis[] = analyzeGuesses('KALEM', ['SELAM', 'MADEN', 'KALEM'], POOL, 'tr');
    const valid = new Set(['optimal', 'great', 'good', 'fair', 'weak']);
    for (const x of a) expect(valid.has(x.quality)).toBe(true);
  });
});
