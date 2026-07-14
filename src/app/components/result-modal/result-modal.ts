import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { copyText, shareNative } from '../../core/clipboard';
import { buildShareGrid } from '../../core/share';
import { GameStatus, MAX_ATTEMPTS } from '../../models/game.model';
import { GameService } from '../../services/game.service';
import { GoldService } from '../../services/gold.service';
import { Countdown } from '../countdown/countdown';
import { StatsPanel } from '../stats-panel/stats-panel';

/** Oyun bitince açılan sonuç ekranı: kazandın/kaybettin + istatistik + paylaş. */
@Component({
  selector: 'app-result-modal',
  imports: [StatsPanel, Countdown],
  templateUrl: './result-modal.html',
  styleUrl: './result-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultModal implements AfterViewInit {
  private readonly game = inject(GameService);
  protected readonly gold = inject(GoldService);

  readonly status = input.required<GameStatus>();
  readonly answer = input.required<string>();
  readonly attempts = input.required<number>();

  readonly playAgain = output<void>();
  readonly close = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  /** Açılınca odağı modala taşı — klavye kullanıcısı sayfada kaybolmasın. */
  ngAfterViewInit(): void {
    this.dialog()?.nativeElement.focus();
  }

  /** Paylaş butonunun geri bildirimi. */
  protected readonly shareState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly maxAttempts = MAX_ATTEMPTS;

  /** Günlük modda "yarın yenilenir" notu gösterilir. */
  protected readonly isDaily = computed(() => this.game.mode() === 'daily');

  /** Paylaşılacak emoji ızgarasının önizlemesi (harf içermez). */
  protected readonly shareGrid = computed(() => buildShareGrid(this.game.guesses()));

  /** Cevap, harf harf — oyunun kutu diliyle gösterilir. */
  protected readonly answerLetters = computed(() => [...this.answer()]);

  /** Bu oyunda kazanılan altın — oyunun kendisinden + tamamlanan görevlerden. */
  protected readonly goldEarned = this.game.goldEarned;
  protected readonly questGold = this.game.questGold;

  /**
   * Sonucu paylaş: önce cihazın yerel paylaşımını dener (mobil),
   * olmazsa panoya kopyalar. Kopyalama HTTP'de de çalışır (yedek yöntem).
   */
  protected async share(): Promise<void> {
    const text = this.game.shareText();

    if (await shareNative(text)) return; // paylaşım penceresi açıldı

    const ok = await copyText(text);
    this.shareState.set(ok ? 'copied' : 'failed');
    setTimeout(() => this.shareState.set('idle'), 2000);
  }
}
