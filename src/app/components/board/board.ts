import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { GameStatus, Tile } from '../../models/game.model';
import { LanguageService } from '../../services/language.service';
import { LetterTile } from '../tile/tile';

/**
 * Oyun tahtası — 6 satır × (kelime uzunluğu) sütun CSS Grid (4-7 harf).
 * Tahta durumu dışarıdan bir signal (satır × sütun) ile beslenir; kutuları <app-tile> çizer.
 */
@Component({
  selector: 'app-board',
  imports: [LetterTile],
  templateUrl: './board.html',
  styleUrl: './board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Board {
  protected readonly i18n = inject(LanguageService);

  /** 6×5 tahta durumu. */
  readonly rows = input.required<Tile[][]>();

  /** Kaç satır gönderildi — bu satırlar açılma animasyonu alır. */
  readonly submitted = input.required<number>();

  /** Her geçersiz denemede artan sayaç — sallanma animasyonunu tetikler. */
  readonly shakeKey = input<number>(0);

  readonly status = input<GameStatus>('playing');

  protected readonly shaking = signal(false);
  private shakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      if (this.shakeKey() > 0) {
        // Önceki zamanlayıcıyı temizle: 450ms içinde 2. geçersiz tahmin gelirse
        // ilk timeout sallanmayı erken kesmesin (shake hep son denemeden 450ms sürer).
        if (this.shakeTimer) clearTimeout(this.shakeTimer);
        this.shaking.set(true);
        this.shakeTimer = setTimeout(() => this.shaking.set(false), 450);
      }
    });
    destroyRef.onDestroy(() => {
      if (this.shakeTimer) clearTimeout(this.shakeTimer);
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

  /**
   * Kazanma zıplaması (bounce) gecikmesi — kutu çevirmesi BİTİNCE başlasın.
   * SABİT değil UZUNLUĞA bağlı (kelime 4-7 harf): son kutu (harf-1)×90ms sonra
   * çevrilmeye başlar, çevirme ~550ms + 40ms pay. 5 harf → 950ms (eski sabit
   * değerle aynı), 7 harf → 1130ms. Yoksa 6-7 harfte kutular çevrilirken zıplardı.
   * (reduced-motion'da global CSS animation-delay'i 0'a düşürür → sorun yok.)
   */
  protected winDelayMs(): number {
    const cols = this.rows()[0]?.length ?? 5;
    return (cols - 1) * 90 + 590;
  }
}
