/**
 * PANEL İÇERİK İNDEKSİ — kapsam verisini rooms-server'a taşınabilir hâle getirir.
 *
 * Panel (rooms-server) depoya erişemez; kapsam göstergesi bu KOMPAKT indeksten
 * beslenir. CI ile AYNI çekirdeği (scripts/lib-content-coverage.mjs) kullanır →
 * panel ve CI aynı sonucu üretir. Deploy bu dosyayı sunucuya kopyalar.
 *
 * Çıktı: rooms-server/content-index.json
 *   { generatedAt, categories: [{ id, label, total, covered, missing:[...] }] }
 *
 * Kullanım: node scripts/build-content-index.mjs
 */
import { writeFile } from 'node:fs/promises';
import { computeCoverage } from './lib-content-coverage.mjs';

const OUT = new URL('../rooms-server/content-index.json', import.meta.url);
const MISSING_CAP = 5000; // dosya boyutu koruması (kapsanan sayısı yine tam)

const { results } = await computeCoverage();
const categories = results.map((r) => ({
  id: r.id,
  label: r.label,
  total: r.total,
  covered: r.total - r.missing.length,
  missing: r.missing.slice(0, MISSING_CAP),
}));

const out = { generatedAt: new Date().toISOString(), categories };
await writeFile(OUT, JSON.stringify(out) + '\n', 'utf8');

console.log(`✅ İçerik indeksi → rooms-server/content-index.json (${categories.length} kategori)`);
for (const c of categories) {
  const pct = c.total ? Math.round((c.covered / c.total) * 100) : 100;
  console.log(
    `   ${c.id.padEnd(15)} ${String(c.covered).padStart(4)}/${String(c.total).padStart(4)} (%${pct})`,
  );
}
