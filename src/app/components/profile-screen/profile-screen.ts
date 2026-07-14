import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { PROFILE_STATS } from '../../core/profile-stats';
import { GoldService } from '../../services/gold.service';
import { AVATARS, ProfileService } from '../../services/profile.service';
import { QuestService } from '../../services/quest.service';
import { StatsService } from '../../services/stats.service';
import { GuessDistribution } from '../guess-distribution/guess-distribution';

/**
 * 👤 PROFİL SAYFASI — tam ekran.
 *
 * Modal değil sayfa olmasının sebebi: gösterilecek içerik (fotoğraf, seviye
 * çubuğu, yedi istatistik kartı, dağılım grafiği) bir modala sığmıyor ve
 * mobilde kaydırma cehennemine dönüyordu.
 *
 * İstatistik kartları core/profile-stats.ts'teki KAYIT DEFTERİNDEN çizilir —
 * burada tek tek yazılmaz. Yeni bir istatistik eklemek için bu dosyaya
 * dokunmaya gerek yok.
 */
@Component({
  selector: 'app-profile-screen',
  imports: [GuessDistribution],
  templateUrl: './profile-screen.html',
  styleUrl: './profile-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileScreen {
  protected readonly profile = inject(ProfileService);
  protected readonly statsService = inject(StatsService);
  protected readonly gold = inject(GoldService);
  protected readonly questService = inject(QuestService);

  readonly back = output<void>();

  protected readonly avatars = AVATARS;
  protected readonly statCards = PROFILE_STATS;

  /** Avatar seçici açık mı (fotoğraf yoksa gösterilir). */
  protected readonly picking = signal(false);

  /** Fotoğraf yüklenemezse gösterilecek uyarı. */
  protected readonly photoError = signal('');

  protected get stats() {
    return this.statsService.stats();
  }

  protected get level() {
    return this.statsService.level();
  }

  protected onName(event: Event): void {
    this.profile.setName((event.target as HTMLInputElement).value);
  }

  /** Grafikte son kazanılan oyunun satırı vurgulanır. */
  protected get highlight(): number | null {
    return this.stats.lastWinAttempts;
  }

  protected async onPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const ok = await this.profile.setPhotoFromFile(file);
    this.photoError.set(ok ? '' : 'Bu dosya bir resim değil ya da okunamadı.');

    // Aynı dosyayı tekrar seçebilmek için girdiyi boşalt — yoksa
    // "change" olayı ikinci kez tetiklenmez.
    input.value = '';
  }
}
