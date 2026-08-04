import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.berk.kelimebaz',
  appName: 'Kelimebaz',
  webDir: 'dist/kelimebaz/browser',
  server: {
    // WebView kökeni http://localhost olsun. Neden: rooms-server HTTP (34.158.136.9,
    // HTTPS yok). https köken → http backend = "mixed content" engellenir. http köken
    // ile bu sorun yok; localhost yine güvenli bağlam sayılır (crypto/localStorage çalışır).
    androidScheme: 'http',
    // Cleartext (şifresiz http) trafiğe izin — sunucu HTTPS değil (usesCleartextTraffic).
    cleartext: true,
  },
};

export default config;
