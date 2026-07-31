/**
 * ===========================================================================
 * 🎯 UYARLANABİLİR ZORLUK — "Bana uygun rakip" (saf mantık, test edilebilir)
 *
 * Oyuncunun son N maçındaki tahmin sayısını kayan pencerede tutar, bundan bota
 * BAŞA BAŞ (hafif zorlayıcı) bir hedef türetir ve hedefi bot parametresine (topK)
 * çevirir. Amaç: maçların çoğunun kıl payı bitmesi.
 *
 * KISIT: Bot yalnız TUTARLI (ipuçlarına uyan) oynar; 3100'lük havuzda ulaşılabilir
 * ortalama ~3.17 (topK 1, en güçlü) – ~3.57 (topK büyük, en rahat). Hedef bu banda
 * kırpılır — çok zayıf oyuncuya karşı bot "en rahat" ayarında kalır (aptallaşmaz).
 * (Havuz 860→3100 büyüyünce aday çoğaldı, band ~0.4 tahmin yukarı kaydı — yeniden
 *  kalibre edildi: scripts/vsai-solver-test.mjs · vsai-persona-test.mjs.)
 *
 * Aşırı salınım engellenir: hem 10 maçlık pencere yumuşatır, hem topK tek maçta
 * en fazla kademeli değişir (smoothStep) → tek sonuçla sert sıçrama olmaz.
 * ===========================================================================
 */

export const ADAPT_WINDOW = 10; // kayan pencere boyu
export const ADAPT_START_TOPK = 8; // yeni oyuncu: ortalama (Dengeli) başlangıç
const MIN_TOPK = 1;
const MAX_TOPK = 200;
const TARGET_LO = 3.17; // botun ulaşabileceği en düşük ortalama (topK 1, en güçlü)
const TARGET_HI = 3.57; // en yüksek ortalama (topK büyük, en rahat)
const TARGET_K = 13; // üstel eşleme katsayısı (band genişliği 0.40'a göre kalibre)
const CHALLENGE = 0.2; // "hafif zorlayıcı": bot hedefi oyuncu ortalamasının biraz ALTINDA

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Bir maçtaki oyuncu performansı: çözdüyse tahmin sayısı, çözemediyse ceza (MAX+1). */
export function perfScore(attempts: number, solved: boolean, max = 6): number {
  return solved ? clamp(Math.round(attempts), 1, max) : max + 1;
}

/** Pencereye yeni skoru ekler, son ADAPT_WINDOW maçı tutar. */
export function pushPerf(recent: readonly number[], score: number): number[] {
  return [...recent, score].slice(-ADAPT_WINDOW);
}

/** Penceredeki ortalama (boşsa null). */
export function windowAvg(recent: readonly number[]): number | null {
  if (!recent.length) return null;
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

/**
 * Oyuncu ortalamasından HEDEF topK. Bot hedefi = oyuncu ort − CHALLENGE (hafif
 * zorlayıcı), [3.17, 3.57]'ye kırpılır, oradan topK'ya (üstel eşleme) çevrilir.
 * Ölçülen eğri (3100 havuz): topK 1→3.17 · 8→3.31 · 140→3.57.
 */
export function targetTopK(playerAvg: number): number {
  const target = clamp(playerAvg - CHALLENGE, TARGET_LO, TARGET_HI);
  const topK = Math.round(Math.exp(TARGET_K * (target - TARGET_LO)));
  return clamp(topK, MIN_TOPK, MAX_TOPK);
}

/**
 * Kademeli geçiş — prev'den target'a doğru SINIRLI adım (tek maçta sert sıçrama yok).
 * Yukarı en fazla ~%60+3, aşağı ~%40+2 → birkaç maçta yumuşakça yeni seviyeye oturur.
 */
export function smoothStep(prev: number, target: number): number {
  if (target > prev) return Math.round(Math.min(target, prev + Math.max(3, prev * 0.6)));
  if (target < prev) return Math.round(Math.max(target, prev - Math.max(2, prev * 0.4)));
  return prev;
}

/**
 * Yeni uyarlanabilir topK: pencere ortalamasından hedefi bul, prev'den kademeli git.
 * Pencere boşsa (yeni oyuncu) makul başlangıçta kalır.
 */
export function nextAdaptTopK(recent: readonly number[], prev: number): number {
  const avg = windowAvg(recent);
  if (avg == null) return clamp(Math.round(prev) || ADAPT_START_TOPK, MIN_TOPK, MAX_TOPK);
  return smoothStep(
    clamp(Math.round(prev) || ADAPT_START_TOPK, MIN_TOPK, MAX_TOPK),
    targetTopK(avg),
  );
}

/** topK'yı oyuncuya gösterilecek kaba zorluk etiketine çevirir. */
export function adaptTierLabel(topK: number): 'hard' | 'medium' | 'easy' {
  if (topK <= 3) return 'hard';
  if (topK <= 25) return 'medium';
  return 'easy';
}
