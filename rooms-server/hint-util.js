'use strict';

/**
 * KELİMEBAZ — Çalışma zamanı YZ ipucu yardımcıları (SAF, bağımlılıksız).
 *
 * server.js bunu require eder. Ayrı dosya olmasının nedeni: sızıntı denetimi ve
 * istem üretimi SAF fonksiyonlardır → sunucu ayağa kalkmadan test edilebilir
 * (rooms-server/hint-util.test.mjs).
 *
 * GÜVENLİK: Cevap kelimesi modele ASLA verilmez (yalnızca tahminler + renk
 * desenleri). Cevap yalnızca DÖNEN metnin sızıntı denetimi için sunucuda kullanılır.
 */

const up = (s) => String(s || '').toLocaleUpperCase('tr');
const TR_LETTERS = /[^A-ZÇĞİÖŞÜ]/g;

/** Renk deseni ('2'=yeşil,'1'=sarı,'0'=gri) → okunur emoji dizisi. */
function patternToEmoji(pattern) {
  return [...String(pattern)]
    .map((c) => (c === '2' ? '🟩' : c === '1' ? '🟨' : '⬜'))
    .join('');
}

/** Girdi doğrulama — bozuk/kötü niyetli istekleri erken ele. */
function validateInput(body) {
  const length = Math.floor(Number(body && body.length));
  const lang = body && body.lang === 'en' ? 'en' : 'tr';
  const answer = up(body && body.answer);
  const guesses = Array.isArray(body && body.guesses) ? body.guesses : [];
  if (!(length >= 4 && length <= 7)) return { error: 'bad_length' };
  if (![...answer].length || [...answer].length !== length) return { error: 'bad_answer' };
  if (guesses.length < 1 || guesses.length > 6) return { error: 'bad_guesses' };
  const clean = [];
  for (const g of guesses) {
    const word = up(g && g.word);
    const pattern = String((g && g.pattern) || '');
    if ([...word].length !== length) return { error: 'bad_guess_word' };
    if (!/^[012]+$/.test(pattern) || pattern.length !== length) return { error: 'bad_pattern' };
    clean.push({ word, pattern });
  }
  return { length, lang, answer, guesses: clean };
}

/** Modele gönderilecek sistem istemi (dile göre). Cevabı İSTEMEZ, tek cümle ister. */
function systemPrompt(lang) {
  if (lang === 'en') {
    return `You are a Wordle coach. The player is stuck. You are given their past guesses and
the color feedback for each (🟩 = right letter, right spot; 🟨 = letter is in the word, wrong spot;
⬜ = letter not in the word). Give ONE short, encouraging sentence guiding their NEXT guess.
Reason from the clues: which positions are locked (🟩), which letters must be reused elsewhere (🟨),
which letters to avoid (⬜), and which common letters they have not tried yet.
STRICT RULES: Never reveal or state the answer word. Never suggest a specific full word. Talk about
letters and positions only. Do not use XML tags. Reply with a single sentence in English.`;
  }
  return `Sen bir Wordle koçusun. Oyuncu takıldı. Sana geçmiş tahminleri ve her birinin renk
geri bildirimi veriliyor (🟩 = doğru harf, doğru yer; 🟨 = harf kelimede var, yeri yanlış;
⬜ = harf kelimede yok). Oyuncuya BİR SONRAKİ tahmini için TEK, kısa, cesaretlendirici bir cümle söyle.
İpuçlarından akıl yürüt: hangi konumlar kesinleşti (🟩), hangi harfler başka yere kaydırılmalı (🟨),
hangi harflerden kaçınılmalı (⬜) ve henüz denemediği yaygın harfler neler.
KATI KURALLAR: Cevap kelimesini ASLA söyleme veya ima etme. Belirli bir tam kelime önerme. Yalnızca
harflerden ve konumlardan bahset. XML etiketi kullanma. Türkçe, tek cümleyle yanıtla.`;
}

/** Kullanıcı mesajı — uzunluk + tahminler + desenler (cevap YOK). */
function userPrompt(length, guesses, lang) {
  const head = lang === 'en' ? `Word length: ${length}. My guesses so far:` : `Kelime uzunluğu: ${length}. Şu ana kadarki tahminlerim:`;
  const lines = guesses.map((g) => `${[...g.word].join(' ')}  ${patternToEmoji(g.pattern)}`);
  const tail = lang === 'en' ? 'Give me one hint for my next guess.' : 'Bir sonraki tahminim için bana tek bir ipucu ver.';
  return `${head}\n${lines.join('\n')}\n${tail}`;
}

/**
 * SIZINTI DENETİMİ — dönen metin cevabı ele veriyor mu?
 * Türkçe soneklidir; ayraçla bölünmüş harf dizisi (K A L E M) de yakalanır.
 */
function leaksAnswer(answer, text) {
  const A = up(answer);
  if ([...A].length < 3) return false;
  const T = up(text);
  if (T.includes(A)) return true; // düz geçiş
  if (T.replace(TR_LETTERS, '').includes(A)) return true; // araya ayraç girmiş (K-A-L-E-M)
  const toks = T.split(/[^A-ZÇĞİÖŞÜ]+/).filter(Boolean);
  return toks.some((t) => t.startsWith(A)); // çekim eki (KALEMİ)
}

/** Modelin çıktısını temizle: XML etiketleri, fazla boşluk, tek cümleye indir. */
function sanitizeHint(text) {
  let s = String(text || '')
    .replace(/<[^>]*>/g, ' ') // olası <thinking> vb. etiketleri at
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, 240);
}

/** Sızıntı/başarısızlık durumunda güvenli, cevabı ele vermeyen genel ipucu. */
function genericHint(lang) {
  return lang === 'en'
    ? 'Keep your green letters in place, move the yellow ones elsewhere, and add a common letter you have not tried yet.'
    : 'Yeşil harfleri yerinde tut, sarıları başka konuma kaydır ve henüz denemediğin yaygın bir harf ekle.';
}

module.exports = {
  validateInput,
  systemPrompt,
  userPrompt,
  leaksAnswer,
  sanitizeHint,
  genericHint,
  patternToEmoji,
};
