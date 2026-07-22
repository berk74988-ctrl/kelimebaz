import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ErrorScreen } from './components/error-screen/error-screen';
import { Game } from './components/game/game';
import { LeagueScreen } from './components/league-screen/league-screen';
import { ProfileScreen } from './components/profile-screen/profile-screen';
import { RoomScreen } from './components/room-screen/room-screen';
import { ShopScreen } from './components/shop-screen/shop-screen';
import { TitleScreen } from './components/title-screen/title-screen';
import { VsaiScreen } from './components/vsai-screen/vsai-screen';
import { GameMode } from './models/game.model';
import { AudioService } from './services/audio.service';
import { ContrastService } from './services/contrast.service';
import { LanguageService } from './services/language.service';
import { ThemeService } from './services/theme.service';
import { WordService } from './services/word.service';

type View = 'title' | 'game' | 'profile' | 'shop' | 'room' | 'league' | 'vsai';

@Component({
  selector: 'app-root',
  imports: [TitleScreen, Game, ProfileScreen, ShopScreen, RoomScreen, LeagueScreen, VsaiScreen, ErrorScreen],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Erkenden kur: yapıcılarında <html> üzerine tema/kontrast yazarlar
  private readonly theme = inject(ThemeService);
  private readonly contrast = inject(ContrastService);
  private readonly lang = inject(LanguageService); // açılışta <html lang> yazar
  private readonly words = inject(WordService);
  private readonly audio = inject(AudioService);

  constructor() {
    // Müziği açılışta başlatmayı dener. Tarayıcı sesli otomatik oynatmayı
    // engellerse (standart politika) ilk dokunuş/tıklamada kendiliğinden başlar.
    this.audio.init();
  }

  /** Kelime havuzu boş/bozuksa oyun başlatılamaz → hata ekranı. */
  protected readonly ready = computed(() => this.words.isReady);

  protected readonly view = signal<View>('title');
  protected readonly mode = signal<GameMode>('daily');

  protected play(mode: GameMode): void {
    this.mode.set(mode);
    this.view.set('game');
  }

  protected show(view: View): void {
    this.view.set(view);
  }
}
