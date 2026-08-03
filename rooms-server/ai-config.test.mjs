/**
 * ai-config.js testleri — geçerlilik kuralları + geri alma + kalıcılık + fallback.
 * Kullanım: node rooms-server/ai-config.test.mjs
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const AI = require('./ai-config.js');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.error('  ❌', m);
  }
};

// --- Geçerlilik kuralları (saf validate) ---
const V = AI.validate;

ok(V({ model: 'yok-boyle', maxTokens: 400 }).error === 'bad_model', 'bilinmeyen model reddedilir');
ok(
  V({ model: 'claude-opus-5', thinking: 'disabled', effort: 'low', maxTokens: 5 }).error ===
    'bad_max_tokens',
  'aralık altı max_tokens reddedilir',
);
ok(
  V({ model: 'claude-opus-5', thinking: 'disabled', effort: 'low', maxTokens: 99999 }).error ===
    'bad_max_tokens',
  'aralık üstü max_tokens reddedilir',
);

// opus-5: disabled + low → OK (istek gövdesi doğru)
const okDisabled = V({ model: 'claude-opus-5', thinking: 'disabled', effort: 'low', maxTokens: 400 });
ok(okDisabled.ok === true, 'opus-5 disabled+low kabul');
ok(
  okDisabled.request &&
    okDisabled.request.thinking.type === 'disabled' &&
    okDisabled.request.output_config.effort === 'low' &&
    okDisabled.request.max_tokens === 400,
  'istek gövdesi: thinking=disabled + effort=low',
);
// opus-5 sampling parametresi göndermez (temperature vs. istek gövdesinde YOK)
ok(
  okDisabled.request.temperature === undefined &&
    okDisabled.request.top_p === undefined &&
    okDisabled.request.budget_tokens === undefined,
  'istek gövdesinde sampling/budget_tokens YOK',
);

// opus-5: disabled + xhigh → 400 (thinking-disabled yalnız effort ≤ high)
ok(
  V({ model: 'claude-opus-5', thinking: 'disabled', effort: 'xhigh', maxTokens: 400 }).error ===
    'disabled_effort_too_high',
  'opus-5 disabled+xhigh reddedilir',
);
ok(
  V({ model: 'claude-opus-5', thinking: 'disabled', effort: 'max', maxTokens: 400 }).error ===
    'disabled_effort_too_high',
  'opus-5 disabled+max reddedilir',
);
// opus-5: adaptive + max → OK
ok(
  V({ model: 'claude-opus-5', thinking: 'adaptive', effort: 'max', maxTokens: 400 }).request.thinking
    .type === 'adaptive',
  'opus-5 adaptive+max kabul',
);

// fable: disabled hiçbir effort'ta kabul edilmez
ok(
  V({ model: 'claude-fable-5', thinking: 'disabled', effort: 'low', maxTokens: 400 }).error ===
    'disabled_not_allowed',
  'fable disabled reddedilir (düşünme daima açık)',
);
ok(
  V({ model: 'claude-fable-5', thinking: 'adaptive', effort: 'high', maxTokens: 400 }).ok === true,
  'fable adaptive kabul',
);

// haiku: thinking/output_config gönderilmez
const okHaiku = V({ model: 'claude-haiku-4-5', maxTokens: 400 });
ok(
  okHaiku.ok === true &&
    okHaiku.request.thinking === undefined &&
    okHaiku.request.output_config === undefined,
  'haiku istek gövdesinde thinking/output_config YOK',
);

// sonnet-4.6: xhigh desteklemez
ok(
  V({ model: 'claude-sonnet-4-6', thinking: 'adaptive', effort: 'xhigh', maxTokens: 400 }).error ===
    'bad_effort',
  'sonnet-4.6 xhigh reddedilir',
);
// geçersiz thinking değeri
ok(
  V({ model: 'claude-opus-5', thinking: 'yandan', effort: 'low', maxTokens: 400 }).error ===
    'bad_thinking',
  'geçersiz thinking değeri reddedilir',
);

// --- Depo davranışı: set / reset / kalıcılık / geçmiş / fallback ---
const dir = mkdtempSync(join(tmpdir(), 'kbai-'));
try {
  const s = AI.open({ file: join(dir, 'cfg.json') });

  ok(s.overridden() === false, 'başta override yok (varsayılan)');
  ok(s.current().model === 'claude-opus-5', 'varsayılan model opus-5');

  // Geçerli set
  ok(
    s.set({ model: 'claude-sonnet-5', thinking: 'adaptive', effort: 'medium', maxTokens: 600 }, 't1')
      .ok === true,
    'geçerli config kabul',
  );
  ok(s.current().model === 'claude-sonnet-5' && s.overridden() === true, 'config kaydedildi');
  ok(
    s.request().model === 'claude-sonnet-5' && s.request().output_config.effort === 'medium',
    'request etkin config’i yansıtır',
  );

  // GEÇERSİZ set override’ı değiştirmez (fallback: eski geçerli config korunur)
  ok(
    s.set({ model: 'claude-opus-5', thinking: 'disabled', effort: 'max', maxTokens: 400 }, 't2')
      .error === 'disabled_effort_too_high',
    'geçersiz config reddedilir',
  );
  ok(s.current().model === 'claude-sonnet-5', 'reddedilen set etkin config’i bozmadı');

  // Kalıcılık: yeni örnek dosyadan okur
  const s2 = AI.open({ file: join(dir, 'cfg.json') });
  ok(s2.current().model === 'claude-sonnet-5', 'config diske kalıcı (restart’ta korunur)');
  ok(s2.history().length >= 1, 'değişiklik geçmişi tutulur');

  // Geri al → varsayılana (gömülü default fallback)
  s2.reset('t3');
  ok(
    s2.overridden() === false && s2.current().model === 'claude-opus-5',
    'reset gömülü varsayılana döner',
  );
  ok(s2.request().model === 'claude-opus-5', 'reset sonrası request varsayılanı kullanır');
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* yoksay */
  }
}

console.log(`\nai-config: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
