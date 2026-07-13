import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { copyText, shareNative } from '../../core/clipboard';
import { buildShareGrid } from '../../core/share';
import { GameStatus, MAX_ATTEMPTS } from '../../models/game.model';
import { GameService } from '../../services/game.service';
import { Countdown } from '../countdown/countdown';
import { StatsPanel } from '../stats-panel/stats-panel';

/** Oyun bitince açılan sonuç ekranı: kazandın/kaybettin + istatistik + paylaş. */
@Component({
  selector: 'app-result-modal',
  imports: [StatsPanel, Countdown],
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

  /** Paylaş butonunun geri bildirimi. */
  protected readonly shareState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly maxAttempts = MAX_ATTEMPTS;

  /** Günlük modda "yarın yenilenir" notu gösterilir. */
  protected readonly isDaily = computed(() => this.game.mode() === 'daily');

  /** Paylaşılacak emoji ızgarasının önizlemesi (harf içermez). */
  protected readonly shareGrid = computed(() => buildShareGrid(this.game.guesses()));

  /**
   * Sonucu paylaş: önce cihazın yerel paylaşımını dener (mobil),
   * olmazsa panoya kopyalar. Kopyalama HTTP'de de çalışır (yedek yöntem).
   */
  protected async share(): Promise<void> {
    const text = this.game.shareText();

    if (await shareNative(text)) return; // paylaşım penceresi açıldı

    const ok = await copyText(text);
    this.shareState.set(ok ? 'copied' : 'failed');
    setTimeout(() => this.shareState.set('idle'), 2000);
  }
}
