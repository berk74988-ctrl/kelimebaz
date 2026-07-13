import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LetterState } from '../../models/game.model';

/** Türkçe klavye düzeni — 29 harf (Q, W, X yok). */
export const TR_ROWS: readonly (readonly string[])[] = [
  ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
  ['ENTER', 'Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', 'SİL'],
];

/** Geçerli Türkçe harfler (fiziksel klavye girişini süzmek için). */
export const TR_LETTERS = new Set(
  TR_ROWS.flat().filter((k) => k !== 'ENTER' && k !== 'SİL'),
);

@Component({
  selector: 'app-keyboard',
  imports: [],
  templateUrl: './keyboard.html',
  styleUrl: './keyboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Keyboard {
  readonly keyStates = input.required<Record<string, LetterState>>();

  readonly letter = output<string>();
  readonly enter = output<void>();
  readonly backspace = output<void>();

  protected readonly rows = TR_ROWS;

  protected press(key: string): void {
    if (key === 'ENTER') this.enter.emit();
    else if (key === 'SİL') this.backspace.emit();
    else this.letter.emit(key);
  }

  protected stateOf(key: string): LetterState | '' {
    return this.keyStates()[key] ?? '';
  }

  protected isWide(key: string): boolean {
    return key === 'ENTER' || key === 'SİL';
  }
}
