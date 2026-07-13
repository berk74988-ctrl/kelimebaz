import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MAX_ATTEMPTS } from '../../models/game.model';
import { StatsService } from '../../services/stats.service';

/**
 * İstatistik paneli: sayılar + tahmin dağılımı grafiği.
 * Hem sonuç ekranında hem de bağımsız istatistik modalında kullanılır.
 */
@Component({
  selector: 'app-stats-panel',
  imports: [],
  templateUrl: './stats-panel.html',
  styleUrl: './stats-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsPanel {
  protected readonly statsService = inject(StatsService);

  /**
   * Grafikte vurgulanacak satır (kaç tahminde kazanıldı).
   * null ise hiçbir satır vurgulanmaz.
   */
  readonly highlight = input<number | null>(null);

  protected readonly rows = Array.from({ length: MAX_ATTEMPTS }, (_, i) => i);

  protected get stats() {
    return this.statsService.stats();
  }

  /** Çubuğun genişlik yüzdesi — en yüksek sütuna oranla. */
  protected barWidth(i: number): number {
    const value = this.stats.distribution[i];
    if (value === 0) return 0;
    return Math.max(8, Math.round((value / this.statsService.maxInDistribution()) * 100));
  }

  protected isHighlighted(i: number): boolean {
    return this.highlight() === i + 1;
  }
}
