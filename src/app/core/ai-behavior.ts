/**
 * ===========================================================================
 * YZ DAVRANIŞ AYARLARI — sunucudan yönetilebilir rakip gücü + ipucu koçu.
 *
 * ŞEMA, rooms-server/ai-behavior.js ile AYNIDIR (parity). Sunucu geçersiz kılma
 * SUNSA BİLE istemci değeri aralığa SIKIŞTIRIR (mergeAiBehavior) → hatalı override
 * oyunu bozamaz. Sunucu erişilemezse GÖMÜLÜ VARSAYILAN kullanılır.
 *
 * KAPSAM (canlı tüketilen): karakter aç/kapa + ağırlık, uyarlanabilir zorluk
 * eşikleri, ipucu koçu. (Zorluk band/tempo grubu ölçüm/kalibrasyon referansıdır —
 * canlı oyun personas + adaptive üzerinden çalışır; AI_CONFIG doğrudan tüketilmez.)
 *
 * Bu dosya SAF (Angular yok) → doğrudan test edilebilir.
 * ===========================================================================
 */

export interface AiBehaviorParam {
  key: string;
  def: number;
  min: number;
  max: number;
  int: boolean;
}

// rooms-server/ai-behavior.js SPEC ile BİREBİR (key/def/min/max/int). Değişirse
// ikisi birlikte güncellenmeli (parity testi bunu doğrular).
export const AI_BEHAVIOR_SPEC: readonly AiBehaviorParam[] = [
  // Zorluk band + tempo (ölçüm referansı)
  { key: 'bandHardLo', def: 0, min: 0, max: 1, int: false },
  { key: 'bandHardHi', def: 0, min: 0, max: 1, int: false },
  { key: 'bandMedLo', def: 0.4, min: 0, max: 1, int: false },
  { key: 'bandMedHi', def: 0.65, min: 0, max: 1, int: false },
  { key: 'bandEasyLo', def: 0.85, min: 0, max: 1, int: false },
  { key: 'bandEasyHi', def: 1, min: 0, max: 1, int: false },
  { key: 'tempoHardMin', def: 1700, min: 200, max: 8000, int: true },
  { key: 'tempoHardMax', def: 2600, min: 200, max: 8000, int: true },
  { key: 'tempoMedMin', def: 2400, min: 200, max: 8000, int: true },
  { key: 'tempoMedMax', def: 3600, min: 200, max: 8000, int: true },
  { key: 'tempoEasyMin', def: 3200, min: 200, max: 8000, int: true },
  { key: 'tempoEasyMax', def: 5200, min: 200, max: 8000, int: true },
  // Karakterler: aç/kapa + ağırlık (CANLI)
  { key: 'pOnTemkinli', def: 1, min: 0, max: 1, int: true },
  { key: 'pOnUnlu', def: 1, min: 0, max: 1, int: true },
  { key: 'pOnHarfsayar', def: 1, min: 0, max: 1, int: true },
  { key: 'pOnKumarbaz', def: 1, min: 0, max: 1, int: true },
  { key: 'pwUnlu', def: 1.5, min: 0, max: 5, int: false },
  { key: 'pwHarfsayar', def: 2.5, min: 0, max: 5, int: false },
  { key: 'pgKumarbaz', def: 0.5, min: 0, max: 1, int: false },
  // Uyarlanabilir zorluk eşikleri (CANLI)
  { key: 'adaptStartPos', def: 0.45, min: 0, max: 1, int: false },
  { key: 'adaptStep', def: 0.15, min: 0.01, max: 1, int: false },
  { key: 'adaptChallenge', def: 0.2, min: 0, max: 2, int: false },
  { key: 'adaptAvgLo', def: 3.1, min: 1, max: 6, int: false },
  { key: 'adaptAvgHi', def: 4.46, min: 1, max: 7, int: false },
  { key: 'adaptWindow', def: 10, min: 1, max: 50, int: true },
  // İpucu koçu (CANLI)
  { key: 'hintPerGame', def: 2, min: 0, max: 10, int: true },
  { key: 'hintGoldCost', def: 20, min: 0, max: 500, int: true },
  { key: 'hintRlPerMin', def: 8, min: 1, max: 120, int: true },
  { key: 'hintOn', def: 1, min: 0, max: 1, int: true },
];

