import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { seasonReward, Tier } from '../../core/league';
import { GoldService } from '../../services/gold.service';
import { LanguageService } from '../../services/language.service';
import { LeagueService } from '../../services/league.service';

/**
 * 🏆 LİG SAYFASI — tam ekran.
 *
 * Oyuncunun ligi, LP'si, sezon durumu ve tüm lig merdiveni. Sezon dolduysa
 * ödül modalı açılır (talep → altın/rozet/tema verilir, yeni sezon başlar).
 * Tüm veri LeagueService'ten gelir; bu bileşen yalnız gösterir.
 */
@Component({
  selector: 'app-league-screen',
  imports: [],
  templateUrl: './league-screen.html',
  styleUrl: './league-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeagueScreen {
  protected readonly league = inject(LeagueService);
  protected readonly gold = inject(GoldService);
  protected readonly i18n = inject(LanguageService);

  readonly back = output<void>();

  /** Mevcut ligde sezon sonunda kazanılacak ödül (önizleme). */
  protected readonly reward = computed(() => seasonReward(this.league.tier().id));

  /** Bu sezon oynanan toplam maç ve kazanma oranı. */
  protected readonly played = computed(() => this.league.wins() + this.league.losses());
  protected readonly winRate = computed(() => {
    const p = this.played();
    return p > 0 ? Math.round((this.league.wins() / p) * 100) : 0;
  });

  constructor() {
    // Ekran açılışında sezon süresi dolmuşsa ödül bekleyişini tetikle.
    this.league.checkSeason();
  }

  /** Lig merdiveninde LP aralığı etiketi (Usta = "1500+"). */
  protected tierRange(t: Tier): string {
    return Number.isFinite(t.max) ? `${t.min}–${t.max - 1}` : `${t.min}+`;
  }

  protected claim(): void {
    this.league.claimPending();
  }
}
