import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { LanguageService } from '../../services/language.service';
import { ProfileService } from '../../services/profile.service';
import { RoomService, RoomSettings } from '../../services/room.service';
import { WordService } from '../../services/word.service';
import { Game } from '../game/game';
import { RoomChat } from '../room-chat/room-chat';

/**
 * 🎮 ÇOK OYUNCULU ODA — arkadaşlarla aynı kelimeyi yarışarak çözme.
 *
 * Tek bileşen, dört aşamayı yönetir (oda durumundan türetilir):
 *   menu     → oda yok: oluştur veya kod ile katıl
 *   lobby    → bekleme odası: oyuncular, ayarlar (sahip), başlat
 *   playing  → <app-game> oda kelimesiyle; bitince sonucu sunucuya iletir
 *   finished → lider tablosu (canlı; herkes bitince kesinleşir)
 *
 * Gerçek zamanlılık RoomService'in polling'iyle gelir — burada sadece
 * o durumu çiziyoruz.
 */
@Component({
  selector: 'app-room-screen',
  imports: [Game, RoomChat],
  templateUrl: './room-screen.html',
  styleUrl: './room-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomScreen {
  protected readonly rooms = inject(RoomService);
  private readonly words = inject(WordService);
  private readonly profile = inject(ProfileService);
  protected readonly i18n = inject(LanguageService);

  readonly back = output<void>();

  /** Menü alt-durumu (oda yokken). */
  protected readonly menuMode = signal<'choose' | 'create' | 'join'>('choose');

  /** Formlar. */
  protected readonly name = signal(this.profile.displayName() || this.i18n.t('room.defaultName'));
  protected readonly joinCode = signal('');
  protected readonly newMaxPlayers = signal(6);
  protected readonly newTimeLimit = signal(120);

  /** Bu oyuncunun bu turu bitirip bitirmediği (oyun→lider tablosu geçişi). */
  protected readonly myDone = signal(false);
  protected readonly copied = signal(false);

  /** Oyun sırasında açılan canlı sıralama paneli. */
  protected readonly liveOpen = signal(false);

  /** Oda bitti mi (tüm oyuncular). */
  protected readonly isFinal = computed(() => this.room()?.status === 'finished');

  /** Kürsü — ilk 3 oyuncu (sunucu zaten puana + hıza göre sıralar). */
  protected readonly podium = computed(() => (this.room()?.players ?? []).slice(0, 3));

  /** Kürsü görsel yerleşimi: 2. sol · 1. orta (en yüksek) · 3. sağ. */
  protected readonly podiumSlots = computed(() => {
    const p = this.podium();
    return [
      { place: 2, player: p[1] ?? null },
      { place: 1, player: p[0] ?? null },
      { place: 3, player: p[2] ?? null },
    ];
  });

  /** Kürsü dışındaki oyuncular (4. ve sonrası). */
  protected readonly rest = computed(() => (this.room()?.players ?? []).slice(3));

  /** Sohbet mesajları (polling ile canlı gelir). */
  protected readonly messages = computed(() => this.room()?.messages ?? []);

  /** Kazanan (yalnızca oda bittiğinde ve en üstteki oyuncu). */
  protected readonly winner = computed(() => {
    const p = this.room()?.players?.[0];
    return this.isFinal() && p && p.finished ? p : null;
  });

  /** Kazanan ben miyim? */
  protected readonly iWon = computed(() => !!this.winner() && this.winner()!.id === this.rooms.myId);

  /**
   * Konfeti parçaları — SABİT liste (title-screen'deki gibi). Rastgele üretilseydi
   * her değişiklik algılamada zıplardı; deterministik değerlerle tutarlı kalır.
   */
  protected readonly confetti = Array.from({ length: 44 }, (_, i) => ({
    left: (i * 96.7) % 100,
    delay: (i % 12) * 0.14,
    duration: 2.6 + (i % 5) * 0.4,
    drift: ((i * 37) % 70) - 35,
    rot: (i * 53) % 360,
    color: ['#4caf82', '#d9a441', '#6c8cff', '#f43f5e', '#a855f7', '#22b8cf'][i % 6],
  }));

  private lastStarted = 0;

  protected readonly room = this.rooms.room;

  /** Oda kelimesi — seed'den türetilir (herkes aynı kelimeyi alır). */
  protected readonly word = computed(() => {
    const r = this.room();
    return r && r.seed != null ? this.words.wordBySeed(r.seed) : '';
  });

  /** Listede kendi oyuncum. */
  protected readonly me = computed(
    () => this.room()?.players.find((p) => p.id === this.rooms.myId) ?? null,
  );

  protected readonly isOwner = computed(() => this.me()?.isOwner ?? false);

  /** Bu oyuncu hazır mı? */
  protected readonly iAmReady = computed(() => this.me()?.ready ?? false);

  /** Herkes hazır mı (en az 2 oyuncu ve hepsi hazır)? */
  protected readonly allReady = computed(() => {
    const r = this.room();
    return !!r && r.playerCount >= 2 && r.readyCount >= r.playerCount;
  });

  /** Oyun tahtası gösterilsin mi (oynanıyor ve ben daha bitirmedim). */
  protected readonly showGame = computed(() => this.room()?.status === 'playing' && !this.myDone());

  /** Süre sınırı seçenekleri (saniye; 0 = serbest). */
  protected readonly timeOptions = [
    { v: 0, key: 'room.unlimited' },
    { v: 60, key: 'room.time1min' },
    { v: 120, key: 'room.time2min' },
    { v: 180, key: 'room.time3min' },
  ];
  protected readonly playerOptions = [2, 3, 4, 5, 6, 7, 8];

  constructor() {
    // Yeni bir tur başladığında (startedAt değişince) "bitirdim" bayrağını sıfırla
    // ki oyun tahtası yeniden görünsün.
    effect(() => {
      const r = this.room();
      if (r?.status === 'playing' && r.startedAt && r.startedAt !== this.lastStarted) {
        this.lastStarted = r.startedAt;
        this.myDone.set(false);
      }
    });
  }

  // --- Menü eylemleri ---

  protected async create(): Promise<void> {
    this.persistName();
    await this.rooms.create(this.name(), {
      maxPlayers: this.newMaxPlayers(),
      timeLimit: this.newTimeLimit(),
    });
  }

  protected async join(): Promise<void> {
    this.persistName();
    await this.rooms.join(this.joinCode(), this.name());
  }

  // --- Lobi eylemleri ---

  protected start(): void {
    this.rooms.start();
  }

  /** Katılan oyuncu hazır/değil durumunu değiştirir. */
  protected toggleReady(): void {
    this.rooms.setReady(!this.iAmReady());
  }

  protected onMaxPlayers(v: number): void {
    const cur = this.room()?.settings;
    if (cur) this.rooms.updateSettings({ maxPlayers: v, timeLimit: cur.timeLimit });
  }

  protected onTimeLimit(v: number): void {
    const cur = this.room()?.settings;
    if (cur) this.rooms.updateSettings({ maxPlayers: cur.maxPlayers, timeLimit: v });
  }

  protected settingsOf(): RoomSettings {
    return this.room()?.settings ?? { maxPlayers: 6, timeLimit: 0 };
  }

  // --- Oyun ---

  protected onFinished(r: { solved: boolean; attempts: number; timeMs: number }): void {
    this.myDone.set(true);
    this.rooms.submitScore(r.solved, r.attempts, r.timeMs);
  }

  /** Sohbet mesajı gönder (tüm oda üyelerine iletilir). */
  protected sendChat(text: string): void {
    this.rooms.sendChat(text);
  }

  // --- Lider tablosu ---

  /** Oda sahibi yeni tur başlatır (aynı oyuncularla). */
  protected playAgain(): void {
    this.rooms.start();
  }

  protected async leaveRoom(): Promise<void> {
    await this.rooms.leave();
    this.menuMode.set('choose');
  }

  /** Üst-sol geri: odadaysan ayrıl (menüye), değilsen başlığa dön. */
  protected async goBack(): Promise<void> {
    if (this.room()) {
      await this.leaveRoom();
    } else {
      this.back.emit();
    }
  }

  // --- Davet: oda kodunu kopyala ---

  /** "Oda kodu kopyalandı" bildirimi görünür mü. */
  protected readonly copiedToast = signal(false);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Oda kodunu panoya kopyalar ve kısa bir bildirim gösterir.
   *
   * ÖNEMLİ: Site HTTP'den sunuluyor; navigator.clipboard yalnızca GÜVENLİ
   * bağlamda (HTTPS/localhost) çalışır. Bu yüzden güvenli bağlam yoksa eski
   * execCommand('copy') yöntemine düşülür — HTTP'de de çalışır.
   */
  protected copyCode(): void {
    const code = this.room()?.code ?? '';
    if (!code) return;

    const ok = this.writeClipboard(code);

    // Butonda kısa "✓ Kopyalandı" + ekranda bildirim
    this.copied.set(true);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (ok) this.copiedToast.set(true);
    this.toastTimer = setTimeout(() => {
      this.copied.set(false);
      this.copiedToast.set(false);
    }, 1800);
  }

  private writeClipboard(text: string): boolean {
    // Güvenli bağlam: modern Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => this.legacyCopy(text));
      return true;
    }
    // HTTP / eski tarayıcı: geçici alan + execCommand
    return this.legacyCopy(text);
  }

  private legacyCopy(text: string): boolean {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  protected onName(e: Event): void {
    this.name.set((e.target as HTMLInputElement).value);
  }

  protected onJoinCode(e: Event): void {
    this.joinCode.set((e.target as HTMLInputElement).value.toUpperCase());
  }

  private persistName(): void {
    const n = this.name().trim();
    if (n) this.profile.setName(n);
  }
}
