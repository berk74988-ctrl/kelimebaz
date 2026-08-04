import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { isCapacitorNative } from './core/server-base';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // PWA: üretimde ngsw-worker.js kaydolur (uygulama kararlı olunca, ~30 sn içinde).
    // Geliştirmede kapalı. NATIVE APK'da da KAPALI: Capacitor içinde SW yerel dosyaları
    // gereksiz önbelleğe alır + istekleri araya girip güncelleme/beyaz-ekran sorunu
    // çıkarabilir (bilinen sorun). Native tespiti: window.Capacitor global'i.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !isCapacitorNative(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
