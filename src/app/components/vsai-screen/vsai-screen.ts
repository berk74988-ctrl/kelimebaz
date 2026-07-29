import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { AI_CONFIG, aiOpeners, AiSolver, Difficulty } from '../../core/ai-opponent';
import { raceOutcome } from '../../core/vsai-race';
import { LetterState, MAX_ATTEMPTS } from '../../models/game.model';
import { AudioService } from '../../services/audio.service';
import { GameService } from '../../services/game.service';
import { GoldService } from '../../services/gold.service';
import { LanguageService } from '../../services/language.service';
import { StatsService } from '../../services/stats.service';
import { WordService } from '../../services/word.service';
import { Game } from '../game/game';

type Phase = 'pick' | 'playing' | 'result';
interface AiRow {
  pattern: LetterState[];
}
interface Result {
  solved: boolean;
  attempts: number;
  timeMs: number;
}

/** YZ'yi yenme bonusu (zorluğa göre) — istatistik/altın endGame'de zaten işlenir. */
const BEAT_BONUS: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 35 };

/**
 * 🤖 YAPAY ZEKÂYA KARŞI — SIRA TABANLI yarış.
 *
 * Oyuncu ve YZ AYNI gizli kelimeyi çözer. Yarış duvar saatine göre DEĞİL, SIRAYLA
 * işler: oyuncu bir tahmin yapar → YZ kısa bir "düşünme" sonrası bir tahmin yapar
 * → sıra tekrar oyuncuya. İkisi de aynı sayıda hak kullanır. Kazanan, kelimeyi
 * DAHA AZ tahminde bulandır; aynı turda bulunduysa berabere (bkz. core/vsai-race).
 *
 * Böylece yavaş düşünen ya da mobilde yavaş yazan oyuncu cezalanmaz — yarış bir
 * refleks değil, kelime bulma becerisi ölçer. İnsanın istatistik/altını app-game
 * akışında (endGame) işlenir; YZ'yi yenmenin ekstra altın bonusu burada verilir.
 */
