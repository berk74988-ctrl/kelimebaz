import { effect, inject, Injectable, signal } from '@angular/core';
import { Lang, upperFor } from '../core/lang';
import { pickLength, WORD_LENGTHS } from '../core/word-length';
import { LanguageService } from './language.service';

/** Bir dilin kelime havuzları — cevaplar (uzunluğa göre) + geçerli tahminler. */
interface Pool {
  answersByLen: Record<number, string[]>;
  answers: readonly string[];
  valid: ReadonlySet<string>;
}

/** Yükleme durumu — açılış gate'i (app) buna bakar. */
export type WordStatus = 'loading' | 'ready' | 'error';

function bucketByLength(words: string[]): Record<number, string[]> {
  const buckets: Record<number, string[]> = { 4: [], 5: [], 6: [], 7: [] };
  for (const w of words) {
    const L = [...w].length;
    if (buckets[L]) buckets[L].push(w);
  }
  return buckets;
}

function buildPool(answerWords: string[], validText: string, lang: Lang): Pool {
  const up = (s: string) => upperFor(s, lang);
  const answersByLen = bucketByLength(answerWords.map(up));
  return {
    answersByLen,
    answers: Object.values(answersByLen).flat(),
    valid: new Set(validText.split(' ').filter(Boolean).map(up)),
  };
}

/**
 * Kelime havuzlarına erişim — TÜRKÇE ve İNGİLİZCE.
 *
 * TEMBEL YÜKLEME: Veri (cevaplar + ~1 MB geçerli tahmin sözlüğü) artık ana pakete
 * GÖMÜLMEZ. Yalnızca AKTİF dilin havuzu, ilk gerektiğinde dinamik import ile ayrı
 * bir chunk olarak indirilir ve önbelleğe alınır. Türkçe oynayan İngilizce veriyi
 * (ve tersi) hiç indirmez → ilk açılış çok daha hızlı, paket ~1.2 MB küçük.
 *
 * Durum sinyali (status) üç değerlidir: veri inerken 'loading', hazırsa 'ready',
 * ağ hatasında 'error' (app hata ekranı + tekrar dene sunar). Dil değişince yeni
 * dilin havuzu (yoksa) indirilir; varsa bellekten kullanılır (iki kez indirilmez).
 */
@Injectable({ providedIn: 'root' })
export class WordService {
  private readonly langSvc = inject(LanguageService);

  private readonly loaded = new Map<Lang, Pool>(); // yüklenmiş havuzlar (önbellek)
  private readonly inflight = new Map<Lang, Promise<void>>(); // süren yüklemeler

  private readonly _status = signal<WordStatus>('loading');
  readonly status = this._status.asReadonly();

  /**
   * YALNIZCA TEST İÇİN: havuzları SENKRON tohumlar (tembel indirme yerine), böylece
   * birim testler async beklemeden çalışır. Üretimde çağrılmaz → seed boş kalır.
   */
  private static seed: Partial<Record<Lang, Pool>> = {};
  static seedForTest(data: Partial<Record<Lang, { answers: string[]; validText: string }>>): void {
    for (const lang of Object.keys(data) as Lang[]) {
      const d = data[lang];
      if (d) WordService.seed[lang] = buildPool(d.answers, d.validText, lang);
    }
  }

  constructor() {
    // Test tohumu varsa senkron yükle (async beklemeden hazır ol).
    for (const lang of Object.keys(WordService.seed) as Lang[]) {
      const pool = WordService.seed[lang];
      if (pool) this.loaded.set(lang, pool);
    }
    if (this.loaded.size) this._status.set('ready');

    // Aktif dil değişince o dilin havuzunu (yoksa) yükle.
    effect(() => {
      const lang = this.langSvc.lang();
      void this.ensure(lang);
    });
  }

  /** Dilin veri dosyalarını dinamik import eder (ayrı chunk → tembel indirilir). */
  private async loadPool(lang: Lang): Promise<Pool> {
    const [answersMod, validMod] =
      lang === 'tr'
        ? await Promise.all([import('../data/words.json'), import('../data/valid-words.json')])
        : await Promise.all([
            import('../data/words-en.json'),
            import('../data/valid-words-en.json'),
          ]);
    const a = ((answersMod as { default?: unknown }).default ?? answersMod) as { words: string[] };
    const v = ((validMod as { default?: unknown }).default ?? validMod) as { words: string };
    return buildPool(a.words, v.words, lang);
  }

