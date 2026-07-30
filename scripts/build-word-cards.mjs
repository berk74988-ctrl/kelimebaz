/**
 * ===========================================================================
 * 📖 KELİME KARTI ÜRETİCİ — Claude API ile (DERLEME ZAMANI, tek seferlik)
 *
 * Oyun bitince sonuç ekranında gösterilen ÖĞRETİCİ kart verisini üretir.
 * Her cevap kelimesi için:
 *   { t: tanım, e: örnek cümle, k?: köken (varsa), s?: eş anlamlılar, z?: zıt anlamlılar }
 * TR (words.json, 860) ve EN (words-en.json, 2840) için ayrı JSON'lar çıkar:
 *   src/app/data/word-cards-tr.json · word-cards-en.json
 *
 * Bu dosyalar TEMBEL YÜKLENİR (WordCardService → dinamik import), ana bundle'ı şişirmez.
 * ÇALIŞMA ZAMANINDA hiçbir LLM çağrısı yapılmaz.
 *
 * İpuçlarının aksine kart, kelimenin KENDİSİNİ içerebilir (amaç öğretmek). Bu yüzden
 * sızıntı denetimi yoktur; sade ve kısa dil hedeflenir.
 *
 * Kullanım:
 *   npm i @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY=...      # ya da: ant auth login
 *   node scripts/build-word-cards.mjs [tr|en]     # dil verilmezse ikisi de (resume'lu)
 * ===========================================================================
 */
import { readFile, writeFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';
const BATCH = 15;

const LANGS = {
  tr: {
    words: new URL('../src/app/data/words.json', import.meta.url),
    out: new URL('../src/app/data/word-cards-tr.json', import.meta.url),
    system: `Sen bir Türkçe kelime oyununun sonuç ekranı için "kelime kartı" yazarısın.
Sana Türkçe kelimeler verilecek. Her biri için şunları üret:
- "t": kısa, sade tanım (bir cümle, ~12 kelime). Sözlük gibi ama anlaşılır.
- "e": kelimeyi doğal kullanan tek örnek cümle.
- "k": kelimenin kökeni/geldiği dil KISACA (biliniyorsa; yoksa alanı hiç koyma).
- "s": bir-iki eş anlamlı (varsa dizi; yoksa koyma).
- "z": bir-iki zıt anlamlı (varsa dizi; yoksa koyma).
Dil sade, kısa ve doğru olsun. Türkçe yaz. Kesin bilmediğin köken/eş/zıt için o alanı boş bırak.`,
  },
  en: {
    words: new URL('../src/app/data/words-en.json', import.meta.url),
    out: new URL('../src/app/data/word-cards-en.json', import.meta.url),
    system: `You write "word cards" shown on the result screen of an English word game.
For each English word, produce:
- "t": a short, plain one-sentence definition (~12 words).
- "e": one natural example sentence using the word.
- "k": the word's origin/etymology BRIEFLY (if known; otherwise omit the field).
- "s": one or two synonyms (array, if any; otherwise omit).
- "z": one or two antonyms (array, if any; otherwise omit).
Keep language simple, short and correct. Omit any field you are not sure about.`,
  },
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['w', 't', 'e'],
        properties: {
          w: { type: 'string' },
          t: { type: 'string' },
          e: { type: 'string' },
          k: { type: 'string' },
          s: { type: 'array', items: { type: 'string' } },
          z: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const client = new Anthropic();

async function genBatch(system, words, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 6000,
        thinking: { type: 'adaptive' },
        system,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: words.join('\n') }],
      });
      const text = res.content.find((b) => b.type === 'text')?.text ?? '{}';
      const map = {};
      for (const it of JSON.parse(text).items ?? []) {
        const w = (it.w || '').toUpperCase();
        const card = { t: (it.t || '').trim(), e: (it.e || '').trim() };
        if (it.k) card.k = it.k.trim();
        if (it.s?.length) card.s = it.s;
        if (it.z?.length) card.z = it.z;
        if (w && card.t) map[w] = card;
      }
      return map;
    } catch (e) {
      if (t === tries - 1) throw e;
      await new Promise((s) => setTimeout(s, 800 * (t + 1)));
    }
  }
}

async function build(lang) {
  const cfg = LANGS[lang];
  const words = JSON.parse(await readFile(cfg.words)).words;
  let out = {};
  try { out = JSON.parse(await readFile(cfg.out)); } catch { out = {}; }
  const todo = words.filter((w) => !out[w] || !out[w].t || !out[w].e);
  console.log(`[${lang}] Üretilecek: ${todo.length} kart (mevcut: ${words.length - todo.length}/${words.length})`);
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const map = await genBatch(cfg.system, batch);
    for (const w of batch) if (map[w]) out[w] = map[w];
    await writeFile(cfg.out, JSON.stringify(out));
    console.log(`  [${lang}] ~${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }
  await writeFile(cfg.out, JSON.stringify(out));
  const miss = words.filter((w) => !out[w]);
  console.log(`✅ [${lang}] ${Object.keys(out).length} kart · kapsam ${words.length - miss.length}/${words.length}`);
}

const only = process.argv[2];
for (const lang of only ? [only] : ['tr', 'en']) await build(lang);
