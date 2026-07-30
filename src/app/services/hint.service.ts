import { inject, Injectable } from '@angular/core';
import hintsTr from '../data/hints-tr.json';
import hintsTrNative from '../data/hints-tr-native.json';
import { LanguageService } from './language.service';

/** Bir kelimenin ipucu: kategori (c) + kısa, cevabı gizleyen açıklama (h). */
export interface Hint {
  c: string;
  h: string;
}

/**
 * 💡 İPUCU SERVİSİ — HER İKİ DİLDE de aktif.
 *
 * TÜRKÇE modda: data/hints-tr-native.json — 860 Türkçe cevap kelimesi için
 *   derleme zamanında LLM ile üretilmiş YERLİ ipuçları (Türkçe kelimenin Türkçe tanımı).
 * İNGİLİZCE modda: data/hints-tr.json — İngilizce cevapların Türkçeye çevrilmiş tanımları.
 *
 * Her iki kaynakta da açıklama cevabı DOĞRUDAN vermez: kelimenin kendisi, kökü ve
 * çekimli biçimi gizlenmiştir (TR için scripts/hint-check-tr-native.mjs otomatik denetler).
 * Çalışma zamanında hiçbir LLM/çeviri çağrısı yapılmaz — sadece bu JSON'lar okunur.
 */
@Injectable({ providedIn: 'root' })
export class HintService {
  private readonly lang = inject(LanguageService);
  private readonly en = hintsTr as Record<string, Hint>;
  private readonly tr = hintsTrNative as Record<string, Hint>;

  /** İpucu sistemi aktif mi? (artık her dilde açık) */
  get enabled(): boolean {
    return true;
  }

  /** Aktif dile göre ipucu kaynağı. */
  private get source(): Record<string, Hint> {
    return this.lang.lang() === 'tr' ? this.tr : this.en;
  }

  /** Kelimenin ipucu — veri yoksa null. */
  for(word: string): Hint | null {
    return this.source[(word || '').toUpperCase()] ?? null;
  }
}
