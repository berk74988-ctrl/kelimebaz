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
import { GameStatus, MAX_ATTEMPTS } from '../../models/game.model';
import { GameService } from '../../services/game.service';
import { GoldService } from '../../services/gold.service';
import { LanguageService } from '../../services/language.service';
import { LeagueService } from '../../services/league.service';
import { WordService } from '../../services/word.service';
import { Countdown } from '../countdown/countdown';
import { WordCardComponent } from '../word-card/word-card';

/**
 * Oyun bitince açılan SONUÇ EKRANI — sade ve net.
 * Yalnız en önemli bilgiler: sonuç (kazan/kaybet) · doğru kelime · kazanılan
 * altın · ustalık puanı. Belirgin butonlar: Yeni Oyun · Ana Menü · Paylaş.
 *
 * "Kelime kartı" (📖) ve "Maç analizi" (🔎) sade görünümü bozmadan geri
 * getirildi: butonların hemen üstünde, VARSAYILAN KAPALI açılır bölümler
 * olarak. İsteyen açar; modal kısa kalır. (İstatistik grafiği 📊 modalında.)
 */
@Component({
  selector: 'app-result-modal',
  imports: [Countdown, WordCardComponent],
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
  readonly home = output<void>();
  readonly close = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  /** Açılınca odağı modala taşı — klavye kullanıcısı sayfada kaybolmasın. */
  ngAfterViewInit(): void {
    this.dialog()?.nativeElement.focus();
  }

  /** Paylaş butonunun geri bildirimi. */
  protected readonly shareState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly maxAttempts = MAX_ATTEMPTS;

  /** Günlük modda "yarın yenilenir" geri sayımı gösterilir. */
  protected readonly isDaily = computed(() => this.game.mode() === 'daily');

  /** Cevap, harf harf — oyunun kutu diliyle gösterilir. */
  protected readonly answerLetters = computed(() => [...this.answer()]);

  /** Bu oyunda kazanılan altın (oyun + seviye + görevler, tek toplam). */
  protected readonly goldEarned = this.game.goldEarned;

  /** Bu maçta kazanılan/kaybedilen ustalık puanı (LP). */
  protected readonly lpDelta = this.game.lpDelta;

  /** Analiz bölümü varsayılan KAPALI — modal kısa kalsın; isteyen açar. */
  protected readonly analysisOpen = signal(false);

  /** Hesaplanan analiz satırları (bir kez, açılınca dolar; boşken hesaplanmadı). */
  protected readonly analysis = signal<GuessAnalysis[]>([]);

  /** Ağır hesap sürüyor mu → başlıkta/gövdede "Hesaplanıyor…" göster. */
  protected readonly analysisComputing = signal(false);

  /**
   * Analizi aç/kapat. AÇARKEN ağır hesabı BİR SONRAKİ KAREYE erteler: analyzeGuesses
   * ilk turda tüm cevap havuzu üstünde O(havuz²) entropi tarar (~460ms tek uzun görev).
   * Önce "Hesaplanıyor…" boyansın (donma HİSSİ olmasın), sonra çift-rAF ile hesapla
   * (tek setTimeout paint'i garantilemez). Bir kez hesaplanınca önbelleğe alınır.
   */
  protected toggleAnalysis(): void {
    const opening = !this.analysisOpen();
    this.analysisOpen.set(opening);
    if (!opening || this.analysis().length || this.analysisComputing()) return;
    const ans = this.answer();
    const words = this.game.guesses().map((g) => g.word);
    if (!ans || !words.length) return;
    this.analysisComputing.set(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const pool = this.words.answersOfLength([...ans].length);
        this.analysis.set(analyzeGuesses(ans, words, pool, this.i18n.lang()));
        this.analysisComputing.set(false);
      }),
    );
  }

  /** Analiz bölümü GÖSTERİLSİN mi? (ucuz — hesaplama yapmaz). */
  protected readonly hasAnalysis = computed(
    () => !!this.answer() && this.game.guesses().length > 0,
  );

  /**
   * Tahminlerin ortalama isabet yüzdesi (0–100). ROZET yalnız analiz HESAPLANMIŞSA
   * (kullanıcı bölümü açınca) görünür; kapalıyken null. BİLİNÇLİ TAVİZ: isabeti
   * hesaplamak tam analizi (O(havuz²)) gerektirir; bunu her modal açılışında yapmak,
   * tembelleştirmeyle kaldırdığımız ~460ms donmayı GERİ getirirdi. Açınca
   * "Hesaplanıyor…" ardından rozet + liste birlikte gelir.
   */
  protected readonly accuracy = computed<number | null>(() => {
    const a = this.analysis();
    if (!a.length) return null;
    const w = { optimal: 100, great: 85, good: 70, fair: 45, weak: 20 } as const;
    return Math.round(a.reduce((s, x) => s + w[x.quality], 0) / a.length);
  });

  /**
   * Sonucu paylaş: önce cihazın yerel paylaşımını dener (mobil),
   * olmazsa panoya kopyalar. Kopyalama HTTP'de de çalışır (yedek yöntem).
   */
  protected async share(): Promise<void> {
    const text = this.game.shareText();
    if (await shareNative(text)) return;
    const ok = await copyText(text);
    this.shareState.set(ok ? 'copied' : 'failed');
    setTimeout(() => this.shareState.set('idle'), 2000);
  }
}
