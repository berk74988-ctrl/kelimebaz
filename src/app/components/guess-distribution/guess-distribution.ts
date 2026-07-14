import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MAX_ATTEMPTS } from '../../models/game.model';
import { StatsService } from '../../services/stats.service';

/**
 * Tahmin dağılımı grafiği.
 *
 * Hem istatistik panelinde (sonuç ekranı) hem profil sayfasında kullanılıyor.
 * Ayrı bileşen olmasının sebebi bu: iki yerde aynı işaretlemeyi kopyalamak,
 * birini düzeltince diğerini unutmak demekti.
 */
@Component({
  selector: 'app-guess-distribution',
  imports: [],
  templateUrl: './guess-distribution.html',
  styleUrl: './guess-distribution.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuessDistribution {
  private readonly statsService = inject(StatsService);

  /** Vurgulanacak satır (kaç tahminde kazanıldı). null → vurgu yok. */
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