export type AiBehavior = Record<string, number>;

const SPEC_BY_KEY = new Map(AI_BEHAVIOR_SPEC.map((p) => [p.key, p]));

export const AI_BEHAVIOR_DEFAULTS: AiBehavior = Object.fromEntries(
  AI_BEHAVIOR_SPEC.map((p) => [p.key, p.def]),
);

/** Değeri şemaya göre aralığa sıkıştır (+ tam sayıysa yuvarla). Bilinmeyen → null. */
export function clampParam(key: string, value: number): number | null {
  const p = SPEC_BY_KEY.get(key);
  if (!p || typeof value !== 'number' || !Number.isFinite(value)) return null;
  const c = Math.max(p.min, Math.min(p.max, value));
  return p.int ? Math.round(c) : c;
}

/**
 * Sunucu override'larını varsayılanla birleştir + HER değeri aralığa sıkıştır.
 * İstemci güvenlik katmanı: bozuk/stale/kötü niyetli override oyunu bozamaz.
 */
export function mergeAiBehavior(overrides: Partial<AiBehavior> | null | undefined): AiBehavior {
  const out: AiBehavior = { ...AI_BEHAVIOR_DEFAULTS };
  if (overrides) {
    for (const p of AI_BEHAVIOR_SPEC) {
      const c = clampParam(p.key, overrides[p.key] as number);
      if (c != null) out[p.key] = c;
    }
  }
  return out;
}

// --- Türetme yardımcıları (birleştirilmiş değerlerden anlamlı config) ---

export type PersonaKnobId = 'temkinli' | 'unlu' | 'harfsayar' | 'kumarbaz';

const PERSONA_ON_KEY: Record<PersonaKnobId, string> = {
  temkinli: 'pOnTemkinli',
  unlu: 'pOnUnlu',
  harfsayar: 'pOnHarfsayar',
  kumarbaz: 'pOnKumarbaz',
};

/** Karakter panelden AÇIK mı? (varsayılan hepsi açık) */
export function personaEnabled(b: AiBehavior, id: string): boolean {
  const key = PERSONA_ON_KEY[id as PersonaKnobId];
  return key ? b[key] !== 0 : true; // 'adaptive' vb. bilinmeyen → açık
}

/**
 * Karakter config'ine uygulanacak override (yalnız ağırlık — band gömülü kalır).
 * unlu/harfsayar → biasWeight; kumarbaz → gamble. Diğerleri → boş.
 */
export function personaWeightOverride(
  b: AiBehavior,
  id: string,
): {
  biasWeight?: number;
  gamble?: number;
} {
  if (id === 'unlu') return { biasWeight: b['pwUnlu'] };
  if (id === 'harfsayar') return { biasWeight: b['pwHarfsayar'] };
  if (id === 'kumarbaz') return { gamble: b['pgKumarbaz'] };
  return {};
}

export interface AdaptiveParams {
  startPos: number;
  step: number;
  challenge: number;
  avgLo: number;
  avgHi: number;
  window: number;
}

/** Uyarlanabilir zorluk eşikleri (ai-adaptive fonksiyonlarına verilir). */
export function adaptiveParams(b: AiBehavior): AdaptiveParams {
  return {
    startPos: b['adaptStartPos'],
    step: b['adaptStep'],
    challenge: b['adaptChallenge'],
    avgLo: b['adaptAvgLo'],
    avgHi: b['adaptAvgHi'],
    window: Math.round(b['adaptWindow']),
  };
}

export interface HintCoach {
  perGame: number;
  goldCost: number;
  rlPerMin: number;
  enabled: boolean;
}

/** İpucu koçu ayarları (game.ts + ai-hint tüketir). */
export function hintCoach(b: AiBehavior): HintCoach {
  return {
    perGame: Math.round(b['hintPerGame']),
    goldCost: Math.round(b['hintGoldCost']),
    rlPerMin: Math.round(b['hintRlPerMin']),
    enabled: b['hintOn'] !== 0,
  };
}
