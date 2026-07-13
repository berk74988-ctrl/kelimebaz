import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { WordService } from '../../services/word.service';

/**
 * KELİMEBAZ — Başlık (giriş) ekranı.
 * Şimdilik yalnızca oyun adını gösterir; "Başla" ileride oyun ekranını açacak.
 */
@Component({
  selector: 'app-title-screen',
  imports: [],
  templateUrl: './title-screen.html',
  styleUrl: './title-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TitleScreen {
  private readonly words = inject(WordService);

  protected readonly title = signal('KELİMEBAZ');
  protected readonly tagline = signal('Türkçe kelime bulmaca oyunu');
  protected readonly wordCount = signal(this.words.size);
  protected readonly wordLength = signal(this.words.wordLength);

  protected start(): void {
    // TODO: oyun ekranı eklenince buradan yönlendirilecek.
    console.info('[kelimebaz] Oyun ekranı henüz hazır değil.');
  }
}
