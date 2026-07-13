import { ChangeDetectionStrategy, Component } from '@angular/core';

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
        <h1>Oyun başlatılamadı</h1>
        <p class="msg">
          Kelime listesi yüklenemedi. Bu genelde geçici bir sorundur —
          sayfayı yenilemek çoğu zaman çözer.
        </p>
        <button class="btn" type="button" (click)="reload()">Sayfayı yenile</button>
      </section>
    </main>
  `,
  styleUrl: './error-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorScreen {
  protected reload(): void {
    location.reload();
  }
}
