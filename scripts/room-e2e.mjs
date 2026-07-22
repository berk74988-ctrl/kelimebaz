/**
 * ÇOK OYUNCULU ODA — uçtan uca (2 oyuncu, ayrı tarayıcı bağlamları).
 *
 * Doğrular: oda oluştur → kod ile katıl → lobide oyuncular → sahip başlatır →
 * ikisi de aynı kelimeyi oynar → biri kazanır biri kaybeder → lider tablosu
 * puana göre sıralı. Ayrıca ikinci bir oda aynı anda açılıp bağımsız çalışıyor mu.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const APP = process.argv[2] ?? 'http://localhost:4200';
const API = process.argv[3] ?? 'http://localhost:4243';

// WordService ile AYNI biçimde: cevaplar uzunluğa göre gruplanır, seed → uzunluk+kelime.
const raw = JSON.parse(readFileSync(new URL('../src/app/data/words.json', import.meta.url)));
const allAnswers = raw.words.map((w) => w.toLocaleUpperCase('tr'));
const LENGTHS = [4, 5, 6, 7];
const answersByLen = { 4: [], 5: [], 6: [], 7: [] };
for (const w of allAnswers) {
  const L = [...w].length;
  if (answersByLen[L]) answersByLen[L].push(w);
}
const poolOf = (L) =>
  answersByLen[L]?.length ? answersByLen[L] : answersByLen[5]?.length ? answersByLen[5] : allAnswers;

function wordBySeed(seed) {
  const s = Math.floor(Math.abs(seed));
  const L = LENGTHS[s % LENGTHS.length];
  const pool = poolOf(L);
  return pool[Math.floor(s / LENGTHS.length) % pool.length];
}

const browser = await chromium.launch();
let fail = 0;
const check = (name, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name}${d ? '  - ' + d : ''}`); };

async function openRoomMenu() {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 820 } });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Arkadaşlarla Oyna/ }).click();
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function typeWord(page, word) {
  for (const ch of word) await page.locator(`.key[aria-label="${ch}"]`).click();
  await page.locator('.key[aria-label="ENTER"]').click();
}

// --- Oyuncu A: oda oluşturur ---
const A = await openRoomMenu();
await A.page.getByRole('button', { name: /Oda Oluştur/ }).click();
await A.page.waitForTimeout(200);
await A.page.locator('select').last().selectOption('0'); // süre serbest (test timer'a takılmasın)
await A.page.locator('input.inp').first().fill('Ayse');
await A.page.getByRole('button', { name: 'Oda Oluştur', exact: true }).click();
await A.page.waitForSelector('.rc-code');
const code = (await A.page.locator('.rc-code').textContent()).trim();
check('oda oluşturuldu, kod alındı', /^[A-Z0-9]{4}$/.test(code), code);

// --- Oyuncu B: koda katılır ---
const B = await openRoomMenu();
await B.page.getByRole('button', { name: /Odaya Katıl/ }).click();
await B.page.waitForTimeout(200);
await B.page.locator('input.inp').first().fill('Berk');
await B.page.locator('input.code-in').fill(code);
await B.page.getByRole('button', { name: 'Odaya Katıl', exact: true }).click();
await B.page.waitForTimeout(1000);

// A lobisinde B görünüyor mu (polling ile)
await A.page.waitForTimeout(2000);
const namesInA = await A.page.locator('.pl-name').allTextContents();
check("B, A'nın lobisinde görünüyor", namesInA.some((n) => n.includes('Berk')), namesInA.join(', '));
check('A oda sahibi (başlat butonu var)', (await A.page.getByRole('button', { name: /Oyunu Başlat/ }).count()) > 0);
check('B sahip değil (Hazır Ol butonu var)', (await B.page.locator('.ready-btn').count()) > 0);

// --- Sahip başlatır ---
await A.page.getByRole('button', { name: /Oyunu Başlat/ }).click();
await A.page.waitForSelector('app-board', { timeout: 6000 });
await B.page.waitForSelector('app-board', { timeout: 6000 });
check('oyun ikisinde de başladı (tahta göründü)', true);

// Sunucudan seed → aynı kelime (uzunluk da seed'den, herkes için aynı)
const state = await (await fetch(`${API}/state?code=${code}`)).json();
const answer = wordBySeed(state.room.seed);
const answerLen = [...answer].length;
check("oda kelimesi seed'den türetildi (4-7 harf)", answerLen >= 4 && answerLen <= 7, `${answer} (${answerLen}h)`);

// A kazanır (cevabı ilk denemede), B kaybeder (aynı uzunlukta farklı geçerli kelime x6)
const wrong = poolOf(answerLen).find((w) => w !== answer);
await typeWord(A.page, answer);
for (let i = 0; i < 6; i++) { await typeWord(B.page, wrong); await B.page.waitForTimeout(1050); }

await B.page.waitForTimeout(2000);
await A.page.waitForTimeout(2500);

const finalHead = await A.page.locator('.winner-head h2').textContent().catch(() => '');
check('A sonuç/kürsü ekranını görüyor', /Kazandın|kazandı|Sonuç/.test(finalHead || ''), finalHead);

const firstName = (await A.page.locator('.podium .pod-1 .pod-name').textContent().catch(() => '') ?? '').trim();
check('1. basamakta kazanan (Ayse)', firstName.includes('Ayse'), firstName);

// --- İkinci oda aynı anda ---
const C = await openRoomMenu();
await C.page.getByRole('button', { name: /Oda Oluştur/ }).click();
await C.page.waitForTimeout(200);
await C.page.getByRole('button', { name: 'Oda Oluştur', exact: true }).click();
await C.page.waitForSelector('.rc-code');
const code2 = (await C.page.locator('.rc-code').textContent()).trim();
check('ikinci oda farklı kodla açıldı', code2 !== code, `${code} vs ${code2}`);
const health = await (await fetch(`${API}/health`)).json();
check('sunucuda birden çok oda aktif', health.rooms >= 2, `${health.rooms} oda`);

await browser.close();
console.log(fail === 0 ? '\n✅ Çok oyunculu oda uçtan uca ÇALIŞIYOR' : `\n❌ ${fail} kontrol başarısız`);
process.exit(fail === 0 ? 0 : 1);
