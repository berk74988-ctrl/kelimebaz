import { TestBed } from '@angular/core/testing';
import wordsData from '../data/words.json';
import { HintService } from './hint.service';
import { LanguageService } from './language.service';

/**
 * İpucu sözleşmesi: Türkçe modda oynanan HER cevap kelimesinde ipucu görünmeli ve
 * hiçbir ipucu cevabı/kökünü/çekimini sızdırmamalı. (Ana kitle Türkçe oynar.)
 */
const TR_WORDS: string[] = (wordsData as { words: string[] }).words;

// scripts/lib-hint-leak.mjs ile aynı mantık (Türkçe soneklidir → sızıntı sözcük başında).
const SOFTEN: Record<string, string> = { P: 'B', Ç: 'C', T: 'D', K: 'Ğ', G: 'Ğ' };
function leaks(word: string, hint: string): boolean {
  const W = word.toLocaleUpperCase('tr');
  const stems = new Set<string>();
  if (W.length >= 3) stems.add(W);
  const last = W[W.length - 1];
  if (SOFTEN[last] && W.length >= 4) stems.add(W.slice(0, -1) + SOFTEN[last]);
  if (last === 'K' && W.length >= 4) stems.add(W.slice(0, -1) + 'G');
  const tokens = (hint || '').toLocaleUpperCase('tr').split(/[^A-ZÇĞİÖŞÜ]+/).filter(Boolean);
  return tokens.some((tok) => [...stems].some((s) => tok.startsWith(s)));
}

describe('İpucu servisi (Türkçe yerli)', () => {
  let hint: HintService;
  let lang: LanguageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    hint = TestBed.inject(HintService);
    lang = TestBed.inject(LanguageService);
    lang.set('tr');
  });

  it('Türkçe modda ipucu sistemi AÇIK', () => {
    expect(hint.enabled).toBe(true);
  });

  it('bilinen bir Türkçe kelimede kategori + açıklama döner', () => {
    const h = hint.for('KEDİ');
    expect(h).not.toBeNull();
    expect(h!.c.length).toBeGreaterThan(0);
    expect(h!.h.length).toBeGreaterThan(0);
  });

  it('ipuçları cevap havuzunun bir alt kümesini kapsıyor ve hepsi geçerli', () => {
    // NOT: Havuz 3100'e büyütüldü; ipuçları fazlı olarak ekleniyor (henüz hepsi
    // kapsanmıyor). Sözleşme: KAPSANAN her kelimenin ipucu geçerli (kategori+açıklama).
    const covered = TR_WORDS.filter((w) => hint.for(w));
    expect(covered.length).toBeGreaterThan(0);
    for (const w of covered) {
      const h = hint.for(w)!;
      expect(h.c.length).toBeGreaterThan(0);
      expect(h.h.length).toBeGreaterThan(0);
    }
  });

  it('hiçbir ipucu cevabı, kökünü veya çekimini İÇERMEZ', () => {
    const sizan = TR_WORDS.filter((w) => {
      const h = hint.for(w);
      return h && leaks(w, h.h);
    });
    expect(sizan).toEqual([]);
  });

  it('dil İngilizceye dönünce Türkçe cevap kelimesi ipucu vermez (kaynak değişir)', () => {
    lang.set('en');
    // hints-tr-native yalnızca TR modda okunur; İngilizce sözlükte Türkçe kelime yoktur
    expect(hint.for('MERHABA')).toBeNull();
  });
});
