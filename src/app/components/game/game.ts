import { ChangeDetectionStrategy, Component, HostListener, inject, input, output, signal } from '@angular/core';
import { GameMode } from '../../models/game.model';
import { GameService } from '../../services/game.service';
import { ThemeService } from '../../services/theme.service';
import { trUpper } from '../../services/word.service';
import { Board } from '../board/board';
import { Keyboard, TR_LETTERS } from '../keyboard/keyboard';
import { ResultModal } from '../result-modal/result-modal';

/** Oyun ekranı: başlık çubuğu + tahta + klavye + sonuç ekranı. */
@Component({
  selector: 'app-game',
  imports: [Board, Keyboard, ResultModal],
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

  protected newGame(): void {
    this.game.reset();
    this.resultOpen.set(false);
  }
}
