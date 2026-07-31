/**
 * KELİMEBAZ — cevap kelimelerine TANIDIKLIK/ZORLUK puanı (1-5) verir.
 *   1 = herkes bilir (çok tanıdık) · 5 = çoğu kişi bilmez (çok zor)
 *
 * İKİ MOD:
 *   • ANTHROPIC_API_KEY varsa → LLM ile gerçek tanıdıklık puanı (biletin istediği).
 *   • Anahtar yoksa → DETERMİNİSTİK HEURİSTİK (frekans-sıralı liste konumu +
 *     harf nadirliği) → anahtarsız da tam çalışan v1 puanları üretir.
 *   Anahtar gelince yeniden çalıştırınca LLM puanları heuristiği EZER (drop-in).
 *
 * Çıktı: src/app/data/word-difficulty-tr.json ve -en.json
 *   { "version": 1, "source": "llm|heuristic", "scores": { "KELİME": 1..5 } }
 *
 * Puanlar HER UZUNLUK GRUBUNDA quantile ile 1-5'e bölünür → her (uzunluk,band)
 * hücresi dolu olur, günlük rotasyon her zaman aday bulur.
 *
 * Kullanım: npm run build:word-difficulty
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DATA = new URL('../src/app/data/', import.meta.url);
const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.DIFFICULTY_MODEL || 'claude-opus-4-8';

// Harf nadirliği (0 = çok yaygın … 1 = çok nadir). Uzunluk grubu frekans-sıralı
// DEĞİLSE (ör. 5 harfli elle seçilmiş liste alfabetik) bile anlamlı sinyal verir.
const RARITY = {
  tr: tier('AEİNRLIKDTUOMS', 'BYŞÜGZHCVPÇÖ', 'ĞF', 'J'),
  en: tier('ETAOINSRH', 'DLUCMWYPGB', 'VKFX', 'JQZ'),
};
function tier(common, mid, rare, veryRare) {
  const m = {};
  for (const c of common) m[c] = 0.1;
  for (const c of mid) m[c] = 0.4;
  for (const c of rare) m[c] = 0.75;
  for (const c of veryRare) m[c] = 1.0;
  return m;
}
function wordRarity(word, lang) {
  const map = RARITY[lang];
  const chars = [...word];
  const sum = chars.reduce((s, ch) => s + (map[ch] ?? 0.5), 0);
  return sum / chars.length;
}

/** Heuristik: uzunluk grubunda konum (frekans vekili) + harf nadirliği → 1-5. */
function heuristicScores(words, lang) {
  const byLen = { 4: [], 5: [], 6: [], 7: [] };
  words.forEach((w, i) => {
    const L = [...w].length;
    if (byLen[L]) byLen[L].push({ w, i });
  });
  const scores = {};
  for (const L of [4, 5, 6, 7]) {
    const group = byLen[L];
    if (!group.length) continue;
    const n = group.length;
    // Ham skor: 0.65 × (konum/n)  +  0.35 × harf nadirliği
    const scored = group.map(({ w }, idx) => ({
      w,
      raw: 0.65 * (idx / n) + 0.35 * wordRarity(w, lang),
    }));
    // Grup içinde ham skora göre sırala → quantile ile 1-5 band (her band ~%20).
    scored.sort((a, b) => a.raw - b.raw);
    scored.forEach((x, rank) => {
      scores[x.w] = Math.min(5, 1 + Math.floor((rank / n) * 5));
    });
  }
  return scores;
}

/** LLM: kelimeleri toplu gönder, her birine 1-5 tanıdıklık puanı iste. */
async function llmScores(words, lang) {
  const BATCH = 60;
  const scores = {};
  const langName = lang === 'tr' ? 'Türkçe' : 'İngilizce';
  for (let i = 0; i < words.length; i += BATCH) {
    const batch = words.slice(i, i + BATCH);
    const system = `Sen ${langName} kelime tanıdıklığı değerlendiren bir dilbilimcisin. Her kelimeye 1-5 arası TANIDIKLIK puanı ver: 1=herkes bilir (çok yaygın), 3=orta, 5=çoğu kişi bilmez (nadir/teknik). YALNIZCA JSON dizi döndür: [{"w":"KELİME","s":1}]`;
    const user = `Şu ${langName} kelimeleri puanla:\n${batch.join(', ')}`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!r.ok) throw new Error('api_' + r.status);
    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    for (const { w, s } of arr) {
      const band = Math.max(1, Math.min(5, Math.round(Number(s))));
      if (w) scores[String(w)] = band;
    }
    process.stdout.write(`\r${lang}: ${Math.min(i + BATCH, words.length)}/${words.length}`);
  }
  process.stdout.write('\n');
  // LLM bazı kelimeleri atlarsa heuristikle tamamla (boşluk kalmasın).
  const h = heuristicScores(words, lang);
  for (const w of words) if (scores[w] == null) scores[w] = h[w] ?? 3;
  return scores;
}

async function scoreLang(lang) {
  const file = lang === 'tr' ? 'words.json' : 'words-en.json';
  const words = JSON.parse(await readFile(new URL(file, DATA), 'utf8')).words;
  const source = KEY ? 'llm' : 'heuristic';
  console.log(`\n[${lang}] ${words.length} kelime · kaynak: ${source}`);
  const scores = KEY ? await llmScores(words, lang) : heuristicScores(words, lang);

  await writeFile(
    fileURLToPath(new URL(`word-difficulty-${lang}.json`, DATA)),
    JSON.stringify({ version: 1, source, scores }) + '\n',
  );

  // Band dağılımı + uç örnekler (elle doğrulama).
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const w of words) dist[scores[w]]++;
  console.log('  band dağılımı:', dist);
  const sorted = [...words].sort((a, b) => scores[a] - scores[b]);
  console.log('  EN KOLAY 20:', sorted.slice(0, 20).join(' '));
  console.log('  EN ZOR 20 :', sorted.slice(-20).join(' '));
}

await scoreLang('tr');
await scoreLang('en');
console.log('\n✅ Zorluk puanları yazıldı (word-difficulty-tr/en.json).');
