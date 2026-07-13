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
import { trUpper } from '../core/turkish';
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

  // --- Durum (signals) ---
  private readonly _answer = signal('');
  private readonly _guesses = signal<string[]>([]);
  private readonly _current = signal('');
  private readonly _status = signal<GameStatus>('playing');
  private readonly _mode = signal<GameMode>('daily');
  private readonly _invalidShake = signal(0); // her geçersiz denemede artar → animasyon tetikler
  private readonly _message = signal('');

  readonly answer = this._answer.asReadonly();
  readonly status = this._status.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly invalidShake = this._invalidShake.asReadonly();
  readonly message = this._message.asReadonly();
  readonly currentGuess = this._current.asReadonly();

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

    if (this._status() === 'playing' && rows.length < MAX_ATTEMPTS) {
      const typed = [...this._current()];
      rows.push(
        Array.from({ length: WORD_LENGTH }, (_, i) => ({
          letter: typed[i] ?? '',
          state: 'empty' as LetterState,
        })),
      );
    }

    while (rows.length < MAX_ATTEMPTS) {
      rows.push(
        Array.from({ length: WORD_LENGTH }, () => ({ letter: '', state: 'empty' as LetterState })),
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

  /** Yeni oyun başlat (kayıtlı oyun varsa onu sürdürür). */
  start(mode: GameMode): void {
    this._mode.set(mode);
    const saved = this.load();

    if (saved && saved.mode === mode && this.isSameSession(saved, mode)) {
      this._answer.set(saved.answer);
      this._guesses.set(saved.guesses);
      this._status.set(saved.status);
      this._current.set('');
      this._message.set('');
      return;
    }

    this.reset(mode);
  }

  /** Sıfırdan yeni oyun (serbest modda "tekrar oyna"). */
  reset(mode: GameMode = this._mode()): void {
    this._mode.set(mode);
    this._answer.set(
      mode === 'daily' ? this.wordService.wordOfTheDay() : this.wordService.randomWord(),
    );
    this._guesses.set([]);
    this._current.set('');
    this._status.set('playing');
    this._message.set('');
    this.save();
  }

  /** Harf yaz. */
  type(letter: string): void {
    if (this.isOver()) return;
    const cur = this._current();
    if ([...cur].length >= WORD_LENGTH) return;
    this._current.set(cur + trUpper(letter));
    this._message.set('');
  }

  /** Son harfi sil. */
  backspace(): void {
    if (this.isOver()) return;
    this._current.set([...this._current()].slice(0, -1).join(''));
    this._message.set('');
  }

  /** Tahmini gönder. */
  submit(): void {
    if (this.isOver()) return;

    const guess = this._current();
    if ([...guess].length < WORD_LENGTH) {
      this.reject('Yeterli harf yok');
      return;
    }
    if (!this.wordService.isValid(guess)) {
      this.reject('Kelime listede yok');
      return;
    }

    const guesses = [...this._guesses(), guess];
    this._guesses.set(guesses);
    this._current.set('');
    this._message.set('');

    if (guess === this._answer()) {
      this._status.set('won');
      this.stats.record(true, guesses.length);
    } else if (guesses.length >= MAX_ATTEMPTS) {
      this._status.set('lost');
      this.stats.record(false, guesses.length);
    }

    this.save();
  }

  /** Sonucu emoji ızgarası olarak paylaş metnine çevirir. */
  shareText(): string {
    const head =
      this._mode() === 'daily'
        ? `Kelimebaz #${this.wordService.dayIndex()}`
        : 'Kelimebaz (serbest)';
    const score = this._status() === 'won' ? `${this._guesses().length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
    const grid = this.guesses()
      .map((g) => g.tiles.map((t) => this.emoji(t.state)).join(''))
      .join('\n');
    return `${head} ${score}\n\n${grid}`;
  }

  // --- Yardımcılar ---

  private emoji(s: LetterState): string {
    return s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬜';
  }

  private reject(msg: string): void {
    this._message.set(msg);
    this._invalidShake.update((n) => n + 1);
  }

  private toTiles(word: string, states: LetterState[]): Tile[] {
    return [...word].map((letter, i) => ({ letter, state: states[i] }));
  }

  private isSameSession(saved: SavedGame, mode: GameMode): boolean {
    if (mode !== 'daily') return true; // serbest oyun her zaman sürdürülebilir
    return saved.dayIndex === this.wordService.dayIndex(); // günlük oyun her gün sıfırlanır
  }

  private save(): void {
    const data: SavedGame = {
      mode: this._mode(),
      dayIndex: this._mode() === 'daily' ? this.wordService.dayIndex() : -1,
      answer: this._answer(),
      guesses: this._guesses(),
      status: this._status(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* depolama kapalıysa sessizce geç */
    }
  }

  private load(): SavedGame | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as SavedGame) : null;
    } catch {
      return null;
    }
  }
}
