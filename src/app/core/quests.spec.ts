import { emptyDay, gameEnded, isComplete, pendingRewards, QUESTS } from './quests';

describe('Günlük görevler', () => {
  describe('kayıt defteri', () => {
    it('kimlikler BENZERSİZ (ödül iki kez ödenmesin)', () => {
      const ids = QUESTS.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('her görevin ödülü ve hedefi pozitiftir', () => {
      for (const q of QUESTS) {
        expect(q.reward).toBeGreaterThan(0);
        expect(q.goal).toBeGreaterThan(0);
        expect(q.label.length).toBeGreaterThan(0);
      }
    });

    it('yeni günde hiçbir görev tamamlanmamıştır', () => {
      const p = emptyDay(5);
      for (const q of QUESTS) expect(isComplete(q, p)).toBe(false);
    });
  });

  describe('ilerleme', () => {
    it('bir oyun oynamak "oyna" görevini bitirir', () => {
      const p = gameEnded(emptyDay(1), false, 6, false);

      const play1 = QUESTS.find((q) => q.id === 'play1')!;
      const win1 = QUESTS.find((q) => q.id === 'win1')!;

      expect(isComplete(play1, p)).toBe(true);
      expect(isComplete(win1, p)).toBe(false); // kaybetti
    });

    it('4 tahminde kazanmak "hızlı" görevini bitirir, 5 bitirmez', () => {
      const fast = QUESTS.find((q) => q.id === 'fast')!;

      expect(isComplete(fast, gameEnded(emptyDay(1), true, 4, false))).toBe(true);
      expect(isComplete(fast, gameEnded(emptyDay(1), true, 5, false))).toBe(false);
    });

    it('EN İYİ tahmin sayısı korunur — sonraki kötü oyun bozmaz', () => {
      let p = gameEnded(emptyDay(1), true, 3, false);
      p = gameEnded(p, true, 6, false);

      expect(p.bestAttempts).toBe(3);
      expect(isComplete(QUESTS.find((q) => q.id === 'fast')!, p)).toBe(true);
    });

    it('günlük kelimeyi çözmek "günün kelimesi" görevini bitirir', () => {
      const daily = QUESTS.find((q) => q.id === 'daily')!;

      expect(isComplete(daily, gameEnded(emptyDay(1), true, 3, true))).toBe(true);
      expect(isComplete(daily, gameEnded(emptyDay(1), true, 3, false))).toBe(false); // serbest oyun
      expect(isComplete(daily, gameEnded(emptyDay(1), false, 6, true))).toBe(false); // kaybetti
    });

    it('çok adımlı görev sayarak ilerler', () => {
      const play3 = QUESTS.find((q) => q.id === 'play3')!;

      let p = emptyDay(1);
      p = gameEnded(p, false, 6, false);
      expect(play3.progress(p)).toBe(1);
      expect(isComplete(play3, p)).toBe(false);

      p = gameEnded(p, false, 6, false);
      p = gameEnded(p, false, 6, false);
      expect(isComplete(play3, p)).toBe(true);
    });
  });

  describe('ödeme BİR KEZ yapılır', () => {
    it('ödülü alınmış görev tekrar listeye girmez', () => {
      let p = gameEnded(emptyDay(1), true, 2, true);

      const ilk = pendingRewards(p).map((q) => q.id);
      expect(ilk).toContain('play1');
      expect(ilk).toContain('win1');
      expect(ilk).toContain('daily');
      expect(ilk).toContain('fast');

      // Ödendi diye işaretle
      p = { ...p, claimed: ilk };

      // Bir oyun daha oyna — aynı görevler TEKRAR ödeme istemez
      p = gameEnded(p, true, 1, true);
      const ikinci = pendingRewards(p).map((q) => q.id);

      for (const id of ilk) expect(ikinci).not.toContain(id);
    });

    it('yeni tamamlanan görev listeye girer', () => {
      let p = gameEnded(emptyDay(1), false, 6, false); // sadece play1
      p = { ...p, claimed: ['play1'] };

      // 3. oyunda play3 tamamlanır
      p = gameEnded(p, false, 6, false);
      p = gameEnded(p, false, 6, false);

      expect(pendingRewards(p).map((q) => q.id)).toContain('play3');
    });
  });
});
