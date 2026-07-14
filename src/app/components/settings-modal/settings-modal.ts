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
import { GoldService } from '../../services/gold.service';
import { InventoryService } from '../../services/inventory.service';
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
  private readonly gold = inject(GoldService);
  private readonly inventory = inject(InventoryService);
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
    // İstatistik, altın ve satın alınan kozmetikler BİRLİKTE sıfırlanır;
    // altını istatistikten, kozmetikleri altından kazandığın için ayrı ayrı
    // sıfırlamak tutarsız bir durum bırakırdı.
    if (!confirm('Tüm istatistiklerin, altının ve satın aldıkların silinecek. Emin misin?')) return;

    this.statsService.reset();
    this.gold.reset();
    this.inventory.reset();
  }
}
