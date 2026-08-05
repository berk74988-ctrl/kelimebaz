import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ErrorScreen } from './components/error-screen/error-screen';
import { Game } from './components/game/game';
import { LeagueScreen } from './components/league-screen/league-screen';
import { LoadingScreen } from './components/loading-screen/loading-screen';
import { ProfileScreen } from './components/profile-screen/profile-screen';
import { PwaPrompt } from './components/pwa-prompt/pwa-prompt';
import { RoomScreen } from './components/room-screen/room-screen';
import { ShopScreen } from './components/shop-screen/shop-screen';
import { ThemeScreen } from './components/theme-screen/theme-screen';
import { TitleScreen } from './components/title-screen/title-screen';
import { VsaiScreen } from './components/vsai-screen/vsai-screen';
import { GameMode } from './models/game.model';
import { AudioService } from './services/audio.service';
import { ContrastService } from './services/contrast.service';
import { LanguageService } from './services/language.service';
import { RoomService } from './services/room.service';
import { SeoService } from './services/seo.service';
import { TelemetryService } from './services/telemetry.service';
import { ThemeService } from './services/theme.service';
import { WordService } from './services/word.service';

type View = 'title' | 'game' | 'profile' | 'shop' | 'room' | 'league' | 'vsai' | 'theme';

@Component({
  selector: 'app-root',
  imports: [
    TitleScreen,
    Game,
    ProfileScreen,
    ShopScreen,
    RoomScreen,
    LeagueScreen,
    VsaiScreen,
    ThemeScreen,
    ErrorScreen,
    LoadingScreen,
    PwaPrompt,
  ],
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
  private readonly seo = inject(SeoService); // dile göre başlık/meta/OG günceller
  private readonly telemetry = inject(TelemetryService);
  // Erken enjekte: yapıcısında kayıtlı oda oturumunu geri yüklemeyi dener (resume).
  private readonly rooms = inject(RoomService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // 📐 TÜM EKRANLAR TEK EKRAN: gerçek görünür yüksekliği ölç → :root --app-height.
    // Menü VE oyun ekranı bunu kullanır (game.scss min-height/tile/key, title-screen
    // .screen). dvh/svh desteklemeyen Android tarayıcı/WebView'larında bile çalışır;
    // visualViewport adres çubuğu/klavye açılışını + güvenli alanı doğru yansıtır.
    if (typeof window !== 'undefined') {
      const vv = window.visualViewport;
      const setAppHeight = () => {
        const h = Math.round(vv?.height ?? window.innerHeight);
        if (h > 0) document.documentElement.style.setProperty('--app-height', `${h}px`);
      };
      setAppHeight();
      const opts: AddEventListenerOptions = { passive: true };
      window.addEventListener('resize', setAppHeight, opts);
      window.addEventListener('orientationchange', setAppHeight, opts);
      vv?.addEventListener('resize', setAppHeight, opts);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('resize', setAppHeight);
        window.removeEventListener('orientationchange', setAppHeight);
        vv?.removeEventListener('resize', setAppHeight);
      });
    }

    // Müziği açılışta başlatmayı dener. Tarayıcı sesli otomatik oynatmayı
    // engellerse (standart politika) ilk dokunuş/tıklamada kendiliğinden başlar.
    this.audio.init();
    // 📊 Anonim hata olayı — sözlük yüklenemezse (kişisel veri yok).
    effect(() => {
      if (this.words.status() === 'error') this.telemetry.error('dict_load_fail');
    });
    // 🔄 Sayfa yenilendiyse ve aktif bir oda oturumu geri yüklendiyse, kullanıcıyı
    // odasına döndür (view kalıcı değil → başlığa döner). Yalnız bir kez ve yalnız
    // kullanıcı henüz başka yere gitmemişken (view hâlâ 'title'). Oturum yoksa veya
    // sunucu not_found derse room() null kalır → hiçbir şey yapılmaz (menüde kalınır).
    if (this.rooms.hadSession) {
      let navigated = false;
      effect(() => {
        if (!navigated && this.rooms.room() && this.view() === 'title') {
          navigated = true;
          this.view.set('room');
        }
      });
    }
  }

  /**
   * Açılış gate'i: veri (tembel) inerken 'loading', hazırsa 'ready', ağ
   * hatasında 'error'. app.html buna göre yükleme/hata/oyun gösterir.
   */
  protected readonly status = this.words.status;

  /** Hata ekranındaki "tekrar dene" — aktif dilin verisini yeniden indirir. */
  protected retry(): void {
    this.words.retry();
  }

  protected readonly view = signal<View>('title');
  protected readonly mode = signal<GameMode>('daily');
  /** Tema modunda seçilen tema kimliği (Game bileşenine geçer). */
  protected readonly themeId = signal('');

  protected play(mode: GameMode): void {
    this.mode.set(mode);
    this.view.set('game');
    this.telemetry.modeSelect(mode, this.lang.lang()); // 📊 anonim
  }

  /** Tema seçildi → o temayı oyna (casual mod). */
  protected playTheme(id: string): void {
    this.themeId.set(id);
    this.mode.set('theme');
    this.view.set('game');
    this.telemetry.modeSelect('theme', this.lang.lang()); // 📊 anonim
  }

  /** Oyundan çıkış — tema modundaysa tema ekranına, değilse ana menüye. */
  protected exitGame(): void {
    this.view.set(this.mode() === 'theme' ? 'theme' : 'title');
  }

  protected show(view: View): void {
    this.view.set(view);
  }
}
