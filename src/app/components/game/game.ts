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
import { GameMode } from '../../models/game.model';
import { ContrastService } from '../../services/contrast.service';
import { GameService } from '../../services/game.service';
import { ThemeService } from '../../services/theme.service';
import { Board } from '../board/board';
import { Keyboard, TR_LETTERS } from '../keyboard/keyboard';
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

  ngOnInit(): void {
    this.game.start(this.mode());
    this.resultOpen.set(this.game.isOver());
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
      this.game.backspace();
      return;
    }

    const ch = trUpper(e.key);
    if ([...ch].length === 1 && TR_LETTERS.has(ch)) {
      e.preventDefault();
      this.game.type(ch);
    }
  }

  protected onEnter(): void {
    const before = this.game.rowIndex();
    this.game.submit();
    const after = this.game.rowIndex();

    if (after > before) {
      // Tahmin kabul edildi → sonucu ekran okuyucuya duyur
      const guess = this.game.guesses()[after - 1];
      this.announcement.set(guessAnnouncement(guess, after));
    } else if (this.game.message()) {
      // Reddedildi → uyarıyı duyur (toast zaten aria-live)
      this.announcement.set(this.game.message());
    }

    if (this.game.isOver()) {
      setTimeout(() => {
        this.announcement.set(
          resultAnnouncement(this.game.status() === 'won', after, this.game.answer()),
        );
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
