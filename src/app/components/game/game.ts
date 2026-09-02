import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { guessAnnouncement, resultAnnouncement } from '../../core/a11y';
import { localHint } from '../../core/local-hint';
import { GameMode } from '../../models/game.model';
import { AiHintService } from '../../services/ai-hint.service';
import { AiBehaviorService } from '../../services/ai-behavior.service';
import { AudioService } from '../../services/audio.service';
import { ContrastService } from '../../services/contrast.service';
import { GameService } from '../../services/game.service';
import { GoldService } from '../../services/gold.service';
import { HintService } from '../../services/hint.service';
import { LanguageService } from '../../services/language.service';
import { StatsService } from '../../services/stats.service';
import { ThemeService } from '../../services/theme.service';
import { WordService } from '../../services/word.service';
import { Board } from '../board/board';
import {
  DE_LETTERS,
  EN_LETTERS,
  Keyboard,
  TR_KEY_POSITIONS,
  TR_LETTERS,
} from '../keyboard/keyboard';
import { ResultModal } from '../result-modal/result-modal';
import { StatsModal } from '../stats-modal/stats-modal';
import { Toast } from '../toast/toast';

/** Oyun ekranı: başlık çubuğu + uyarı + tahta + klavye + sonuç/istatistik ekranı. */
@Component({
  selector: 'app-game',
  imports: [Board, Keyboard, ResultModal, StatsModal, Toast],
  templateUrl: './game.html',
  styleUrl: './game.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Game {
  protected readonly game = inject(GameService);
  protected readonly i18n = inject(LanguageService);
  protected readonly hint = inject(HintService);
  protected readonly theme = inject(ThemeService);
  protected readonly contrast = inject(ContrastService);
  private readonly audio = inject(AudioService);
  protected readonly gold = inject(GoldService);
  private readonly aiHint = inject(AiHintService);
  private readonly aiBehavior = inject(AiBehaviorService);
  private readonly stats = inject(StatsService);
  private readonly words = inject(WordService); // yerel ipucu aday havuzu

  /** 💡 İpucu açıldı mı (statik ipucu kartı; her yeni oyunda sıfırlanır). */
  protected readonly hintShown = signal(false);

  // 🆘 "Takıldım" — çalışma zamanı YZ ipucu (rooms-server üzerinden, altınla).
  // Maliyet + oyun başına hak PANELDEN ayarlanabilir (aiBehavior); sunucu yoksa
  // gömülü varsayılan (20 altın / 2 hak). Her okuma anlıktır → yeni ayar hemen geçer.
  protected get HINT_COST(): number {
    return this.aiBehavior.hint().goldCost;
  }
  private get HINT_MAX_PER_GAME(): number {
    return this.aiBehavior.hint().perGame;
  }
  protected readonly aiHintText = signal('');
  protected readonly aiHintLoading = signal(false);
  protected readonly aiHintError = signal('');
  protected readonly aiHintsUsedGame = signal(0);

  /**
   * "Takıldım" butonu görünsün mü? 4. tahminden sonra, tek kişilik modda.
   * Sunucu YZ ipucu (LLM) AÇIKSA onu, DEĞİLSE ücretsiz yerel (kural-tabanlı)
   * ipucu kullanılır → özellik her zaman çalışır (API anahtarı olmasa da).
   */
  protected stuckAvailable(): boolean {
    return (
      this.aiBehavior.hint().enabled && // panelden ipucu koçu kapatılabilir
      !this.game.isOver() &&
      !this.isRoom() &&
      this.mode() !== 'vsai' &&
      this.game.rowIndex() >= 4 &&
      this.aiHintsUsedGame() < this.HINT_MAX_PER_GAME
    );
  }

  /**
   * İpucu iste: altınla öde. Sunucu YZ ipucu AÇIKSA (anahtar tanımlı) ondan
   * kişisel LLM ipucu alınır; DEĞİLSE ücretsiz YEREL ipucu anında hesaplanır
   * (tahminlerden aday süzme + strateji). Hata olursa altın İADE edilir.
   */
  protected async askStuck(): Promise<void> {
    if (this.aiHintLoading() || !this.stuckAvailable()) return;
    if (!this.gold.spend(this.HINT_COST)) {
      this.aiHintError.set(this.i18n.t('stuck.noGold'));
      return;
    }
    this.aiHintLoading.set(true);
    this.aiHintError.set('');
    this.aiHintText.set('');
    try {
      let hint: string;
      if (this.aiHint.available()) {
        // Sunucu YZ ipucu (LLM, kişisel) — anahtar tanımlıysa
        const guesses = this.game.guesses().map((g) => ({
          word: g.word,
          pattern: g.tiles
            .map((t) => (t.state === 'correct' ? '2' : t.state === 'present' ? '1' : '0'))
            .join(''),
        }));
        hint = await this.aiHint.requestHint({
          length: this.game.wordLength(),
          guesses,
          answer: this.game.answer(),
        });
      } else {
        // Ücretsiz yerel ipucu (LLM yok) — anında, cevabı ele vermeden
        hint = localHint({
          answer: this.game.answer(),
          guesses: this.game.guesses().map((g) => g.word),
          pool: this.words.answersOfLength(this.game.wordLength()),
          lang: this.i18n.lang(),
        });
      }
      this.aiHintText.set(hint);
      this.aiHintsUsedGame.update((n) => n + 1);
      this.stats.recordAiHint();
      this.announcement.set(hint); // ekran okuyucu da duysun
    } catch {
      this.gold.earn(this.HINT_COST); // ipucu gelmedi → ödenen altını geri ver
      this.aiHintError.set(this.i18n.t('stuck.error'));
    } finally {
      this.aiHintLoading.set(false);
    }
  }

  /** Yeni kelimede "Takıldım" durumunu temizle. */
  private resetStuck(): void {
    this.aiHintText.set('');
    this.aiHintError.set('');
    this.aiHintsUsedGame.set(0);
    this.aiHintLoading.set(false);
  }

  readonly mode = input.required<GameMode>();
  readonly exit = output<void>();

  /** Tema modu: seçilen temanın kimliği (verilmişse o temadan kelime oynanır). */
  readonly themeId = input<string | undefined>(undefined);
  /** Oda modu: kelime sunucudan gelir (verilmişse günlük/serbest yerine bu oynanır). */
  readonly roomAnswer = input<string | undefined>(undefined);
  /** Oda süre sınırı (saniye); 0 = serbest. */
  readonly roomTimeLimit = input<number>(0);
  /** Oda oyunu bitti — sonuç (RoomScreen sunucuya iletir). */
  readonly finished = output<{ solved: boolean; attempts: number; timeMs: number }>();
  /** Her KABUL EDİLEN oyuncu tahmininden sonra (sıra tabanlı YZ yarışı bunu dinler). */
  readonly guessed = output<{ attempts: number; solved: boolean; over: boolean }>();
  /** Dışarıdan giriş kilidi — YZ yarışında BOTUN sırasında true (oyuncu yazamaz). */
  readonly inputLocked = input<boolean>(false);

  /** Oda modunda mıyız? */
  protected isRoom(): boolean {
    return !!this.roomAnswer();
  }

  /** Süre sayacı — kalan saniye (oda modunda, süre sınırı varsa gösterilir). */
  protected readonly remaining = signal(0);
  private roomStart = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private reported = false;

  /** Oyun bitse bile kullanıcı sonucu kapatıp tahtayı inceleyebilir. */
  protected readonly resultOpen = signal(true);

  /** 📊 ile istenildiği an açılan istatistik ekranı. */
  protected readonly statsOpen = signal(false);

  /**
   * Ekran okuyucuya duyurulacak metin (görsel olarak gizli, aria-live).
   * Her tahminden sonra sonucu, oyun bitince kazanma/kaybetmeyi okur.
   */
  protected readonly announcement = signal('');

  /**
   * Kutular çevrilirken giriş KİLİTLİ.
   *
   * Neden: ENTER'a hızlıca iki kez basınca ikinci basış boş satırı
   * onaylamaya çalışıyor ve "5 harf girin" uyarısı çıkıyordu. Ayrıca
   * animasyon sürerken yazılan harfler yarım açılmış kutuların üstüne
   * biniyordu. Kilit, açılma bitene kadar girişi durdurur.
   */
  private readonly locked = signal(false);
  private lockTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.hintShown.set(false); // yeni oyun → ipucu kapalı başlar
    this.resetStuck();
    const answer = this.roomAnswer();
    if (answer) {
      // Oda/YZ yarışı: verilen kelimeyle sıfırdan başla (mod korunur → istatistik/altın/görev doğru işler).
      this.game.startRoom(answer, this.mode());
      this.roomStart = performance.now();
      this.resultOpen.set(false);
      if (this.roomTimeLimit() > 0) this.startTimer();
      return;
    }
    if (this.mode() === 'theme' && this.themeId()) {
      // Tema modu: seçilen temadan kelime, sıfırdan başla (kaydedilmez).
      this.game.startTheme(this.themeId()!);
      this.resultOpen.set(false);
      return;
    }
    this.game.start(this.mode());
    this.resultOpen.set(this.game.isOver());
  }

  ngOnDestroy(): void {
    if (this.lockTimer) clearTimeout(this.lockTimer);
    this.stopTimer();
  }

  /** Süre sayacını başlat — süre dolunca oyun kayıpla biter. */
  private startTimer(): void {
    this.remaining.set(this.roomTimeLimit());
    this.timer = setInterval(() => {
      this.remaining.update((s) => s - 1);
      if (this.remaining() <= 0) {
        this.stopTimer();
        if (!this.game.isOver()) this.game.timeout();
        this.reportRoomResult();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Oda sonucunu TEK KEZ üst bileşene bildir. */
  private reportRoomResult(): void {
    if (this.reported) return;
    this.reported = true;
    this.stopTimer();
    this.finished.emit({
      solved: this.game.status() === 'won',
      attempts: this.game.rowIndex(),
      timeMs: Math.round(performance.now() - this.roomStart),
    });
  }

  /** Kalan süre "1:05" biçiminde. */
  protected clock(): string {
    const s = Math.max(0, this.remaining());
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Kutuların açılma animasyonu ne kadar sürüyor. */
  private revealMs(): number {
    // Hareket azaltma açıksa animasyon anlık → kilitlemeye gerek yok
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return 0;

    // Son kutu: (harf-1) × 90ms gecikme + 550ms çevirme + 40ms pay. Kelime 4-7 harf
    // olduğu için SABİT değil uzunluğa bağlı — yoksa 6-7 harfte kutular bitmeden
    // modal/ses gelir. 5 harf → 4×90+590 = 950 (eski sabit değerle aynı).
    return (this.game.wordLength() - 1) * 90 + 590;
  }

  private lockInput(): void {
    const ms = this.revealMs();
    if (ms === 0) return;

    this.locked.set(true);
    if (this.lockTimer) clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => this.locked.set(false), ms);
  }

  // --- Giriş (ekran klavyesi ve fiziksel klavye buradan geçer) ---

  protected onLetter(letter: string): void {
    if (this.locked() || this.inputLocked()) return;
    const before = this.game.currentGuess();
    this.game.type(letter);
    // Satır zaten doluysa harf eklenmez → ses de çıkmasın (yanlış geri bildirim olur)
    if (this.game.currentGuess() !== before) this.audio.sfx('key');
  }

  protected onBackspace(): void {
    if (this.locked() || this.inputLocked()) return;
    const before = this.game.currentGuess();
    this.game.backspace();
    if (this.game.currentGuess() !== before) this.audio.sfx('delete');
  }

  /** Fiziksel klavye desteği (masaüstü). */
  @HostListener('window:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Escape: açık pencereyi kapat (klavyeyle oynanabilirlik)
    if (e.key === 'Escape') {
      if (this.statsOpen()) {
        this.statsOpen.set(false);
        e.preventDefault();
      } else if (this.resultOpen()) {
        this.resultOpen.set(false);
        e.preventDefault();
      }
      return;
    }

    // Pencere açıkken oyuna harf yazılmasın
    if (this.statsOpen() || this.resultOpen()) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      this.onEnter();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.onBackspace();
      return;
    }

    // 1) Tuşun kendisi doğru harfi verir (aktif dilin harf setine göre süz).
    const lang = this.i18n.lang();
    const letters = lang === 'en' ? EN_LETTERS : lang === 'de' ? DE_LETTERS : TR_LETTERS;
    const ch = this.i18n.upper(e.key);
    if ([...ch].length === 1 && letters.has(ch)) {
      e.preventDefault();
      this.onLetter(ch);
      return;
    }

    // 2) TÜRKÇE modda, Türkçe olmayan fiziksel klavyeler için KONUMA bak.
    //    US klavyede ';' tuşu Türkçe düzende Ş'nin yerindedir → Ş yaz.
    //    (İngilizce/Almanca modda gerek yok — harfler zaten event.key ile gelir.)
    if (lang === 'tr') {
      const byPosition = TR_KEY_POSITIONS[e.code];
      if (byPosition) {
        e.preventDefault();
        this.onLetter(byPosition);
      }
    }
  }

  protected onEnter(): void {
    if (this.locked() || this.inputLocked()) return; // çift onaylamayı / bot sırasını engelle

    const before = this.game.rowIndex();
    this.game.submit();
    const after = this.game.rowIndex();

    if (after > before) {
      // Tahmin kabul edildi → açılma bitene kadar girişi kilitle
      this.lockInput();

      const guess = this.game.guesses()[after - 1];
      this.announcement.set(guessAnnouncement(guess, after, this.i18n.lang()));

      // Kutular sırayla açılırken her kutuda bir tık — görsel ritimle aynı gecikme
      this.audio.revealSequence(this.game.wordLength(), 90);

      // 🤖 Sıra tabanlı YZ yarışı: her kabul edilen tahmini üst bileşene bildir.
      this.guessed.emit({
        attempts: after,
        solved: this.game.status() === 'won',
        over: this.game.isOver(),
      });
    } else if (this.game.message()) {
      // Reddedildi → uyarıyı duyur (toast zaten aria-live)
      this.announcement.set(this.game.message());
      this.audio.sfx('invalid');
    }

    if (this.game.isOver()) {
      const won = this.game.status() === 'won';
      // Açılma animasyonu bitince (uzunluğa göre) — kutu tıklarının/çevirmenin üstüne binmesin
      const reveal = this.revealMs();
      setTimeout(() => this.audio.sfx(won ? 'win' : 'lose'), reveal);

      setTimeout(() => {
        this.announcement.set(resultAnnouncement(won, after, this.game.answer(), this.i18n.lang()));
        // Oda → üst bileşene bildir (lider tablosu). YZ yarışı → sonucu VsaiScreen
        // 'guessed' akışıyla yönetir (burada sonuç ekranı AÇILMAZ). Diğer modlar → sonuç modalı.
        if (this.mode() === 'room') this.reportRoomResult();
        else if (this.mode() !== 'vsai') this.resultOpen.set(true);
      }, reveal); // açılma animasyonu bitsin
    }
  }

  /**
   * "Tekrar oyna" → her zaman TEMİZ ve YENİ bir kelimeyle başlar.
   *
   * Not: günlük modda reset yapmak aynı kelimeyi geri getirirdi (günün kelimesi
   * tarihe bağlı). Bu yüzden tekrar oynarken serbest moda geçiyoruz.
   */
  protected newGame(): void {
    this.game.reset('practice');
    this.resultOpen.set(false);
    this.hintShown.set(false); // yeni kelime → ipucu tekrar kapalı
    this.resetStuck();
    this.announcement.set(this.i18n.t('game.newGameStarted'));
  }
}
