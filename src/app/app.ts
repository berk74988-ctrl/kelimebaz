import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ErrorScreen } from './components/error-screen/error-screen';
import { Game } from './components/game/game';
import { TitleScreen } from './components/title-screen/title-screen';
import { GameMode } from './models/game.model';
import { ContrastService } from './services/contrast.service';
import { ThemeService } from './services/theme.service';
import { WordService } from './services/word.service';

type View = 'title' | 'game';

@Component({
  selector: 'app-root',
  imports: [TitleScreen, Game, ErrorScreen],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Erkenden kur: yapıcılarında <html> üzerine tema/kontrast yazarlar
  private readonly theme = inject(ThemeService);
  private readonly contrast = inject(ContrastService);
  private readonly words = inject(WordService);

  /** Kelime havuzu boş/bozuksa oyun başlatılamaz → hata ekranı. */
  protected readonly ready = computed(() => this.words.isReady);

  protected readonly view = signal<View>('title');
  protected readonly mode = signal<GameMode>('daily');

  protected play(mode: GameMode): void {
    this.mode.set(mode);
    this.view.set('game');
  }

  protected exit(): void {
    this.view.set('title');
  }
}
