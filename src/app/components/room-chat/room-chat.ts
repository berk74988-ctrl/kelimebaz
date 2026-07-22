import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ChatMessage } from '../../services/room.service';
import { LanguageService } from '../../services/language.service';

/**
 * 💬 ODA SOHBETİ — sunum bileşeni (kendi ağ çağrısı yok).
 *
 * Mesajlar dışarıdan (RoomService polling'i) `messages` ile beslenir; yazılan
 * mesaj `send` ile yukarı iletilir. Lobi ve sonuç ekranında yeniden kullanılır.
 */
@Component({
  selector: 'app-room-chat',
  imports: [],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // fill=true → sohbet, kalan dikey alanı doldurur (lobi: sayfa kaymaz).
  host: { '[class.fill]': 'fill()' },
})
export class RoomChat {
  readonly messages = input.required<ChatMessage[]>();
  readonly myId = input.required<string>();
  /** true: kalan alanı doldur (lobi); false: sabit yükseklik (sonuç ekranı). */
  readonly fill = input(false);
  readonly send = output<string>();

  protected readonly i18n = inject(LanguageService);

  protected readonly draft = signal('');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
    // Yeni mesaj gelince listeyi en alta kaydır (render sonrası → scrollHeight doğru).
    afterRenderEffect(() => {
      this.messages(); // reaktif bağımlılık
      const el = this.list()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  protected onInput(e: Event): void {
    this.draft.set((e.target as HTMLInputElement).value);
  }

  protected submit(): void {
    const t = this.draft().trim();
    if (!t) return;
    this.send.emit(t);
    this.draft.set('');
  }
}
