import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { GameMode } from '../../models/game.model';
import { GameService } from '../../services/game.service';
import { StatsService } from '../../services/stats.service';
import { ThemeService } from '../../services/theme.service';
import { WordService } from '../../services/word.service';
import { Countdown } from '../countdown/countdown';

/** Giriş ekranı — oyun adı + mod seçimi + günlük bulmaca durumu. */
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
  protected readonly statsService = inject(StatsService);

  readonly play = output<GameMode>();

  protected readonly title = signal('KELİMEBAZ');
  protected readonly wordCount = signal(this.words.dictionarySize);
  protected readonly dayNo = signal(this.words.dayIndex());

  /** Bugünün günlük bulmacası bitti mi? */
  protected readonly dailyDone = signal(this.game.dailyDone());

  /** Bugünkü sonuç: kazandı mı, kaç tahminde? */
  protected readonly dailyWon = signal(this.game.dailySnapshot()?.status === 'won');
  protected readonly dailyTries = signal(this.game.dailySnapshot()?.guesses.length ?? 0);

  protected get stats() {
    return this.statsService.stats();
  }
}
