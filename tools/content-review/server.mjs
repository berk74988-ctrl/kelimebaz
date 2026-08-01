/**
 * İÇERİK DENETİM SUNUCUSU — küçük, bağımlılıksız Node HTTP sunucu.
 *
 * Yerelde çalışır: ne veritabanı, ne kimlik doğrulama, ne dağıtım. Kararlar
 * repo içindeki JSON dosyalarına yazılır (reviews/<key>.json) → araç kapanıp
 * açılınca kaldığı yerden devam eder. Reddedilen SİLİNMEZ, gerekçesiyle işaretlenir.
 *
 * Çalıştırma:  node tools/content-review/server.mjs   → http://localhost:4517
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCES, sourceByKey, loadItems } from './sources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..'); // repo kökü
const REVIEWS = join(HERE, 'reviews');
const PORT = Number(process.env.PORT || 4517);

const decisionsPath = (key) => join(REVIEWS, `${key}.json`);

async function readDecisions(key) {
  try {
    return JSON.parse(await readFile(decisionsPath(key), 'utf8'));
  } catch {
    return {};
  }
}
async function writeDecisions(key, data) {
  await mkdir(REVIEWS, { recursive: true });
  await writeFile(decisionsPath(key), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    // Statik arayüz
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      const html = await readFile(join(HERE, 'index.html'), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // Kaynak listesi + denetim özeti (ilerleme göstergesi için)
    if (req.method === 'GET' && path === '/api/sources') {
      const out = [];
      for (const s of SOURCES) {
        let total = 0;
        try {
          ({ items: { length: total } = { length: 0 } } = await loadItems(s));
        } catch {
          total = -1; // dosya yok/okunamadı
        }
        const d = await readDecisions(s.key);
        const vals = Object.values(d);
        out.push({
          key: s.key,
          label: s.label,
          type: s.type,
          total,
          approved: vals.filter((v) => v.status === 'approved' || v.status === 'edited').length,
          rejected: vals.filter((v) => v.status === 'rejected').length,
          reviewed: vals.length,
        });
      }
      return json(res, 200, out);
    }

    // Bir kaynağın kayıtları + mevcut kararları
    if (req.method === 'GET' && path === '/api/items') {
      const src = sourceByKey(url.searchParams.get('source'));
      if (!src) return json(res, 404, { error: 'kaynak yok' });
      const { items } = await loadItems(src);
      const decisions = await readDecisions(src.key);
      return json(res, 200, { source: src.key, label: src.label, type: src.type, items, decisions });
    }

    // Karar kaydet: { source, id, status, edited?, reason? }
    if (req.method === 'POST' && path === '/api/decision') {
      const b = await readBody(req);
      const src = sourceByKey(b.source);
      if (!src) return json(res, 404, { error: 'kaynak yok' });
      if (!b.id || !['approved', 'rejected', 'edited', 'clear'].includes(b.status)) {
        return json(res, 400, { error: 'geçersiz karar' });
      }
      const decisions = await readDecisions(src.key);
      if (b.status === 'clear') {
        delete decisions[b.id]; // denetlenmemişe geri al
      } else {
        decisions[b.id] = {
          status: b.status,
          ...(b.edited ? { edited: b.edited } : {}),
          ...(b.reason ? { reason: b.reason } : {}),
          at: new Date().toISOString(),
        };
      }
      await writeDecisions(src.key, decisions);
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: 'bulunamadı' });
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`\n📋 İçerik denetim aracı → http://localhost:${PORT}`);
  console.log(`   Kararlar: tools/content-review/reviews/*.json`);
  console.log(`   Kapatmak için Ctrl+C.\n`);
  void ROOT;
});
