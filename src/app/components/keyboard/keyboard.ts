import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LetterState } from '../../models/game.model';
import { LanguageService } from '../../services/language.service';

/** Türkçe klavye düzeni — alfabenin 29 harfinin tamamı (Q, W, X yok). */
export const TR_ROWS: readonly (readonly string[])[] = [
  ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
  ['ENTER', 'Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', 'SİL'],
];

/** İngilizce klavye düzeni — standart QWERTY (26 harf). */
export const EN_ROWS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'SİL'],
];

/** Geçerli Türkçe harfler (fiziksel klavye girişini süzmek için). */
export const TR_LETTERS = new Set(TR_ROWS.flat().filter((k) => k !== 'ENTER' && k !== 'SİL'));

/** Geçerli İngilizce harfler. */
export const EN_LETTERS = new Set(EN_ROWS.flat().filter((k) => k !== 'ENTER' && k !== 'SİL'));

/**
 * TÜRKÇE OLMAYAN FİZİKSEL KLAVYELER İÇİN TUŞ KONUMU EŞLEMESİ.
 *
 * Sorun: İngilizce (US QWERTY) klavyesi olan bir oyuncu Ç, Ğ, Ö, Ş, Ü
 * harflerini ÜRETEMEZ — o tuşlar `event.key` olarak `;`, `'`, `[`, `]`,
 * `,`, `.` döner. Oyunun 29 harfi de desteklemesi için bu yetmez.
 *
 * Çözüm: `event.code` fiziksel TUŞ KONUMUNU verir, düzenden bağımsız olarak.
 * Türkçe-Q düzeninde o konumlarda hangi harf varsa onu yazıyoruz:
 *
 *        [ ]        →  Ğ Ü
 *        ; '        →  Ş İ
 *        , .        →  Ö Ç
 *
 * Bu eşleme SADECE `event.key` geçerli bir Türkçe harf vermediğinde devreye
 * girer — yani gerçek Türkçe klavyede hiç çalışmaz, orada `key` zaten doğru.
 *
 * Not: I ve İ ayrımı `key` üzerinden zaten çözülür — `i` → İ, `Shift+I` → I
 * (Türkçe yerelde 'I'.toLocaleUpperCase('tr') === 'I', noktasız kalır).
 */
export const TR_KEY_POSITIONS: Readonly<Record<string, string>> = {
  BracketLeft: 'Ğ',
  BracketRight: 'Ü',
  Semicolon: 'Ş',
  Quote: 'İ',
  Comma: 'Ö',
  Period: 'Ç',
};

@Component({
  selector: 'app-keyboard',
  imports: [],
  templateUrl: './keyboard.html',
  styleUrl: './keyboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Keyboard {
  protected readonly i18n = inject(LanguageService);

  readonly keyStates = input.required<Record<string, LetterState>>();

  readonly letter = output<string>();
  readonly enter = output<void>();
  readonly backspace = output<void>();

  /** Aktif dile göre klavye düzeni (TR: 29 harf · EN: QWERTY). */
  protected readonly rows = computed(() => (this.i18n.lang() === 'en' ? EN_ROWS : TR_ROWS));

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
