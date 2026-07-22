/**
 * ===========================================================================
 * LİG SİSTEMİ — saf mantık (LP, ligler, sezon ödülleri). Signal/DOM yok, test edilebilir.
 *
 * Oyuncu maç kazandıkça LP kazanır, kaybettikçe kaybeder; LP eşiklerine göre
 * Bronz → Usta ligleri arasında yükselir/düşer. Her sezon sonunda ulaşılan lige
 * göre ödül (altın + üst liglerde tema/rozet) verilir ve yeni sezon başlar.
 * ===========================================================================
 */

export type TierId = 'bronz' | 'gumus' | 'altin' | 'platin' | 'elmas' | 'usta';

export interface Tier {
  id: TierId;
  name: string;
  /** Bu lige giriş LP'si. */
  min: number;
  /** Bir sonraki lige geçiş LP'si (Usta = Infinity). */
  max: number;
  icon: string;
  /** Vurgu rengi (CSS). */
  color: string;
}

/** Ligler — LP eşiklerine göre ARTAN sırada. */
export const TIERS: readonly Tier[] = [
  { id: 'bronz', name: 'Bronz', min: 0, max: 300, icon: '🥉', color: '#cd7f43' },
  { id: 'gumus', name: 'Gümüş', min: 300, max: 600, icon: '🥈', color: '#aab6c4' },
  { id: 'altin', name: 'Altın', min: 600, max: 900, icon: '🥇', color: '#e8b923' },
  { id: 'platin', name: 'Platin', min: 900, max: 1200, icon: '💠', color: '#2ec4b6' },
  { id: 'elmas', name: 'Elmas', min: 1200, max: 1500, icon: '💎', color: '#4aa3ff' },
  { id: 'usta', name: 'Usta', min: 1500, max: Infinity, icon: '👑', color: '#c084fc' },
];

/** LP → içinde bulunulan lig. */
export function tierForLp(lp: number): Tier {
  const p = Math.max(0, lp);
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (p >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

/** Lig içindeki ilerleme 0..1 (bir sonraki lige ne kadar kaldı; Usta = 1). */
export function tierProgress(lp: number): number {
  const t = tierForLp(lp);
  if (!Number.isFinite(t.max)) return 1;
  return Math.max(0, Math.min(1, (lp - t.min) / (t.max - t.min)));
}

export type LeagueMode = 'daily' | 'practice' | 'room';

/**
 * Bir maç sonucunda LP değişimi (Bronz koruması UYGULANMADAN — o serviste).
 * Kazanınca az tahminle daha çok kazanılır; serbest mod biraz daha az verir
 * (sınırsız oynanabildiği için puan çiftliği önlenir).
 */
export function lpForResult(won: boolean, attempts: number, mode: LeagueMode): number {
  if (won) {
    const base = mode === 'practice' ? 14 : 24;
    const a = Math.max(1, Math.min(6, Math.floor(attempts) || 6));
    return base + (7 - a) * 2; // 1 tahmin → +12 bonus, 6 tahmin → +2
  }
  return mode === 'practice' ? -12 : -16;
}

/** Sezon süresi. */
export const SEASON_DAYS = 14;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SEASON_MS = SEASON_DAYS * DAY_MS;

export interface SeasonReward {
  gold: number;
  /** Envanterde grant edilecek rozet (opsiyonel). */
  badgeId?: string;
  /** Envanterde grant edilecek tema (opsiyonel). */
  themeId?: string;
  /** Ödül özeti (ekranda gösterilir). */
  label: string;
}

/** Sezon sonu ödülü — ulaşılan en yüksek lige göre. */
export function seasonReward(tierId: TierId): SeasonReward {
  switch (tierId) {
    case 'usta':
      return { gold: 750, themeId: 'theme.champion', badgeId: 'badge.league', label: '750 altın · Şampiyon teması · Lig rozeti' };
    case 'elmas':
      return { gold: 480, themeId: 'theme.champion', badgeId: 'badge.league', label: '480 altın · Şampiyon teması · Lig rozeti' };
    case 'platin':
      return { gold: 320, badgeId: 'badge.league', label: '320 altın · Lig rozeti' };
    case 'altin':
      return { gold: 200, badgeId: 'badge.league', label: '200 altın · Lig rozeti' };
    case 'gumus':
      return { gold: 120, label: '120 altın' };
    default:
      return { gold: 60, label: '60 altın' };
  }
}

/** Yeni sezon başlangıç LP'si — final LP'nin bir kısmı taşınır (yumuşak sıfırlama). */
export function softResetLp(finalLp: number): number {
  return Math.max(0, Math.round(Math.max(0, finalLp) * 0.35));
}
