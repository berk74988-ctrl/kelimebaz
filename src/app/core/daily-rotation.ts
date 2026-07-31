/**
 * ===========================================================================
 * GÜNLÜK KELİME ROTASYONU — saf, deterministik, zorluk-dengeli. Angular yok.
 *
 * KURAL: Günün kelimesi BELİRLEYİCİDİR — aynı gün (dayIndex) + aynı dil herkese
 * aynı kelimeyi verir. Rotasyon "akıllı" ama RASTGELE DEĞİL: hepsi dayIndex'ten
 * türetilen sabit işlevlerdir.
 *
 * Zorluk bandı (1=çok tanıdık … 5=çok zor):
 *   - Hafta içi (Pzt-Per): kolay-orta (band 1-3)
 *   - Cuma: orta (2-4) · Cumartesi/Pazar: daha zorlu (3-5)
 *   - ART ARDA İKİ GÜN band-5 GELMEZ (kural aşağıda kanıtlı).
 *
 * Uzunluk: katı 4→5→6→7 döngüsü yerine, 4 günlük blok başına dayIndex'ten
 * türetilen bir KARIŞTIRMA → tahmin edilemez ama belirleyici; her uzunluk
 * yine düzenli görünür.
 * ===========================================================================
 */

export const ANSWER_LENGTHS = [4, 5, 6, 7] as const;

/** dayIndex 0 = 2026-01-01 = Perşembe (0=Pazar … 6=Cumartesi). */
const EPOCH_DOW = 4;

/** Hafta gününe göre taban zorluk (0=Pazar … 6=Cumartesi). */
const WEEKDAY_BASE: Record<number, number> = { 0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 3, 6: 4 };

/** Deterministik 32-bit karıştırıcı (tuzla farklı amaçlar için bağımsız değer). */
export function mix(n: number, salt: number): number {
  let x = (Math.floor(n) ^ Math.imul(salt | 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Gün (0=Pazar … 6=Cumartesi) — dayIndex'ten belirleyici. */
export function dayOfWeek(dayIndex: number): number {
  return ((((dayIndex % 7) + EPOCH_DOW) % 7) + 7) % 7;
}

/** Ham band: hafta günü tabanı + [-1,0,+1] belirleyici sapma, 1-5'e sıkışır. */
export function rawBand(dayIndex: number): number {
  const wobble = (mix(dayIndex, 1) % 3) - 1; // -1, 0, +1
  return clamp(WEEKDAY_BASE[dayOfWeek(dayIndex)] + wobble, 1, 5);
}

/**
 * Günün hedef zorluk bandı. ART ARDA İKİ band-5 ENGELLENİR:
 *   effective(d)=5  ⟺  rawBand(d)=5 ve rawBand(d-1)≠5
 *   effective(d+1)=5 ⟺ rawBand(d+1)=5 ve rawBand(d)≠5
 * İkisi birden olamaz (rawBand(d) hem =5 hem ≠5 olamaz) → asla art arda iki 5.
 */
export function targetBand(dayIndex: number): number {
  const b = rawBand(dayIndex);
  if (b === 5 && rawBand(dayIndex - 1) === 5) return 4; // bir öncekiyle çakışma → düşür
  return b;
}

/** [4,5,6,7]'yi tohuma göre belirleyici karıştır (Fisher-Yates). */
function shuffledLengths(seed: number): number[] {
  const a = [...ANSWER_LENGTHS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = mix(seed, i + 3) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Günün kelime uzunluğu — 4 günlük blokta karıştırılmış sıradan (belirleyici). */
export function lengthForDay(dayIndex: number): number {
  const block = Math.floor(dayIndex / 4);
  const perm = shuffledLengths(block);
  return perm[((dayIndex % 4) + 4) % 4];
}

/** Hedef band boşsa aranacak band sırası: hedef → önce KOLAY yönü → sonra zor. */
function bandSearchOrder(band: number): number[] {
  const order = [band];
  for (let d = 1; d <= 4; d++) {
    if (band - d >= 1) order.push(band - d); // önce kolaylaş (beklenmedik zorluk olmasın)
    if (band + d <= 5) order.push(band + d);
  }
  return order;
}

/**
 * Günün kelimesini seç. `byBand(length, band)` o uzunluk+banddaki KARARLI SIRALI
 * kelime dizisini döndürür (havuz sırası). Hedef band boşsa en yakın banda düşer.
 * Belirleyici: aynı dayIndex + aynı havuz → aynı kelime.
 */
export function pickDaily(
  dayIndex: number,
  byBand: (length: number, band: number) => readonly string[],
): { length: number; band: number; word: string } | null {
  const length = lengthForDay(dayIndex);
  const band = targetBand(dayIndex);
  let chosen: readonly string[] = [];
  let usedBand = band;
  for (const b of bandSearchOrder(band)) {
    const c = byBand(length, b);
    if (c.length) {
      chosen = c;
      usedBand = b;
      break;
    }
  }
  if (!chosen.length) return null;
  const word = chosen[mix(dayIndex, 3) % chosen.length];
  return { length, band: usedBand, word };
}

/**
 * SERBEST MOD — seviyeye göre hedef zorluk bandı (deterministik değil; r sapması).
 * Düşük seviye → tanıdık (band 1-2), yüksek seviye → zor (band 4-5).
 */
export function levelBand(level: number, r: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  const center = clamp(Math.round(1 + (lv - 1) / 3.5), 1, 5); // sv1→1 … sv15→5
  const spread = Math.floor(clamp(r, 0, 0.999) * 3) - 1; // -1, 0, +1
  return clamp(center + spread, 1, 5);
}
