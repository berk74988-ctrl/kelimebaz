import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.berk.kelimebaz',
  appName: 'Kelimebaz',
  webDir: 'dist/kelimebaz/browser',
  server: {
    // WebView kökeni https://localhost. Sunucu artık HTTPS (kelimebaz.aicirkit.com)
    // → iki taraf da HTTPS, "mixed content" yok. Cleartext KALDIRILDI (Play Store +
    // güvenlik: telefondaki tüm trafik artık şifreli). Native istek çapraz köken →
    // sunucu ALLOWED_ORIGINS'ta https://localhost olmali (rooms-server'da eklendi).
    androidScheme: 'https',
  },
};

export default config;
