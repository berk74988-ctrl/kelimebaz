import {
  hasEnoughData,
  MIN_GAMES,
  PlayRecord,
  PLAY_STYLE_INSIGHTS,
  weakestLetter,
} from './play-style';

/** Kısa yardımcı: game('CEVAP', 'tahmin1', 'tahmin2', ...) */
function game(answer: string, ...guesses: string[]): PlayRecord {
  return { answer, guesses };
}

/** Belirli bir içgörü kaydını bul + hesapla. */
function insight(key: string, records: PlayRecord[]) {
  const entry = PLAY_STYLE_INSIGHTS.find((i) => i.key === key)!;
  return entry.compute(records, 'tr');
}

describe('Oyun tarzı analizi (saf)', () => {
  describe('yeterli veri (boş durum)', () => {
    it(`${MIN_GAMES} maçtan az → yeterli veri yok`, () => {
      expect(hasEnoughData([game('KALEM', 'KALEM')])).toBe(false);
      expect(hasEnoughData(Array(MIN_GAMES - 1).fill(game('KALEM', 'KALEM')))).toBe(false);
    });
    it(`${MIN_GAMES} maç ve üstü → yeterli`, () => {
      expect(hasEnoughData(Array(MIN_GAMES).fill(game('KALEM', 'KALEM')))).toBe(true);
    });
  });

  describe('harf körlüğü', () => {
    it('hep geç denenen harfi kör nokta olarak yakalar (Ş)', () => {
      const recs = [
        game('ŞEKER', 'KALEM', 'ROBOT', 'ŞEKER'), // Ş turn 3
        game('ŞAPKA', 'MODEL', 'ŞAPKA'), // Ş turn 2
        game('KUŞAK', 'DENİZ', 'TORBA', 'KUŞAK'), // Ş turn 3
      ];
      const r = insight('letter', recs);
      expect(r?.textKey).toBe('playstyle.letterBlind');
      expect(r?.params?.['letter']).toBe('Ş');
    });

    it('harfler erken taranıyorsa olumlu (keskin)', () => {
      const recs = [
        game('ŞEKER', 'ŞEKER'), // her harf turn 1
        game('ŞAPKA', 'ŞAPKA'),
        game('KUŞAK', 'KUŞAK'),
      ];
      expect(insight('letter', recs)?.textKey).toBe('playstyle.letterSharp');
    });
  });

  describe('uzunluk performansı', () => {
    it('uzunluğa göre en iyi/en zor ortalamayı hesaplar', () => {
      const recs = [
        game('KALEM', 'AAAAA', 'BBBBB', 'KALEM'), // 5 harf, 3 tahmin
        game('ŞEKER', 'CCCCC', 'DDDDD', 'ŞEKER'), // 5 harf, 3 tahmin
        game('TELEFON', 'a', 'b', 'c', 'd', 'TELEFON'), // 7 harf, 5 tahmin
        game('BERABER', 'a', 'b', 'c', 'd', 'BERABER'), // 7 harf, 5 tahmin
      ];
      const r = insight('length', recs);
      expect(r?.textKey).toBe('playstyle.lengthPerf');
      expect(r?.params).toMatchObject({ bestLen: 5, bestAvg: 3, worstLen: 7, worstAvg: 5 });
    });
  });

  describe('açılış alışkanlığı', () => {
    it('hep aynı iyi açılışı yakalar', () => {
      const recs = Array(6).fill(game('KALEM', 'ADRES', 'KALEM')); // ADRES: 5 farklı harf, 2 ünlü
      const r = insight('opening', recs);
      expect(r?.textKey).toBe('playstyle.openGood');
      expect(r?.params).toMatchObject({ word: 'ADRES', pct: 100 });
    });
    it('açılışlar çeşitliyse olumlu', () => {
      const recs = [
        game('KALEM', 'ADRES', 'KALEM'),
        game('ŞEKER', 'MODEL', 'ŞEKER'),
        game('TABAK', 'KİTAP', 'TABAK'),
        game('DENİZ', 'ROBOT', 'DENİZ'),
        game('SÜRAT', 'GÜNEŞ', 'SÜRAT'),
        game('KUZEY', 'BALIK', 'KUZEY'),
      ];
      expect(insight('opening', recs)?.textKey).toBe('playstyle.openVaried');
    });
  });

  describe('tur verimliliği', () => {
    it('elenmiş harfleri tekrar denemeyen oyuncuyu verimli sayar', () => {
      const recs = Array(5).fill(game('KALEM', 'RESİM', 'KALEM')); // RESİM elenenleri (R,S,İ) tekrar yok
      expect(insight('efficiency', recs)?.textKey).toBe('playstyle.efficient');
    });
    it('elenmiş harfleri tekrar deneyeni yakalar', () => {
      const recs = Array(3).fill(game('KALEM', 'ROBOT', 'TORBA', 'KALEM')); // TORBA, ROBOT'un elenen T/O/R/B'sini tekrar dener
      expect(insight('efficiency', recs)?.textKey).toBe('playstyle.reuses');
    });
  });

  describe('ünlü/ünsüz dengesi', () => {
    it('ünlü ağırlıklı tahminleri yakalar', () => {
      const recs = Array(8).fill(game('OYUNU', 'OYUNA', 'OYUNU')); // ~%60 ünlü
      expect(insight('vowel', recs)?.textKey).toBe('playstyle.vowelHeavy');
    });
    it('ünsüz ağırlıklı tahminleri yakalar', () => {
      const recs = Array(8).fill(game('KRDLM', 'KRTBS', 'KRDLM')); // neredeyse ünsüz
      expect(insight('vowel', recs)?.textKey).toBe('playstyle.consonantHeavy');
    });
  });

  describe('kayıt defteri', () => {
    it('zengin veride en az 4 içgörü üretir', () => {
      const recs = [
        game('KALEM', 'ADRES', 'ROBOT', 'KALEM'),
        game('ŞEKER', 'ADRES', 'MODEL', 'ŞEKER'),
        game('TELEFON', 'ADRES', 'b', 'c', 'd', 'TELEFON'),
        game('BERABER', 'ADRES', 'b', 'c', 'd', 'BERABER'),
        game('KUŞAK', 'ADRES', 'TORBA', 'KUŞAK'),
        game('DENİZ', 'ADRES', 'DENİZ'),
      ];
      const produced = PLAY_STYLE_INSIGHTS.map((i) => i.compute(recs, 'tr')).filter(Boolean);
      expect(produced.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('antrenman için en zayıf harf', () => {
    it('yeterli veride kör noktayı döndürür', () => {
      const recs = [
        game('ŞEKER', 'KALEM', 'ROBOT', 'ŞEKER'),
        game('ŞAPKA', 'MODEL', 'ROBOT', 'ŞAPKA'),
        game('KUŞAK', 'DENİZ', 'TORBA', 'KUŞAK'),
        game('ŞİMŞEK', 'KALEM', 'ROBOT', 'ŞİMŞEK'),
        game('BEŞİK', 'KALEM', 'ROBOT', 'BEŞİK'),
      ];
      expect(weakestLetter(recs)).toBe('Ş');
    });
    it('az veride null', () => {
      expect(weakestLetter([game('KALEM', 'KALEM')])).toBeNull();
    });
  });
});
