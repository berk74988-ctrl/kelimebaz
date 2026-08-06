import { Lang, upperFor } from './lang';
import { evaluateGuess } from './evaluate';
import { LetterState } from '../models/game.model';

/**
 * 🆘 YEREL "TAKILDIM" İPUCU — LLM'siz, ücretsiz, çevrimdışı.
 *
 * Çalışma zamanı YZ ipucu (rooms-server /hint) para harcadığı için etkin
 * değilse, aynı fikri KURAL-TABANLI üretir: oyuncunun tahminlerinden çıkan
 * ipuçlarına uyan adayları süzer, sonra
 *   - kaç harfin yeri kesinleşti (yeşil),
 *   - hangi sarı harf başka konuma taşınmalı,
 *   - HENÜZ denenmemiş, olasılıkları en çok daraltacak harf
 * bilgilerinden CEVABI ELE VERMEDEN tek cümlelik yönlendirme kurar.
 *
 * GÜVENLİK: Yalnız harflerden/konumlardan bahseder; tam kelime ASLA önerilmez
 * → cevap sızmaz. Saf fonksiyon (Angular'a bağımsız) → test edilebilir.
 */

export interface LocalHintInput {
  answer: string;
  guesses: readonly string[]; // oyuncunun tahmin ettiği kelimeler
  pool: readonly string[]; // aynı uzunluktaki olası cevaplar
  lang: Lang;
}

function patternKey(states: LetterState[]): string {
  return states.map((s) => (s === 'correct' ? '2' : s === 'present' ? '1' : '0')).join('');
}

/** Bilgi verecek adaylara göre en faydalı DENENMEMİŞ harf (≈yarıya en yakın). */
function bestUntriedLetter(candidates: string[], tried: Set<string>): string {
  const letters = new Set<string>();
  for (const c of candidates) for (const ch of c) if (!tried.has(ch)) letters.add(ch);
  let best = '';
  let bestScore = -1;
  const n = candidates.length;
  for (const ch of letters) {
    const withCount = candidates.filter((c) => c.includes(ch)).length;
    if (withCount === 0) continue;
    // Yarıya ne kadar yakınsa o kadar çok daraltır (klasik strateji).
    // withCount === n olsa bile (kesin var) bir işe yarar → küçük puanla kalsın.
    const score = withCount === n ? 0.5 : n - Math.abs(n - 2 * withCount);
    if (score > bestScore) {
      bestScore = score;
      best = ch;
    }
  }
  return best;
}

export function localHint(input: LocalHintInput): string {
  const lang = input.lang;
  const answer = upperFor(input.answer, lang);
  const A = [...answer];
  const len = A.length;

  const guesses = input.guesses.map((g) => upperFor(g, lang)).filter((g) => [...g].length === len);

  // Oyuncunun gördüğü renk desenleri (cevaba göre).
  const seen = guesses.map((g) => patternKey(evaluateGuess(g, answer, lang)));

  // Tüm ipuçlarına UYAN adaylar (cevap havuzda yoksa ekle → boş kalmasın).
  const base = input.pool.includes(answer) ? input.pool : [answer, ...input.pool];
  let candidates = base.map((w) => upperFor(w, lang)).filter((w) => [...w].length === len);
  guesses.forEach((g, i) => {
    candidates = candidates.filter((c) => patternKey(evaluateGuess(g, c, lang)) === seen[i]);
  });
  if (!candidates.length) candidates = [answer]; // güvenlik ağı

  // Kısıtları çıkar.
  const greens = new Set<number>();
  const presentLetters = new Set<string>();
  const tried = new Set<string>();
  for (const g of guesses) {
    const st = evaluateGuess(g, answer, lang);
    [...g].forEach((ch, i) => {
      tried.add(ch);
      if (st[i] === 'correct') greens.add(i);
      else if (st[i] === 'present') presentLetters.add(ch);
    });
  }

  const bestLetter = bestUntriedLetter(candidates, tried);

  return buildSentence(lang, {
    greens: greens.size,
    yellows: [...presentLetters],
    bestLetter,
    remaining: candidates.length,
  });
}

interface HintFacts {
  greens: number;
  yellows: string[];
  bestLetter: string;
  remaining: number;
}

/** Bilgilerden dile göre TEK cümle kur (cevap yok). */
function buildSentence(lang: Lang, f: HintFacts): string {
  const T = MESSAGES[lang] || MESSAGES['tr'];
  const parts: string[] = [];

  if (f.greens > 0) parts.push(T.greens(f.greens));
  if (f.yellows.length > 0) parts.push(T.yellow(f.yellows[0]));
  if (f.bestLetter) parts.push(T.tryLetter(f.bestLetter));

  // Hiç somut ipucu yoksa (çok erken) genel strateji.
  if (parts.length === 0) return f.remaining <= 3 ? T.fewLeft : T.generic;

  // Çok az kelime kaldıysa cesaret ver.
  const tail = f.remaining <= 3 ? ' ' + T.almost : '';
  return T.join(parts) + tail;
}

interface Msg {
  greens: (n: number) => string;
  yellow: (ch: string) => string;
  tryLetter: (ch: string) => string;
  join: (parts: string[]) => string;
  generic: string;
  fewLeft: string;
  almost: string;
}

const MESSAGES: Record<string, Msg> = {
  tr: {
    greens: (n) => (n === 1 ? '1 harfin yeri kesin' : `${n} harfin yeri kesin`),
    yellow: (ch) => `sarı ${ch} harfini başka bir konuma taşı`,
    tryLetter: (ch) => `henüz denemediğin ${ch} harfini dene`,
    join: (p) => p.join('; ').replace(/^./, (c) => c.toLocaleUpperCase('tr')) + '.',
    generic: 'Farklı ünlü ve sık kullanılan yeni harfler deneyerek olasılıkları daralt.',
    fewLeft: 'Çok az kelime kaldı — yeşil harfleri sabitleyip kalanları değiştirerek dene.',
    almost: 'Az kaldı!',
  },
  en: {
    greens: (n) => (n === 1 ? '1 letter is locked in place' : `${n} letters are locked in place`),
    yellow: (ch) => `move the yellow ${ch} to a different spot`,
    tryLetter: (ch) => `try the letter ${ch} you haven't used yet`,
    join: (p) => p.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.',
    generic: 'Narrow it down by trying different vowels and common new letters.',
    fewLeft: 'Very few words left — keep the greens fixed and swap the rest.',
    almost: 'Almost there!',
  },
  de: {
    greens: (n) => (n === 1 ? '1 Buchstabe sitzt fest' : `${n} Buchstaben sitzen fest`),
    yellow: (ch) => `verschiebe das gelbe ${ch} an eine andere Stelle`,
    tryLetter: (ch) => `probiere den noch nicht genutzten Buchstaben ${ch}`,
    join: (p) => p.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.',
    generic: 'Grenze es ein, indem du andere Vokale und häufige neue Buchstaben probierst.',
    fewLeft: 'Nur noch wenige Wörter — halte die Grünen fest und tausche den Rest.',
    almost: 'Fast geschafft!',
  },
};
