import {
  AI_BEHAVIOR_DEFAULTS,
  AI_BEHAVIOR_SPEC,
  adaptiveParams,
  clampParam,
  hintCoach,
  mergeAiBehavior,
  personaEnabled,
  personaWeightOverride,
} from './ai-behavior';

/**
 * YZ davranış çekirdeği — sunucu şemasıyla parity + aralık sıkıştırma + türetme.
 * ŞEMA GOLDEN'ı rooms-server/ai-behavior.js SPEC ile AYNI olmalı (drift olursa
 * ikisi de güncellenmeli).
 */
describe('YZ davranış (ai-behavior)', () => {
  it('SPEC parity — sunucu ai-behavior.js ile aynı (GOLDEN)', () => {
    const GOLDEN: [string, number, number, number, boolean][] = [
      ['bandHardLo', 0, 0, 1, false],
      ['bandHardHi', 0, 0, 1, false],
      ['bandMedLo', 0.4, 0, 1, false],
      ['bandMedHi', 0.65, 0, 1, false],
      ['bandEasyLo', 0.85, 0, 1, false],
      ['bandEasyHi', 1, 0, 1, false],
      ['tempoHardMin', 1700, 200, 8000, true],
      ['tempoHardMax', 2600, 200, 8000, true],
      ['tempoMedMin', 2400, 200, 8000, true],
      ['tempoMedMax', 3600, 200, 8000, true],
      ['tempoEasyMin', 3200, 200, 8000, true],
      ['tempoEasyMax', 5200, 200, 8000, true],
      ['pOnTemkinli', 1, 0, 1, true],
      ['pOnUnlu', 1, 0, 1, true],
      ['pOnHarfsayar', 1, 0, 1, true],
      ['pOnKumarbaz', 1, 0, 1, true],
      ['pwUnlu', 1.5, 0, 5, false],
      ['pwHarfsayar', 2.5, 0, 5, false],
      ['pgKumarbaz', 0.5, 0, 1, false],
      ['adaptStartPos', 0.45, 0, 1, false],
      ['adaptStep', 0.15, 0.01, 1, false],
      ['adaptChallenge', 0.2, 0, 2, false],
      ['adaptAvgLo', 3.1, 1, 6, false],
      ['adaptAvgHi', 4.46, 1, 7, false],
      ['adaptWindow', 10, 1, 50, true],
      ['hintPerGame', 2, 0, 10, true],
      ['hintGoldCost', 20, 0, 500, true],
      ['hintRlPerMin', 8, 1, 120, true],
      ['hintOn', 1, 0, 1, true],
    ];
    const got = AI_BEHAVIOR_SPEC.map((p) => [p.key, p.def, p.min, p.max, p.int]);
    expect(got).toEqual(GOLDEN);
  });

  it('clampParam: aralığa sıkıştırır, tam sayı yuvarlar, bilinmeyen null', () => {
    expect(clampParam('pwUnlu', 9)).toBe(5); // üst
    expect(clampParam('pwUnlu', -1)).toBe(0); // alt
    expect(clampParam('hintGoldCost', 25.7)).toBe(26); // int yuvarla
    expect(clampParam('pwUnlu', 2.3)).toBe(2.3); // float korunur
    expect(clampParam('yok', 5)).toBeNull();
  });

  it('mergeAiBehavior: override yoksa varsayılan, bozuk override sıkıştırılır', () => {
    expect(mergeAiBehavior(null)).toEqual(AI_BEHAVIOR_DEFAULTS);
    const m = mergeAiBehavior({ pwUnlu: 99, pOnKumarbaz: 0, yok: 5 } as never);
    expect(m['pwUnlu']).toBe(5); // aralığa sıkıştı
    expect(m['pOnKumarbaz']).toBe(0);
    expect(m['pwHarfsayar']).toBe(2.5); // dokunulmayan varsayılan
    expect((m as Record<string, number>)['yok']).toBeUndefined();
  });

  it('personaEnabled: aç/kapa + bilinmeyen açık', () => {
    const on = mergeAiBehavior(null);
    expect(personaEnabled(on, 'kumarbaz')).toBe(true);
    const off = mergeAiBehavior({ pOnKumarbaz: 0 });
    expect(personaEnabled(off, 'kumarbaz')).toBe(false);
    expect(personaEnabled(off, 'temkinli')).toBe(true);
    expect(personaEnabled(on, 'adaptive')).toBe(true); // bilinmeyen → açık
  });

  it('personaWeightOverride: doğru knob', () => {
    const b = mergeAiBehavior({ pwUnlu: 3, pwHarfsayar: 1, pgKumarbaz: 0.8 });
    expect(personaWeightOverride(b, 'unlu')).toEqual({ biasWeight: 3 });
    expect(personaWeightOverride(b, 'harfsayar')).toEqual({ biasWeight: 1 });
    expect(personaWeightOverride(b, 'kumarbaz')).toEqual({ gamble: 0.8 });
    expect(personaWeightOverride(b, 'temkinli')).toEqual({});
  });

  it('adaptiveParams + hintCoach türetme', () => {
    const b = mergeAiBehavior({ adaptStartPos: 0.6, adaptWindow: 8, hintGoldCost: 30, hintOn: 0 });
    const a = adaptiveParams(b);
    expect(a.startPos).toBe(0.6);
    expect(a.window).toBe(8);
    expect(a.avgHi).toBe(4.46); // varsayılan korunur
    const h = hintCoach(b);
    expect(h.goldCost).toBe(30);
    expect(h.enabled).toBe(false);
    expect(h.perGame).toBe(2);
  });
});
