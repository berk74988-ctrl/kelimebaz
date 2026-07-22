import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { AI_CONFIG, AiSolver, Difficulty } from '../../core/ai-opponent';
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
 * 🤖 YAPAY ZEKÂYA KARŞI — tek kişilik yarış.
 *
 * Oyuncu ve YZ AYNI gizli kelimeyi çözmeye çalışır. YZ, zorluğa göre zamanlı
 * tahminler yapar (kolay yavaş, zor hızlı). İkisi de bitince kazanan belirlenir:
 * çözen kazanır; ikisi de çözdüyse ÖNCE çözen (daha hızlı) kazanır. İnsanın
 * istatistik/altın/görevleri app-game akışında (endGame) normal işlenir; YZ'yi
 * yenmenin ekstra altın bonusu burada verilir.
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
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private matchStart = 0;
  private aiTimeMs = 0;
  private human: Result | null = null;
  private ended = false; // sonuç bir kez gösterilir (ilk çözen anında bitirir)

  // --- akış ---

  protected start(diff: Difficulty): void {
    this.stopAi();
    this.difficulty.set(diff);
    const w = this.words.randomWordForLevel(this.stats.level().level);
    this.word.set(w);
    this.aiRows.set([]);
    this.aiSolved.set(false);
    this.aiFailed.set(false);
    this.human = null;
    this.ended = false;
    this.myResult.set(null);
    this.aiResult.set(null);
    this.aiTimeMs = 0;
    this.matchStart = performance.now();
    this.solver = new AiSolver(w, this.words.answersOfLength([...w].length), AI_CONFIG[diff], this.MAX);
    this.phase.set('playing');
    this.scheduleAi();
  }

  private scheduleAi(): void {
    if (!this.solver || this.solver.done) {
      this.aiThinking.set(false);
      return;
    }
    this.aiThinking.set(true);
    this.aiTimer = setTimeout(() => {
      const s = this.solver;
      if (!s || this.phase() !== 'playing' || this.ended) return;
      s.step();
      this.aiRows.set(s.guesses.map((g) => ({ pattern: g.pattern })));
      if (s.solved) {
        // 🤖 YZ doğru kelimeyi buldu → oyun ANINDA biter, sonuç açılır.
        this.aiSolved.set(true);
        this.aiThinking.set(false);
        this.aiTimeMs = Math.round(performance.now() - this.matchStart);
        this.safeSfx('key');
        this.onAiSolvedFirst();
      } else if (s.done) {
        // YZ 6 hakkında çözemedi. İnsan bittiyse sonuç; değilse insanı bekle.
        this.aiFailed.set(true);
        this.aiThinking.set(false);
        if (this.human) this.endMatch();
      } else {
        this.scheduleAi();
      }
    }, this.solver.nextDelay());
  }

  /** app-game insan sonucunu bildirdi (çözdü veya 6 hakkı bitti). */
  protected onHumanFinished(r: Result): void {
    if (this.ended) return;
    this.human = r;
    if (r.solved) {
      this.endMatch(); // 🧑 insan çözdü → oyun HEMEN biter (kazanır)
      return;
    }
    if (this.solver?.done) this.endMatch(); // insan çözemedi + YZ de bittiyse → sonuç
    // aksi halde YZ'yi bekle (YZ çözerse kaybedersin, YZ de çözemezse berabere)
  }

  /** 🤖 YZ önce çözdü → insan bitmemişse oyununu KAYIPLA kapat (istatistik/altın işlensin), sonra bitir. */
  private onAiSolvedFirst(): void {
    if (this.ended) return;
    if (!this.human) {
      const attempts = Math.max(1, this.game.rowIndex());
      try {
        if (!this.game.isOver()) this.game.timeout(); // insan oyununu kayıpla kapat → endGame istatistik/altın işler
      } catch {
        /* yok say */
      }
      this.human = { solved: false, attempts, timeMs: Math.round(performance.now() - this.matchStart) };
    }
    this.endMatch();
  }

  /** Sonucu belirle ve göster — ÖNCE çözen kazanır (anında). */
  private endMatch(): void {
    if (this.ended || !this.human || !this.solver) return;
    this.ended = true;
    this.stopAi();
    const me = this.human;
    const aiSolved = this.solver.solved;
    const ai: Result = {
      solved: aiSolved,
      attempts: this.solver.attempts,
      timeMs: aiSolved ? this.aiTimeMs : Number.MAX_SAFE_INTEGER,
    };
    let res: 'win' | 'lose' | 'draw';
    if (me.solved && !aiSolved) res = 'win';
    else if (aiSolved && !me.solved) res = 'lose';
    else if (me.solved && aiSolved) res = me.timeMs <= ai.timeMs ? 'win' : 'lose'; // güvenlik ağı (neredeyse olmaz)
    else res = 'draw'; // ikisi de çözemedi
    this.outcome.set(res);
    const b = res === 'win' ? BEAT_BONUS[this.difficulty()] : 0;
    if (b) this.gold.earn(b);
    this.bonus.set(b);
    this.myResult.set(me);
    this.aiResult.set(ai);
    this.phase.set('result');
    this.safeSfx(res === 'win' ? 'win' : 'lose');
  }

  protected again(): void {
    this.start(this.difficulty());
  }
  protected toPick(): void {
    this.stopAi();
    this.phase.set('pick');
  }
  protected exit(): void {
    this.stopAi();
    this.back.emit();
  }

  private stopAi(): void {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.aiThinking.set(false);
  }

  ngOnDestroy(): void {
    this.stopAi();
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
