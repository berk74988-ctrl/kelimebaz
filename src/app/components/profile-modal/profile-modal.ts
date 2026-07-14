import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { AVATARS, ProfileService } from '../../services/profile.service';
import { StatsService } from '../../services/stats.service';
import { StatsPanel } from '../stats-panel/stats-panel';

/** 👤 Profil — oyuncunun adı, avatarı ve istatistikleri tek ekranda. */
@Component({
  selector: 'app-profile-modal',
  imports: [StatsPanel],
  templateUrl: './profile-modal.html',
  styleUrl: './profile-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileModal implements AfterViewInit {
  protected readonly profile = inject(ProfileService);
  protected readonly statsService = inject(StatsService);

  readonly close = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  protected readonly avatars = AVATARS;

  /** Açılınca odağı modala taşı — klavye kullanıcısı sayfada kaybolmasın. */
  ngAfterViewInit(): void {
    this.dialog()?.nativeElement.focus();
  }

  /** Grafikte son kazanılan oyunun satırı vurgulanır. */
  protected get highlight(): number | null {
    return this.statsService.stats().lastWinAttempts;
  }

  protected onName(event: Event): void {
    this.profile.setName((event.target as HTMLInputElement).value);
  }
}
