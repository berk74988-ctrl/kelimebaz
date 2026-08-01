/**
 * ===========================================================================
 * DENGE AYARLARI — sunucudan yönetilebilir ekonomi/zorluk parametreleri.
 *
 * KAPSAM (bilinçli DAR): yalnız gerçekten dengelenmesi gereken değerler —
 * ALTIN ORANLARI + tek YZ ZORLUK kolu. Mağaza fiyatları, görevler, lig vb.
 * şimdilik gömülü kalır (riski düşük tutmak için kapsam küçük başlar).
 *
 * GÜVENLİK: her parametrenin [min, max] aralığı vardır. Sunucu geçersiz kılma
 * SUNSA BİLE istemci değeri aralığa SIKIŞTIRIR (mergeBalance) → hatalı bir giriş
 * (fiyat 0, altın 999999) ekonomiyi bozamaz. Sunucu da ayrıca reddeder.
 *
 * Bu dosya SAF (Angular yok) → hem istemci hem (kopyası) sunucu doğrular.
 * ===========================================================================
 */

export interface BalanceParam {
  key: string;
  def: number;
  min: number;
  max: number;
  int: boolean; // tam sayı mı (altın) yoksa ondalık mı (çarpan)
  label: string;
  group: 'gold' | 'ai';
}

export const BALANCE_SPEC: readonly BalanceParam[] = [
  { key: 'winGold', def: 20, min: 0, max: 200, int: true, label: 'Kazanma altını', group: 'gold' },
  {
    key: 'speedGold',
    def: 5,
    min: 0,
    max: 100,
    int: true,
    label: 'Hız bonusu (kalan hak başına)',
    group: 'gold',
  },
  {
    key: 'dailyBonus',
    def: 10,
    min: 0,
    max: 200,
    int: true,
    label: 'Günün kelimesi bonusu',
    group: 'gold',
  },
  {
    key: 'lossGold',
    def: 2,
    min: 0,
    max: 100,
    int: true,
    label: 'Kaybetme tesellisi',
    group: 'gold',
  },
  {
    key: 'levelGold',
    def: 4,
    min: 0,
    max: 50,
    int: true,
    label: 'Seviye ödülü (seviye başına)',
    group: 'gold',
  },
  {
    key: 'levelGoldCap',
    def: 40,
    min: 0,
    max: 500,
    int: true,
    label: 'Seviye ödülü tavanı',
    group: 'gold',
  },
  {
    key: 'aiTopKMul',
    def: 1,
    min: 0.25,
    max: 4,
    int: false,
    label: 'YZ zorluk çarpanı (topK; >1 kolay, <1 zor)',
    group: 'ai',
  },
];

export type Balance = Record<string, number>;

const SPEC_BY_KEY = new Map(BALANCE_SPEC.map((p) => [p.key, p]));

export const BALANCE_DEFAULTS: Balance = Object.fromEntries(
  BALANCE_SPEC.map((p) => [p.key, p.def]),
);

/** Bilinen anahtar + sonlu + aralık içinde mi? (reddetme için — clamp DEĞİL) */
export function inRange(key: string, value: number): boolean {
  const p = SPEC_BY_KEY.get(key);
  return (
    !!p && typeof value === 'number' && Number.isFinite(value) && value >= p.min && value <= p.max
  );
}

/** Değeri şemaya göre aralığa sıkıştır (+ tam sayıysa yuvarla). Bilinmeyen anahtar → null. */
export function clampParam(key: string, value: number): number | null {
  const p = SPEC_BY_KEY.get(key);
  if (!p || typeof value !== 'number' || !Number.isFinite(value)) return null;
  const c = Math.max(p.min, Math.min(p.max, value));
  return p.int ? Math.round(c) : c;
}

/**
 * Sunucu override'larını varsayılanla birleştir + HER değeri aralığa sıkıştır.
 * İstemci güvenlik katmanı: bozuk/stale/kötü niyetli override ekonomiyi bozamaz.
 */
export function mergeBalance(overrides: Partial<Balance> | null | undefined): Balance {
  const out: Balance = { ...BALANCE_DEFAULTS };
  if (overrides) {
    for (const p of BALANCE_SPEC) {
      const c = clampParam(p.key, overrides[p.key] as number);
      if (c != null) out[p.key] = c;
    }
  }
  return out;
}
