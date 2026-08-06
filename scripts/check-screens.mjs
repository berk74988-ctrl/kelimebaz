/**
 * KELİMEBAZ — EKRAN ENVANTERİ KONTROLÜ (ağ: sessiz özellik kaybını engeller).
 *
 * Neden var: 058c850 sonuç ekranını sadeleştirirken kelime kartı (OYUN-192) ve
 * maç analizi (OYUN-208) — ikisi de tamamlanmış paketler — sessizce KALDIRILDI.
 * Ne CI ne de mevcut Playwright kontrolleri yakaladı. Bu script, her kilit ekranı
 * gerçek tarayıcıda gezip scripts/screen-inventory.json'daki ZORUNLU bölümlerin
 * hâlâ DOM'da olduğunu doğrular; eksik olanı ADIYLA bildirir ve KIRMIZI olur.
 *
 * Tasarım ilkesi: DETERMİNİK ol — ekran klavyesiyle oyun OYNAMA (o yol yavaş
 * koşucuda flaky). Ekranlara localStorage seed + buton tıklamayla ulaş, sonra
 * yalnız KOŞULSUZ görünen bölümleri (word-card, analiz, butonlar…) yokla. Böylece
 * bu kontrol CI'da ENGELLEYİCİ (hard gate) olabilir.
 *
 * Kullanım: node scripts/check-screens.mjs [url]
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const HERE = dirname(fileURLToPath(import.meta.url));
const INVENTORY = JSON.parse(readFileSync(join(HERE, 'screen-inventory.json'), 'utf8'));

const PRACTICE_KEY = 'kelimebaz:game:practice';

// Bitmiş oyun tohumları — analiz bölümünün render olması için tahminler GEREKLİ
// (analyzeGuesses tahmin ister). Kelimeler sözlükte gerçek 5-harfli kelimeler.
const SEED_WIN = {
  mode: 'practice',
  dayIndex: -1,
  answer: 'KALEM',
  guesses: ['KİTAP', 'KALEM'],
  status: 'won',
  lang: 'tr',
};
const SEED_LOSE = {
  mode: 'practice',
  dayIndex: -1,
  answer: 'ŞEKER',
  guesses: ['KİTAP', 'ÇORBA', 'GÜNEŞ', 'KALEM', 'ARABA', 'ÇİÇEK'],
  status: 'lost',
  lang: 'tr',
};

/** localStorage'a bitmiş oyunu yaz → sayfayı yenile → Serbest Oyna'ya gir. */
async function seedResult(page, seed) {
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.evaluate(({ key, s }) => localStorage.setItem(key, JSON.stringify(s)), {
    key: PRACTICE_KEY,
    s: seed,
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.mode.m-practice').click();
  // Bileşen host'u (<app-result-modal>) 0×0 → 'visible' beklemesi takılır; görünür
  // .modal çocuğunu bekle. Bölüm sayımları count() ile (görünürlükten bağımsız) yapılır.
  await page.waitForSelector('app-result-modal .modal', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(400); // kutu çevirme animasyonu otursun
}

/**
 * Her ekrana nasıl ULAŞILACAĞI — SADECE gezinme mekaniği (mantık burada, veri
 * JSON'da). Yeni bir 'reach' değeri eklersen buraya bir dal ekle.
 */
const REACH = {
  async menu(page) {
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    await page.waitForSelector('.wordmark', { timeout: 8000 });
  },
  async game(page) {
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    await page.locator('.mode.m-practice').click();
    await page.waitForSelector('app-board', { timeout: 8000 });
    await page.waitForTimeout(300);
  },
  async ['result-win'](page) {
    await seedResult(page, SEED_WIN);
  },
  async ['result-lose'](page) {
    await seedResult(page, SEED_LOSE);
  },
  async shop(page) {
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    await page.locator('.p-shop').click();
    await page.waitForSelector('.grid .item', { timeout: 8000 });
  },
  async settings(page) {
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    await page.locator('.tools .tool').filter({ hasText: '⚙️' }).click();
    await page.waitForSelector('.lang-seg', { timeout: 8000 });
  },
  async room(page) {
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    await page.locator('.mode.m-friends').click();
    await page.waitForSelector('.rs .hero', { timeout: 8000 });
  },
};

const browser = await chromium.launch();
let totalMissing = 0;
let reachFails = 0;

console.log(`\n🔎 Ekran envanteri kontrolü → ${TARGET}\n${'─'.repeat(60)}`);

for (const screen of INVENTORY.screens) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  // Dili TR'ye SABİTLE (localStorage navigator'ı ezer) → CI koşucusunun yerelinden
  // bağımsız, deterministik. Sonuç ekranı tohumu da 'tr' kayıtla eşleşsin diye şart.
  await ctx.addInitScript(() => localStorage.setItem('kelimebaz:lang', 'tr'));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const reach = REACH[screen.reach];
  if (!reach) {
    console.log(
      `\n✗ ${screen.name}: bilinmeyen reach "${screen.reach}" (check-screens.mjs'e ekle)`,
    );
    reachFails++;
    await ctx.close();
    continue;
  }

  try {
    await reach(page);
  } catch (e) {
    console.log(`\n✗ ${screen.name}: ekrana ULAŞILAMADI — ${String(e.message).split('\n')[0]}`);
    reachFails++;
    await ctx.close();
    continue;
  }

  // Zorunlu bölümleri yokla
  const missing = [];
  for (const s of screen.sections) {
    const n = await page.locator(s.sel).count();
    if (n === 0) missing.push(s);
  }

  if (missing.length === 0) {
    console.log(`\n✓ ${screen.name}  (${screen.sections.length} bölüm tam)`);
  } else {
    totalMissing += missing.length;
    console.log(`\n✗ ${screen.name}  — EKSİK ${missing.length}/${screen.sections.length} bölüm:`);
    for (const m of missing) console.log(`    · ${m.name}   [${m.sel}]`);
  }
  if (pageErrors.length) {
    console.log(`    ⚠ konsol/sayfa hatası: ${pageErrors.slice(0, 3).join(' | ')}`);
  }

  await ctx.close();
}

await browser.close();

console.log(`\n${'─'.repeat(60)}`);
if (totalMissing === 0 && reachFails === 0) {
  console.log(`✅ Tüm kilit ekranlarda zorunlu bölümler yerinde.\n`);
  process.exit(0);
} else {
  const parts = [];
  if (totalMissing) parts.push(`${totalMissing} eksik bölüm`);
  if (reachFails) parts.push(`${reachFails} ekrana ulaşılamadı`);
  console.log(`❌ ${parts.join(' · ')}. Bir bölüm bilerek kaldırıldıysa önce`);
  console.log(`   scripts/screen-inventory.json'dan çıkar + gerekçeyi commit mesajına yaz.\n`);
  process.exit(1);
}
