import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { GameMode } from '../../models/game.model';
import { ContrastService } from '../../services/contrast.service';
import { GameService } from '../../services/game.service';
import { StatsService } from '../../services/stats.service';
import { ThemeService } from '../../services/theme.service';
import { WordService } from '../../services/word.service';
import { Countdown } from '../countdown/countdown';

/** Arka planda süzülen harf. */
interface Floater {
  ch: string;
  left: number; // %
  size: number; // px
  delay: number; // s
  duration: number; // s
  drift: number; // px — yatay sapma
}

/**
 * Arka plan harfleri — SABİT değerler.
 *
 * Neden rastgele değil: her değişiklik algılamada yeni değer üretilirse
 * harfler zıplar. Sabit liste hem tutarlı hem de test edilebilir.
 */
const FLOATERS: Floater[] = [
  { ch: 'K', left: 6, size: 42, delay: 0, duration: 26, drift: 30 },
  { ch: 'E', left: 18, size: 28, delay: 5, duration: 32, drift: -24 },
  { ch: 'L', left: 31, size: 36, delay: 11, duration: 29, drift: 18 },
  { ch: 'İ', left: 44, size: 24, delay: 2, duration: 35, drift: -30 },
  { ch: 'M', left: 57, size: 40, delay: 8, duration: 27, drift: 26 },
  { ch: 'E', left: 70, size: 30, delay: 14, duration: 33, drift: -20 },
  { ch: 'B', left: 82, size: 34, delay: 4, duration: 30, drift: 22 },
  { ch: 'A', left: 93, size: 26, delay: 17, duration: 36, drift: -16 },
  { ch: 'Z', left: 12, size: 32, delay: 20, duration: 28, drift: -28 },
  { ch: 'Ş', left: 63, size: 26, delay: 23, duration: 34, drift: 20 },
];

/** Giriş ekranı — oyun adı, mod seçimi, günlük bulmaca durumu. */
@Component({
  selector: 'app-title-screen',
  imports: [Countdown],
  templateUrl: './title-screen.html',
  styleUrl: './title-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TitleScreen {
  private readonly words = inject(WordService);
  private readonly game = inject(GameService);
  protected readonly theme = inject(ThemeService);
  protected readonly contrast = inject(ContrastService);
  protected readonly statsService = inject(StatsService);

  readonly play = output<GameMode>();

  protected readonly floaters = FLOATERS;
  protected readonly title = signal('KELİMEBAZ');
  protected readonly dictSize = signal(this.words.dictionarySize);
  protected readonly dayNo = signal(this.words.dayIndex());

  /** Bugünün günlük bulmacası bitti mi? */
  protected readonly dailyDone = signal(this.game.dailyDone());
  protected readonly dailyWon = signal(this.game.dailySnapshot()?.status === 'won');
  protected readonly dailyTries = signal(this.game.dailySnapshot()?.guesses.length ?? 0);

  protected get stats() {
    return this.statsService.stats();
  }
}
