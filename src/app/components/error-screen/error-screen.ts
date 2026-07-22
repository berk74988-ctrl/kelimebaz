import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LanguageService } from '../../services/language.service';

/**
 * Oyun başlatılamadığında gösterilir (kelime havuzu boş/bozuk).
 * Beyaz ekranla baş başa bırakmak yerine ne olduğunu açıkça söyler.
 */
@Component({
  selector: 'app-error-screen',
  imports: [],
  template: `
    <main class="wrap">
      <section class="card" role="alert">
        <p class="ico" aria-hidden="true">😕</p>
        <h1>{{ i18n.t('error.title') }}</h1>
        <p class="msg">{{ i18n.t('error.message') }}</p>
        <button class="btn" type="button" (click)="reload()">{{ i18n.t('error.reload') }}</button>
      </section>
    </main>
  `,
  styleUrl: './error-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorScreen {
  protected readonly i18n = inject(LanguageService);

  protected reload(): void {
    location.reload();
  }
}
