/**
 * KELİMEBAZ — uçtan uca senaryo testleri (gerçek tarayıcılar).
 *
 * Oyunu GERÇEKTEN oynar ve ana akışları doğrular:
 *   1) Kazanma
 *   2) Kaybetme (6 hak) + doğru kelimenin gösterilmesi
 *   3) Geçersiz kelime (sözlükte yok / eksik harf)
 *   4) HARF TEKRARI — zor renk senaryoları
 *   5) localStorage — sayfa yenilenince oyun devam ediyor mu
 *   6) Günün kelimesi — tekrar oynanamıyor mu
 *   7) Tema ve istatistik kalıcılığı
 *
 * Chromium, Firefox ve WebKit (Safari motoru) üzerinde çalışır.
 *
 * Kullanım: node scripts/scenarios-check.mjs [url] [browser]
 */
import { chromium, firefox, webkit } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';
const ONLY = process.argv[3];

const ENGINES = [
  ['Chromium', chromium],
  ['Firefox', firefox],
  ['WebKit', webkit],
].filter(([n]) => !ONLY || n.toLowerCase() === ONLY.toLowerCase());

const PRACTICE_KEY = 'kelimebaz:game:practice';
const DAILY_KEY = 'kelimebaz:game:daily';

let totalFail = 0;

