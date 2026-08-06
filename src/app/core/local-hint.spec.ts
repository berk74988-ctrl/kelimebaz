import { describe, it, expect } from 'vitest';
import { localHint } from './local-hint';

const POOL = [
  'KALEM',
  'KALAS',
  'KATAR',
  'MASAL',
  'MASAJ',
  'SALON',
  'BALON',
  'KANAT',
  'KAYAK',
  'DAMAT',
];

describe('localHint — yerel Takıldım ipucu', () => {
  it('CEVABI ASLA ele vermez (tam kelime geçmez)', () => {
    for (const answer of ['KALEM', 'MASAL', 'SALON']) {
      const h = localHint({ answer, guesses: ['KATAR', 'MASAJ'], pool: POOL, lang: 'tr' });
      expect(h.toLocaleUpperCase('tr')).not.toContain(answer);
      expect(h.length).toBeGreaterThan(8); // dolu bir cümle
    }
  });

  it('yeşil (doğru yerde) harf varsa bunu söyler', () => {
    // KATAR vs KALEM → K yeşil (1. harf), A yeşil (2. harf)
    const h = localHint({ answer: 'KALEM', guesses: ['KATAR'], pool: POOL, lang: 'tr' });
    expect(h).toMatch(/harfin yeri kesin/);
  });

  it('henüz denenmemiş faydalı bir harf önerir', () => {
    const h = localHint({ answer: 'KALEM', guesses: ['SALON'], pool: POOL, lang: 'tr' });
    expect(h).toMatch(/denemediğin . harfini dene|harfin yeri kesin|sarı/);
  });

  it('İngilizce ve Almanca da cümle üretir, cevabı vermez', () => {
    const en = localHint({ answer: 'KALEM', guesses: ['MASAL'], pool: POOL, lang: 'en' });
    expect(en).not.toContain('KALEM');
    expect(en.length).toBeGreaterThan(8);
    const de = localHint({ answer: 'SALON', guesses: ['BALON'], pool: POOL, lang: 'de' });
    expect(de).not.toContain('SALON');
    expect(de.length).toBeGreaterThan(8);
  });

  it('hiç tahmin yoksa bile güvenli bir genel ipucu döner', () => {
    const h = localHint({ answer: 'KALEM', guesses: [], pool: POOL, lang: 'tr' });
    expect(h.length).toBeGreaterThan(8);
    expect(h.toLocaleUpperCase('tr')).not.toContain('KALEM');
  });
});
