import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const cg = require('./content-gen.js');

// Fiyat tablosu taklidi (ai-config priceOf ile aynı şekil): 1M token başına USD.
const priceOf = (m) => (m === 'claude-haiku-4-5' ? { inUsd: 1, outUsd: 5 } : { inUsd: 5, outUsd: 25 });

test('kategori: yalnız hint/card üretilebilir, difficulty/theme değil', () => {
  assert.equal(cg.isGeneratable('tr.hint'), true);
  assert.equal(cg.isGeneratable('en.card'), true);
  assert.equal(cg.isGeneratable('tr.difficulty'), false);
  assert.equal(cg.isGeneratable('tr.theme'), false);
  assert.equal(cg.isGeneratable('bogus'), false);
});

test('maliyet tahmini: fiyat × sayı × ortalama token', () => {
  const e = cg.estimateCost('tr.hint', 100, 'claude-haiku-4-5', priceOf);
  // hint avg {in:260,out:80} × 100 = 26000 in, 8000 out
  assert.equal(e.estInputTokens, 26000);
  assert.equal(e.estOutputTokens, 8000);
  // (26000/1e6)*1 + (8000/1e6)*5 = 0.026 + 0.04 = 0.066
  assert.ok(Math.abs(e.estUsd - 0.066) < 1e-6, `estUsd=${e.estUsd}`);
  assert.equal(cg.estimateCost('yok', 5, 'x', priceOf).error, 'bad_category');
  // bilinmeyen model → fiyat 0 → maliyet 0 ama token yine hesaplanır
  const z = cg.estimateCost('tr.card', 10, 'bogus-model', () => null);
  assert.equal(z.estUsd, 0);
  assert.equal(z.estInputTokens, 3200);
});

test('çıktı ayrıştırma: hint {c,h} ve card {t,e,s,z}', () => {
  const h = cg.parseOutput('hint', 'Buyrun: {"c":"İsim","h":"Yetişkin erkek insan"} teşekkürler');
  assert.equal(h.ok, true);
  assert.equal(h.content.c, 'İsim');
  assert.equal(h.content.h, 'Yetişkin erkek insan');

  const c = cg.parseOutput('card', '{"t":"Arka yön","e":"Geri gitti.","s":["a","b","c"],"z":["x"]}');
  assert.equal(c.ok, true);
  assert.equal(c.content.t, 'Arka yön');
  assert.deepEqual(c.content.s, ['a', 'b']); // en fazla 2
  assert.deepEqual(c.content.z, ['x']);

  assert.equal(cg.parseOutput('hint', 'JSON yok burada').error, 'parse');
  assert.equal(cg.parseOutput('hint', '{bozuk json').error, 'parse');
  assert.equal(cg.parseOutput('hint', '{"c":"İsim"}').error, 'parse'); // h yok
});

test('ön denetim: sızıntı / kısa / boş reddedilir', () => {
  // hint sızıntısı: ipucu kelimenin kendisini içeriyor
  assert.deepEqual(cg.precheck('KALEM', 'hint', { c: 'İsim', h: 'Kalem ile yazılır' }), {
    rejected: true,
    reason: 'leak',
  });
  // çekim ekiyle de yakalanır (leaksAnswer)
  assert.equal(cg.precheck('KALEM', 'hint', { c: 'İsim', h: 'Kalemi masaya koydu' }).rejected, true);
  // temiz hint geçer
  assert.deepEqual(cg.precheck('KALEM', 'hint', { c: 'İsim', h: 'Yazı yazmaya yarayan araç' }), {
    ok: true,
  });
  // kısa
  assert.equal(cg.precheck('KALEM', 'hint', { c: 'İsim', h: 'kısa' }).reason, 'too_short');
  // boş içerik
  assert.equal(cg.precheck('KALEM', 'hint', null).reason, 'empty');
  // card: tanım sızıntısı reddedilir ama örnek cümle kelimeyi içerebilir
  assert.equal(cg.precheck('GERİ', 'card', { t: 'Geri yön demektir', e: 'x' }).reason, 'leak');
  assert.deepEqual(
    cg.precheck('GERİ', 'card', { t: 'Arka yöne doğru olan', e: 'Araba geri gitti' }),
    { ok: true },
  );
});

test('store: taslak yaz/oku, sayaç, günlük bütçe, tavan aşımı, kalıcılık', () => {
  const file = join(tmpdir(), `cg-test-${process.pid}-${Date.now()}.json`);
  try {
    let s = cg.open({ file });
    assert.equal(s.hasDraft('tr.hint', 'KALEM'), false);

    s.addDraft({
      category: 'tr.hint',
      word: 'kalem',
      status: 'generated',
      content: { c: 'İsim', h: 'Yazı aracı' },
      inputTokens: 200,
      outputTokens: 60,
      costUsd: 0.001,
    });
    s.addDraft({ category: 'tr.hint', word: 'X', status: 'rejected', reason: 'leak' });

    assert.equal(s.hasDraft('tr.hint', 'KALEM'), true); // küçük harf de eşleşir (normalize)
    assert.equal(s.hasDraft('tr.hint', 'kalem'), true);
    assert.deepEqual(s.counts('tr.hint'), { generated: 1, rejected: 1 });
    assert.equal(s.listDrafts('tr.hint', 'generated').length, 1);

    // günlük bütçe: varsayılan 2 USD
    assert.equal(s.dailyBudgetUsd(), 2);
    assert.equal(s.dailySpent(), 0);
    assert.equal(s.wouldExceedDaily(1.5), false);
    assert.equal(s.wouldExceedDaily(2.5), true); // tavanı aşar
    s.addSpend(1.8);
    assert.ok(Math.abs(s.dailySpent() - 1.8) < 1e-9);
    assert.equal(s.wouldExceedDaily(0.5), true); // 1.8+0.5>2

    s.setBudget({ dailyUsd: 5, batchMax: 20 });
    assert.equal(s.dailyBudgetUsd(), 5);
    assert.equal(s.batchMax(), 20);
    assert.equal(s.wouldExceedDaily(0.5), false); // 1.8+0.5<5

    // kalıcılık: yeniden aç, veri durmalı
    s = cg.open({ file });
    assert.equal(s.hasDraft('tr.hint', 'KALEM'), true);
    assert.equal(s.dailyBudgetUsd(), 5);
    assert.ok(Math.abs(s.dailySpent() - 1.8) < 1e-9);
    assert.deepEqual(s.schema().drafts['tr.hint'], { generated: 1, rejected: 1 });
  } finally {
    rmSync(file, { force: true });
  }
});