for (const [engineName, engine] of ENGINES) {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${engineName}`);
  console.log('═'.repeat(72));

  const browser = await engine.launch();
  const results = [];

  const check = (name, ok, detail = '') => {
    results.push([name, ok, detail]);
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  → ${detail}` : ''}`);
  };

  // --- yardımcılar ---
  async function newPage() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    return page;
  }

  /** Serbest oyunu, cevabı BİZİM belirlediğimiz kelimeyle başlatır. */
  async function startWithAnswer(page, answer) {
    await page.evaluate(
      ({ key, ans }) => {
        localStorage.setItem(
          key,
          JSON.stringify({ mode: 'practice', dayIndex: -1, answer: ans, guesses: [], status: 'playing' }),
        );
      },
      { key: PRACTICE_KEY, ans: answer },
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Serbest Oyna/ }).click();
    await page.waitForSelector('app-board');
  }

  /** Ekran klavyesiyle kelime yazıp gönderir (Türkçe harfler için güvenli). */
  async function guess(page, word) {
    for (const ch of word) await page.locator(`.key[aria-label="${ch}"]`).click();
    await page.locator('.key[aria-label="ENTER"]').click();
    await page.waitForTimeout(1150); // açılma animasyonu + giriş kilidi
  }

  /** Bir satırın renklerini emoji olarak okur. */
  async function rowColors(page, rowIndex) {
    return page.evaluate((r) => {
      const tiles = [...document.querySelectorAll('.row')][r].querySelectorAll('app-tile');
      return [...tiles]
        .map((t) =>
          t.classList.contains('correct') ? '🟩' : t.classList.contains('present') ? '🟨' : t.classList.contains('absent') ? '⬜' : '·',
        )
        .join('');
    }, rowIndex);
  }

  const modalOpen = (page) => page.evaluate(() => !!document.querySelector('.preview'));

  // ═══ 1) KAZANMA ═══
  {
    const page = await newPage();
    await startWithAnswer(page, 'KALEM');
    await guess(page, 'KALEM');
    await page.waitForTimeout(1100);

    const colors = await rowColors(page, 0);
    const won = await page.evaluate(() =>
      document.querySelector('.head')?.textContent?.includes('Tebrikler'),
    );
    check('Kazanma: doğru tahmin → 5 yeşil', colors === '🟩🟩🟩🟩🟩', colors);
    check('Kazanma: kutlama ekranı açılıyor', !!won);
    await page.context().close();
  }

  // ═══ 2) KAYBETME ═══
  {
    const page = await newPage();
    await startWithAnswer(page, 'KALEM');
    for (const w of ['KİTAP', 'ÇORBA', 'DENİZ', 'GÜNEŞ', 'BULUT', 'ŞEKER']) await guess(page, w);
    await page.waitForTimeout(1200);

    const shown = await page.evaluate(() => document.querySelector('.answer')?.textContent?.trim());
    const lost = await page.evaluate(() =>
      document.querySelector('.head')?.textContent?.includes('olmadı'),
    );
    check('Kaybetme: 6 hak bitince oyun bitiyor', !!lost);
    check('Kaybetme: DOĞRU KELİME gösteriliyor', shown === 'KALEM', `gösterilen: "${shown}"`);
    await page.context().close();
  }

  // ═══ 3) GEÇERSİZ KELİME ═══
  {
    const page = await newPage();
    await startWithAnswer(page, 'KALEM');

    // sözlükte olmayan kelime
    for (const ch of 'ZZZZZ') await page.locator(`.key[aria-label="${ch}"]`).click();
    await page.locator('.key[aria-label="ENTER"]').click();
    await page.waitForTimeout(300);

    const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent?.trim());
    const rowsUsed = await page.evaluate(() => document.querySelectorAll('app-tile.reveal').length);
    check('Geçersiz: "Sözlükte yok" uyarısı', toast === 'Sözlükte yok', `"${toast}"`);
    check('Geçersiz: satır ilerlemiyor', rowsUsed === 0);

    // harfler duruyor mu → düzeltilebiliyor mu
    await page.locator('.key[aria-label="Sil"]').click();
    await page.waitForTimeout(150);
    const afterDel = await page.evaluate(() =>
      [...document.querySelectorAll('.row')][0].textContent.replace(/\s/g, ''),
    );
    check('Geçersiz: satır kilitlenmiyor, düzeltilebiliyor', afterDel === 'ZZZZ', `"${afterDel}"`);

    // uyarı kayboluyor mu
    await page.waitForTimeout(2200);
    const gone = await page.evaluate(() => !document.querySelector('.toast'));
    check('Geçersiz: uyarı birkaç saniyede kayboluyor', gone);

    // eksik harf
    for (let i = 0; i < 4; i++) await page.locator('.key[aria-label="Sil"]').click();
    await page.locator('.key[aria-label="K"]').click();
    await page.locator('.key[aria-label="ENTER"]').click();
    await page.waitForTimeout(300);
    const toast2 = await page.evaluate(() => document.querySelector('.toast')?.textContent?.trim());
    check('Geçersiz: eksik harfte "5 harf girin"', toast2 === '5 harf girin', `"${toast2}"`);
    await page.context().close();
  }

  // ═══ 4) HARF TEKRARI (zor renk senaryoları) ═══
  {
    // ÖNEMLİ: Tahminler SÖZLÜKTEKİ gerçek kelimeler olmalı — oyun uydurma
    // kelimeleri (doğru şekilde) reddeder. Bu yüzden gerçek kelimelerle
    // kurulmuş tekrar senaryoları kullanıyoruz.
    const CASES = [
      // [cevap, tahmin, beklenen, açıklama]
      // ARABA'da 3 A var ama KALEM'de sadece 1 A → yalnızca BİRİ sarı olmalı
      ['KALEM', 'ARABA', '🟨⬜⬜⬜⬜', 'tahminde 3 A, cevapta 1 A'],
      // Tersi: cevapta 3 A, tahminde 1 A → o tek A sarı
      ['ARABA', 'KALEM', '⬜🟨⬜⬜⬜', 'cevapta 3 A, tahminde 1 A'],
      // EKMEK: 2 E + 2 K. ŞEKER: 2 E + 1 K → yeşil önce sayılır, kalanlar sarı
      ['EKMEK', 'ŞEKER', '⬜🟨🟨🟩⬜', 'çift harf, yeşil önceliği'],
      // HAMAM: 2 A + 2 M. MASAL: iki A yerinde, M sarı
      ['HAMAM', 'MASAL', '🟨🟩⬜🟩⬜', 'iki yeşil + bir sarı'],
      // Çift Ç'li kelimede tam isabet
      ['ÇİÇEK', 'ÇİÇEK', '🟩🟩🟩🟩🟩', 'çift Ç, tam isabet'],
      // Cevapta 2 K, tahminde 1 K, yanlış yerde → sarı
      ['EKMEK', 'KİTAP', '🟨⬜⬜⬜⬜', 'cevapta 2 K, tahminde 1 K'],
    ];

    for (const [answer, word, expected, note] of CASES) {
      const page = await newPage();
      await startWithAnswer(page, answer);
      await guess(page, word);
      const got = await rowColors(page, 0);
      check(
        `Harf tekrarı: ${answer} / ${word} (${note})`,
        got === expected,
        got === expected ? got : `beklenen ${expected}, gelen ${got}`,
      );
      await page.context().close();
    }
  }

  // ═══ 5) localStorage — sayfa yenilenince devam ═══
  {
    const page = await newPage();
    await startWithAnswer(page, 'KALEM');
    await guess(page, 'KİTAP');

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Serbest Oyna/ }).click();
    await page.waitForSelector('app-board');
    await page.waitForTimeout(400);

    const revealed = await page.evaluate(() => document.querySelectorAll('app-tile.reveal').length / 5);
    const firstRow = await page.evaluate(() =>
      [...document.querySelectorAll('.row')][0].textContent.replace(/\s/g, ''),
    );
    check('Kalıcılık: yarım oyun sayfa yenilenince devam ediyor', revealed === 1 && firstRow === 'KİTAP', `${revealed} satır, "${firstRow}"`);
    await page.context().close();
  }

  // ═══ 6) GÜNÜN KELİMESİ — tekrar oynanamıyor ═══
  {
    const page = await newPage();

    // 1) Günlük oyunu bir kez başlat → uygulama BUGÜNÜN kaydını oluştursun
    await page.getByRole('button', { name: /Günün Kelimesi|Sonucu Gör/ }).click();
    await page.waitForSelector('app-board');
    await page.waitForTimeout(300);

    // 2) O kaydı "kazanılmış" hâle getir (gerçek dayIndex korunur)
    await page.evaluate((key) => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.guesses = [saved.answer];
      saved.status = 'won';
      localStorage.setItem(key, JSON.stringify(saved));
    }, DAILY_KEY);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const doneShown = await page.evaluate(() => !!document.querySelector('.done'));
    const countdown = await page.evaluate(() => !!document.querySelector('app-countdown'));
    check('Günlük: bitmiş oyun başlık ekranında gösteriliyor', doneShown);
    check('Günlük: bir sonraki kelimeye geri sayım gösteriliyor', countdown);

    // 3) Serbest oyun oyna → günlük kayıt EZİLMEMELİ (eski bir hataydı)
    await page.getByRole('button', { name: /Serbest Oyna/ }).click();
    await page.waitForSelector('app-board');
    await page.getByRole('button', { name: /Başlık ekranına dön/ }).click();
    await page.waitForTimeout(300);

    const daily = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), DAILY_KEY);
    check('Günlük: serbest oyun günlük kaydı EZMİYOR', daily?.status === 'won', `durum: ${daily?.status}`);

    // 4) Günlüğe dön → yeni oyun başlamamalı, bitmiş tahta durmalı
    await page.getByRole('button', { name: /Sonucu Gör/ }).click();
    await page.waitForSelector('app-board');
    await page.waitForTimeout(400);
    const stillOver = await page.evaluate(() => document.querySelectorAll('app-tile.reveal').length >= 5);
    check('Günlük: tekrar oynanamıyor, bitmiş tahta duruyor', stillOver);

    await page.context().close();
  }

  // ═══ 7) TEMA + İSTATİSTİK KALICILIĞI ═══
  {
    const page = await newPage();
    await startWithAnswer(page, 'KALEM');
    await guess(page, 'KALEM'); // kazan
    await page.waitForTimeout(1100);

    // temayı değiştir
    await page.getByRole('button', { name: /Sonuç ekranını kapat/ }).click();
    await page.getByRole('button', { name: /moda geç/ }).click();
    const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);

    await page.reload({ waitUntil: 'networkidle' });
    const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
    check('Tema: sayfa yeninlense de korunuyor', themeBefore === themeAfter, `${themeBefore} → ${themeAfter}`);

    const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('kelimebaz:stats') ?? '{}'));
    check('İstatistik: kazanma kaydedildi', stats.played === 1 && stats.won === 1, `oynanan ${stats.played}, kazanılan ${stats.won}`);
    await page.context().close();
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok).length;
  totalFail += failed;
  console.log(
    `\n  ${failed === 0 ? '✅' : '❌'} ${engineName}: ${results.length - failed}/${results.length} geçti`,
  );
}

console.log(`\n${'═'.repeat(72)}`);
if (totalFail === 0) {
  console.log('\n✅ TÜM SENARYOLAR, TÜM TARAYICILARDA GEÇTİ\n');
} else {
  console.log(`\n❌ Toplam ${totalFail} kontrol başarısız\n`);
  process.exit(1);
}
