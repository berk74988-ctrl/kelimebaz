import { Injectable } from '@angular/core';

/** localStorage'daki tüm oyuncu verisi bu önekle tutulur. */
const PREFIX = 'kelimebaz:';
/** Yedek dosyası şema sürümü. Yapı değişirse artır + apply'da göç ekle. */
const SCHEMA_VERSION = 1;
const APP = 'kelimebaz';

/** İndirilen/yüklenen yedek dosyasının biçimi. */
export interface Backup {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, string>;
}

/** İçe aktarma hatası kodu — bileşen bunu anlaşılır bir mesaja çevirir. */
export type ImportErrorCode = 'invalidJson' | 'notBackup' | 'empty';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
  }
}

/**
 * ===========================================================================
 * OYUNCU VERİSİ — dışa/içe aktarma (yedekleme).
 *
 * Hesap sistemi yok; tüm ilerleme localStorage'da (`kelimebaz:*`). Tek bir
 * "tarayıcı verisini temizle" ile hepsi yok olur ve cihazlar arası taşınmaz.
 * Bu servis TÜM `kelimebaz:*` anahtarlarını tek bir JSON dosyasına toplar ve
 * geri yükler — böylece oyuncu ilerlemesini yedekleyip taşıyabilir.
 *
 * TASARIM: anahtarlar tek tek sayılmaz; `kelimebaz:` önekli HER anahtar
 * toplanır → ileride eklenen anahtarlar da otomatik yedeklenir.
 *
 * İÇE AKTARMA: mevcut `kelimebaz:*` anahtarlar TEMİZLENİR, yedektekiler yazılır
 * → birebir replika. Yedekte olmayan anahtarlar servislerin varsayılanına
 * düşer (eski sürüm yedeği güvenle yüklenir). Uygulama sonrası sayfa yeniden
 * yüklenmeli ki tüm servisler yeni durumu okusun (bunu bileşen yapar).
 * ===========================================================================
 */
@Injectable({ providedIn: 'root' })
export class PlayerDataService {
  /** Tüm `kelimebaz:*` anahtarlarını { anahtar: değer } olarak toplar. */
  collect(): Record<string, string> {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
      }
    }
    return data;
  }

  /** Sürüm ve tarih içeren yedek nesnesi. */
  buildBackup(): Backup {
    return {
      app: APP,
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: this.collect(),
    };
  }

  /** Yedeği JSON dosyası olarak indirir (kelimebaz-yedek-YYYY-AA-GG.json). */
  export(): void {
    const json = JSON.stringify(this.buildBackup(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kelimebaz-yedek-${this.dateStamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Dosya metnini doğrular. Geçerliyse temizlenmiş Backup döner; değilse
   * anlaşılır kodlu ImportError fırlatır (bozuk JSON / yedek değil / boş).
   */
  parse(text: string): Backup {
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new ImportError('invalidJson');
    }
    if (!obj || typeof obj !== 'object') throw new ImportError('notBackup');

    const b = obj as Partial<Backup>;
    if (b.app !== APP || typeof b.version !== 'number' || !b.data || typeof b.data !== 'object') {
      throw new ImportError('notBackup');
    }

    // Yalnızca `kelimebaz:*` string anahtar/değerleri al — çöp/enjekte veriyi ele.
    const raw = b.data as Record<string, unknown>;
    const data: Record<string, string> = {};
    for (const key of Object.keys(raw)) {
      if (key.startsWith(PREFIX) && typeof raw[key] === 'string') data[key] = raw[key] as string;
    }
    if (Object.keys(data).length === 0) throw new ImportError('empty');

    return { app: APP, version: b.version, exportedAt: String(b.exportedAt ?? ''), data };
  }

  /** Yedek bu uygulamanın şemasından daha yeni bir sürümden mi? */
  isNewer(backup: Backup): boolean {
    return backup.version > SCHEMA_VERSION;
  }

  /**
   * Yedeği uygular: mevcut TÜM `kelimebaz:*` anahtarları silinir, yedektekiler
   * yazılır. Böylece sonuç yedeğin BİREBİR replikasıdır; yedekte olmayan
   * anahtarlar servis varsayılanına düşer. Çağıran ardından sayfayı yeniden
   * yüklemeli (servisler değeri yapıcıda okur).
   */
  apply(backup: Backup): void {
    for (const key of this.currentKeys()) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(backup.data)) localStorage.setItem(key, value);
  }

  /** Şu an localStorage'daki `kelimebaz:*` anahtarların listesi. */
  private currentKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    return keys;
  }

  /** İndirilen dosya adı için YYYY-AA-GG. */
  private dateStamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}
