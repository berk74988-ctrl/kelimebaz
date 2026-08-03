/**
 * ai-behavior.js testleri — aralık reddi + geri alma + kalıcılık + measureConfigs.
 * Kullanım: node rooms-server/ai-behavior.test.mjs
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const AB = require('./ai-behavior.js');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.error('  ❌', m);
  }
};

// Her SPEC parametresinde gerekli alanlar
ok(
  AB.SPEC.every(
    (p) => p.key && typeof p.def === 'number' && p.min <= p.max && ['diff', 'persona', 'adapt', 'hint'].includes(p.group), // prettier-ignore
  ),
  'her SPEC parametresi geçerli (key/def/aralık/grup)',
);

// PARITY: src/app/core/ai-behavior.ts AI_BEHAVIOR_SPEC ile AYNI (drift olursa ikisi de).
const GOLDEN = [
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
const gotSpec = AB.SPEC.map((p) => [p.key, p.def, p.min, p.max, p.int]);
ok(JSON.stringify(gotSpec) === JSON.stringify(GOLDEN), 'SPEC istemci golden ile eşleşir (parity)');

const dir = mkdtempSync(join(tmpdir(), 'kbab-'));
try {
  const s = AB.open({ file: join(dir, 'b.json') });

  ok(Object.keys(s.overrides()).length === 0, 'başta override yok');

  // Geçerli set
  ok(s.set('bandEasyLo', 0.9, 't1').ok === true, 'geçerli set kabul');
  ok(s.overrides().bandEasyLo === 0.9, 'override kaydedildi');

  // ARALIK DIŞI reddedilir (band 0..1)
  ok(s.set('bandEasyLo', 1.5, 't2').error === 'out_of_range', 'aralık üstü reddedilir');
  ok(s.set('bandEasyLo', -0.1, 't2').error === 'out_of_range', 'aralık altı reddedilir');
  ok(s.set('yokKey', 5, 't2').error === 'unknown_key', 'bilinmeyen anahtar reddedilir');
  ok(s.overrides().bandEasyLo === 0.9, 'reddedilen set override’ı değiştirmedi');

  // int yuvarlama (hintGoldCost int)
  s.set('hintGoldCost', 25.7, 't3');
  ok(s.overrides().hintGoldCost === 26, 'int değer yuvarlanır');

  // Şema
  const sch = s.schema().find((p) => p.key === 'bandEasyLo');
  ok(sch.current === 0.9 && sch.def === 0.85 && sch.overridden === true, 'schema mevcut/def/override');

  // measureConfigs: varsayılanda 3 zorluk + 4 persona = 7 config
  const cfg = s.measureConfigs();
  ok(
    cfg['diff.hard'] && cfg['diff.medium'] && cfg['diff.easy'],
    'measureConfigs 3 zorluk bandı içerir',
  );
  ok(
    cfg['persona.temkinli'] && cfg['persona.unlu'] && cfg['persona.kumarbaz'],
    'measureConfigs açık karakterleri içerir',
  );
  ok(
    cfg['persona.unlu'].bias === 'vowel' && cfg['persona.unlu'].biasWeight === 1.5,
    'ünlü persona config: vowel bias + ağırlık',
  );

  // Karakter KAPATINCA measureConfigs'ten çıkar
  s.set('pOnKumarbaz', 0, 't4');
  ok(!s.measureConfigs()['persona.kumarbaz'], 'kapalı karakter ölçüme girmez');

  // saveMeasure + lastMeasure
  s.saveMeasure({ 'diff.hard': { avg: 3.1 } }, 't5');
  ok(s.lastMeasure() && s.lastMeasure().results['diff.hard'].avg === 3.1, 'son ölçüm saklanır');

  // Kalıcılık
  const s2 = AB.open({ file: join(dir, 'b.json') });
  ok(s2.overrides().bandEasyLo === 0.9, 'override diske kalıcı');
  ok(s2.lastMeasure().results['diff.hard'].avg === 3.1, 'son ölçüm diske kalıcı');
  ok(s2.history().length >= 3, 'değişiklik geçmişi tutulur');

  // Geri al (tek) + hepsi
  s2.reset('bandEasyLo', 't6');
  ok(s2.overrides().bandEasyLo === undefined, 'reset override’ı kaldırır');
  s2.resetAll('t7');
  ok(Object.keys(s2.overrides()).length === 0, 'resetAll tümünü temizler');
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* yoksay */
  }
}

console.log(`\nai-behavior: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
