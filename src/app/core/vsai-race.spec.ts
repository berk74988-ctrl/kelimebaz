import { raceOutcome } from './vsai-race';

/**
 * Sıra tabanlı YZ yarışında kazanan = daha az tahminde bulan.
 */
describe('YZ yarışı — kazanan kuralı (raceOutcome)', () => {
  it('oyuncu 3 tahminde, bot 4 tahminde çözerse OYUNCU kazanır', () => {
    expect(raceOutcome({ solved: true, attempts: 3 }, { solved: true, attempts: 4 })).toBe('win');
  });

  it('bot 3 tahminde, oyuncu 5 tahminde çözerse BOT kazanır', () => {
    expect(raceOutcome({ solved: true, attempts: 5 }, { solved: true, attempts: 3 })).toBe('lose');
  });

  it('ikisi de AYNI turda çözerse BERABERE', () => {
    expect(raceOutcome({ solved: true, attempts: 4 }, { solved: true, attempts: 4 })).toBe('draw');
  });

  it('yalnız oyuncu çözerse (bot çözemedi) oyuncu kazanır — tahmin sayısından bağımsız', () => {
    expect(raceOutcome({ solved: true, attempts: 6 }, { solved: false, attempts: 6 })).toBe('win');
  });

  it('yalnız bot çözerse bot kazanır', () => {
    expect(raceOutcome({ solved: false, attempts: 6 }, { solved: true, attempts: 2 })).toBe('lose');
  });

  it('ikisi de çözemezse berabere', () => {
    expect(raceOutcome({ solved: false, attempts: 6 }, { solved: false, attempts: 6 })).toBe('draw');
  });

  it('hız/süre kazananı DEĞİŞTİRMEZ — yalnız tahmin sayısı belirler', () => {
    // Oyuncu daha az tahminde bulmuş; "yavaş" olması önemli değil (süre parametresi yok).
    expect(raceOutcome({ solved: true, attempts: 2 }, { solved: true, attempts: 3 })).toBe('win');
  });
});
