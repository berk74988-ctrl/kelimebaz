import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { tileLabel } from '../../core/a11y';
import { LetterState } from '../../models/game.model';
import { LanguageService } from '../../services/language.service';

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
    // Ekran okuyucu için: sadece harf değil, DURUMU da söylenir.
    // Renk körü / görme engelli oyuncular oyunu böyle takip edebilir.
    '[attr.aria-label]': 'label()',
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

  private readonly i18n = inject(LanguageService);

  /** Ekran okuyucu etiketi: "K, doğru yerde" / "K, correct spot" gibi. */
  protected readonly label = computed(() => tileLabel(this.letter(), this.state(), this.i18n.lang()));

  /** Harf yazılmış ama henüz değerlendirilmemiş. */
  protected isFilled(): boolean {
    return this.letter() !== '' && this.state() === 'empty';
  }
}
