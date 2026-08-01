/**
 * DENETİM KARARLARINI ÜRETİME UYGULA — "yalnızca onaylı içerik paketlenir".
 *
 * reviews/<key>.json kararlarını okur ve kaynağın veri dosyasını yeniden yazar:
 *   • reddedilenler ÇIKARILIR (ama SİLİNMEZ → rejected/<key>.json'a gerekçesiyle
 *     arşivlenir; yeniden üretimde aynı hata tekrarlanırsa fark edilsin),
 *   • düzeltmeler UYGULANIR,
 *   • onaylı + (varsayılan) henüz denetlenmemiş TUTULUR.
 *
 * --strict : denetlenmemişleri de ÇIKAR (kesinlikle yalnız onaylı paketlenir).
 * --dry    : dosyayı yazma, yalnız raporla.
 *
 * Kullanım: node tools/content-review/apply-reviews.mjs <key> [--strict] [--dry]
 *           key: hints-tr, cards-tr, themes-tr, answers-tr, ...
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sourceByKey, adapter, loadItems } from './sources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith('--'));
const strict = args.includes('--strict');
const dry = args.includes('--dry');

const src = sourceByKey(key);
if (!src) {
  console.error(`Kaynak yok: "${key}". Geçerli: hints-tr, hints-en, cards-tr, cards-en, themes-tr, themes-en, answers-tr`);
  process.exit(1);
}

const decPath = join(HERE, 'reviews', `${src.key}.json`);
let decisions = {};
try {
  decisions = JSON.parse(await readFile(decPath, 'utf8'));
} catch {
  console.error(`Karar dosyası yok (${decPath}) — önce denetim yap: node tools/content-review/server.mjs`);
  process.exit(1);
}

const raw = JSON.parse(await readFile(src.file, 'utf8'));
const { out, kept, rejected, undecided } = adapter(src.type).approvedRaw(raw, decisions, src.lang, strict);

// Reddedilenleri gerekçeleriyle arşivle (SİLME).
const { items } = await loadItems(src);
const byId = new Map(items.map((it) => [it.id, it]));
const archive = Object.entries(decisions)
  .filter(([, d]) => d.status === 'rejected')
  .map(([id, d]) => ({
    id,
    word: byId.get(id)?.word ?? id,
    content: byId.get(id)?.fields?.map((f) => `${f.label}: ${f.value}`).join(' · ') ?? '',
    reason: d.reason ?? '',
    at: d.at ?? '',
  }));

console.log(`\n[${src.key}] ${src.file}`);
console.log(`  Onaylı+tutulan: ${kept}  ·  Reddedilen (çıkarıldı): ${rejected}  ·  Denetlenmemiş: ${undecided}${strict ? ' (strict → çıkarıldı)' : ' (tutuldu)'}`);
if (archive.length) console.log(`  Arşivlenen red (gerekçeli): ${archive.length} → rejected/${src.key}.json`);

if (dry) {
  console.log('  (--dry → dosya yazılmadı)');
  process.exit(0);
}

// Veri dosyasını yaz (tema/answer için app'in beklediği biçim korunur).
await writeFile(src.file, JSON.stringify(out) + '\n', 'utf8');
// Red arşivini yaz (silme değil işaretleme).
await mkdir(join(HERE, 'rejected'), { recursive: true });
await writeFile(join(HERE, 'rejected', `${src.key}.json`), JSON.stringify(archive, null, 2) + '\n', 'utf8');
console.log(`  ✓ Yazıldı. Yalnız onaylı${strict ? '' : ' + denetlenmemiş'} içerik paketlenecek.\n`);
