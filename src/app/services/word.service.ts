import { effect, inject, Injectable, signal } from '@angular/core';
import { levelBand, pickDaily } from '../core/daily-rotation';
import { Lang, upperFor } from '../core/lang';
import { pickLength, WORD_LENGTHS } from '../core/word-length';
import { LanguageService } from './language.service';

/** Bir dilin kelime havuzları — cevaplar (uzunluğa göre) + geçerli tahminler. */
interface Pool {
  answersByLen: Record<number, string[]>;
  answers: readonly string[];
  valid: ReadonlySet<string>;
  /** Zorluk bandına göre gruplu cevaplar: [uzunluk][band 1-5] → kelimeler. */
  byLenByBand: Record<number, Record<number, string[]>>;
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

function buildPool(
  answerWords: string[],
  validText: string,
  lang: Lang,
  difficulty: Record<string, number> = {},
): Pool {
  const up = (s: string) => upperFor(s, lang);
  const answersByLen = bucketByLength(answerWords.map(up));

  // Zorluk haritası → [uzunluk][band] gruplaması (havuz sırası korunur =
  // belirleyici seçim). Puanı olmayan kelime orta banda (3) düşer.
  const byLenByBand: Record<number, Record<number, string[]>> = {};
  for (const L of WORD_LENGTHS) {
    const bands: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const w of answersByLen[L] ?? []) {
      const band = difficulty[w] ?? 3;
      (bands[band] ?? bands[3]).push(w);
    }
    byLenByBand[L] = bands;
  }

  return {
    answersByLen,
    answers: Object.values(answersByLen).flat(),
    valid: new Set(validText.split(' ').filter(Boolean).map(up)),
    byLenByBand,
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
  static seedForTest(
    data: Partial<
      Record<Lang, { answers: string[]; validText: string; difficulty?: Record<string, number> }>
    >,
  ): void {
    for (const lang of Object.keys(data) as Lang[]) {
      const d = data[lang];
      if (d) WordService.seed[lang] = buildPool(d.answers, d.validText, lang, d.difficulty);
    }
  }

  // 📅 GÜNÜN KELİMESİ geçersiz kılma (override) — `${lang}:${dayIndex}` → KELİME.
  // Sunucudan gelir; önbellekten SENKRON okunur (wordOfTheDay senkron çalışır).
  // Sunucu erişilemezse boş kalır → gömülü algoritma kullanılır (oyun etkilenmez).
  private static readonly OVR_KEY = 'kelimebaz:daily-overrides';
  private readonly _overrides = new Map<string, string>();

  constructor() {
    // Test tohumu varsa senkron yükle (async beklemeden hazır ol).
    for (const lang of Object.keys(WordService.seed) as Lang[]) {
      const pool = WordService.seed[lang];
      if (pool) this.loaded.set(lang, pool);
    }
    if (this.loaded.size) this._status.set('ready');

    this.loadOverridesCache(); // senkron: önceki oturumun override'ları hemen hazır
    // Testte (tohumluyken) ağ isteği atma; üretimde bugünün override'ını tazele.
    if (!Object.keys(WordService.seed).length) void this.refreshOverrides();

    // Aktif dil değişince o dilin havuzunu (yoksa) yükle.
    effect(() => {
      const lang = this.langSvc.lang();
      void this.ensure(lang);
    });
  }

  /** RoomService ile aynı köken: canlıda /berk/rooms, yerelde :4243. */
  private overrideBase(): string {
    if (typeof location === 'undefined') return 'http://localhost:4243';
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4243';
    return '/berk/rooms';
  }

  private loadOverridesCache(): void {
    try {
      const raw = localStorage.getItem(WordService.OVR_KEY);
      const obj = raw ? (JSON.parse(raw) as { map?: Record<string, string> }) : null;
      for (const [k, v] of Object.entries(obj?.map ?? {})) this._overrides.set(k, v);
    } catch {
      /* depolama yok/bozuk → override yok, gömülü algoritma */
    }
  }

  /**
   * Bugünün override'ını sunucudan çek (best-effort). Başarısızsa sessizce geç →
   * gömülü algoritma. Kısa önbellek: oturum başına bir kez (her oyunda DEĞİL).
   */
  async refreshOverrides(): Promise<void> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(this.overrideBase() + '/daily-overrides', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const data = (await res.json()) as { overrides?: Record<string, Record<string, string>> };
      for (const [di, byLang] of Object.entries(data.overrides ?? {})) {
        for (const [lang, word] of Object.entries(byLang ?? {})) {
          if (word) this._overrides.set(`${lang}:${di}`, String(word));
        }
      }
      const map: Record<string, string> = {};
      this._overrides.forEach((v, k) => (map[k] = v));
      try {
        localStorage.setItem(WordService.OVR_KEY, JSON.stringify({ map, at: Date.now() }));
      } catch {
        /* depolama kapalı — bellekte kalır */
      }
    } catch {
      /* sunucu erişilemez → gömülü algoritma (oyun her koşulda çalışır) */
    }
  }

