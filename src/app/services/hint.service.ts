import { inject, Injectable } from '@angular/core';
import hintsTr from '../data/hints-tr.json';
import { LanguageService } from './language.service';

/** Bir kelimenin ipucu: kategori (c) + kısa, cevabı gizleyen açıklama (h). */
export interface Hint {
  c: string;
  h: string;
}

/**
 * 💡 İPUCU SERVİSİ — YALNIZCA İngilizce modda aktif.
 *
 * İngilizce kelimelerle oynanır ama ipucu (kategori + açıklama) TÜRKÇE gösterilir
 * (build-time üretilen data/hints-tr.json — İngilizce tanımların otomatik çevirisi).
 * Sistem yalnızca İngilizce modda aktiftir; Türkçe modda hiçbir ipucu döndürmez.
 * İpuçları cevabı DOĞRUDAN vermez (kelime, çekimleri ve kognatları gizlenmiştir).
 */
@Injectable({ providedIn: 'root' })
export class HintService {
  private readonly lang = inject(LanguageService);
  private readonly hints = hintsTr as Record<string, Hint>;

  /** İpucu sistemi aktif mi? (yalnızca İngilizce dil) */
  get enabled(): boolean {
    return this.lang.lang() === 'en';
  }

  /** Kelimenin ipucu — EN değilse veya veri yoksa null. */
  for(word: string): Hint | null {
    if (!this.enabled) return null;
    return this.hints[(word || '').toUpperCase()] ?? null;
  }
}
