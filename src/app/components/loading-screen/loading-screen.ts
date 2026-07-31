import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LanguageService } from '../../services/language.service';

/**
 * Aktif dilin kelime verisi (tembel) inerken gösterilen kısa bekleme ekranı.
 * Beyaz ekran yerine "yükleniyor" durumu — dil değişince de görünür.
 */
@Component({
  selector: 'app-loading-screen',
  imports: [],
  template: `
    <main class="wrap">
      <div class="spin" aria-hidden="true"></div>
      <p class="msg" role="status" aria-live="polite">{{ i18n.t('loading.message') }}</p>
    </main>
  `,
  styles: [
    `
      .wrap {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        background: var(--bg, #faf7f0);
        color: var(--text, #1a1a1a);
      }
      .spin {
        width: 42px;
        height: 42px;
        border: 4px solid color-mix(in srgb, currentColor 22%, transparent);
        border-top-color: var(--accent, #eb8f16);
        border-radius: 50%;
        animation: ls 0.8s linear infinite;
      }
      .msg {
        font-size: 15px;
        opacity: 0.85;
      }
      @keyframes ls {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .spin {
          animation-duration: 2s;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingScreen {
  protected readonly i18n = inject(LanguageService);
}
