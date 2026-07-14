import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { StatsService } from '../../services/stats.service';
import { GuessDistribution } from '../guess-distribution/guess-distribution';

/**
 * İstatistik paneli: dört sayı + tahmin dağılımı grafiği.
 * Sonuç ekranında ve istatistik penceresinde kullanılır.
 *
 * (Profil sayfası bu paneli DEĞİL, doğrudan istatistik kayıt defterini kullanır —
 * orada çok daha fazla sayı gösteriliyor.)
 */
@Component({
  selector: 'app-stats-panel',
  imports: [GuessDistribution],
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

  protected get stats() {
    return this.statsService.stats();
  }
}
