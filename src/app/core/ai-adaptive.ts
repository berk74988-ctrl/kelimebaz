import type { Band } from './ai-opponent';

/**
 * ===========================================================================
 * 🎯 UYARLANABİLİR ZORLUK — "Bana uygun rakip" (saf mantık, test edilebilir)
 *
 * Oyuncunun son N maçındaki tahmin sayısını kayan pencerede tutar, bundan bota
 * BAŞA BAŞ (hafif zorlayıcı) bir hedef türetir ve hedefi bot parametresine —
 * entropi sıralamasındaki YÜZDELİK KONUM (pos ∈ [0,1]) — çevirir. Amaç: maçların
 * çoğunun kıl payı bitmesi.
 *
 * pos 0 = en güçlü (en iyi entropi, band [0,0]) · pos 1 = en zayıf (band [~,1]).
 * KISIT: Bot yalnız TUTARLI (ipuçlarına uyan) oynar; ulaşılabilir ortalama
 * ~3.10 (pos 0) – ~4.46 (pos 1) arası (ÖLÇÜLDÜ: scripts/vsai-solver-test.mjs).
 * Hedef bu banda kırpılır — çok zayıf oyuncuya karşı bot "en rahat" ucunda kalır.
 *
 * Aşırı salınım engellenir: hem 10 maçlık pencere yumuşatır, hem pos tek maçta
 * en fazla STEP kadar değişir (smoothStep) → tek sonuçla sert sıçrama olmaz.
 * ===========================================================================
 */

export const ADAPT_WINDOW = 10; // kayan pencere boyu
export const ADAPT_START_POS = 0.45; // yeni oyuncu: orta (Dengeli) başlangıç konumu
const MIN_POS = 0;
const MAX_POS = 1;
const AVG_LO = 3.1; // pos 0'da botun ortalama tahmini (en güçlü) — ölçüldü
const AVG_HI = 4.46; // pos 1'de botun ortalama tahmini (en zayıf) — ölçüldü
const STEP = 0.15; // pos'un tek maçta en fazla değişimi (kademeli geçiş)
const CHALLENGE = 0.2; // "hafif zorlayıcı": bot hedefi oyuncu ortalamasının biraz ALTINDA

/**
 * Uyarlanabilir zorluk eşikleri — panelden ayarlanabilir (varsayılan = gömülü).
 * Fonksiyonlara opsiyonel verilir; VERİLMEZSE gömülü değerler kullanılır → mevcut
 * davranış birebir korunur (geriye dönük uyumlu).
 */
export interface AdaptTuning {
  startPos: number;
  step: number;
  challenge: number;
  avgLo: number;
  avgHi: number;
  window: number;
}
export const ADAPT_DEFAULTS: AdaptTuning = {
  startPos: ADAPT_START_POS,
  step: STEP,
  challenge: CHALLENGE,
  avgLo: AVG_LO,
  avgHi: AVG_HI,
  window: ADAPT_WINDOW,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Bir maçtaki oyuncu performansı: çözdüyse tahmin sayısı, çözemediyse ceza (MAX+1). */
export function perfScore(attempts: number, solved: boolean, max = 6): number {
  return solved ? clamp(Math.round(attempts), 1, max) : max + 1;
}

/** Pencereye yeni skoru ekler, son `window` maçı tutar (varsayılan ADAPT_WINDOW). */
export function pushPerf(
  recent: readonly number[],
  score: number,
  window: number = ADAPT_WINDOW,
): number[] {
  return [...recent, score].slice(-Math.max(1, Math.round(window)));
}

/** Penceredeki ortalama (boşsa null). */
export function windowAvg(recent: readonly number[]): number | null {
  if (!recent.length) return null;
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

/**
 * Oyuncu ortalamasından HEDEF konum. Bot hedef ortalaması = oyuncu ort − CHALLENGE
 * (hafif zorlayıcı), [AVG_LO, AVG_HI]'ye kırpılır, oradan pos'a (doğrusal) çevrilir.
 * Düşük ortalama → düşük pos (güçlü bot); yüksek ortalama → yüksek pos (rahat bot).
 */
export function targetPos(playerAvg: number, t: AdaptTuning = ADAPT_DEFAULTS): number {
  const lo = t.avgLo;
  const hi = t.avgHi > t.avgLo ? t.avgHi : t.avgLo + 0.01; // sıfıra bölme koruması
  const targetAvg = clamp(playerAvg - t.challenge, lo, hi);
  return clamp((targetAvg - lo) / (hi - lo), MIN_POS, MAX_POS);
}

/** Kademeli geçiş — prev'den target'a doğru en fazla `step` adım (sert sıçrama yok). */
export function smoothStep(prev: number, target: number, step: number = STEP): number {
  if (target > prev) return Math.min(target, prev + step);
  if (target < prev) return Math.max(target, prev - step);
  return prev;
}

/**
 * Yeni uyarlanabilir konum: pencere ortalamasından hedefi bul, prev'den kademeli git.
 * Pencere boşsa (yeni oyuncu, geçmiş yok) makul başlangıca çekilir. DİKKAT: pos=0
 * GEÇERLİ (en güçlü) → geçmiş varken 0'ı başlangıca sıçratma (yoksa güçlü oyuncuda
 * salınım olur); yalnız pencere boş VE prev anlamsızken (0/tanımsız) başlangıca dön.
 */
export function nextAdaptPos(
  recent: readonly number[],
  prev: number,
  t: AdaptTuning = ADAPT_DEFAULTS,
): number {
  const p = Number.isFinite(prev) ? clamp(prev, MIN_POS, MAX_POS) : t.startPos;
  const avg = windowAvg(recent);
  if (avg == null) return Number.isFinite(prev) && prev > 0 ? p : t.startPos;
  return smoothStep(p, targetPos(avg, t), t.step); // geçmiş var → prev (0 dâhil) korunur, kademeli
}

/** Konumu çözücü bandına çevirir — konum çevresinde dar bir dilim (uçlarda kırpılır). */
export function adaptBand(pos: number): Band {
  const p = clamp(pos, MIN_POS, MAX_POS);
  return [clamp(p - 0.05, 0, 1), clamp(p + 0.05, 0, 1)];
}

/** Konumu oyuncuya gösterilecek kaba zorluk etiketine çevirir. */
export function adaptTierLabel(pos: number): 'hard' | 'medium' | 'easy' {
  if (pos <= 0.3) return 'hard';
  if (pos <= 0.72) return 'medium';
  return 'easy';
}
