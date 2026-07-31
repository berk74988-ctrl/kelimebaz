import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageService } from '../../services/language.service';
import { PwaService } from '../../services/pwa.service';
import { StatsService } from '../../services/stats.service';

/**
 * PWA bildirim çubukları — kök seviyede, tüm ekranların üstünde.
 *  1) Güncelleme: yeni sürüm hazır → "Yenile".
 *  2) Kurulum: "ana ekrana ekle" — ANCAK 2. oyundan sonra, tek "Şimdi değil"le
 *     kalıcı kapanır (ısrarcı değil). Yalnızca güvenli bağlamda (HTTPS/localhost)
 *     tarayıcı istemi yakalandığında görünür.
 */
@Component({
  selector: 'app-pwa-prompt',
  templateUrl: './pwa-prompt.html',
  styleUrl: './pwa-prompt.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaPrompt {
  protected readonly pwa = inject(PwaService);
  protected readonly i18n = inject(LanguageService);
  private readonly statsService = inject(StatsService);

  /** Kurulum istemini yalnızca kullanıcı en az 2 oyun oynadıysa göster. */
  protected readonly showInstall = computed(
    () => this.pwa.installAvailable() && this.statsService.stats().played >= 2,
  );
}
