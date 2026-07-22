import { computed, Injectable, inject, signal } from '@angular/core';
import {
  GameMode,
  GameStatus,
  Guess,
  LetterState,
  MAX_ATTEMPTS,
  SavedGame,
  Tile,
  WORD_LENGTH,
} from '../models/game.model';
import { evaluateGuess, keyStatesFrom } from '../core/evaluate';
import { goldForGame, levelBonus } from '../core/gold';
import { buildShareText } from '../core/share';
import { GoldService } from './gold.service';
import { LanguageService } from './language.service';
import { LeagueService } from './league.service';
import { QuestService } from './quest.service';
import { StatsService } from './stats.service';
import { WordService } from './word.service';

const SAVE_KEY = 'kelimebaz:game';

/**
 * Oyun durumu (signals) + akış.
 * Renk mantığı burada DEĞİL — saf çekirdekte: core/evaluate.ts
 */
@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly wordService = inject(WordService);
  private readonly stats = inject(StatsService);
  private readonly gold = inject(GoldService);
  private readonly quests = inject(QuestService);
  private readonly league = inject(LeagueService);
  private readonly lang = inject(LanguageService);

  // --- Durum (signals) ---
  private readonly _answer = signal('');
  private readonly _guesses = signal<string[]>([]);
  private readonly _current = signal('');
  private readonly _status = signal<GameStatus>('playing');
  private readonly _mode = signal<GameMode>('daily');
  private readonly _invalidShake = signal(0); // her geçersiz denemede artar → animasyon tetikler
  private readonly _message = signal('');

  /** Bu oyunda kazanılan TOPLAM altın (oyun + seviye + görevler) — sonuç ekranı gösterir. */
  private readonly _goldEarned = signal(0);
  /** Bunun ne kadarı günlük görevlerden geldi. */
  private readonly _questGold = signal(0);
  /** Bunun ne kadarı SEVİYE ödülünden geldi (kademeli bonus). */
  private readonly _levelGold = signal(0);
  /** Bu maçta kazanılan/kaybedilen LP (lig puanı) — sonuç ekranı gösterir. */
  private readonly _lpDelta = signal(0);

  readonly answer = this._answer.asReadonly();
  readonly status = this._status.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly invalidShake = this._invalidShake.asReadonly();
  readonly message = this._message.asReadonly();
  readonly currentGuess = this._current.asReadonly();
  readonly goldEarned = this._goldEarned.asReadonly();
  readonly questGold = this._questGold.asReadonly();
  readonly levelGold = this._levelGold.asReadonly();
  readonly lpDelta = this._lpDelta.asReadonly();

  /** Bu oyunun kelime uzunluğu (4-7) — cevabın harf sayısından türetilir. */
  readonly wordLength = computed(() => {
    const n = [...this._answer()].length;
    return n > 0 ? n : WORD_LENGTH;
  });

  /** Değerlendirilmiş tahmin satırları. */
  readonly guesses = computed<Guess[]>(() =>
    this._guesses().map((word) => ({
      word,
      tiles: this.toTiles(word, evaluateGuess(word, this._answer())),
    })),
  );

  /** Tahtanın tamamı: geçmiş tahminler + yazılmakta olan satır + boş satırlar. */
  readonly board = computed<Tile[][]>(() => {
    const rows: Tile[][] = this.guesses().map((g) => g.tiles);

    const cols = this.wordLength();

    if (this._status() === 'playing' && rows.length < MAX_ATTEMPTS) {
      const typed = [...this._current()];
      rows.push(
        Array.from({ length: cols }, (_, i) => ({
          letter: typed[i] ?? '',
          state: 'empty' as LetterState,
        })),
      );
    }

    while (rows.length < MAX_ATTEMPTS) {
      rows.push(
        Array.from({ length: cols }, () => ({ letter: '', state: 'empty' as LetterState })),
      );
    }
    return rows;
  });

  /** Klavyedeki her harfin bilinen EN GÜÇLÜ durumu (yeşil asla geriye gitmez). */
  readonly keyStates = computed<Record<string, LetterState>>(() => keyStatesFrom(this.guesses()));

  /** Kaçıncı satırdayız (animasyon gecikmeleri için). */
  readonly rowIndex = computed(() => this._guesses().length);

  readonly isOver = computed(() => this._status() !== 'playing');

  // --- Oyun akışı ---

  /** Yeni oyun başlat (o modun kayıtlı oyunu varsa onu sürdürür). */
  start(mode: GameMode): void {
    this._mode.set(mode);
    // Bu oyunun altın sayacı sıfırdan başlar — yoksa kaydedilmiş bir oyunu
    // açınca ÖNCEKİ oyunun kazancı sonuç ekranında tekrar görünürdü.
    this._goldEarned.set(0);
    this._questGold.set(0);
    this._levelGold.set(0);
    this._lpDelta.set(0);
    this.quests.refresh(); // gün dönmüşse görevler tazelensin

    const saved = this.load(mode);

    if (saved && this.isSameSession(saved, mode)) {
      this._answer.set(saved.answer);
      this._guesses.set(saved.guesses);
      this._status.set(saved.status);
      this._current.set('');
      this.clearMessage();
      return;
    }

    this.reset(mode);
  }

  /**
   * Çok oyunculu oda oyununu başlat — kelime SUNUCUDAN gelir (seed → kelime).
   *
   * Günlük/serbest akışından ayrıdır: kayıtlı oyun YÜKLENMEZ (her oda oyunu
   * sıfırdan ve sunucunun verdiği kelimeyle başlar), localStorage'a da yazılmaz.
   */
  startRoom(answer: string, mode: GameMode = 'room'): void {
    this._mode.set(mode);
    this._goldEarned.set(0);
    this._questGold.set(0);
    this._levelGold.set(0);
    this._lpDelta.set(0);
    this._answer.set(this.lang.upper(answer));
    this._guesses.set([]);
    this._current.set('');
    this._status.set('playing');
    this.clearMessage();
  }

  /**
   * Süre doldu — oda oyununu kayıp olarak bitirir (yalnızca oynanıyorsa).
   * Sonuç sunucuya bildirilecek; istatistik/altın normal akıştaki gibi işlenir.
   */
  timeout(): void {
    if (this.isOver()) return;
    this._status.set('lost');
    this.endGame(false, Math.max(1, this._guesses().length));
  }

  /** Sıfırdan yeni oyun. */
  reset(mode: GameMode = this._mode()): void {
    this._mode.set(mode);
    this._answer.set(
      mode === 'daily'
        ? this.wordService.wordOfTheDay()
        : this.wordService.randomWordForLevel(this.stats.level().level),
    );
    this._guesses.set([]);
    this._current.set('');
    this._status.set('playing');
    this.clearMessage();
    this.save();
  }

  /**
   * Bugünün günlük oyunu — oyunu BAŞLATMADAN durumunu okur.
   * Başlık ekranı "bugünkü kelimeyi çözdün mü" bilgisini buradan alır.
   */
  dailySnapshot(): SavedGame | null {
    const saved = this.load('daily');
    if (!saved || saved.dayIndex !== this.wordService.dayIndex()) return null;
    return saved;
  }

  /** Bugünün günlük bulmacası bitti mi? (bittiyse tekrar oynanamaz) */
  dailyDone(): boolean {
    const s = this.dailySnapshot();
    return !!s && s.status !== 'playing';
  }

  /** Harf yaz. */
  type(letter: string): void {
    if (this.isOver()) return;
    const cur = this._current();
    if ([...cur].length >= this.wordLength()) return;
    this._current.set(cur + this.lang.upper(letter));
    this.clearMessage();
  }

  /** Son harfi sil. */
  backspace(): void {
    if (this.isOver()) return;
    this._current.set([...this._current()].slice(0, -1).join(''));
    this.clearMessage();
  }

  /** Tahmini gönder. */
  submit(): void {
    if (this.isOver()) return;

    const guess = this._current();

    // Geçersiz tahminde satır KİLİTLENMEZ — uyarı verilir, oyuncu düzeltip tekrar dener.
    if ([...guess].length < this.wordLength()) {
      this.reject(this.lang.t('game.enterNLetters', { n: this.wordLength() }));
      return;
    }
    if (!this.wordService.isValid(guess)) {
      this.reject(this.lang.t('game.notInDict'));
      return;
    }

    const guesses = [...this._guesses(), guess];
    this._guesses.set(guesses);
    this._current.set('');
    this.clearMessage();

    if (guess === this._answer()) {
      this._status.set('won');
      this.endGame(true, guesses.length);
    } else if (guesses.length >= MAX_ATTEMPTS) {
      this._status.set('lost');
      this.endGame(false, guesses.length);
    }

    this.save();
  }

  /**
   * Oyun bitti — istatistik, altın ve günlük görevler TAM BİR KEZ işlenir.
   *
   * Altın üç kaynaktan gelir ve hepsi burada toplanır:
   *   1. Oyunun kendisi (kazanma + hız + günlük bonusu)
   *   2. SEVİYE ödülü — oyuncu seviyesi yükseldikçe artar (kademeli)
   *   3. O hamlede tamamlanan günlük görevler
   * Sonuç ekranı bu toplamı gösterir.
   */
  private endGame(won: boolean, attempts: number): void {
    const isDaily = this._mode() === 'daily';

    // Seviye ödülü, bu oyunun puanı EKLENMEDEN önceki seviyeyle hesaplanır:
    // oyuncu bu oyuna hangi seviyeyle girdiyse onun ödülünü hak eder.
    const level = this.stats.level().level;

    this.stats.record(won, attempts);

    const fromGame = goldForGame(won, attempts, isDaily, level);
    this.gold.earn(fromGame);

    const fromQuests = this.quests.recordGame(won, attempts, isDaily);

    this._goldEarned.set(fromGame + fromQuests);
    this._questGold.set(fromQuests);
    this._levelGold.set(won ? levelBonus(level) : 0);

    // 🏆 Lig puanı (LP): kazan → +LP, kaybet → -LP. Değişimi sonuç ekranı gösterir.
    // YZ modu CASUAL — ligi (rekabetçi merdiven) etkilemez.
    const m = this._mode();
    this._lpDelta.set(m === 'vsai' ? 0 : this.league.recordResult(won, attempts, m));
  }

  /** Sonucu emoji ızgarası olarak paylaş metnine çevirir (harf içermez). */
  shareText(): string {
    return buildShareText({
      mode: this._mode(),
      dayIndex: this.wordService.dayIndex(),
      status: this._status(),
      attempts: this._guesses().length,
      maxAttempts: MAX_ATTEMPTS,
      guesses: this.guesses(),
    });
  }

  // --- Yardımcılar ---

  /** Uyarı kaç ms sonra kendiliğinden kaybolur. */
  private static readonly MESSAGE_MS = 2000;
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  /** Tahmini reddet: uyarı göster + satırı salla. Satır KİLİTLENMEZ. */
  private reject(msg: string): void {
    this._message.set(msg);
    this._invalidShake.update((n) => n + 1);

    // Birkaç saniye sonra uyarı kendiliğinden kaybolsun
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this._message.set(''), GameService.MESSAGE_MS);
  }

  /** Uyarıyı hemen kaldır (oyuncu yazmaya devam edince). */
  private clearMessage(): void {
    if (this.msgTimer) {
      clearTimeout(this.msgTimer);
      this.msgTimer = null;
    }
    this._message.set('');
  }

  private toTiles(word: string, states: LetterState[]): Tile[] {
    return [...word].map((letter, i) => ({ letter, state: states[i] }));
  }

  private isSameSession(saved: SavedGame, mode: GameMode): boolean {
    if (mode !== 'daily') return true; // serbest oyun her zaman sürdürülebilir
    return saved.dayIndex === this.wordService.dayIndex(); // günlük oyun her gün sıfırlanır
  }

  /**
   * Her modun KENDİ kaydı vardır.
   *
   * Neden: tek anahtar kullanılsaydı, günlük bulmacayı bitirip serbest oyuna
   * geçmek günlük kaydı EZERDİ. Sonra günlük moda dönünce oyun sıfırdan
   * başlar ve aynı kelime tekrar oynanabilirdi — "günde tek oyun" kuralı kırılırdı.
   */
  private key(mode: GameMode): string {
    return `${SAVE_KEY}:${mode}`;
  }

  private save(): void {
    const mode = this._mode();
    if (mode === 'room' || mode === 'vsai') return; // oda ve YZ oyunları geçicidir, diske yazılmaz

    const data: SavedGame = {
      mode,
      dayIndex: mode === 'daily' ? this.wordService.dayIndex() : -1,
      answer: this._answer(),
      guesses: this._guesses(),
      status: this._status(),
      lang: this.lang.lang(),
    };
    try {
      localStorage.setItem(this.key(mode), JSON.stringify(data));
    } catch {
      /* depolama kapalıysa sessizce geç */
    }
  }

  private load(mode: GameMode): SavedGame | null {
    try {
      const raw = localStorage.getItem(this.key(mode));
      if (!raw) return null;
      const saved = JSON.parse(raw) as SavedGame;
      if (saved.mode !== mode) return null;
      // Dil değiştiyse eski dildeki oyun sürdürülmez → taze (yeni dilde) başlar.
      if ((saved.lang ?? 'tr') !== this.lang.lang()) return null;
      return saved;
    } catch {
      return null;
    }
  }
}
