import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { LanguageService } from '../../services/language.service';
import { WordCard, WordCardService } from '../../services/word-card.service';

/**
 * 📖 KELİME KARTI — sonuç ekranında oyuncuya kelimeyi öğreten açılır kart.
 *
 * Tanım + örnek cümle (+ varsa köken/eş/zıt). Veri TEMBEL yüklenir (WordCardService).
 * Kartı olmayan kelimede HİÇBİR ŞEY render etmez (boş durum → ekran bozulmaz).
 * Erişilebilir: başlık düğmesi aria-expanded taşır, gövde aria-controls ile bağlı,
 * klavyeyle (Enter/Boşluk) açılıp kapanır; içerik ekran okuyucuyla okunur.
 */
@Component({
  selector: 'app-word-card',
  templateUrl: './word-card.html',
  styleUrl: './word-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordCardComponent {
  private readonly svc = inject(WordCardService);
  protected readonly i18n = inject(LanguageService);

  /** Gösterilecek cevap kelimesi. */
  readonly word = input.required<string>();
  /** Başlangıçta açık mı? (kaybedince true önerilir) */
  readonly openByDefault = input(false);

  protected readonly card = signal<WordCard | null>(null);
  protected readonly expanded = signal(false);

  constructor() {
    // kelime ya da DİL değişince kartı yeniden (tembel) yükle
    effect(() => {
      const w = this.word();
      this.i18n.lang(); // dil sinyaline bağımlılık → dil değişince yeniden yükler
      void this.reload(w);
    });
  }

  private async reload(word: string): Promise<void> {
    this.card.set(null);
    const c = await this.svc.card(word);
    this.card.set(c);
    this.expanded.set(this.openByDefault() && !!c);
  }

  protected toggle(): void {
    this.expanded.set(!this.expanded());
  }
}
