import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
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
    const ok = confirm('Tüm istatistiklerin silinecek. Emin misin?');
    if (ok) this.statsService.reset();
  }
}
