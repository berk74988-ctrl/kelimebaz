import { ChangeDetectionStrategy, Component, HostListener, inject, input, output, signal } from '@angular/core';
import { trUpper } from '../../core/turkish';
import { GameMode } from '../../models/game.model';
import { GameService } from '../../services/game.service';
import { ThemeService } from '../../services/theme.service';
import { Board } from '../board/board';
import { Keyboard, TR_LETTERS } from '../keyboard/keyboard';
import { ResultModal } from '../result-modal/result-modal';
import { Toast } from '../toast/toast';

/** Oyun ekranı: başlık çubuğu + uyarı + tahta + klavye + sonuç ekranı. */
@Component({
  selector: 'app-game',
  imports: [Board, Keyboard, ResultModal, Toast],
  templateUrl: './game.html',
  styleUrl: './game.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Game {
  protected readonly game = inject(GameService);
  protected readonly theme = inject(ThemeService);

  readonly mode = input.required<GameMode>();
  readonly exit = output<void>();

  /** Oyun bitse bile kullanıcı sonucu kapatıp tahtayı inceleyebilir. */
  protected readonly resultOpen = signal(true);

  ngOnInit(): void {
    this.game.start(this.mode());
    this.resultOpen.set(this.game.isOver());
  }

  /** Fiziksel klavye desteği (masaüstü). */
  @HostListener('window:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;

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
    this.game.submit();
    if (this.game.isOver()) {
      setTimeout(() => this.resultOpen.set(true), 900); // açılma animasyonu bitsin
    }
  }

  /**
   * "Tekrar oyna" → her zaman TEMİZ ve YENİ bir kelimeyle başlar.
   *
   * Not: günlük modda reset yapmak aynı kelimeyi geri getirirdi (günün kelimesi
   * tarihe bağlı). Bu yüzden tekrar oynarken serbest moda geçiyoruz — böylece
   * oyuncu her seferinde yeni bir kelime alır. Günün kelimesi yarın yenilenir.
   */
  protected newGame(): void {
    this.game.reset('practice');
    this.resultOpen.set(false);
  }
}
