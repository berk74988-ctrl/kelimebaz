import { describe, expect, it } from 'vitest';
import { BALANCE_DEFAULTS, BALANCE_SPEC, clampParam, inRange, mergeBalance } from './balance';

/** Şema parity için GOLDEN — rooms-server/balance.test.mjs AYNISINI kontrol eder. */
export const BALANCE_GOLDEN = [
  ['winGold', 20, 0, 200, true],
  ['speedGold', 5, 0, 100, true],
  ['dailyBonus', 10, 0, 200, true],
  ['lossGold', 2, 0, 100, true],
  ['levelGold', 4, 0, 50, true],
  ['levelGoldCap', 40, 0, 500, true],
  ['aiTopKMul', 1, 0.25, 4, false],
];

describe('balance şeması', () => {
  it('spec golden ile eşleşir (sunucu ile parity)', () => {
    const got = BALANCE_SPEC.map((p) => [p.key, p.def, p.min, p.max, p.int]);
    expect(got).toEqual(BALANCE_GOLDEN);
  });

  it('inRange aralık denetimi', () => {
    expect(inRange('winGold', 20)).toBe(true);
    expect(inRange('winGold', 201)).toBe(false); // üst sınır aşımı
    expect(inRange('winGold', -1)).toBe(false);
    expect(inRange('bilinmeyen', 5)).toBe(false);
    expect(inRange('aiTopKMul', 0.1)).toBe(false); // 0.25 altı
  });

  it('clampParam sıkıştırır + int yuvarlar', () => {
    expect(clampParam('winGold', 999999)).toBe(200); // tavan
    expect(clampParam('winGold', -50)).toBe(0); // taban
    expect(clampParam('winGold', 25.7)).toBe(26); // int → yuvarla
    expect(clampParam('aiTopKMul', 2.5)).toBe(2.5); // float korunur
    expect(clampParam('bilinmeyen', 5)).toBe(null);
  });

  it('mergeBalance: varsayılan + override, aralığa SIKIŞTIRIR', () => {
    expect(mergeBalance(null)).toEqual(BALANCE_DEFAULTS); // override yok → varsayılan
    const m = mergeBalance({ winGold: 50, lossGold: 999999, aiTopKMul: 2 });
    expect(m['winGold']).toBe(50);
    expect(m['lossGold']).toBe(100); // aralığa sıkıştırıldı (999999 → 100)
    expect(m['aiTopKMul']).toBe(2);
    expect(m['speedGold']).toBe(5); // dokunulmayan → varsayılan
  });

  it('mergeBalance bozuk/bilinmeyen değeri yok sayar', () => {
    const m = mergeBalance({ winGold: NaN, dailyBonus: 'x' as unknown as number, foo: 9 });
    expect(m['winGold']).toBe(20); // NaN → varsayılan
    expect(m['dailyBonus']).toBe(10);
    expect((m as Record<string, number>)['foo']).toBeUndefined();
  });
});
