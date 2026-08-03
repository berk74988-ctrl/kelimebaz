import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { LanguageService } from '../../services/language.service';

/**
 * Kelime verisi yüklenemediğinde (ağ hatası / bozuk havuz) gösterilir.
 * Beyaz ekranla baş başa bırakmak yerine ne olduğunu söyler ve "tekrar dene" sunar.
 *
 * retry: bağlanmışsa veriyi YENİDEN indirmeyi dener (tam sayfa yenilemeden).
 * Bağlı değilse buton sayfayı yeniler (yedek davranış).
 */
@Component({
  selector: 'app-error-screen',
  imports: [],
  template: `
    <main class="wrap">
      <section class="card" role="alert">
        <p class="brand" aria-hidden="true">KELİMEBAZ</p>
        <!-- Oyunun kendi görsel dili: hiçbir harfin tutmadığı bir tahmin satırı -->
        <div class="tiles" aria-hidden="true">
          <span class="t">?</span><span class="t">?</span><span class="t">?</span
          ><span class="t">?</span>
        </div>
        <h1>{{ i18n.t('error.title') }}</h1>
        <p class="msg">{{ i18n.t('error.message') }}</p>
        <button class="btn" type="button" (click)="onRetry()">
          ↻ {{ i18n.t('error.reload') }}
        </button>
      </section>
    </main>
  `,
  styleUrl: './error-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorScreen {
  protected readonly i18n = inject(LanguageService);

  /** Bağlıysa veriyi yeniden indirmeyi dener; bağlı değilse sayfa yenilenir. */
  readonly retry = output<void>();

  protected onRetry(): void {
    // Dinleyen var mı bilemeyiz; her iki durumda da anlamlı davran:
    this.retry.emit();
  }
}
