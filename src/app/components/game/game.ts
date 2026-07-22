import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { guessAnnouncement, resultAnnouncement } from '../../core/a11y';
import { GameMode } from '../../models/game.model';
import { AudioService } from '../../services/audio.service';
import { ContrastService } from '../../services/contrast.service';
import { GameService } from '../../services/game.service';
import { HintService } from '../../services/hint.service';
import { LanguageService } from '../../services/language.service';
import { ThemeService } from '../../services/theme.service';
import { Board } from '../board/board';
import { EN_LETTERS, Keyboard, TR_KEY_POSITIONS, TR_LETTERS } from '../keyboard/keyboard';
import { ResultModal } from '../result-modal/result-modal';
import { StatsModal } from '../stats-modal/stats-modal';
import { Toast } from '../toast/toast';

/** Oyun ekranı: başlık çubuğu + uyarı + tahta + klavye + sonuç/istatistik ekranı. */
@Component({
  selector: 'app-game',
  imports: [Board, Keyboard, ResultModal, StatsModal, Toast],
  templateUrl: './game.html',
  styleUrl: './game.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Game {
  protected readonly game = inject(GameService);
  protected readonly i18n = inject(LanguageService);
  protected readonly hint = inject(HintService);
  protected readonly theme = inject(ThemeService);
  protected readonly contrast = inject(ContrastService);
  private readonly audio = inject(AudioService);

  /** 💡 İpucu açıldı mı (yalnız İngilizce; her yeni oyunda sıfırlanır). */
  protected readonly hintShown = signal(false);

  readonly mode = input.required<GameMode>();
  readonly exit = output<void>();

  /** Oda modu: kelime sunucudan gelir (verilmişse günlük/serbest yerine bu oynanır). */
  readonly roomAnswer = input<string | undefined>(undefined);
  /** Oda süre sınırı (saniye); 0 = serbest. */
  readonly roomTimeLimit = input<number>(0);
  /** Oda oyunu bitti — sonuç (RoomScreen sunucuya iletir). */
  readonly finished = output<{ solved: boolean; attempts: number; timeMs: number }>();

  /** Oda modunda mıyız? */
  protected isRoom(): boolean {
    return !!this.roomAnswer();
  }

  /** Süre sayacı — kalan saniye (oda modunda, süre sınırı varsa gösterilir). */
  protected readonly remaining = signal(0);
  private roomStart = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private reported = false;

  /** Oyun bitse bile kullanıcı sonucu kapatıp tahtayı inceleyebilir. */
  protected readonly resultOpen = signal(true);

  /** 📊 ile istenildiği an açılan istatistik ekranı. */
  protected readonly statsOpen = signal(false);

  /**
   * Ekran okuyucuya duyurulacak metin (görsel olarak gizli, aria-live).
   * Her tahminden sonra sonucu, oyun bitince kazanma/kaybetmeyi okur.
   */
  protected readonly announcement = signal('');

  /**
   * Kutular çevrilirken giriş KİLİTLİ.
   *
   * Neden: ENTER'a hızlıca iki kez basınca ikinci basış boş satırı
   * onaylamaya çalışıyor ve "5 harf girin" uyarısı çıkıyordu. Ayrıca
   * animasyon sürerken yazılan harfler yarım açılmış kutuların üstüne
   * biniyordu. Kilit, açılma bitene kadar girişi durdurur.
   */
  private readonly locked = signal(false);
  private lockTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.hintShown.set(false); // yeni oyun → ipucu kapalı başlar
    const answer = this.roomAnswer();
    if (answer) {
      // Oda/YZ yarışı: verilen kelimeyle sıfırdan başla (mod korunur → istatistik/altın/görev doğru işler).
      this.game.startRoom(answer, this.mode());
      this.roomStart = performance.now();
      this.resultOpen.set(false);
      if (this.roomTimeLimit() > 0) this.startTimer();
      return;
    }
    this.game.start(this.mode());
    this.resultOpen.set(this.game.isOver());
  }

  ngOnDestroy(): void {
    if (this.lockTimer) clearTimeout(this.lockTimer);
    this.stopTimer();
  }

  /** Süre sayacını başlat — süre dolunca oyun kayıpla biter. */
  private startTimer(): void {
    this.remaining.set(this.roomTimeLimit());
    this.timer = setInterval(() => {
      this.remaining.update((s) => s - 1);
      if (this.remaining() <= 0) {
        this.stopTimer();
        if (!this.game.isOver()) this.game.timeout();
        this.reportRoomResult();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Oda sonucunu TEK KEZ üst bileşene bildir. */
  private reportRoomResult(): void {
    if (this.reported) return;
    this.reported = true;
    this.stopTimer();
    this.finished.emit({
      solved: this.game.status() === 'won',
      attempts: this.game.rowIndex(),
      timeMs: Math.round(performance.now() - this.roomStart),
    });
  }

  /** Kalan süre "1:05" biçiminde. */
  protected clock(): string {
    const s = Math.max(0, this.remaining());
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Kutuların açılma animasyonu ne kadar sürüyor. */
  private revealMs(): number {
    // Hareket azaltma açıksa animasyon anlık → kilitlemeye gerek yok
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return 0;

    // son kutu: 4 × 90ms gecikme + 550ms çevirme
    return 950;
  }

  private lockInput(): void {
    const ms = this.revealMs();
    if (ms === 0) return;

    this.locked.set(true);
    if (this.lockTimer) clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => this.locked.set(false), ms);
  }

  // --- Giriş (ekran klavyesi ve fiziksel klavye buradan geçer) ---

  protected onLetter(letter: string): void {
    if (this.locked()) return;
    const before = this.game.currentGuess();
    this.game.type(letter);
    // Satır zaten doluysa harf eklenmez → ses de çıkmasın (yanlış geri bildirim olur)
    if (this.game.currentGuess() !== before) this.audio.sfx('key');
  }

  protected onBackspace(): void {
    if (this.locked()) return;
    const before = this.game.currentGuess();
    this.game.backspace();
    if (this.game.currentGuess() !== before) this.audio.sfx('delete');
  }

  /** Fiziksel klavye desteği (masaüstü). */
  @HostListener('window:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Escape: açık pencereyi kapat (klavyeyle oynanabilirlik)
    if (e.key === 'Escape') {
      if (this.statsOpen()) {
        this.statsOpen.set(false);
        e.preventDefault();
      } else if (this.resultOpen()) {
        this.resultOpen.set(false);
        e.preventDefault();
      }
      return;
    }

    // Pencere açıkken oyuna harf yazılmasın
    if (this.statsOpen() || this.resultOpen()) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      this.onEnter();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.onBackspace();
      return;
    }

    // 1) Tuşun kendisi doğru harfi verir (aktif dilin harf setine göre süz).
    const isEn = this.i18n.lang() === 'en';
    const letters = isEn ? EN_LETTERS : TR_LETTERS;
    const ch = this.i18n.upper(e.key);
    if ([...ch].length === 1 && letters.has(ch)) {
      e.preventDefault();
      this.onLetter(ch);
      return;
    }

    // 2) TÜRKÇE modda, Türkçe olmayan fiziksel klavyeler için KONUMA bak.
    //    US klavyede ';' tuşu Türkçe düzende Ş'nin yerindedir → Ş yaz.
    //    (İngilizce modda gerek yok — harfler zaten event.key ile gelir.)
    if (!isEn) {
      const byPosition = TR_KEY_POSITIONS[e.code];
      if (byPosition) {
        e.preventDefault();
        this.onLetter(byPosition);
      }
    }
  }

  protected onEnter(): void {
    if (this.locked()) return; // çift onaylamayı engelle

    const before = this.game.rowIndex();
    this.game.submit();
    const after = this.game.rowIndex();

    if (after > before) {
      // Tahmin kabul edildi → açılma bitene kadar girişi kilitle
      this.lockInput();

      const guess = this.game.guesses()[after - 1];
      this.announcement.set(guessAnnouncement(guess, after, this.i18n.lang()));

      // Kutular sırayla açılırken her kutuda bir tık — görsel ritimle aynı gecikme
      this.audio.revealSequence(this.game.wordLength(), 90);
    } else if (this.game.message()) {
      // Reddedildi → uyarıyı duyur (toast zaten aria-live)
      this.announcement.set(this.game.message());
      this.audio.sfx('invalid');
    }

    if (this.game.isOver()) {
      const won = this.game.status() === 'won';
      // Açılma animasyonu bitince çal — kutu tıklarının üstüne binmesin
      setTimeout(() => this.audio.sfx(won ? 'win' : 'lose'), 900);

      setTimeout(() => {
        this.announcement.set(resultAnnouncement(won, after, this.game.answer(), this.i18n.lang()));
        // Oda modunda sonuç ekranı yerine üst bileşene bildir → lider tablosu açılır.
        if (this.isRoom()) this.reportRoomResult();
        else this.resultOpen.set(true);
      }, 900); // açılma animasyonu bitsin
    }
  }

  /**
   * "Tekrar oyna" → her zaman TEMİZ ve YENİ bir kelimeyle başlar.
   *
   * Not: günlük modda reset yapmak aynı kelimeyi geri getirirdi (günün kelimesi
   * tarihe bağlı). Bu yüzden tekrar oynarken serbest moda geçiyoruz.
   */
  protected newGame(): void {
    this.game.reset('practice');
    this.resultOpen.set(false);
    this.hintShown.set(false); // yeni kelime → ipucu tekrar kapalı
    this.announcement.set(this.i18n.t('game.newGameStarted'));
  }
}
