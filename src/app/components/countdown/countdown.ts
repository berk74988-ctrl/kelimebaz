import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { LanguageService } from '../../services/language.service';
import { WordService } from '../../services/word.service';

/** Saat/dakika/saniyeyi iki haneye tamamlar. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ms → "SS:DD:SS" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Bir sonraki günün kelimesine geri sayım.
 * Her saniye kendini günceller; bileşen kapanınca sayaç durur.
 */
@Component({
  selector: 'app-countdown',
  imports: [],
  template: `
    <span class="label">{{ i18n.t('countdown.newWord') }}</span>
    <time class="clock">{{ text() }}</time>
  `,
  styleUrl: './countdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Countdown implements OnDestroy {
  protected readonly i18n = inject(LanguageService);
  private readonly words = inject(WordService);

  protected readonly text = signal(this.current());

  private readonly timer = setInterval(() => this.text.set(this.current()), 1000);

  ngOnDestroy(): void {
    clearInterval(this.timer); // sızıntı olmasın
  }

  private current(): string {
    return formatCountdown(this.words.msUntilNextDay());
  }
}
