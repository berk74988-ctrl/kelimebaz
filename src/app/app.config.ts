import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // PWA: üretimde ngsw-worker.js kaydolur (uygulama kararlı olunca, ~30 sn içinde).
    // Geliştirmede kapalı. Servis worker YALNIZCA güvenli bağlamda (HTTPS/localhost)
    // kaydolur; düz HTTP'de sessizce devre dışı kalır, uygulama normal çalışır.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
