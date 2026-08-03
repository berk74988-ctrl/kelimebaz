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
import { analyzeGuesses, GuessAnalysis } from '../../core/guess-analysis';
import { buildShareGrid } from '../../core/share';
import { GameStatus, MAX_ATTEMPTS } from '../../models/game.model';
import { GameService } from '../../services/game.service';
import { GoldService } from '../../services/gold.service';
import { LanguageService } from '../../services/language.service';
import { LeagueService } from '../../services/league.service';
import { WordService } from '../../services/word.service';
import { Countdown } from '../countdown/countdown';
import { StatsPanel } from '../stats-panel/stats-panel';
import { WordCardComponent } from '../word-card/word-card';

/** Oyun bitince açılan sonuç ekranı: kazandın/kaybettin + istatistik + paylaş. */
@Component({
  selector: 'app-result-modal',
  imports: [StatsPanel, Countdown, WordCardComponent],
  templateUrl: './result-modal.html',
  styleUrl: './result-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultModal implements AfterViewInit {
  private readonly game = inject(GameService);
  private readonly words = inject(WordService);
  protected readonly gold = inject(GoldService);
  protected readonly league = inject(LeagueService);
  protected readonly i18n = inject(LanguageService);

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

  /**
   * 🔎 Maç sonu tahmin analizi — her tahminin kalitesi (aday eleme + entropi + en iyi
   * alternatif). Yalnız modal açıkken (oyun bitince) bir kez hesaplanır (lazy computed).
   */
  protected readonly analysis = computed<GuessAnalysis[]>(() => {
    const ans = this.answer();
    const words = this.game.guesses().map((g) => g.word);
    if (!ans || !words.length) return [];
    const pool = this.words.answersOfLength([...ans].length);
    return analyzeGuesses(ans, words, pool, this.i18n.lang());
  });

  /** Analiz panelini aç/kapa (varsayılan kapalı — sonuç ekranını kalabalıklaştırmasın). */
  protected readonly analysisOpen = signal(false);
  protected toggleAnalysis(): void {
    this.analysisOpen.update((v) => !v);
  }

  /** Tüm maçın ortalama isabeti (0-100) — analizden türetilir, kısa bir rozet için. */
  protected readonly accuracy = computed(() => {
    const a = this.analysis();
    if (!a.length) return 0;
    const w = { optimal: 100, great: 85, good: 70, fair: 45, weak: 20 } as const;
    return Math.round(a.reduce((s, x) => s + w[x.quality], 0) / a.length);
  });

  /** Bu oyunda kazanılan altın — oyun + seviye ödülü + tamamlanan görevler. */
  protected readonly goldEarned = this.game.goldEarned;
  protected readonly questGold = this.game.questGold;
  protected readonly levelGold = this.game.levelGold;

  /** Bu maçta kazanılan/kaybedilen lig puanı (LP). */
  protected readonly lpDelta = this.game.lpDelta;

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