@Component({
  selector: 'app-vsai-screen',
  imports: [Game],
  templateUrl: './vsai-screen.html',
  styleUrl: './vsai-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VsaiScreen {
  private readonly words = inject(WordService);
  private readonly stats = inject(StatsService);
  private readonly gold = inject(GoldService);
  private readonly audio = inject(AudioService);
  private readonly game = inject(GameService);
  protected readonly i18n = inject(LanguageService);

  readonly back = output<void>();

  protected readonly MAX = MAX_ATTEMPTS;
  protected readonly diffs: Difficulty[] = ['easy', 'medium', 'hard'];

  protected readonly phase = signal<Phase>('pick');
  protected readonly difficulty = signal<Difficulty>('medium');
  protected readonly word = signal('');

  // Sıra: 'you' → oyuncu tahmin yapabilir · 'ai' → YZ düşünüyor (oyuncu girişi kilitli)
  protected readonly turn = signal<'you' | 'ai'>('you');
  protected readonly botTurn = computed(() => this.turn() === 'ai');

  // YZ (rakip) durumu — canlı gösterilir
  protected readonly aiRows = signal<AiRow[]>([]);
  protected readonly aiSolved = signal(false);
  protected readonly aiFailed = signal(false);
  protected readonly aiThinking = signal(false);
  protected readonly aiGhosts = computed(() =>
    Array.from({ length: Math.max(0, this.MAX - this.aiRows().length) }, (_, i) => i),
  );

  // Sonuç
  protected readonly outcome = signal<'win' | 'lose' | 'draw'>('draw');
  protected readonly bonus = signal(0);
  protected readonly myResult = signal<Result | null>(null);
  protected readonly aiResult = signal<Result | null>(null);

  private solver: AiSolver | null = null;
  private thinkTimer: ReturnType<typeof setTimeout> | null = null;
  private matchStart = 0;
  private aiTimeMs = 0;
  private humanSolved = false;
  private humanAttempts = 0;
  private ended = false; // sonuç bir kez gösterilir

  // --- akış ---

  protected start(diff: Difficulty): void {
    this.clearThink();
    this.difficulty.set(diff);
    const w = this.words.randomWordForLevel(this.stats.level().level);
    this.word.set(w);
    this.aiRows.set([]);
    this.aiSolved.set(false);
    this.aiFailed.set(false);
    this.aiThinking.set(false);
    this.humanSolved = false;
    this.humanAttempts = 0;
    this.ended = false;
    this.myResult.set(null);
    this.aiResult.set(null);
    this.aiTimeMs = 0;
    this.matchStart = performance.now();
    const len = [...w].length;
    this.solver = new AiSolver(
      w,
      this.words.answersOfLength(len),
      AI_CONFIG[diff],
      this.MAX,
      Math.random,
      aiOpeners(this.i18n.lang(), len), // 🤖 derleme zamanı sıralı açılış → ilk tur gecikmesiz
    );
    this.turn.set('you'); // 🧑 önce oyuncu — YZ, oyuncunun tahminini BEKLER (saat değil, sıra)
    this.phase.set('playing');
  }

  /**
   * 🧑 Oyuncu bir tahmin yaptı (app-game bildirdi) → sıra YZ'ye geçer.
   * YZ, saat dolduğu için değil, oyuncu OYNADIĞI için tahmin yapar.
   */
  protected onPlayerGuess(e: { attempts: number; solved: boolean; over: boolean }): void {
    if (this.ended || this.phase() !== 'playing' || this.turn() !== 'you') return;
    this.humanAttempts = e.attempts;
    this.humanSolved = e.solved;
    // Sıra YZ'de: oyuncu girişi kilitlenir, kısa bir "düşünüyor" animasyonu, sonra YZ tahmini.
    this.turn.set('ai');
    this.aiThinking.set(true);
    this.clearThink();
    this.thinkTimer = setTimeout(() => this.botTurnStep(), this.thinkDelay());
  }

  /** YZ'nin tek turu: bir tahmin yapar, sonra tur değerlendirilir. */
  private botTurnStep(): void {
    if (this.ended || this.phase() !== 'playing') return;
    const s = this.solver;
    if (s && !s.done) {
      s.step();
      this.aiRows.set(s.guesses.map((g) => ({ pattern: g.pattern })));
      if (s.solved) {
        this.aiSolved.set(true);
        this.aiTimeMs = Math.round(performance.now() - this.matchStart);
        this.safeSfx('key');
      } else if (s.done) {
        this.aiFailed.set(true);
      }
    }
    this.aiThinking.set(false);
    this.decideRound();
  }

  /** Tur tamamlandı (ikisi de bu turda birer tahmin yaptı) → bitti mi, devam mı? */
  private decideRound(): void {
    const s = this.solver;
    if (!s) return;
    const someoneSolved = this.humanSolved || s.solved;
    const bothExhausted = this.humanAttempts >= this.MAX && s.attempts >= this.MAX;
    if (someoneSolved || bothExhausted) {
      this.endMatch();
      return;
    }
    this.turn.set('you'); // kimse çözemedi → sıra tekrar oyuncuya
  }

  /** Sonucu belirle ve göster — kazanan DAHA AZ tahminde bulan (core/vsai-race). */
  private endMatch(): void {
    if (this.ended || !this.solver) return;
    this.ended = true;
    this.clearThink();
    this.aiThinking.set(false);
    const s = this.solver;

    // Oyuncunun oyunu hâlâ açıksa (YZ kazandı, oyuncu çözemeden) kapat → istatistik/
    // altın işlensin. endVsaiMatch: 'lost' DEĞİL 'ended' → ana seri cezalanmaz.
    if (!this.game.isOver()) {
      try {
        this.game.endVsaiMatch();
      } catch {
        /* yok say */
      }
    }

    const me: Result = {
      solved: this.humanSolved,
      attempts: this.humanAttempts,
      timeMs: Math.round(performance.now() - this.matchStart),
    };
    const ai: Result = {
      solved: s.solved,
      attempts: s.attempts,
      timeMs: s.solved ? this.aiTimeMs : Number.MAX_SAFE_INTEGER,
    };
    const res = raceOutcome(me, ai);
    this.outcome.set(res);
    const b = res === 'win' ? BEAT_BONUS[this.difficulty()] : 0;
    if (b) this.gold.earn(b);
    this.bonus.set(b);
    this.myResult.set(me);
    this.aiResult.set(ai);
    this.turn.set('you');
    this.phase.set('result');
    this.safeSfx(res === 'win' ? 'win' : res === 'lose' ? 'lose' : 'key');
  }

  protected again(): void {
    this.start(this.difficulty());
  }
  protected toPick(): void {
    this.clearThink();
    this.phase.set('pick');
  }
  protected exit(): void {
    this.clearThink();
    this.back.emit();
  }

  /** YZ "düşünme" süresi (ms) — kısa, tempo hissi verir; zorlukla hafif değişir (600-1250). */
  private thinkDelay(): number {
    const base = this.difficulty() === 'easy' ? 1000 : this.difficulty() === 'medium' ? 800 : 650;
    return base + Math.floor(Math.random() * 250);
  }

  private clearThink(): void {
    if (this.thinkTimer) {
      clearTimeout(this.thinkTimer);
      this.thinkTimer = null;
    }
    this.aiThinking.set(false);
  }

  ngOnDestroy(): void {
    this.clearThink();
  }

  // --- sonuç ekranı yardımcıları ---

  protected clock(ms: number): string {
    if (!isFinite(ms) || ms >= Number.MAX_SAFE_INTEGER) return '—';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private safeSfx(name: string): void {
    try {
      (this.audio as unknown as { sfx: (n: string) => void }).sfx(name);
    } catch {
      /* ses kapalıysa sessiz geç */
    }
  }
}
