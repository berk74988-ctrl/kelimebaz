import { Injectable, signal } from '@angular/core';
import { PlayRecord } from '../core/play-style';

const KEY = 'kelimebaz:playstyle';
const TRAINING_KEY = 'kelimebaz:training';
/** KAYAN PENCERE — yalnız son N maçın tahmin geçmişi tutulur (depolama sınırlı). */
const MAX_GAMES = 80;

/**
 * OYUN TARZI GEÇMİŞİ — analiz için son maçların tahminlerini saklar.
 *
 * Sayaçlardan (StatsService) farklı olarak burada HARF/DESEN düzeyinde veri
 * (cevap + tahmin edilen kelimeler) tutulur; içgörüleri core/play-style.ts
 * hesaplar. Kayan pencere (~80 maç × ~6 kelime) depolamayı ~10 KB'ta tutar.
 *
 * GİZLİLİK: yalnız localStorage — hiçbir veri dışarı gönderilmez.
 */
@Injectable({ providedIn: 'root' })
export class PlayStyleService {
  private readonly _games = signal<PlayRecord[]>(this.load());
  readonly games = this._games.asReadonly();

  /** ANTRENMAN: açıksa serbest modda zayıf harflere HAFİFÇE kayar (varsayılan KAPALI). */
  private readonly _training = signal<boolean>(this.loadTraining());
  readonly training = this._training.asReadonly();

  setTraining(on: boolean): void {
    this._training.set(on);
    try {
      localStorage.setItem(TRAINING_KEY, on ? '1' : '0');
    } catch {
      /* depolama kapalı */
    }
  }

  private loadTraining(): boolean {
    try {
      return localStorage.getItem(TRAINING_KEY) === '1';
    } catch {
      return false;
    }
  }

  /** Biten bir maçın tahminlerini ekle (kayan pencereyle sınırlı). */
  record(answer: string, guesses: string[]): void {
    if (!answer || !guesses.length) return;
    const next = [...this._games(), { answer, guesses }].slice(-MAX_GAMES);
    this._games.set(next);
    this.save(next);
  }

  reset(): void {
    this._games.set([]);
    this.save([]);
  }

  private load(): PlayRecord[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { games?: unknown };
      const games = Array.isArray(parsed.games) ? parsed.games : [];
      return games
        .filter(
          (g): g is PlayRecord =>
            !!g &&
            typeof (g as PlayRecord).answer === 'string' &&
            Array.isArray((g as PlayRecord).guesses),
        )
        .slice(-MAX_GAMES);
    } catch {
      return [];
    }
  }

  private save(games: PlayRecord[]): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, games }));
    } catch {
      /* depolama kapalı/kota — analiz özelliği sessizce devre dışı kalır */
    }
  }
}
