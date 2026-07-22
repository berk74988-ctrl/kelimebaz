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
import { LanguageService } from '../../services/language.service';
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
  protected readonly i18n = inject(LanguageService);

  readonly close = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  /** Getter — dil değişince (CD tetiklenince) aktif dilin sözlük boyutunu verir. */
  protected get dictSize(): number {
    return this.words.dictionarySize;
  }

  ngAfterViewInit(): void {
    this.dialog()?.nativeElement.focus();
  }

  /** Dili değiştir — anında uygulanır (metinler ve kelime havuzu). */
  protected setLang(l: 'tr' | 'en'): void {
    this.i18n.set(l);
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
    if (!confirm(this.i18n.t('settings.resetConfirm'))) return;

    this.statsService.reset();
    this.gold.reset();
    this.inventory.reset();
  }
}
