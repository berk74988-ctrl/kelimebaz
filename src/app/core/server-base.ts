/**
 * SUNUCU KÖK ADRESİ — rooms-server'a bağlanan TÜM servisler bunu kullanır (tek kaynak).
 *
 *  - **Native APK (Capacitor):** WebView kökeni `https://localhost` olur; göreli `/berk/rooms`
 *    ya da `localhost:4243` telefonda ÇALIŞMAZ → gerçek sunucuya MUTLAK (HTTPS) adres verilir.
 *    Native istek çapraz kökendir → sunucu ALLOWED_ORIGINS'ta `https://localhost` olmalı.
 *  - **Web (yerel geliştirme):** `http://localhost:4243`
 *  - **Web (yayın):** `/berk/rooms` (nginx aynı köken üzerinden 127.0.0.1:4243'e proxy'ler)
 *
 * Native tespiti: Capacitor, WebView'a `window.Capacitor` global'ini enjekte eder;
 * modülü import etmeden bakılır → bu dosya saf kalır (Angular/Capacitor bağımlılığı yok).
 */

const NATIVE_ROOMS = 'https://kelimebaz.aicirkit.com/berk/rooms';

/** Uygulama Capacitor (native APK/paket) içinde mi çalışıyor? (modül import etmeden) */
export function isCapacitorNative(): boolean {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export function serverBase(): string {
  if (isCapacitorNative()) return NATIVE_ROOMS; // telefonda gerçek sunucu
  if (typeof location === 'undefined') return 'http://localhost:4243';
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4243';
  return '/berk/rooms';
}
