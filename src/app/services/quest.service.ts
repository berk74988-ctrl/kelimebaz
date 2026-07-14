import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DayProgress,
  emptyDay,
  gameEnded,
  isComplete,
  pendingRewards,
  Quest,
  QUESTS,
} from '../core/quests';
import { GoldService } from './gold.service';
import { WordService } from './word.service';

const KEY = 'kelimebaz:quests';

/**
 * 📋 GÜNLÜK GÖREVLER — her gün sıfırlanır, altın kazandırır.
 *
 * "Gün" WordService.dayIndex ile aynı — günün kelimesiyle aynı ritimde döner.
 *
 * ÖDEME BİR KEZ YAPILIR: tamamlanan görevin kimliği `claimed` listesine yazılır.
 * Sayfa yenilense, oyuncu tekrar oynasa bile aynı görev ikinci kez ödemez.
 */
@Injectable({ providedIn: 'root' })
export class QuestService {
  private readonly gold = inject(GoldService);
  private readonly words = inject(WordService);

  private readonly _day = signal<DayProgress>(this.load());

  readonly day = this._day.asReadonly();
  readonly quests = QUESTS;

  /** Görevlerin o anki durumu — profil sayfası bunu çizer. */
  readonly view = computed(() =>
    QUESTS.map((q) => ({
      quest: q,
      progress: Math.min(q.goal, q.progress(this._day())),
      done: isComplete(q, this._day()),
    })),
  );

  readonly completedCount = computed(() => this.view().filter((v) => v.done).length);
  readonly allDone = computed(() => this.completedCount() === QUESTS.length);

  /** Bugün görevlerden kazanılabilecek toplam altın. */
  readonly totalReward = QUESTS.reduce((sum, q) => sum + q.reward, 0);

  /**
   * Bir oyunun sonucunu işler ve tamamlanan görevlerin altınını verir.
   * @returns görevlerden bu hamlede kazanılan altın (0 olabilir)
   */
  recordGame(won: boolean, attempts: number, isDaily: boolean): number {
    const next = gameEnded(this.today(), won, attempts, isDaily);

    // Tamamlanıp da ödülü alınmamış görevleri ÖDE
    const due = pendingRewards(next);
    let earned = 0;
    for (const q of due) {
      this.gold.earn(q.reward);
      next.claimed.push(q.id);
      earned += q.reward;
    }

    this.commit(next);
    return earned;
  }

  /** Bugünün ilerlemesi — gün değiştiyse sıfırdan başlar. */
  private today(): DayProgress {
    const now = this.words.dayIndex();
    const p = this._day();
    return p.day === now ? p : emptyDay(now);
  }

  /** Gün dönmüşse durumu tazeler (ekran açılışında çağrılır). */
  refresh(): void {
    const fresh = this.today();
    if (fresh !== this._day()) this.commit(fresh);
  }

  private commit(p: DayProgress): void {
    this._day.set(p);
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* depolama kapalı — görevler o oturumda yine çalışır */
    }
  }

  /** Bozuk/eski kayda dayanıklı okuma. */
  private load(): DayProgress {
    const now = this.words.dayIndex();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyDay(now);

      const p = JSON.parse(raw) as Partial<DayProgress>;
      if (p.day !== now) return emptyDay(now); // gün değişmiş → sıfırla

      const num = (v: unknown) =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

      return {
        day: now,
        played: num(p.played),
        won: num(p.won),
        bestAttempts:
          typeof p.bestAttempts === 'number' && p.bestAttempts > 0 ? p.bestAttempts : null,
        dailySolved: p.dailySolved === true,
        // Bilinmeyen görev kimliklerini at — kayıt defteri değişmiş olabilir
        claimed: Array.isArray(p.claimed)
          ? p.claimed.filter((id) => QUESTS.some((q: Quest) => q.id === id))
          : [],
      };
    } catch {
      return emptyDay(now);
    }
  }
}
