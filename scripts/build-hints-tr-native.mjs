/**
 * ===========================================================================
 * 💡 TÜRKÇE YERLİ İPUCU ÜRETİCİ — Claude API ile (DERLEME ZAMANI, tek seferlik)
 *
 * words.json'daki 860 TÜRKÇE cevap kelimesi için ipucu üretir:
 *   { c: kategori (İsim/Fiil/Sıfat ya da anlam alanı), h: cevabı ele vermeyen kısa açıklama }
 * Sonuç src/app/data/hints-tr-native.json olarak depoya girer. ÇALIŞMA ZAMANINDA
 * hiçbir LLM çağrısı yapılmaz — oyun sadece bu JSON'u okur.
 *
 * KALİTE ŞARTI: açıklama, kelimenin kendisini/kökünü/çekimli biçimini İÇERMEZ.
 * Üretilen her ipucu otomatik denetimden (checkLeak) geçer; sızıntı varsa o kayıt
 * işaretlenir ve tekrar üretilir. (İngilizce muadili: scripts/fix-hints-redact.mjs)
 *
 * Kullanım:
 *   npm i @anthropic-ai/sdk           # (bir kez)
 *   export ANTHROPIC_API_KEY=...      # ya da: ant auth login
 *   node scripts/build-hints-tr-native.mjs        # resume'lu (kesilirse kaldığından devam)
 *
 * Not: Kimlik yoksa (API anahtarı/ant profili) betik çalışmaz. Depoda hazır bulunan
 * hints-tr-native.json bu betiğin bir çıktısıdır; yeniden üretim için bunu kullanın.
 * ===========================================================================
 */
import { readFile, writeFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { checkLeak } from './lib-hint-leak.mjs';

const WORDS = new URL('../src/app/data/words.json', import.meta.url);
const OUT = new URL('../src/app/data/hints-tr-native.json', import.meta.url);

const MODEL = 'claude-opus-5';
const BATCH = 20; // maliyeti düşürmek için istekleri grupla

const SYSTEM = `Sen bir Türkçe kelime oyunu (Wordle benzeri) için ipucu yazarısın.
Sana bir Türkçe kelime listesi verilecek. Her kelime için:
- "c": tek kelimelik kategori. Somut bir anlam alanı varsa onu kullan (Hayvan, Yiyecek,
  İçecek, Bitki, Yer, Kişi, Meslek, Eşya, Araç, Vücut, Doğa, Renk, Zaman, Giysi, Spor,
  Yapı, Sayı, Ünlem, Din, Aile). Yoksa sözcük türünü ver (İsim, Fiil, Sıfat, Zarf).
- "h": kelimeyi tanımlayan TEK cümlelik kısa açıklama (en fazla ~10 kelime).

MUTLAK KURAL: "h" açıklaması, tanımlanan kelimenin KENDİSİNİ, KÖKÜNÜ ya da herhangi bir
ÇEKİMLİ/TÜREMİŞ biçimini İÇERMEMELİDİR. (Örn. "KİTAP" için "kitaplık" bile yasak.)
Açıklama doğal, doğru ve cevabı ele vermeyen bir tanım olmalı. Türkçe yaz.`;

function userPrompt(words) {
  return `Şu kelimeler için ipucu üret:\n${words.join('\n')}`;
}

// Structured output: kelime→{c,h} dizisi
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
        required: ['w', 'c', 'h'],
        properties: { w: { type: 'string' }, c: { type: 'string' }, h: { type: 'string' } },
      },
    },
  },
};

const client = new Anthropic(); // ANTHROPIC_API_KEY ya da ant profili

async function genBatch(words, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        system: SYSTEM,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: userPrompt(words) }],
      });
      const text = res.content.find((b) => b.type === 'text')?.text ?? '{}';
      const map = {};
      for (const it of JSON.parse(text).items ?? []) {
        map[(it.w || '').toUpperCase()] = {
          c: String(it.c || '').trim(),
          h: String(it.h || '').trim(),
        };
      }
      return map;
    } catch (e) {
      if (t === tries - 1) throw e;
      await new Promise((s) => setTimeout(s, 800 * (t + 1)));
    }
  }
}

const words = JSON.parse(await readFile(WORDS)).words;
let out = {};
try {
  out = JSON.parse(await readFile(OUT));
} catch {
  out = {};
}

// yalnızca eksik ya da sızıntılı olanları üret (resume)
const todo = words.filter((w) => !out[w] || checkLeak(w, out[w].h));
console.log(
  `Üretilecek: ${todo.length} ipucu (mevcut sağlam: ${words.length - todo.length} / toplam ${words.length})`,
);

for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const map = await genBatch(batch);
  // her kelimeyi doğrula; sızıntılıyı tek tek yeniden dene (max 3 kez)
  for (const w of batch) {
    let hint = map[w];
    let retry = 0;
    while ((!hint || !hint.h || checkLeak(w, hint.h)) && retry < 3) {
      const one = await genBatch([w]);
      hint = one[w];
      retry++;
    }
    if (hint && hint.h && !checkLeak(w, hint.h)) out[w] = hint;
    else console.warn(`⚠️  SIZINTI/eksik, elle bakılmalı: ${w} → ${hint?.h ?? '(yok)'}`);
  }
  await writeFile(OUT, JSON.stringify(out));
  console.log(`  ~${Math.min(i + BATCH, todo.length)}/${todo.length} üretildi`);
}

await writeFile(OUT, JSON.stringify(out));
const leaks = words.filter((w) => out[w] && checkLeak(w, out[w].h));
console.log(`\n✅ Bitti: ${Object.keys(out).length} ipucu → hints-tr-native.json`);
console.log(
  `   Kapsam: ${words.filter((w) => out[w]).length}/${words.length} · Sızıntı: ${leaks.length}`,
);
for (const w of ['KEDİ', 'ELMAS', 'DOKTOR', 'MERHABA'])
  if (out[w]) console.log(`   ${w}: [${out[w].c}] ${out[w].h}`);
