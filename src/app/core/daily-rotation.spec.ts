import {
  ANSWER_LENGTHS,
  dayOfWeek,
  lengthForDay,
  levelBand,
  pickDaily,
  rawBand,
  targetBand,
} from './daily-rotation';

/**
 * Günlük rotasyon — BELİRLEYİCİ ve zorluk-dengeli olmalı.
 * (Aynı gün + aynı havuz → aynı kelime; art arda iki gün en zor banttan gelmez.)
 */
describe('Günlük kelime rotasyonu', () => {
  // Sahte havuz: her uzunluk × her band için farklı kelimeler.
  const byBand = (length: number, band: number): string[] =>
    Array.from({ length: 10 }, (_, i) => `L${length}B${band}#${i}`);

  describe('belirleyicilik (aynı gün → aynı sonuç)', () => {
    it('aynı dayIndex her zaman aynı kelime + uzunluk + bandı verir', () => {
      for (const day of [0, 1, 5, 42, 100, 365, 1000]) {
        const a = pickDaily(day, byBand);
        const b = pickDaily(day, byBand);
        expect(a).toEqual(b);
        expect(a).not.toBeNull();
      }
    });

    it('farklı günler (genelde) farklı kelime verir — sabit değil', () => {
      const words = new Set(Array.from({ length: 30 }, (_, d) => pickDaily(d, byBand)!.word));
      expect(words.size).toBeGreaterThan(10); // rotasyon gerçekten dönüyor
    });
  });

  describe('zorluk bandı', () => {
    it('hafta içi (Pzt-Per) kolay-orta: band ≤ 3', () => {
      for (let day = 0; day < 400; day++) {
        const dow = dayOfWeek(day);
        if (dow >= 1 && dow <= 4) expect(targetBand(day)).toBeLessThanOrEqual(3);
      }
    });

    it('band her zaman 1-5 aralığında', () => {
      for (let day = 0; day < 400; day++) {
        expect(targetBand(day)).toBeGreaterThanOrEqual(1);
        expect(targetBand(day)).toBeLessThanOrEqual(5);
      }
    });

    it('ART ARDA İKİ GÜN band-5 gelmez', () => {
      for (let day = 0; day < 2000; day++) {
        if (targetBand(day) === 5) expect(targetBand(day + 1)).not.toBe(5);
      }
    });

    it('hafta sonu en az bir kez band-5 çıkabiliyor (zorluk gerçekten var)', () => {
      let seen5 = false;
      for (let day = 0; day < 400 && !seen5; day++) if (targetBand(day) === 5) seen5 = true;
      expect(seen5).toBe(true);
    });

    it('kural gerçekten tetikleniyor: bir ham-5 çifti düşürülüyor', () => {
      let lowered = false;
      for (let day = 1; day < 4000 && !lowered; day++) {
        if (rawBand(day) === 5 && rawBand(day - 1) === 5 && targetBand(day) === 4) lowered = true;
      }
      expect(lowered).toBe(true); // art arda ham-5 vakası var ve düşürülüyor
    });
  });

  describe('uzunluk (belirleyici karıştırma)', () => {
    it('uzunluk her zaman 4-7 ve belirleyici', () => {
      for (const day of [0, 1, 2, 3, 50, 51, 52, 53]) {
        const L = lengthForDay(day);
        expect(ANSWER_LENGTHS).toContain(L);
        expect(lengthForDay(day)).toBe(L); // tekrar çağırınca aynı
      }
    });

    it('her 4 günlük blokta dört uzunluk da bir kez görünür (döngü korunur ama karışık)', () => {
      for (const block of [0, 1, 7, 25]) {
        const lens = [0, 1, 2, 3].map((i) => lengthForDay(block * 4 + i));
        expect(new Set(lens)).toEqual(new Set([4, 5, 6, 7]));
      }
    });

    it('katı 4→5→6→7 döngüsü DEĞİL (tahmin edilemez)', () => {
      const rigid = [0, 1, 2, 3, 4, 5, 6, 7].every((d) => lengthForDay(d) === [4, 5, 6, 7][d % 4]);
      expect(rigid).toBe(false);
    });
  });

  describe('boş band → en yakına düşer', () => {
    it('hedef band boşsa dolu en yakın banddan seçer (asla null olmaz)', () => {
      // Yalnız band 3 dolu — diğerleri boş
      const onlyB3 = (length: number, band: number) => (band === 3 ? [`L${length}#tek`] : []);
      for (let day = 0; day < 60; day++) {
        const r = pickDaily(day, onlyB3);
        expect(r?.band).toBe(3);
        expect(r?.word).toContain('#tek');
      }
    });
  });

  describe('serbest mod: seviye → band', () => {
    it('düşük seviye tanıdık (≤2), yüksek seviye zorlu (≥4)', () => {
      expect(levelBand(1, 0.5)).toBeLessThanOrEqual(2);
      expect(levelBand(15, 0.5)).toBeGreaterThanOrEqual(4);
    });
    it('band her zaman 1-5', () => {
      for (const lv of [1, 5, 10, 20]) {
        for (const r of [0, 0.5, 0.99]) {
          const b = levelBand(lv, r);
          expect(b).toBeGreaterThanOrEqual(1);
          expect(b).toBeLessThanOrEqual(5);
        }
      }
    });
  });

  /**
   * SUNUCU PARITY: rooms-server/daily-rotation.js bu değerlerin AYNISINI üretmeli
   * (yönetim takvimi önizlemesi gerçekle uyuşsun). Aynı GOLDEN dizi
   * rooms-server/daily-rotation.test.mjs'te de kontrol edilir → iki kopya senkron.
   * Biri kayarsa kendi tarafındaki test kırılır.
   */
  describe('golden değerler (sunucu JS ile paylaşılan)', () => {
    it('targetBand 0..20', () => {
      const g = [2, 4, 4, 3, 2, 3, 3, 2, 4, 5, 3, 2, 1, 2, 3, 4, 3, 5, 1, 1, 2];
      expect(Array.from({ length: 21 }, (_, d) => targetBand(d))).toEqual(g);
    });
    it('lengthForDay 0..20', () => {
      const g = [4, 7, 6, 5, 7, 6, 5, 4, 4, 5, 6, 7, 5, 6, 7, 4, 6, 5, 4, 7, 6];
      expect(Array.from({ length: 21 }, (_, d) => lengthForDay(d))).toEqual(g);
    });
  });
});
