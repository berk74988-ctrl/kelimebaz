import { TestBed } from '@angular/core/testing';
import { QUESTS } from '../core/quests';
import { GoldService } from './gold.service';
import { QuestService } from './quest.service';

describe('QuestService — günlük görevler', () => {
  function fresh(): { quests: QuestService; gold: GoldService } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return { quests: TestBed.inject(QuestService), gold: TestBed.inject(GoldService) };
  }

  let quests: QuestService;
  let gold: GoldService;

  beforeEach(() => {
    localStorage.clear();
    ({ quests, gold } = fresh());
  });

  const reward = (id: string) => QUESTS.find((q) => q.id === id)!.reward;

  it('tamamlanan görevin altını ANINDA verilir', () => {
    // Günün kelimesini 2 tahminde çöz → play1 + win1 + daily + fast tamamlanır
    const earned = quests.recordGame(true, 2, true);
    const beklenen = reward('play1') + reward('win1') + reward('daily') + reward('fast');

    expect(earned).toBe(beklenen);
    expect(gold.balance()).toBe(beklenen);
  });

  it('aynı görev İKİNCİ KEZ ödeme yapmaz', () => {
    quests.recordGame(true, 2, true);
    const ilkBakiye = gold.balance();

    // Aynı gün bir oyun daha — play1/win1/daily/fast zaten alınmıştı
    const ikinci = quests.recordGame(true, 1, true);

    expect(ikinci).toBe(0); // play3 henüz 2/3
    expect(gold.balance()).toBe(ilkBakiye);
  });

  it('çok adımlı görev hedefe ulaşınca ödenir', () => {
    quests.recordGame(false, 6, false); // 1/3
    quests.recordGame(false, 6, false); // 2/3
    const bakiyeOnce = gold.balance();

    const ucuncu = quests.recordGame(false, 6, false); // 3/3 → play3 öder

    expect(ucuncu).toBe(reward('play3'));
    expect(gold.balance()).toBe(bakiyeOnce + reward('play3'));
  });

  it('ilerleme sayfa yenilenince korunur', () => {
    quests.recordGame(true, 3, false);

    const { quests: reloaded } = fresh();

    expect(reloaded.day().played).toBe(1);
    expect(reloaded.day().won).toBe(1);
    expect(reloaded.completedCount()).toBeGreaterThan(0);
  });

  it('GÜN DEĞİŞİNCE görevler sıfırlanır (ama altın kalır)', () => {
    quests.recordGame(true, 2, true);
    const kazanilan = gold.balance();
    expect(kazanilan).toBeGreaterThan(0);

    // Dün oynanmış gibi göster
    const dun = JSON.parse(localStorage.getItem('kelimebaz:quests')!);
    localStorage.setItem('kelimebaz:quests', JSON.stringify({ ...dun, day: dun.day - 1 }));

    const { quests: bugun, gold: kasa } = fresh();

    expect(bugun.day().played).toBe(0); // görevler sıfırlandı
    expect(bugun.completedCount()).toBe(0);
    expect(kasa.balance()).toBe(kazanilan); // altın DURUYOR

    // Ve görevler tekrar kazanılabilir
    expect(bugun.recordGame(true, 2, true)).toBeGreaterThan(0);
  });

  it('bozuk kayıt çökertmez, temiz günle başlar', () => {
    localStorage.setItem('kelimebaz:quests', '{bozuk');

    const { quests: q } = fresh();

    expect(q.day().played).toBe(0);
    expect(q.completedCount()).toBe(0);
  });

  it('bilinmeyen görev kimliği kayıttan atılır (defter değişmiş olabilir)', () => {
    quests.recordGame(true, 2, true);

    const kayit = JSON.parse(localStorage.getItem('kelimebaz:quests')!);
    kayit.claimed.push('artik-olmayan-gorev');
    localStorage.setItem('kelimebaz:quests', JSON.stringify(kayit));

    const { quests: q } = fresh();

    expect(q.day().claimed).not.toContain('artik-olmayan-gorev');
  });
});
