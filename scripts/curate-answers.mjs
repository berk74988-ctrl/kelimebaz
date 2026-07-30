/**
 * ===========================================================================
 * 🧹 CEVAP HAVUZU LLM SÜZGECİ — "cevap olmaya uygun mu?" (DERLEME ZAMANI)
 *
 * Frekans ön elemesinden geçmiş aday havuzunu (words.json) Claude ile denetler.
 * Frekans "sık = tanıdık" ön elemesini yapar; LLM SON kararı verir. Ölçüt:
 *   - Günlük hayatta TANIDIK bir kelime mi? ("bunu hiç duymadım" olmamalı)
 *   - ÖZEL AD değil (kişi/yer/marka)
 *   - RAHATSIZ EDİCİ / müstehcen / hassas değil
 *   - Yazım hatası / çekimli-türemiş biçim değil (kök/madde başı olmalı)
 * Uygun olmayanlar ELENİR; kalanlar words.json'a yazılır. Elenenler rapora düşer.
 *
 * Frekans ön elemesi + morfoloji süzgeci scripts/build-dictionary.mjs'te; bu betik
 * onun ÜSTÜNE insan/LLM yargısını ekler. ÇALIŞMA ZAMANINDA API çağrısı YOK.
 *
 * Kullanım:
 *   npm i @anthropic-ai/sdk ; export ANTHROPIC_API_KEY=...   (ya da: ant auth login)
 *   node scripts/curate-answers.mjs [tr|en] [--apply]
 *      (--apply olmadan: sadece rapor; ile: words.json'u süzülmüş halle günceller)
 * ===========================================================================
 */
import { readFile, writeFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';
const BATCH = 40;

const FILES = {
  tr: new URL('../src/app/data/words.json', import.meta.url),
  en: new URL('../src/app/data/words-en.json', import.meta.url),
};
const SYSTEM = {
  tr: `Bir Türkçe kelime bulmaca oyununun CEVAP havuzunu süzüyorsun. Sana kelimeler verilecek.
Her kelime için, o kelimenin oyunun gizli cevabı olmaya UYGUN olup olmadığına karar ver.
UYGUN = günlük hayatta tanıdık, çoğu kişinin bildiği, sözlükte geçen sıradan bir kelime.
UYGUN DEĞİL ise nedeni: "ozel" (kişi/yer/marka adı), "nadir" (çoğu kişinin duymadığı/teknik),
"cekim" (çekimli ya da türemiş biçim, kök değil), "hatali" (yazım hatası), "kaba" (müstehcen/hassas).
Emin değilsen ve kelime sana yabancı geliyorsa UYGUN DEĞİL say (havuz temiz kalsın).`,
  en: `You are curating the ANSWER pool of an English word puzzle. For each given word decide
whether it is SUITABLE as a hidden answer. SUITABLE = a common, familiar everyday word most
players know. If NOT suitable, give a reason: "proper" (name/place/brand), "rare"
(obscure/technical), "inflected" (not a base form), "misspelled", "offensive".
When in doubt and the word looks unfamiliar, mark it NOT suitable (keep the pool clean).`,
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
        required: ['w', 'ok'],
        properties: { w: { type: 'string' }, ok: { type: 'boolean' }, why: { type: 'string' } },
      },
    },
  },
};

const client = new Anthropic();

async function judge(lang, words, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        system: SYSTEM[lang],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: words.join('\n') }],
      });
      const text = res.content.find((b) => b.type === 'text')?.text ?? '{}';
      const map = {};
      for (const it of JSON.parse(text).items ?? []) map[(it.w || '').toUpperCase()] = it;
      return map;
    } catch (e) {
      if (t === tries - 1) throw e;
      await new Promise((s) => setTimeout(s, 800 * (t + 1)));
    }
  }
}

const lang = process.argv[2] === 'en' ? 'en' : 'tr';
const apply = process.argv.includes('--apply');
const data = JSON.parse(await readFile(FILES[lang]));
const words = data.words;

const keep = [];
const drop = [];
for (let i = 0; i < words.length; i += BATCH) {
  const batch = words.slice(i, i + BATCH);
  const map = await judge(lang, batch);
  for (const w of batch) {
    const v = map[w.toUpperCase()];
    if (!v || v.ok) keep.push(w); // yargı gelmezse GÜVENDE tut (elenmesin)
    else drop.push(`${w} — ${v.why || 'uygun değil'}`);
  }
  process.stdout.write(`\r  ${Math.min(i + BATCH, words.length)}/${words.length} denetlendi · elenen ${drop.length}`);
}
console.log('');

console.log(`\n[${lang}] Toplam ${words.length} · kalan ${keep.length} · elenen ${drop.length}`);
if (drop.length) { console.log('ELENENLER (örnek):'); for (const d of drop.slice(0, 40)) console.log('  ✂️ ', d); }

if (apply) {
  const byLen = {};
  for (const w of keep) { const L = [...w].length; (byLen[L] = byLen[L] || []).push(w); }
  const out = { ...data, counts: Object.fromEntries(Object.keys(byLen).sort().map((L) => [L, byLen[L].length])), words: keep };
  await writeFile(FILES[lang], JSON.stringify(out, null, 0) + '\n');
  console.log(`\n✅ Uygulandı: ${keep.length} cevap → ${lang === 'tr' ? 'words.json' : 'words-en.json'}`);
} else {
  console.log('\n(Rapor modu — words.json değişmedi. Uygulamak için --apply ekleyin.)');
}
