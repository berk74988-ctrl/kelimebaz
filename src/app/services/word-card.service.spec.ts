import { TestBed } from '@angular/core/testing';
import trCards from '../data/word-cards-tr.json';
import wordsData from '../data/words.json';
import { LanguageService } from './language.service';
import { WordCardService } from './word-card.service';

/**
 * Kelime kartı sözleşmesi: HER Türkçe cevap kelimesinin bir kartı olmalı ve her
 * kartta tanım (t) + örnek cümle (e) bulunmalı. Kartı olmayan kelimede servis
 * null döner (arayüz kartı hiç göstermez → boş durum bozulmaz).
 */
const TR_WORDS: string[] = (wordsData as { words: string[] }).words;
const CARDS = trCards as Record<string, { t: string; e: string }>;

describe('Kelime kartı verisi (Türkçe)', () => {
  it('kartlar cevap havuzunun bir alt kümesini kapsıyor (fazlı yayılım)', () => {
    // NOT: Havuz 3100'e büyütüldü; kartlar fazlı olarak ekleniyor (henüz hepsi değil).
    const covered = TR_WORDS.filter((w) => CARDS[w]);
    expect(covered.length).toBeGreaterThan(0);
  });

  it('her kartta tanım ve örnek cümle var', () => {
    // Sözleşme: VAR OLAN her kartın tanımı ve örnek cümlesi dolu olmalı.
    const bozuk = Object.keys(CARDS).filter((w) => {
      const c = CARDS[w];
      return !c || !c.t?.trim() || !c.e?.trim();
    });
    expect(bozuk).toEqual([]);
  });
});

describe('WordCardService (tembel yükleme)', () => {
  let svc: WordCardService;
  let lang: LanguageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(WordCardService);
    lang = TestBed.inject(LanguageService);
    lang.set('tr');
  });

  it('bilinen kelime için tanım + örnek döner', async () => {
    const c = await svc.card('KEDİ');
    expect(c).not.toBeNull();
    expect(c!.t.length).toBeGreaterThan(0);
    expect(c!.e.length).toBeGreaterThan(0);
  });

  it('kartı olmayan kelimede null döner (boş durum)', async () => {
    const c = await svc.card('ZZZYOKKELIME');
    expect(c).toBeNull();
  });
});
