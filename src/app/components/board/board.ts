import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { GameStatus, Tile } from '../../models/game.model';

/** Oyun tahtası — 6 satır × 5 harf kutusu. */
@Component({
  selector: 'app-board',
  imports: [],
  templateUrl: './board.html',
  styleUrl: './board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Board {
  readonly rows = input.required<Tile[][]>();
  /** Kaç satır gönderildi — bu satırlar açılma animasyonu alır. */
  readonly submitted = input.required<number>();
  /** Her geçersiz denemede artan sayaç — sallanma animasyonunu tetikler. */
  readonly shakeKey = input<number>(0);
  readonly status = input<GameStatus>('playing');

  protected readonly shaking = signal(false);

  constructor() {
    effect(() => {
      if (this.shakeKey() > 0) {
        this.shaking.set(true);
        setTimeout(() => this.shaking.set(false), 450);
      }
    });
  }

  /** Sallanan satır = şu an yazılmakta olan satır. */
  protected isActiveRow(i: number): boolean {
    return i === this.submitted() && this.status() === 'playing';
  }

  /** Kazanılan satır zıplar. */
  protected isWinRow(i: number): boolean {
    return this.status() === 'won' && i === this.submitted() - 1;
  }
}
