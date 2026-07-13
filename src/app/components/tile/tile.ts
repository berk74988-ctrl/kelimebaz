import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LetterState } from '../../models/game.model';

/**
 * Tek bir harf kutusu.
 *
 * Üç durumu vardır:
 *  - boş              → letter '' , state 'empty'
 *  - harf girilmiş    → letter dolu, state 'empty'   (kenarlık vurgulanır + pop animasyonu)
 *  - değerlendirilmiş → state 'correct' | 'present' | 'absent' (renklenir + çevrilerek açılır)
 *
 * Not: Girdiler Angular'ın signal tabanlı `input()` API'si ile tanımlı —
 * klasik `@Input()`in güncel karşılığı (OnPush ile birlikte daha verimli).
 */
@Component({
  selector: 'app-tile',
  imports: [],
  template: '{{ letter() }}',
  styleUrl: './tile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'gridcell',
    '[class.filled]': 'isFilled()',
    '[class.reveal]': 'revealed()',
    '[class.correct]': 'state() === "correct"',
    '[class.present]': 'state() === "present"',
    '[class.absent]': 'state() === "absent"',
    '[style.animation-delay.ms]': 'delay()',
    '[attr.aria-label]': 'letter() || "boş"',
  },
})
export class LetterTile {
  /** Kutuda gösterilen harf ('' = boş). */
  readonly letter = input.required<string>();

  /** Değerlendirme durumu. */
  readonly state = input.required<LetterState>();

  /** Tahmin gönderildi mi → çevrilerek açılma animasyonu. */
  readonly revealed = input(false);

  /** Açılma animasyonunun gecikmesi (ms) — harfler sırayla açılsın diye. */
  readonly delay = input(0);

  /** Harf yazılmış ama henüz değerlendirilmemiş. */
  protected isFilled(): boolean {
    return this.letter() !== '' && this.state() === 'empty';
  }
}
