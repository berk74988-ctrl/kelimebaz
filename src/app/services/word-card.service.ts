import { inject, Injectable } from '@angular/core';
import { Lang } from '../core/lang';
import { LanguageService } from './language.service';

/** Sonuç ekranındaki öğretici kelime kartı. t/e zorunlu; k/s/z opsiyonel. */
export interface WordCard {
  /** Tanım (kısa, sade). */
  t: string;
  /** Örnek cümle. */
  e: string;
  /** Köken (varsa). */
  k?: string;
  /** Eş anlamlılar (varsa). */
  s?: string[];
  /** Zıt anlamlılar (varsa). */
  z?: string[];
}

type CardMap = Record<string, WordCard>;

/**
 * 📖 KELİME KARTI SERVİSİ — TEMBEL YÜKLEME.
 *
 * Kart verisi (860 TR + 2840 EN) büyüktür; ana bundle'a KATILMAZ. Aktif dilin
 * JSON'u yalnızca ilk gerektiğinde (sonuç ekranı açılınca) dinamik import ile
 * indirilir ve önbelleğe alınır. Böylece oyun açılışı hızlı kalır.
 *
 * Veri derleme zamanında üretilir (scripts/build-word-cards.mjs); çalışma
 * zamanında hiçbir API çağrısı yapılmaz.
 */
@Injectable({ providedIn: 'root' })
export class WordCardService {
  private readonly lang = inject(LanguageService);
  private readonly cache: Partial<Record<Lang, Promise<CardMap>>> = {};

  /** Dilin kart haritasını (tembel) yükler — bir kez indirir, önbellekler. */
  private load(lang: Lang): Promise<CardMap> {
    if (!this.cache[lang]) {
      const p =
        lang === 'tr'
          ? import('../data/word-cards-tr.json')
          : import('../data/word-cards-en.json');
      this.cache[lang] = p.then((m) => (m.default ?? m) as CardMap).catch(() => ({}) as CardMap);
    }
    return this.cache[lang]!;
  }

  /** Kelimenin kartı — veri yoksa null (arayüz kartı hiç göstermez). */
  async card(word: string): Promise<WordCard | null> {
    const map = await this.load(this.lang.lang());
    return map[(word || '').toUpperCase()] ?? null;
  }
}
