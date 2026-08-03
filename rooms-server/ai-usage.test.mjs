/**
 * ai-usage.js testleri — toplu sayaç + maliyet (tek kaynak fiyat) + bütçe + gizlilik.
 * Kullanım: node rooms-server/ai-usage.test.mjs
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const AU = require('./ai-usage.js');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.error('  ❌', m);
  }
};

// Sahte fiyat tablosu (tek kaynak simülasyonu): opus-5 = $5/$25.
const priceOf = (model) => (model === 'claude-opus-5' ? { inUsd: 5, outUsd: 25 } : null);
const T = Date.parse('2026-08-03T10:00:00Z'); // sabit an (deterministik)

const dir = mkdtempSync(join(tmpdir(), 'kbau-'));
try {
  const file = join(dir, 'u.json');
  const u = AU.open({ file });

  // İpucu çağrısı: giriş 1000, çıkış 500, gecikme 800ms
  u.record({ kind: 'hint', model: 'claude-opus-5', inputTokens: 1000, outputTokens: 500, latencyMs: 800, at: T }); // prettier-ignore
  // İkinci ipucu: hata
  u.record({ kind: 'hint', model: 'claude-opus-5', inputTokens: 800, outputTokens: 0, latencyMs: 1200, error: true, at: T }); // prettier-ignore
  // Panel testi (ayrı kalem)
  u.record({ kind: 'test', model: 'claude-opus-5', inputTokens: 500, outputTokens: 200, latencyMs: 600, at: T }); // prettier-ignore
  // Hız sınırına takılan istek
  u.recordRateLimited({ kind: 'hint', at: T });

  const s = u.summary(priceOf, 30, T);
  ok(s.kinds.hint.req === 2, 'hint istek sayısı toplandı');
  ok(s.kinds.hint.err === 1 && s.kinds.hint.errRate === 50, 'hata + hata oranı (%50)');
  ok(s.kinds.hint.rl === 1, 'hız sınırı sayacı ayrı tutuldu');
  ok(s.kinds.hint.avgLatMs === 1000, 'ortalama gecikme (800+1200)/2');
  // maliyet: (1000+800)/1e6*5 + (500+0)/1e6*25 = 0.009 + 0.0125 = 0.0215
  ok(Math.abs(s.kinds.hint.costUsd - 0.0215) < 1e-6, `hint maliyeti fiyat tablosundan (${s.kinds.hint.costUsd})`); // prettier-ignore
  // test kalemi AYRI: 500/1e6*5 + 200/1e6*25 = 0.0025 + 0.005 = 0.0075
  ok(Math.abs(s.kinds.test.costUsd - 0.0075) < 1e-6, 'içerik/test kalemi ayrı hesaplanır');
  ok(s.kinds.content.req === 0, 'içerik kalemi boş (Faz B besleyecek)');

  // Bilinmeyen model fiyatı → maliyet 0 ama token yine sayılır
  u.record({ kind: 'hint', model: 'gizemli-model', inputTokens: 9999, outputTokens: 9999, at: T });
  const s2 = u.summary(priceOf, 30, T);
  ok(s2.kinds.hint.inTok === 1000 + 800 + 9999, 'bilinmeyen modelin tokeni yine sayılır');
  ok(Math.abs(s2.kinds.hint.costUsd - 0.0215) < 1e-6, 'bilinmeyen model maliyeti 0 sayılır');

  // Bütçe: aylık eşik 0.02 → bu ay maliyeti (0.0215+0.0075=0.029) aşar
  u.setBudget({ monthlyUsd: 0.02, autoOff: true });
  ok(Math.abs(u.monthCostUsd(priceOf, T) - 0.029) < 1e-6, 'aylık maliyet toplandı');
  ok(u.budgetExceeded(priceOf, T) === true, 'bütçe eşiği aşıldı → uyarı');
  u.setBudget({ monthlyUsd: 1 });
  ok(u.budgetExceeded(priceOf, T) === false, 'yüksek eşik → aşılmadı');
  ok(u.budget().autoOff === true, 'oto-kapat bayrağı korunur');

  // GİZLİLİK: depoda IP/kimlik/oyuncu izi YOK
  const rawFile = readFileSync(file, 'utf8');
  ok(!/ip|player|oyuncu|user|kimlik/i.test(rawFile), 'depoda kişiye bağlı iz yok (yalnız toplu)');

  // Kalıcılık
  const u2 = AU.open({ file });
  const s3 = u2.summary(priceOf, 30, T);
  ok(s3.kinds.hint.req === 3, 'sayaçlar diske kalıcı');
  ok(u2.budget().monthlyUsd === 1, 'bütçe diske kalıcı');
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* yoksay */
  }
}

console.log(`\nai-usage: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
