import { Injectable, computed, signal } from '@angular/core';
import { Lang, upperFor } from '../core/lang';
import { MESSAGES } from '../core/messages';

const KEY = 'kelimebaz:lang';

/**
 * ===========================================================================
 * DİL SERVİSİ — Türkçe / İngilizce, çalışma zamanında ANINDA geçiş.
 *
 * Metinler core/messages.ts kayıt defterinde {tr,en} olarak tutulur. `t()`
 * aktif dil SİNYALİNİ okur → şablonlardaki `i18n.t('...')` ifadeleri dil
 * değişince kendiliğinden güncellenir (yeniden yükleme yok). Depolama:
 * 'kelimebaz:lang'. <html lang> de güncellenir.
 * ===========================================================================
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly _lang = signal<Lang>(this.load());
  readonly lang = this._lang.asReadonly();
  readonly isEn = computed(() => this._lang() === 'en');

  constructor() {
    this.apply();
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
  }

  /** Anahtara göre aktif dildeki metin. `{param}` yer tutucuları doldurulur. */
  t(key: string, params?: Record<string, string | number>): string {
    const e = MESSAGES[key];
    let s = e ? (this._lang() === 'en' ? e.en : e.tr) : key;
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

  private load(): Lang {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'en' || v === 'tr') return v;
    } catch {
      /* yoksay */
    }
    return 'tr';
  }
}
