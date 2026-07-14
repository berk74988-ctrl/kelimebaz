import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { AudioService } from '../../services/audio.service';
import { ContrastService } from '../../services/contrast.service';
import { StatsService } from '../../services/stats.service';
import { ThemeService } from '../../services/theme.service';
import { WordService } from '../../services/word.service';

/** ⚙️ Ayarlar — görünüm tercihleri ve veri yönetimi. */
@Component({
  selector: 'app-settings-modal',
  imports: [],
  templateUrl: './settings-modal.html',
  styleUrl: './settings-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModal implements AfterViewInit {
  protected readonly theme = inject(ThemeService);
  protected readonly contrast = inject(ContrastService);
  protected readonly statsService = inject(StatsService);
  protected readonly audio = inject(AudioService);
  private readonly words = inject(WordService);

  readonly close = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  protected readonly dictSize = this.words.dictionarySize;

  ngAfterViewInit(): void {
    this.dialog()?.nativeElement.focus();
  }

  /** Kaydırıcı 0–100 gösterir, servis 0–1 ile çalışır. */
  protected onMusicVol(event: Event): void {
    this.audio.setMusicVol(Number((event.target as HTMLInputElement).value) / 100);
  }

  protected onSfxVol(event: Event): void {
    this.audio.setSfxVol(Number((event.target as HTMLInputElement).value) / 100);
    this.audio.sfx('key'); // sürüklerken sesi duy — ayarı kulakla yap
  }

  protected pct(v: number): number {
    return Math.round(v * 100);
  }

  protected resetStats(): void {
    // Geri alınamaz bir işlem — onay şart.
    if (confirm('Tüm istatistiklerin silinecek. Emin misin?')) this.statsService.reset();
  }
}
