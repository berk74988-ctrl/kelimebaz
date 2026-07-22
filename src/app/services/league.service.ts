import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DAY_MS,
  LeagueMode,
  SEASON_MS,
  Tier,
  TierId,
  TIERS,
  lpForResult,
  seasonReward,
  softResetLp,
  tierForLp,
  tierProgress,
} from '../core/league';
import { GoldService } from './gold.service';
import { InventoryService } from './inventory.service';

const KEY = 'kelimebaz:league';

interface LeagueState {
  lp: number;
  season: number; // 1'den başlar
  seasonStart: number; // sezon başlangıç zamanı (ms)
  wins: number; // bu sezon kazanılan maç
  losses: number; // bu sezon kaybedilen maç
  peakLp: number; // bu sezon zirvesi
  history: number[]; // son maçların LP değişimleri (en yeni önde, ~12)
}

/** Sezon dolduğunda oluşan, oyuncunun talep etmesini bekleyen ödül. */
export interface PendingReward {
  season: number; // biten sezon numarası
  tierId: TierId;
  tierName: string;
  icon: string;
  gold: number;
  label: string;
  wins: number;
  losses: number;
  peakLp: number;
}

function nowMs(): number {
  return Date.now();
}

function emptyState(): LeagueState {
  return { lp: 0, season: 1, seasonStart: nowMs(), wins: 0, losses: 0, peakLp: 0, history: [] };
}

/**
 * ===========================================================================
 * LİG SERVİSİ — LP, lig, sezon durumu (localStorage: 'kelimebaz:league').
 *
 * Maç bitince GameService.recordResult() çağırır → LP güncellenir. Sezon süresi
 * dolunca sezon kapanır, ödül "beklemeye" alınır (oyuncu lig ekranından talep
 * eder) ve yeni sezon başlar (yumuşak LP sıfırlaması). Depolama deseni
 * GoldService ile aynı: signal + her mutasyonda kaydet.
 * ===========================================================================
 */
@Injectable({ providedIn: 'root' })
export class LeagueService {
  private readonly gold = inject(GoldService);
  private readonly inventory = inject(InventoryService);

  private readonly _state = signal<LeagueState>(this.load());
  private readonly _pending = signal<PendingReward | null>(null);

  readonly lp = computed(() => this._state().lp);
  readonly season = computed(() => this._state().season);
  readonly wins = computed(() => this._state().wins);
  readonly losses = computed(() => this._state().losses);
  readonly peakLp = computed(() => this._state().peakLp);
  readonly history = computed(() => this._state().history);
  readonly tier = computed<Tier>(() => tierForLp(this._state().lp));
  readonly progress = computed(() => tierProgress(this._state().lp));
  readonly pending = this._pending.asReadonly();
  readonly tiers = TIERS;

  /** Bir sonraki lige kalan LP (Usta ise 0). */
  readonly toNextTier = computed(() => {
    const t = this.tier();
    return Number.isFinite(t.max) ? Math.max(0, t.max - this._state().lp) : 0;
  });

  /** Sezon bitişine kalan gün. */
  readonly daysLeft = computed(() => {
    const left = this._state().seasonStart + SEASON_MS - nowMs();
    return Math.max(0, Math.ceil(left / DAY_MS));
  });

  constructor() {
    this.checkSeason();
  }

  /**
   * Bir maç sonucu işlenir — LP güncellenir (Bronz koruması dahil), sezon kontrol
   * edilir. Kazanılan/kaybedilen LP döndürülür (sonuç ekranı gösterir).
   */
  recordResult(won: boolean, attempts: number, mode: LeagueMode): number {
    this.checkSeason();
    const s = this._state();
    let delta = lpForResult(won, attempts, mode);
    // Bronz koruması: en alt ligde kayıp yarıya iner (yeni oyuncu cesareti kırılmasın)
    if (!won && s.lp < TIERS[1].min) delta = Math.round(delta / 2);
    const lp = Math.max(0, s.lp + delta);
    const effective = lp - s.lp; // taban 0'a çarpınca gerçek değişim
    this.commit({
      ...s,
      lp,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
      peakLp: Math.max(s.peakLp, lp),
      history: [effective, ...s.history].slice(0, 12),
    });
    return effective;
  }

  /** Sezon süresi dolduysa: sezonu kapat, ödülü beklemeye al, yeni sezon başlat. */
  checkSeason(): void {
    const s = this._state();
    if (nowMs() - s.seasonStart < SEASON_MS) return;
    const t = tierForLp(s.lp);
    const rw = seasonReward(t.id);
    this._pending.set({
      season: s.season,
      tierId: t.id,
      tierName: t.name,
      icon: t.icon,
      gold: rw.gold,
      label: rw.label,
      wins: s.wins,
      losses: s.losses,
      peakLp: s.peakLp,
    });
    const reset = softResetLp(s.lp);
    this.commit({
      lp: reset,
      season: s.season + 1,
      seasonStart: nowMs(),
      wins: 0,
      losses: 0,
      peakLp: reset,
      history: [],
    });
  }

  /** Bekleyen sezon ödülünü ver (altın + rozet/tema) ve bildirimi kapat. */
  claimPending(): void {
    const p = this._pending();
    if (!p) return;
    const rw = seasonReward(p.tierId);
    if (rw.gold > 0) this.gold.earn(rw.gold);
    if (rw.badgeId) this.inventory.grant(rw.badgeId, true); // rozeti kullanıma da al
    if (rw.themeId) this.inventory.grant(rw.themeId, false); // temayı yalnız aç (kullanıcı seçsin)
    this._pending.set(null);
  }

  // --- kalıcılık ---

  private commit(s: LeagueState): void {
    this._state.set(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* depolama kapalıysa sessizce geç */
    }
  }

  private load(): LeagueState {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyState();
      const p = JSON.parse(raw) as Partial<LeagueState>;
      const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
      return {
        lp: Math.max(0, num(p.lp)),
        season: Math.max(1, num(p.season, 1)),
        seasonStart: num(p.seasonStart, nowMs()),
        wins: Math.max(0, num(p.wins)),
        losses: Math.max(0, num(p.losses)),
        peakLp: Math.max(0, num(p.peakLp)),
        history: Array.isArray(p.history)
          ? p.history.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).slice(0, 12)
          : [],
      };
    } catch {
      return emptyState();
    }
  }
}
