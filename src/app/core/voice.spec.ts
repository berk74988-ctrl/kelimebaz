import { describe, expect, it } from 'vitest';
import { voiceToLetters } from './voice';

describe('voiceToLetters', () => {
  it('kelime söylemeyi büyük harfe çevirir', () => {
    expect(voiceToLetters('kalem', 'tr')).toBe('KALEM');
  });

  it('harf harf söylemeyi (boşluklu) tek kelimeye birleştirir', () => {
    expect(voiceToLetters('k a l e m', 'tr')).toBe('KALEM');
    expect(voiceToLetters('K-A-L-E-M', 'tr')).toBe('KALEM');
  });

  it('noktalama, rakam ve boşlukları atar', () => {
    expect(voiceToLetters('  masa, 3! ', 'tr')).toBe('MASA');
  });

  it('kelime uzunluğuna kırpar (fazlası atılır)', () => {
    // "kalemler" 8 harf → 5 harflik oyunda ilk 5: KALEM
    expect(voiceToLetters('kalemler', 'tr', 5)).toBe('KALEM');
  });

  it('alfabe dışı harf yoksa boş döner (anlaşılamadı)', () => {
    expect(voiceToLetters('', 'tr')).toBe('');
    expect(voiceToLetters('123 ...', 'tr')).toBe('');
    // Türkçede Q/W/X yok → düşer
    expect(voiceToLetters('www', 'tr')).toBe('');
  });

  it('İngilizce modda W/X/Q korunur', () => {
    expect(voiceToLetters('proxy', 'en', 5)).toBe('PROXY');
    expect(voiceToLetters('q w', 'en')).toBe('QW');
  });

  it('boş/geçersiz girişte patlamaz', () => {
    // @ts-expect-error — çalışma zamanında null gelebilir
    expect(voiceToLetters(null, 'tr')).toBe('');
  });

  it('Almanca umlaut harflerini korur; ß büyük harfte SS olur', () => {
    expect(voiceToLetters('Zeit', 'de', 5)).toBe('ZEIT');
    expect(voiceToLetters('grün', 'de', 5)).toBe('GRÜN');
    expect(voiceToLetters('Mädchen', 'de', 7)).toBe('MÄDCHEN');
    // ß Almanca büyük harfte SS'e döner (havuzda ß'li kelime yok; yine de bozulmaz)
    expect(voiceToLetters('straße', 'de', 7)).toBe('STRASSE');
  });

  it('Türkçe özel harfleri korur', () => {
    // ç ğ ş ö ü İ — büyük harf yerelden bağımsız alfabede olmalı
    const out = voiceToLetters('güçlü', 'tr', 5);
    expect(out.length).toBe(5);
    expect([...out].every((c) => 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.includes(c))).toBe(true);
  });
});