  /** Dilin veri dosyalarını dinamik import eder (ayrı chunk → tembel indirilir). */
  private async loadPool(lang: Lang): Promise<Pool> {
    const [answersMod, validMod, diffMod] =
      lang === 'tr'
        ? await Promise.all([
            import('../data/words.json'),
            import('../data/valid-words.json'),
            import('../data/word-difficulty-tr.json'),
          ])
        : lang === 'de'
          ? await Promise.all([
              import('../data/words-de.json'),
              import('../data/valid-words-de.json'),
              import('../data/word-difficulty-de.json'),
            ])
          : await Promise.all([
              import('../data/words-en.json'),
              import('../data/valid-words-en.json'),
              import('../data/word-difficulty-en.json'),
            ]);
    const a = ((answersMod as { default?: unknown }).default ?? answersMod) as { words: string[] };
    const v = ((validMod as { default?: unknown }).default ?? validMod) as { words: string };
    const d = ((diffMod as { default?: unknown }).default ?? diffMod) as {
      scores?: Record<string, number>;
    };
    return buildPool(a.words, v.words, lang, d.scores ?? {});
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

  /**
   * SEVİYEYE göre rastgele cevap (serbest mod) — uzunluk VE zorluk seviyeye
   * uyumlu: düşük seviyede tanıdık, yüksek seviyede zorlu kelimeler.
   *
   * `preferLetter` verilirse (antrenman modu): kelimelerin bir kısmı o harfi
   * İÇERECEK şekilde HAFİFÇE kayar — oyuncu manipüle edildiğini hissetmesin
   * diye yalnız ~%35 olasılıkla ve aday varsa.
   */
  randomWordForLevel(level: number, preferLetter?: string): string {
    if (!this.isReady) return '';
    const p = this.pool();
    if (!p) return '';
    const L = pickLength(level);
    const band = levelBand(level, Math.random());
    // Hedef banddaki kelimeler; boşsa o uzunluğun tüm havuzuna düş.
    let candidates: readonly string[] = p.byLenByBand[L]?.[band]?.length
      ? p.byLenByBand[L][band]
      : this.poolOf(L);
    // Antrenman: hafif kaydırma (her zaman değil → fark edilmez).
    if (preferLetter && Math.random() < 0.35) {
      const withLetter = candidates.filter((w) => w.includes(preferLetter));
      if (withLetter.length) candidates = withLetter;
    }
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : '';
  }

  /**
   * Günün kelimesi — tarihe göre BELİRLEYİCİ (aynı gün + aynı dil → aynı kelime),
   * ama ZORLUK-DENGELİ: hafta içi kolay-orta, hafta sonu zorlu; art arda iki gün
   * en zor banttan gelmez; uzunluk tahmin edilemez ama belirleyici (bkz.
   * core/daily-rotation.ts).
   */
  wordOfTheDay(date = new Date()): string {
    if (!this.isReady) return '';
    const p = this.pool();
    if (!p) return '';
    const di = this.dayIndex(date);
    // 📅 Geçersiz kılma (override) önce: yönetici bir güne kelime atadıysa onu
    // kullan — ama yalnız GEÇERLİ bir kelimeyse (bozuk/stale önbellek oyunu bozmasın).
    const ov = this._overrides.get(`${this.langSvc.lang()}:${di}`);
    if (ov) {
      const w = this.up(ov);
      if (p.valid.has(w)) return w;
    }
    const picked = pickDaily(di, (L, band) => p.byLenByBand[L]?.[band] ?? []);
    if (picked) return picked.word;
    // Güvenlik yedeği (band verisi hiç yoksa): eski sıralı seçim.
    const day = this.dayIndex(date);
    const pool = this.poolOf(WORD_LENGTHS[day % WORD_LENGTHS.length]);
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
