/**
 * KELİMEBAZ — ses sistemi doğrulaması (gerçek tarayıcı).
 *
 * ÖLÇER (iddia etmez):
 *   1. Müzik dosyası gerçekten sunuluyor mu, çalınabilir mi?
 *   2. Otomatik başlatma engellendiğinde ilk etkileşimde başlıyor mu?
 *   3. Kaydırıcılar müziğin ve efektlerin sesini AYRI AYRI değiştiriyor mu?
 *   4. Ayarlar sayfa yenilenince aynı şekilde geri geliyor mu?
 *
 * Kullanım: node scripts/audio-check.mjs [url]
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'http://localhost:4200';

const browser = await chromium.launch();
let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(46)} ${detail}`);
};

/** Sayfadaki <audio> öğesinin durumu. */
const music = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('audio') ?? window.__kbAudio ?? null;
    // Servis <audio>'yu new Audio() ile üretiyor → DOM'da olmayabilir.
    // Bu yüzden servisin kendi durumunu da okuyacağız (aşağıda ayrıca).
    return el ? { src: el.src, paused: el.paused, volume: el.volume, loop: el.loop } : null;
  });

// ---------------------------------------------------------------------------
console.log(`\nHedef: ${TARGET}\n`);
console.log('1) MÜZİK DOSYASI');
console.log('─'.repeat(64));

{
  const page = await browser.newPage();
  const res = await page.goto(new URL('music.mp3', TARGET).href);
  const len = Number(res.headers()['content-length'] ?? 0);
  check('music.mp3 sunuluyor', res.status() === 200, `HTTP ${res.status()}`);
  check('boyut makul', len > 100_000, `${(len / 1024 / 1024).toFixed(2)} MB`);
  await page.close();
}

// ---------------------------------------------------------------------------
console.log('\n2) OTOMATİK BAŞLATMA');
console.log('─'.repeat(64));

{
  // Chromium'a otomatik oynatma izni ver → "izin varsa gerçekten çalıyor mu?"
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // Servisin oluşturduğu Audio öğesini yakala ki test edebilelim
    const Orig = window.Audio;
    window.Audio = function (...a) {
      const el = new Orig(...a);
      window.__kbAudio = el;
      return el;
    };
  });
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const before = await page.evaluate(() => {
    const el = window.__kbAudio;
    return el ? { src: el.src, loop: el.loop, paused: el.paused, volume: el.volume } : null;
  });

  check('açılışta <audio> kuruldu', !!before, before ? new URL(before.src).pathname : 'YOK');
  check('döngüde çalacak şekilde ayarlı', before?.loop === true);
  check('ses seviyesi varsayılanda', before?.volume > 0 && before?.volume < 1, `${before?.volume}`);

  // Tarayıcı sesli otomatik oynatmayı engelleyebilir (standart politika).
  // Engellendiyse İLK ETKİLEŞİMDE başlamalı — asıl sınav bu.
  await page.mouse.click(10, 10);
  await page.waitForTimeout(700);

  const after = await page.evaluate(() => {
    const el = window.__kbAudio;
    return el ? { paused: el.paused, currentTime: el.currentTime } : null;
  });

  check(
    'ilk etkileşimden sonra müzik ÇALIYOR',
    after && after.paused === false,
    after ? `paused=${after.paused}, t=${after.currentTime.toFixed(2)}s` : '',
  );

  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n3) AYARLAR — İKİ KANAL AYRI');
console.log('─'.repeat(64));

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const Orig = window.Audio;
    window.Audio = function (...a) {
      const el = new Orig(...a);
      window.__kbAudio = el;
      return el;
    };
  });
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Ayarlar' }).first().click();
  await page.waitForTimeout(400);

  const musicRange = page.getByRole('slider', { name: /Müzik ses seviyesi/ });
  const sfxRange = page.getByRole('slider', { name: /Efekt sesleri seviyesi/ });

  check('müzik kaydırıcısı var', (await musicRange.count()) === 1);
  check('efekt kaydırıcısı var', (await sfxRange.count()) === 1);

  // Müziği %20'ye, efektleri %90'a çek
  await musicRange.fill('20');
  await sfxRange.fill('90');
  await page.waitForTimeout(300);

  const vol = await page.evaluate(() => window.__kbAudio?.volume ?? null);
  check('müzik kaydırıcısı <audio>.volume değiştiriyor', Math.abs(vol - 0.2) < 0.02, `volume=${vol}`);

  const stored = await page.evaluate(() => ({
    m: localStorage.getItem('kelimebaz:audio:musicVol'),
    s: localStorage.getItem('kelimebaz:audio:sfxVol'),
  }));
  check('efekt sesi AYRI kaydedildi', Math.abs(Number(stored.s) - 0.9) < 0.02, `sfx=${stored.s}`);
  check('müzik sesi ayrı kaydedildi', Math.abs(Number(stored.m) - 0.2) < 0.02, `music=${stored.m}`);

  // Müziği kapat
  await page.getByRole('switch', { name: /Müziği kapat/ }).click();
  await page.waitForTimeout(300);

  const afterMute = await page.evaluate(() => ({
    paused: window.__kbAudio?.paused,
    sfxOn: localStorage.getItem('kelimebaz:audio:sfxOn'),
  }));
  check('müzik kapatılınca durdu', afterMute.paused === true);
  check('efektler ETKİLENMEDİ', afterMute.sfxOn === '1');

  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n4) KALICILIK — OYUN TEKRAR AÇILINCA');
console.log('─'.repeat(64));

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'networkidle' });

  // Ayarları yaz, sonra sayfayı sıfırdan yükle
  await page.evaluate(() => {
    localStorage.setItem('kelimebaz:audio:musicVol', '0.12');
    localStorage.setItem('kelimebaz:audio:sfxVol', '0.77');
    localStorage.setItem('kelimebaz:audio:musicOn', '0');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Ayarlar' }).first().click();
  await page.waitForTimeout(400);

  const shown = await page.evaluate(() => {
    const rs = [...document.querySelectorAll('.rng')];
    const pcs = [...document.querySelectorAll('.pc')].map((e) => e.textContent.trim());
    const sw = document.querySelector('[role="switch"][aria-label*="Müzi"]');
    return { values: rs.map((r) => r.value), pcs, musicOn: sw?.getAttribute('aria-checked') };
  });

  check('müzik seviyesi geri yüklendi', shown.values[0] === '12', `${shown.pcs[0]}`);
  check('efekt seviyesi geri yüklendi', shown.values[1] === '77', `${shown.pcs[1]}`);
  check('müzik KAPALI hâli hatırlandı', shown.musicOn === 'false');

  await ctx.close();
}

await browser.close();

console.log('\n' + '─'.repeat(64));
if (fail === 0) {
  console.log('\n✅ SES SİSTEMİ DOĞRU ÇALIŞIYOR\n');
} else {
  console.log(`\n❌ ${fail} kontrol başarısız\n`);
  process.exit(1);
}
