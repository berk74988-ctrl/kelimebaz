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
import { StatsService } from '../../services/stats.service';

/** Oyun bitince açılan sonuç ekranı: kazandın/kaybettin + istatistik + paylaş. */
@Component({
  selector: 'app-result-modal',
  imports: [],
  templateUrl: './result-modal.html',
  styleUrl: './result-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultModal {
  private readonly game = inject(GameService);
  protected readonly statsService = inject(StatsService);

  readonly status = input.required<GameStatus>();
  readonly answer = input.required<string>();
  readonly attempts = input.required<number>();

  readonly playAgain = output<void>();
  readonly close = output<void>();

  protected readonly copied = signal(false);
  protected readonly maxAttempts = MAX_ATTEMPTS;
  protected readonly rows = [0, 1, 2, 3, 4, 5];

  /** Günlük modda oynanıyorsa "yarın yenilenir" notu gösterilir. */
  protected readonly isDaily = computed(() => this.game.mode() === 'daily');

  protected get stats() {
    return this.statsService.stats();
  }

  /** Dağılım grafiğinde bir sütunun genişlik yüzdesi. */
  protected barWidth(i: number): number {
    const max = this.statsService.maxInDistribution();
    return Math.max(6, Math.round((this.stats.distribution[i] / max) * 100));
  }

  /** Kazanılan satır vurgulanır. */
  protected isWinRow(i: number): boolean {
    return this.status() === 'won' && i === this.attempts() - 1;
  }

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
