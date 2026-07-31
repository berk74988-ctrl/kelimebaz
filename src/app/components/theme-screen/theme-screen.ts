import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { THEMES } from '../../core/themes';
import { GoldService } from '../../services/gold.service';
import { LanguageService } from '../../services/language.service';
import { ThemeModeService } from '../../services/theme-mode.service';

/**
 * 🎨 TEMA MODU — tema seçim ekranı. Her tema kart: ikon, ad, ilerleme çubuğu
 * ("bulunan/toplam"). Tema seçilince o temadan kelimeler oynanır (casual mod).
 */
@Component({
  selector: 'app-theme-screen',
  imports: [],
  templateUrl: './theme-screen.html',
  styleUrl: './theme-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeScreen {
  protected readonly themeMode = inject(ThemeModeService);
  protected readonly i18n = inject(LanguageService);
  protected readonly gold = inject(GoldService);

  protected readonly themes = THEMES;

  readonly back = output<void>();
  readonly playTheme = output<string>();
}
