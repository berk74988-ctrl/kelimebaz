import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Kısa uyarı mesajı ("5 harf girin", "Sözlükte yok").
 *
 * Mesaj boşsa hiçbir şey çizmez, ama yerini KORUR (sabit yükseklik) —
 * böylece uyarı gelip gidince tahta yukarı aşağı zıplamaz.
 *
 * Mesajın ne zaman kaybolacağına GameService karar verir (2 sn),
 * bu bileşen yalnızca gösterimden sorumlu.
 */
@Component({
  selector: 'app-toast',
  imports: [],
  template: `
    @if (text()) {
      <p class="toast">{{ text() }}</p>
    }
  `,
  styleUrl: './toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    'aria-live': 'polite', // ekran okuyucu uyarıyı duyursun
  },
})
export class Toast {
  readonly text = input.required<string>();
}
