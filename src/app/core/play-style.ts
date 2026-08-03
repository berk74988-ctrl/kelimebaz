import { Lang } from './lang';

/**
 * ===========================================================================
 * OYUN TARZI ANALİZİ — saf, cihazda, LLM'siz. Angular yok, doğrudan test edilir.
 *
 * Girdi: oyuncunun son maçlarının tahmin geçmişi (cevap + tahmin edilen
 * kelimeler). Çıktı: cesaretlendirici içgörüler (i18n anahtarı + parametre).
 *
 * GİZLİLİK: tüm analiz burada, bellekte yapılır — hiçbir veri dışarı gitmez.
 *
 * YENİ İÇGÖRÜ EKLEMEK: PLAY_STYLE_INSIGHTS'a bir kayıt ekle (key + icon +
 * compute). Profil ekranı, boş durum ve testler kendiliğinden uyar.
 * ===========================================================================
 */

/** Bir maçın analiz için gereken özeti (hepsi BÜYÜK harf). */
export interface PlayRecord {
  answer: string;
  guesses: string[];
}

/** Hesaplanan içgörü — i18n anahtarı + parametreler (metin dile göre çevrilir). */
export interface Insight {
  textKey: string;
  params?: Record<string, string | number>;
}

export interface PlayStyleInsight {
  key: string;
  icon: string;
  compute: (records: readonly PlayRecord[], lang: Lang) => Insight | null;
}

/** Altında hiçbir içgörü gösterilmez — az veriyle yanıltıcı çıkarım yapma. */
export const MIN_GAMES = 5;

const VOWELS: Record<Lang, ReadonlySet<string>> = {
  tr: new Set([...'AEIİOÖUÜ']),
  en: new Set([...'AEIOU']),
  de: new Set([...'AEIOUÄÖÜ']),
};

const chars = (w: string) => [...w];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Yeterli maç oynandı mı? (boş durum kararı) */
export function hasEnoughData(records: readonly PlayRecord[]): boolean {
  return records.length >= MIN_GAMES;
}

// ── İÇGÖRÜ HESAPLAYICILARI (saf) ──────────────────────────────────────────

/**
 * HARF KÖRLÜĞÜ — cevapta olan harfleri kaçıncı turda ilk kez deniyorsun?
 * Bir harfi hep geç deniyorsan o harf "kör nokta"dır (Türkçede Ş/Ğ/Ü tipik).
 */
function letterBlindness(records: readonly PlayRecord[]): Insight | null {
  const sum = new Map<string, number>();
  const cnt = new Map<string, number>();
  for (const { answer, guesses } of records) {
    for (const L of new Set(chars(answer))) {
      // Bu harfi İÇEREN ilk tahminin turu (1..n); hiç denenmediyse n+1 ceza.
      let turn = guesses.length + 1;
      for (let i = 0; i < guesses.length; i++) {
        if (guesses[i].includes(L)) {
          turn = i + 1;
          break;
        }
      }
      sum.set(L, (sum.get(L) ?? 0) + turn);
      cnt.set(L, (cnt.get(L) ?? 0) + 1);
    }
  }
  // Yeterli örneği (≥3 maç) olan harfler arasında en geç denenen.
  let worst = '';
  let worstAvg = 0;
  for (const [L, c] of cnt) {
    if (c < 3) continue;
    const a = sum.get(L)! / c;
    if (a > worstAvg) {
      worstAvg = a;
      worst = L;
    }
  }
  if (!worst) return null;
  // Ortalama ≥2 → tipik olarak ilk turda denenmiyor = kör nokta.
  return worstAvg >= 2
    ? { textKey: 'playstyle.letterBlind', params: { letter: worst } }
    : { textKey: 'playstyle.letterSharp' };
}

/** UZUNLUK PERFORMANSI — çözülen maçlarda uzunluğa göre ortalama tahmin. */
function lengthPerformance(records: readonly PlayRecord[]): Insight | null {
  const byLen = new Map<number, number[]>();
  for (const { answer, guesses } of records) {
    const solved = guesses[guesses.length - 1] === answer;
    if (!solved) continue;
    const L = chars(answer).length;
    (byLen.get(L) ?? byLen.set(L, []).get(L)!).push(guesses.length);
  }
  // En az 2 çözümü olan uzunluklar arasında en iyi (düşük ort.) ve en zor.
  const qualified = [...byLen.entries()].filter(([, v]) => v.length >= 2);
  if (!qualified.length) return null;
  const withAvg = qualified.map(([L, v]) => ({ L, a: avg(v) }));
  withAvg.sort((x, y) => x.a - y.a);
  const best = withAvg[0];
  const worst = withAvg[withAvg.length - 1];
  if (withAvg.length === 1) {
    return { textKey: 'playstyle.lengthOne', params: { len: best.L, avg: round1(best.a) } };
  }
  return {
    textKey: 'playstyle.lengthPerf',
    params: {
      bestLen: best.L,
      bestAvg: round1(best.a),
      worstLen: worst.L,
      worstAvg: round1(worst.a),
    },
  };
}

