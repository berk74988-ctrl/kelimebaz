import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { StatsService } from '../../services/stats.service';
import { StatsPanel } from '../stats-panel/stats-panel';

/** İstenildiği an açılabilen istatistik ekranı (📊 butonu). */
@Component({
  selector: 'app-stats-modal',
  imports: [StatsPanel],
  templateUrl: './stats-modal.html',
  styleUrl: './stats-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsModal {
  protected readonly statsService = inject(StatsService);

  readonly close = output<void>();

  /** Grafikte son kazanılan oyunun satırı vurgulanır. */
  protected get highlight(): number | null {
    return this.statsService.stats().lastWinAttempts;
  }

  protected resetStats(): void {
    const ok = confirm('Tüm istatistiklerin silinecek. Emin misin?');
    if (ok) this.statsService.reset();
  }
}
