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
import { trUpper } from '../../core/turkish';
import { GameMode, WORD_LENGTH } from '../../models/game.model';
import { AudioService } from '../../services/audio.service';
import { ContrastService } from '../../services/contrast.service';
import { GameService } from '../../services/game.service';
import { ThemeService } from '../../services/theme.service';
import { Board } from '../board/board';
import { Keyboard, TR_KEY_POSITIONS, TR_LETTERS } from '../keyboard/keyboard';
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
  protected readonly theme = inject(ThemeService);
  protected readonly contrast = inject(ContrastService);
  private readonly audio = inject(AudioService);

  readonly mode = input.required<GameMode>();
  readonly exit = output<void>();

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
    this.game.start(this.mode());
    this.resultOpen.set(this.game.isOver());
  }

  ngOnDestroy(): void {
    if (this.lockTimer) clearTimeout(this.lockTimer);
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

    // 1) Türkçe klavye: tuşun kendisi zaten doğru harfi verir
    const ch = trUpper(e.key);
    if ([...ch].length === 1 && TR_LETTERS.has(ch)) {
      e.preventDefault();
      this.onLetter(ch);
      return;
    }

    // 2) Türkçe olmayan klavye: harf üretemeyen tuşlar için KONUMA bak.
    //    US klavyede ';' tuşu Türkçe düzende Ş'nin yerindedir → Ş yaz.
    const byPosition = TR_KEY_POSITIONS[e.code];
    if (byPosition) {
      e.preventDefault();
      this.onLetter(byPosition);
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
      this.announcement.set(guessAnnouncement(guess, after));

      // Kutular sırayla açılırken her kutuda bir tık — görsel ritimle aynı gecikme
      this.audio.revealSequence(WORD_LENGTH, 90);
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
        this.announcement.set(resultAnnouncement(won, after, this.game.answer()));
        this.resultOpen.set(true);
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
    this.announcement.set('Yeni oyun başladı.');
  }
}