/** AÇILIŞ ALIŞKANLIĞI — en sık ilk tahmin; iyi bir açılış mı (harf çeşitliliği)? */
function openingHabit(records: readonly PlayRecord[], lang: Lang): Insight | null {
  const first = new Map<string, number>();
  for (const { guesses } of records) {
    if (guesses.length) first.set(guesses[0], (first.get(guesses[0]) ?? 0) + 1);
  }
  if (!first.size) return null;
  let word = '';
  let count = 0;
  for (const [w, c] of first) if (c > count) ((word = w), (count = c));
  const share = count / records.length;
  if (share < 0.35) return { textKey: 'playstyle.openVaried' }; // çeşitli açılış — iyi
  // Alışkanlık var: açılış kelimesi iyi mi? (farklı harf + ünlü sayısı)
  const letters = new Set(chars(word));
  const vowels = chars(word).filter((c) => VOWELS[lang].has(c)).length;
  const good = letters.size >= chars(word).length && vowels >= 2;
  return {
    textKey: good ? 'playstyle.openGood' : 'playstyle.openWeak',
    params: { word, pct: Math.round(share * 100) },
  };
}

/** TUR VERİMLİLİĞİ — elenmiş (cevapta olmayan) harfleri tekrar deniyor musun? */
function turnEfficiency(records: readonly PlayRecord[]): Insight | null {
  let wasted = 0;
  let opportunities = 0;
  for (const { answer, guesses } of records) {
    const ansSet = new Set(chars(answer));
    const knownAbsent = new Set<string>();
    for (let i = 0; i < guesses.length; i++) {
      if (i > 0) {
        opportunities++;
        if (chars(guesses[i]).some((c) => knownAbsent.has(c))) wasted++;
      }
      for (const c of chars(guesses[i])) if (!ansSet.has(c)) knownAbsent.add(c);
    }
  }
  if (opportunities < 5) return null;
  const ratio = wasted / opportunities;
  return ratio <= 0.15
    ? { textKey: 'playstyle.efficient', params: { pct: Math.round((1 - ratio) * 100) } }
    : { textKey: 'playstyle.reuses', params: { pct: Math.round(ratio * 100) } };
}

/** ÜNLÜ/ÜNSÜZ DENGESİ — tahminlerinde ünlüler mi ağır basıyor? */
function vowelBalance(records: readonly PlayRecord[], lang: Lang): Insight | null {
  let vowels = 0;
  let total = 0;
  for (const { guesses } of records) {
    for (const g of guesses) {
      for (const c of chars(g)) {
        total++;
        if (VOWELS[lang].has(c)) vowels++;
      }
    }
  }
  if (total < 30) return null;
  const ratio = vowels / total;
  const pct = Math.round(ratio * 100);
  // Türkçe doğal ünlü oranı ~%42, İngilizce ~%38. Sapmaya göre yorum.
  const base = lang === 'tr' ? 0.42 : 0.38;
  if (ratio > base + 0.06) return { textKey: 'playstyle.vowelHeavy', params: { pct } };
  if (ratio < base - 0.06) return { textKey: 'playstyle.consonantHeavy', params: { pct } };
  return { textKey: 'playstyle.balanced', params: { pct } };
}

/** KAYIT DEFTERİ — profil ekranı bu listeden çizer. */
export const PLAY_STYLE_INSIGHTS: readonly PlayStyleInsight[] = [
  { key: 'length', icon: '📏', compute: (r) => lengthPerformance(r) },
  { key: 'opening', icon: '🚪', compute: (r, l) => openingHabit(r, l) },
  { key: 'letter', icon: '🔤', compute: (r) => letterBlindness(r) },
  { key: 'efficiency', icon: '♻️', compute: (r) => turnEfficiency(r) },
  { key: 'vowel', icon: '🅰️', compute: (r, l) => vowelBalance(r, l) },
];

/**
 * ANTRENMAN İPUCU (isteğe bağlı serbest-mod kaydırması için): oyuncunun en zayıf
 * olduğu (en geç denediği) harf — yeterli veri yoksa null. Kaydırma HAFİF olmalı.
 */
export function weakestLetter(records: readonly PlayRecord[]): string | null {
  if (!hasEnoughData(records)) return null;
  const ins = letterBlindness(records);
  return ins?.textKey === 'playstyle.letterBlind' ? String(ins.params!['letter']) : null;
}
