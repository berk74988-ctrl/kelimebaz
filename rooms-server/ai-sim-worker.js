'use strict';

/**
 * YZ ÖLÇÜM WORKER'I — ai-sim ölçümünü AYRI THREAD'de koşturur.
 *
 * Neden: ölçüm CPU-yoğun (yüzlerce maç × entropi). Ana thread'de koşarsa oda
 * sunucusu tüm kullanıcılar için saniyelerce DONAR. Worker thread'de ana olay
 * döngüsü bloklanmaz. server.js tek worker + eşzamanlılık + zaman aşımı yönetir.
 *
 * workerData: { wordsFile, length, configs, matches, seed }
 * Çıktı (postMessage): { results } | { error }
 */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const sim = require('./ai-sim');

try {
  const { wordsFile, length, configs, matches, seed } = workerData;
  const raw = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
  const words = Array.isArray(raw) ? raw : raw.words || [];
  const pool = words
    .map((w) => String(w).toLocaleUpperCase('tr'))
    .filter((w) => [...w].length === length);
  if (pool.length < 20) {
    parentPort.postMessage({ error: 'pool_too_small' });
  } else {
    const results = sim.measureAll(pool, configs, { matches, seed });
    parentPort.postMessage({ results, poolSize: pool.length });
  }
} catch (e) {
  parentPort.postMessage({ error: String((e && e.message) || e).slice(0, 80) });
}
