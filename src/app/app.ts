import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Game } from './components/game/game';
import { TitleScreen } from './components/title-screen/title-screen';
import { GameMode } from './models/game.model';
import { ThemeService } from './services/theme.service';

type View = 'title' | 'game';

@Component({
  selector: 'app-root',
  imports: [TitleScreen, Game],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Temayı erkenden kur (ThemeService yapıcısında <html data-theme> ayarlanır)
  private readonly theme = inject(ThemeService);

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