  /** Aktif dilin havuzu yüklü değilse yükler; status'u günceller (idempotent). */
  private ensure(lang: Lang): Promise<void> {
    if (this.loaded.has(lang)) {
      if (this.langSvc.lang() === lang) this._status.set('ready');
      return Promise.resolve();
    }
    const existing = this.inflight.get(lang);
    if (existing) return existing;

    if (this.langSvc.lang() === lang) this._status.set('loading');
    const p = this.loadPool(lang)
      .then((pool) => {
        this.loaded.set(lang, pool);
        if (this.langSvc.lang() === lang) this._status.set('ready');
      })
      .catch(() => {
        if (this.langSvc.lang() === lang) this._status.set('error');
      })
      .finally(() => this.inflight.delete(lang));
    this.inflight.set(lang, p);
    return p;
  }

  /** Ağ/yükleme hatasından sonra AKTİF dil için tekrar dener. */
  retry(): void {
    void this.ensure(this.langSvc.lang());
  }

  /** Aktif dilin havuzu hazır olana kadar bekler (testler ve gerekli akışlar için). */
  async whenReady(): Promise<void> {
    await this.ensure(this.langSvc.lang());
  }

  /** Aktif dilin YÜKLENMİŞ havuzu — henüz inmemişse null. */
  private pool(): Pool | null {
    return this.loaded.get(this.langSvc.lang()) ?? null;
  }

  private up(s: string): string {
    return upperFor(s, this.langSvc.lang());
  }

  /** O uzunlukta cevap havuzu (boşsa 5'e, o da boşsa tümüne düşer). */
  private poolOf(length: number): readonly string[] {
    const p = this.pool();
    if (!p) return [];
    if (p.answersByLen[length]?.length) return p.answersByLen[length];
    if (p.answersByLen[5]?.length) return p.answersByLen[5];
    return p.answers;
  }

  /** Cevap havuzundaki kelime sayısı (aktif dil; yüklenmediyse 0). */
  get size(): number {
    return this.pool()?.answers.length ?? 0;
  }

  /** Kabul edilen toplam tahmin sayısı (aktif dil; yüklenmediyse 0). */
  get dictionarySize(): number {
    return this.pool()?.valid.size ?? 0;
  }

  /** Oyun başlatılabilir mi? (aktif dilin havuzu indi ve dolu mu) */
  get isReady(): boolean {
    return this._status() === 'ready' && (this.pool()?.answers.length ?? 0) > 0;
  }

  /** Rastgele bir cevap (uzunluktan bağımsız). */
  randomWord(): string {
    const a = this.pool()?.answers ?? [];
    return a.length ? a[Math.floor(Math.random() * a.length)] : '';
  }

  /** O uzunluktaki cevap havuzu — YZ rakip aday kelimeleri buradan eler (aktif dil). */
  answersOfLength(length: number): readonly string[] {
    return this.poolOf(length);
  }

  /** SEVİYEYE göre rastgele cevap (serbest mod). */
  randomWordForLevel(level: number): string {
    if (!this.isReady) return '';
    const pool = this.poolOf(pickLength(level));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : '';
  }

  /** Günün kelimesi — tarihe göre, herkes (aynı dilde) aynı kelimeyi görür. */
  wordOfTheDay(date = new Date()): string {
    if (!this.isReady) return '';
    const day = this.dayIndex(date);
    const L = WORD_LENGTHS[day % WORD_LENGTHS.length];
    const pool = this.poolOf(L);
    return pool.length ? pool[day % pool.length] : '';
  }

  /** Tohumdan (seed) kelime — çok oyunculu oda için. */
  wordBySeed(seed: number): string {
    if (!this.isReady) return '';
    const s = Math.floor(Math.abs(seed));
    const L = WORD_LENGTHS[s % WORD_LENGTHS.length];
    const pool = this.poolOf(L);
    return pool.length ? pool[Math.floor(s / WORD_LENGTHS.length) % pool.length] : '';
  }

  /** Sabit bir başlangıç gününden bu yana geçen gün sayısı. */
  dayIndex(date = new Date()): number {
    const start = Date.UTC(2026, 0, 1);
    const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(0, Math.floor((today - start) / 86_400_000));
  }

  /** Yeni kelimeye kalan süre (ms) — oyuncunun yerel gece yarısına kadar. */
  msUntilNextDay(now = new Date()): number {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  /** Tahmin aktif dilin geçerli sözlüğünde mi? (havuz inmemişse false) */
  isValid(guess: string): boolean {
    const p = this.pool();
    return p ? p.valid.has(this.up(guess)) : false;
  }

  /** Bu harfi içeren en az bir geçerli kelime var mı? (aktif dil) */
  hasLetter(letter: string): boolean {
    const p = this.pool();
    if (!p) return false;
    const ch = this.up(letter);
    for (const w of p.valid) if (w.includes(ch)) return true;
    return false;
  }
}
