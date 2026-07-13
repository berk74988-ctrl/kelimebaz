import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { GameStatus, MAX_ATTEMPTS } from '../../models/game.model';
import { GameService } from '../../services/game.service';
import { StatsPanel } from '../stats-panel/stats-panel';

/** Oyun bitince açılan sonuç ekranı: kazandın/kaybettin + istatistik + paylaş. */
@Component({
  selector: 'app-result-modal',
  imports: [StatsPanel],
  templateUrl: './result-modal.html',
  styleUrl: './result-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultModal {
  private readonly game = inject(GameService);

  readonly status = input.required<GameStatus>();
  readonly answer = input.required<string>();
  readonly attempts = input.required<number>();

  readonly playAgain = output<void>();
  readonly close = output<void>();

  protected readonly copied = signal(false);
  protected readonly maxAttempts = MAX_ATTEMPTS;

  /** Günlük modda "yarın yenilenir" notu gösterilir. */
  protected readonly isDaily = computed(() => this.game.mode() === 'daily');

  protected async share(): Promise<void> {
    const text = this.game.shareText();
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* kullanıcı iptal etti ya da izin yok — sessizce geç */
    }
  }
}
