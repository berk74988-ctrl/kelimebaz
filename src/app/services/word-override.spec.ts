import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WordService } from './word.service';

/**
 * GÜNÜN KELİMESİ override — istemci davranışı.
 * Kritik: override VARSA ve geçerliyse kullanılır; YOKSA / geçersizse / sunucu
 * erişilemezse gömülü algoritmaya düşülür (oyun her koşulda çalışır).
 */
describe('WordService günün kelimesi override', () => {
  const D = new Date(2026, 5, 1); // sabit bir gün → belirleyici dayIndex

  function seed(): void {
    WordService.seedForTest({
      tr: {
        answers: ['KALEM', 'MASA', 'KITAP', 'ARABA', 'ELMAS'],
        validText: 'KALEM MASA KITAP ARABA ELMAS KAPAK',
      },
    });
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('override yokken gömülü algoritmayı kullanır (belirleyici)', () => {
    seed();
    const w = TestBed.inject(WordService);
    const di = w.dayIndex(D);
    const a = w.wordOfTheDay(D);
    expect(a).toBeTruthy();
    // Aynı gün → aynı kelime (belirleyici)
    expect(w.wordOfTheDay(D)).toBe(a);
    void di;
  });

  it('geçerli override o günün kelimesini değiştirir', () => {
    seed();
    // dayIndex'i önce bir örnekten öğren, sonra override yaz + servisi yeniden kur.
    const probe = TestBed.inject(WordService);
    const di = probe.dayIndex(D);
    TestBed.resetTestingModule();
    localStorage.setItem(
      'kelimebaz:daily-overrides',
      JSON.stringify({ map: { [`tr:${di}`]: 'KAPAK' } }),
    );
    TestBed.configureTestingModule({});
    const w = TestBed.inject(WordService);
    expect(w.wordOfTheDay(D)).toBe('KAPAK'); // override (geçerli kelime) uygulandı
  });

  it('geçersiz (sözlükte olmayan) override yok sayılır → gömülü algoritma', () => {
    seed();
    const probe = TestBed.inject(WordService);
    const di = probe.dayIndex(D);
    const algo = probe.wordOfTheDay(D);
    TestBed.resetTestingModule();
    localStorage.setItem(
      'kelimebaz:daily-overrides',
      JSON.stringify({ map: { [`tr:${di}`]: 'ZZZZZ' } }), // havuzda/sözlükte yok
    );
    TestBed.configureTestingModule({});
    const w = TestBed.inject(WordService);
    expect(w.wordOfTheDay(D)).toBe(algo); // override reddedildi, gömülüye düştü
  });

  it('başka güne yazılan override bugünü etkilemez', () => {
    seed();
    const probe = TestBed.inject(WordService);
    const di = probe.dayIndex(D);
    const algo = probe.wordOfTheDay(D);
    TestBed.resetTestingModule();
    localStorage.setItem(
      'kelimebaz:daily-overrides',
      JSON.stringify({ map: { [`tr:${di + 1}`]: 'KAPAK' } }), // yarın
    );
    TestBed.configureTestingModule({});
    const w = TestBed.inject(WordService);
    expect(w.wordOfTheDay(D)).toBe(algo);
  });
});
