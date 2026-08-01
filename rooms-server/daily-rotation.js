'use strict';

/**
 * GÜNLÜK KELİME ROTASYONU — src/app/core/daily-rotation.ts'in BİREBİR JS kopyası.
 *
 * Sunucu, YÖNETİM TAKVİMİ önizlemesi için günün (algoritmik) kelimesini hesaplar.
 * İstemci hâlâ OTORİTEDİR (gerçek seçimi gömülü algoritma yapar); bu yalnız
 * önizleme + geçersiz-kılma tabanıdır. İki dosya AYNI kalmalı (parity testi var).
 *
 * Bağımlılıksız, saf. Belirleyici: aynı dayIndex + aynı havuz → aynı kelime.
 */

const ANSWER_LENGTHS = [4, 5, 6, 7];
const EPOCH_DOW = 4; // dayIndex 0 = 2026-01-01 = Perşembe
const WEEKDAY_BASE = { 0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 3, 6: 4 };

function mix(n, salt) {
  let x = (Math.floor(n) ^ Math.imul(salt | 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function dayOfWeek(dayIndex) {
  return ((((dayIndex % 7) + EPOCH_DOW) % 7) + 7) % 7;
}
function rawBand(dayIndex) {
  const wobble = (mix(dayIndex, 1) % 3) - 1;
  return clamp(WEEKDAY_BASE[dayOfWeek(dayIndex)] + wobble, 1, 5);
}
function targetBand(dayIndex) {
  const b = rawBand(dayIndex);
  if (b === 5 && rawBand(dayIndex - 1) === 5) return 4;
  return b;
}
function shuffledLengths(seed) {
  const a = [...ANSWER_LENGTHS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = mix(seed, i + 3) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function lengthForDay(dayIndex) {
  const block = Math.floor(dayIndex / 4);
  const perm = shuffledLengths(block);
  return perm[((dayIndex % 4) + 4) % 4];
}
function bandSearchOrder(band) {
  const order = [band];
  for (let d = 1; d <= 4; d++) {
    if (band - d >= 1) order.push(band - d);
    if (band + d <= 5) order.push(band + d);
  }
  return order;
}
function pickDaily(dayIndex, byBand) {
  const length = lengthForDay(dayIndex);
  const band = targetBand(dayIndex);
  let chosen = [];
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

module.exports = {
  ANSWER_LENGTHS,
  mix,
  dayOfWeek,
  rawBand,
  targetBand,
  lengthForDay,
  pickDaily,
};
