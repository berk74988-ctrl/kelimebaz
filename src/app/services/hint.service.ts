import { effect, inject, Injectable, signal } from '@angular/core';
import { Lang } from '../core/lang';
import { LanguageService } from './language.service';

/** Bir kelimenin ipucu: kategori (c) + kısa, cevabı gizleyen açıklama (h). */
export interface Hint {
  c: string;
  h: string;
}

type HintMap = Record<string, Hint>;

/**
 * 💡 İPUCU SERVİSİ — HER İKİ DİLDE, TEMBEL YÜKLEME.
 *
 * İpucu sözlükleri (TR yerli + İngilizce çeviri; toplam ~250 KB) ana pakete
 * GÖMÜLMEZ. Aktif dilin haritası ilk gerektiğinde dinamik import ile ayrı chunk
 * olarak indirilir, önbelleğe alınır. İpuçları oyun sırasında (istenirse) gösterilir;
 * inene kadar `for()` null döner (buton çıkmaz), inince şablon kendiliğinden yeniler.
 *
 * TÜRKÇE: hints-tr-native.json (Türkçe kelimenin Türkçe tanımı).
 * İNGİLİZCE: hints-tr.json (İngilizce cevapların Türkçeye çevrilmiş tanımları).
 * Her iki kaynakta da açıklama cevabı doğrudan vermez (kelime/kök/çekim gizli).
 */
@Injectable({ providedIn: 'root' })
export class HintService {
  private readonly lang = inject(LanguageService);
  private readonly cache = new Map<Lang, HintMap>();
  private readonly inflight = new Map<Lang, Promise<void>>();
  /** Yeni bir dil haritası inince artar → for() kullanan şablonları tetikler. */
  private readonly rev = signal(0);

  /** YALNIZCA TEST İÇİN: ipucu haritalarını senkron tohumlar. Üretimde çağrılmaz. */
  private static seed: Partial<Record<Lang, HintMap>> = {};
  static seedForTest(maps: Partial<Record<Lang, HintMap>>): void {
    Object.assign(HintService.seed, maps);
  }

  constructor() {
    for (const lang of Object.keys(HintService.seed) as Lang[]) {
      const map = HintService.seed[lang];
      if (map) this.cache.set(lang, map);
    }
    effect(() => {
      const l = this.lang.lang();
      void this.ensure(l);
    });
  }

  /** İpucu sistemi aktif mi? (artık her dilde açık) */
  get enabled(): boolean {
    return true;
  }

  private ensure(lang: Lang): Promise<void> {
    if (this.cache.has(lang)) return Promise.resolve();
    const existing = this.inflight.get(lang);
    if (existing) return existing;
    const p = (
      lang === 'tr'
        ? import('../data/hints-tr-native.json')
        : lang === 'de'
          ? import('../data/hints-de.json')
          : import('../data/hints-tr.json')
    )
      .then((m) => {
        const map = ((m as { default?: unknown }).default ?? m) as HintMap;
        this.cache.set(lang, map);
        this.rev.update((n) => n + 1);
      })
      .catch(() => {
        /* ipucu ikincil özellik — inmezse sessizce yok say (oyun bozulmaz) */
      })
      .finally(() => this.inflight.delete(lang));
    this.inflight.set(lang, p);
    return p;
  }

  /** Aktif dilin haritası inene kadar bekler (testler için). */
  async whenReady(): Promise<void> {
    await this.ensure(this.lang.lang());
  }

  /** Kelimenin ipucu — veri henüz inmediyse ya da yoksa null. */
  for(word: string): Hint | null {
    this.rev(); // reaktif: harita inince yeniden değerlendir
    const map = this.cache.get(this.lang.lang());
    return map ? (map[(word || '').toUpperCase()] ?? null) : null;
  }
}
