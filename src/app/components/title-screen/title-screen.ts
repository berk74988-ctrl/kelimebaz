import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { GameMode } from '../../models/game.model';
import { StatsService } from '../../services/stats.service';
import { ThemeService } from '../../services/theme.service';
import { WordService } from '../../services/word.service';

/** Giriş ekranı — oyun adı + mod seçimi. */
@Component({
  selector: 'app-title-screen',
  imports: [],
  templateUrl: './title-screen.html',
  styleUrl: './title-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TitleScreen {
  private readonly words = inject(WordService);
  protected readonly theme = inject(ThemeService);
  protected readonly statsService = inject(StatsService);

  readonly play = output<GameMode>();

  protected readonly title = signal('KELİMEBAZ');
  protected readonly wordCount = signal(this.words.size);
  protected readonly dayNo = signal(this.words.dayIndex());

  protected get stats() {
    return this.statsService.stats();
  }
}
