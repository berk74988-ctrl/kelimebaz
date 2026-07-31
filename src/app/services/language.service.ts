import { computed, effect, Injectable, signal } from '@angular/core';
import { Lang, upperFor } from '../core/lang';
import trMessages from '../../i18n/tr.json';

const KEY = 'kelimebaz:lang';
type Dict = Record<string, string>;

/**
 * ===========================================================================
 * DİL SERVİSİ — Türkçe / İngilizce, çalışma zamanında ANINDA geçiş.
 *
 * TEMBEL YÜKLEME: Çeviriler dil başına ayrı JSON'dadır (src/i18n/<lang>.json).
 * VARSAYILAN dil (tr) ana pakete gömülüdür — hem anında görünür hem de EKSİK
 * anahtarlarda GÜVENLİ YEDEK'tir. Diğer diller (en, ileride başkaları) yalnızca
 * seçildiğinde dinamik import ile AYRI CHUNK olarak iner ve önbelleğe alınır.
 *
 * `t(key)` aktif dil + yükleme sinyalini okur → şablonlar dil değişince ya da
 * çeviri inince kendiliğinden güncellenir. Anahtar aktif dilde yoksa VARSAYILAN
 * dile (tr), o da yoksa anahtarın kendisine düşer → arayüz asla boş/bozuk kalmaz.
 * ===========================================================================
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly _lang = signal<Lang>(this.load());
  readonly lang = this._lang.asReadonly();
  readonly isEn = computed(() => this._lang() === 'en');

  /** Yüklenmiş çeviri sözlükleri — 'tr' gömülü (varsayılan + yedek). */
  private readonly dicts = new Map<Lang, Dict>([['tr', trMessages as Dict]]);
  private readonly inflight = new Map<Lang, Promise<void>>();
  /** Yeni bir dil sözlüğü inince artar → t() kullanan şablonları tetikler. */
  private readonly rev = signal(0);

  constructor() {
    this.apply();
    void this.ensure(this._lang()); // aktif dili hemen (tembel) yüklemeye başla
    effect(() => void this.ensure(this._lang())); // dil değişince yeni dili yükle
  }

  /** Dilin çeviri dosyasını (yoksa) dinamik import ile yükler, önbellekler. */
  private ensure(lang: Lang): Promise<void> {
    if (this.dicts.has(lang)) return Promise.resolve();
    const existing = this.inflight.get(lang);
    if (existing) return existing;
    // Not: yeni dil eklerken buraya bir kol ekle (tr gömülü, gerisi tembel).
    const load = lang === 'en' ? import('../../i18n/en.json') : Promise.resolve(null);
    const p = load
      .then((m) => {
        if (m) this.dicts.set(lang, (m as { default?: Dict }).default ?? (m as unknown as Dict));
        this.rev.update((n) => n + 1);
      })
      .catch(() => {
        /* çeviri inmezse yedek (tr) devrede — arayüz bozulmaz */
      })
      .finally(() => this.inflight.delete(lang));
    this.inflight.set(lang, p);
    return p;
  }

  /** Aktif dilin sözlüğü inene kadar bekler (testler için). */
  async whenReady(): Promise<void> {
    await this.ensure(this._lang());
  }

  set(lang: Lang): void {
    if (lang !== 'tr' && lang !== 'en') return;
    this._lang.set(lang);
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* depolama kapalı */
    }
    this.apply();
    this.syncUrl(lang); // paylaşılan link doğru dilde açılsın (?lang=...)
  }

  /**
   * Anahtara göre aktif dildeki metin. `{param}` yer tutucuları doldurulur.
   * Yükleme durumuna reaktiftir (rev). Yedek zinciri: aktif dil → tr → anahtar.
   */
  t(key: string, params?: Record<string, string | number>): string {
    this.rev(); // reaktif: dil sözlüğü inince yeniden değerlendir
    const active = this.dicts.get(this._lang());
    let s = active?.[key] ?? (this.dicts.get('tr') as Dict)[key] ?? key;
    if (params) for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
    return s;
  }

  /** Aktif dile göre büyük harf (TR: İ/I kuralları; EN: düz). */
  upper(s: string): string {
    return upperFor(s, this._lang());
  }

  /** Sayıyı aktif dilin binlik ayracıyla biçimler (tr: 1.000 · en: 1,000). */
  num(n: number): string {
    return n.toLocaleString(this._lang() === 'en' ? 'en' : 'tr');
  }

  private apply(): void {
    if (typeof document !== 'undefined') document.documentElement.lang = this._lang();
  }

  /** Aktif dili URL sorgusuna yazar (history.replaceState) — paylaşım/derin link için. */
  private syncUrl(lang: Lang): void {
    if (typeof location === 'undefined' || typeof history === 'undefined') return;
    try {
      const url = new URL(location.href);
      if (url.searchParams.get('lang') === lang) return; // zaten doğru
      url.searchParams.set('lang', lang);
      history.replaceState(history.state, '', url.toString());
    } catch {
      /* yoksay */
    }
  }

  /**
   * Başlangıç dili: 1) URL ?lang= (paylaşılan link öncelikli) → 2) localStorage →
   * 3) varsayılan 'tr'. Böylece .../?lang=en linki İngilizce açılır.
   */
  private load(): Lang {
    try {
      const u = new URLSearchParams(location.search).get('lang');
      if (u === 'en' || u === 'tr') return u;
    } catch {
      /* location yok / erişilemez */
    }
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'en' || v === 'tr') return v;
    } catch {
      /* yoksay */
    }
    return 'tr';
  }
}
