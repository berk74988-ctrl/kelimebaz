import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { LanguageService } from '../../services/language.service';
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
export class StatsModal implements AfterViewInit {
  protected readonly statsService = inject(StatsService);
  protected readonly i18n = inject(LanguageService);

  readonly close = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  /** Açılınca odağı modala taşı — klavye kullanıcısı sayfada kaybolmasın. */
  ngAfterViewInit(): void {
    this.dialog()?.nativeElement.focus();
  }

  /** Grafikte son kazanılan oyunun satırı vurgulanır. */
  protected get highlight(): number | null {
    return this.statsService.stats().lastWinAttempts;
  }

  protected resetStats(): void {
    const ok = confirm(this.i18n.t('statsmodal.resetConfirm'));
    if (ok) this.statsService.reset();
  }
}
