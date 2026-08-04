# Mobil Geliştirme Ortamı Kurulumu (Android / iOS)

Sıfırdan bir Windows makinede Kelimebaz'ı Android'de (Capacitor ile) çalıştırmak
için geliştirme ortamı. **Bu paket Capacitor entegrasyonundan ÖNCE gelir** — ortam
kurulmadan `npx cap add android` çalışmaz.

> Bu not gerçek bir kurulumda (Windows 11, 3 Ağu 2026) yaşananları yansıtır.
> İkinci kurulum yapan buradaki komutları + "Takılmalar" bölümünü takip ederek çok
> daha hızlı gider.

## Gereken sürümler (Capacitor güncel belgesinden — tahmin YOK)

Kaynak: https://capacitorjs.com/docs/getting-started/environment-setup (3 Ağu 2026)

| Araç | Gerekli |
|---|---|
| Node.js | 22+ |
| Android Studio | 2025.2.1+ |
| Android SDK | API 24+ (güncel stabil: Android 16 = **API 36**) |
| JDK | Belge "Android Studio kendi JDK'sını kurar" der. **Komut satırı derlemesi için ayrı JDK 21** kurduk (Android Studio'nun JBR'si de 21). |
| Gradle | Capacitor'ın Android projesi kendi getirir (wrapper) |

iOS: Xcode 26+ (yalnız macOS) + CocoaPods (opsiyonel).

## Başlangıç durumu (bu makinede)

- winget ✅, Node **v24.18.0** ✅
- **Java 8 (1.8.0_401)** kuruluydu — ÇOK ESKİ, Android derlemesi için yetersiz.
- adb yok, Android Studio yok, SDK yok, `ANDROID_HOME`/`JAVA_HOME` boş.

## Yapılan adımlar (komutlarıyla)

Hepsi PowerShell'de. Kurulum konumları: JDK → `C:\Program Files\Eclipse Adoptium\`,
SDK → `%LOCALAPPDATA%\Android\Sdk`.

### 1. JDK 21 (Temurin)

```powershell
winget install --id EclipseAdoptium.Temurin.21.JDK -e --accept-source-agreements --accept-package-agreements
```

Temurin MSI, `jdk-...\bin`'i **Machine PATH'in başına** ekler (index 0) ve doğrular:
`openjdk version "21.0.12"`. `JAVA_HOME`'u elle ayarladık (MSI ayarlamıyor):

```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot", "User")
```

### 2. Android SDK — command-line tools (GUI sihirbazı olmadan)

Güncel indirme adresi Google'ın studio sayfasından doğrulandı (build 15859902):

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
Invoke-WebRequest "https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip" -OutFile "$env:TEMP\cmdtools.zip"
Expand-Archive "$env:TEMP\cmdtools.zip" "$env:TEMP\cmdtools-extract" -Force
New-Item -ItemType Directory -Force "$sdk\cmdline-tools\latest" | Out-Null
Get-ChildItem "$env:TEMP\cmdtools-extract\cmdline-tools" | Move-Item -Destination "$sdk\cmdline-tools\latest" -Force
```

> ⚠️ **ÖNEMLİ yerleşim:** zip `cmdline-tools\` diye açılır; sdkmanager bunu
> `cmdline-tools\latest\` altında bekler. İçeriği `latest\`e taşımazsan sdkmanager
> "Could not determine SDK root" der.

### 3. Ortam değişkenleri (kalıcı)

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdk, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdk, "User")
# User PATH'e ekle: platform-tools (adb) + cmdline-tools\latest\bin (sdkmanager)
```

### 4. SDK bileşenleri + lisanslar

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
$env:ANDROID_HOME = $sdk
$mgr = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"
& $mgr --sdk_root="$sdk" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

Kurulanlar: **platform-tools 37.0.1** (adb dahil), **platforms;android-36**,
**build-tools;36.0.0**.

## ⚠️ Takılmalar ve çözümleri (İKİNCİ KURULUM İÇİN EN ÖNEMLİ BÖLÜM)

1. **Eski Java 8, PATH'te öndeydi → `java -version` yanlış sürüm gösterir.**
   Çözüm: Temurin MSI zaten JDK21 bin'ini Machine PATH index 0'a koydu (Oracle
   javapath index 1). Yeni terminalde `java` → 21. Emin olmak için PATH sırasını
   kontrol et; JDK21 Oracle'dan **önce** olmalı. Gradle zaten `JAVA_HOME`'u kullanır.

2. **`sdkmanager --licenses` Windows'ta stdin'den "y" OKUMUYOR.** Ne PowerShell
   pipe'ı (`"y" | sdkmanager`) ne de cmd for-döngüsü (`(for /l ...do @echo y)|`)
   çalıştı — prompt'ta asılı kaldı. **Çözüm:** lisans kabul dosyalarını doğrudan
   yaz. `%ANDROID_HOME%\licenses\` altına dosya adı = lisans adı, içerik = resmi
   SHA1 hash(ler)i:
   ```
   android-sdk-license:          24333f8a63b6825ea9c5514f83c2829b004d1fee
                                 d56f5187479451eabf01fb78af6dfcb131a6481e
                                 8933bad161af4178b1185d1a37fbf41ea5269c55
   android-sdk-preview-license:  84831b9409646a918e30573bab4c9c91346d8abd
   ```
   Bu, kuracağımız paketlerin (`android-sdk-license` altındaki platform-tools/
   platform/build-tools) lisansını kapatır → install prompt'suz geçer. (Kalan
   preview/googletv lisansları kurmadığımız paketler için, gerekmez.)

3. **Bu oturumun PATH'i bayat:** kurulumdan sonra AÇIK olan terminal eski env'i
   taşır. Doğrulamaları **YENİ bir terminalde** yap (ya da env'i elle set et).

## Doğrulama (yeni terminalde)

```
java -version      → openjdk version "21.0.12"
adb --version      → 1.0.41 / 37.0.1
echo %JAVA_HOME%   → ...jdk-21...
echo %ANDROID_HOME% → ...\Android\Sdk
```

## Kalan adımlar (GUI/fiziksel — kılavuzlu)

### Android Studio (emülatör + AVD Manager için)
```powershell
winget install --id Google.AndroidStudio -e --accept-package-agreements --accept-source-agreements
```
İlk açılışta "Standard" kurulumu seç; SDK'yı yukarıda kurduğumuz konumu
(`%LOCALAPPDATA%\Android\Sdk`) göster (yeniden indirmesin).

### Emülatör (AVD)
Android Studio → **More Actions → Virtual Device Manager → Create Device** →
Pixel (herhangi) → System Image: **API 36 (google_apis_playstore, x86_64)** → indir
→ Finish → ▶ ile başlat.
- **Yavaşsa donanım hızlandırma:** Windows'ta "Windows Hypervisor Platform" (WHPX)
  özelliğini aç (Denetim Masası → Programlar → Windows özelliklerini aç/kapat →
  Windows Hypervisor Platform ✔ → yeniden başlat). Yönetici + reboot gerekir.

### Gerçek cihaz (telefon — önerilen)
1. Telefon: **Ayarlar → Telefon hakkında → Yapılım numarası**na 7 kez dokun →
   "Geliştirici oldun".
2. **Ayarlar → Geliştirici seçenekleri → USB hata ayıklama** aç.
3. USB ile bağla; telefonda "Bu bilgisayara izin ver?" çıkarsa **İzin ver**.
4. `adb devices` → cihaz listede `device` olarak görünmeli.
   - Windows'ta görünmezse: üreticinin **USB sürücüsü** ya da "Google USB Driver"
     (SDK Manager → SDK Tools) gerekebilir.

### `npx cap doctor`
Bu komut **Capacitor paketi eklendikten sonra** (bir sonraki iş) anlamlı çalışır;
projede `@capacitor/cli` + `capacitor.config` gerektirir. Ortamın kendisi yukarıdaki
`java -version` / `adb --version` ile doğrulandı.

## ✅ Kurulum sonucu (bu makinede doğrulandı — 3 Ağu 2026)

- `java -version` → **openjdk 21.0.12** (eski Java 8 yerine, PATH sırası düzeldi)
- `adb --version` → **1.0.41 / 37.0.1**
- `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` tanımlı + PATH (adb/sdkmanager)
- Android Studio **2026.1.3.7** kuruldu; ilk açılışta mevcut SDK'yı buldu (baştan
  indirmedi) ve emülatör motorunu (37.1.11) ekledi.
- Emülatör: **Pixel_8** AVD (Android 17 / API 37.1, x86_64, Google Play) oluşturuldu.
  `emulator -accel-check` → **WHPX installed and usable** (donanım hızlandırma açık).
  Emülatör açıldı, `boot_completed=1`, `adb devices` → `emulator-5554 device`,
  ana ekran (NexusLauncher) geldi → **kullanılabilir hızda çalışıyor.** ✅
- **Gerçek cihaz:** bu kurulumda telefon bağlanmadı (emülatör yeterli oldu). Gerçek
  telefonla test için yukarıdaki "Gerçek cihaz" adımları izlenir.
- **`npx cap doctor`:** Capacitor paketi eklendikten sonra (bir sonraki iş) çalışır.

## 🍎 iOS — ENGEL (donanım)

iOS derlemesi **yalnız macOS + Xcode** ile mümkün. **Bu makinede Mac YOK** → iOS
adımı burada durur. Bu bir kod sorunu değil, donanım gereksinimidir. Mac erişimi
olursa: Xcode 26+ + Command Line Tools (`xcode-select --install`) + CocoaPods
(`brew install cocoapods`). Cihazda test için ücretsiz Apple ID yeter; App Store
için ücretli geliştirici hesabı şart.

## 📦 Capacitor + Android APK (4 Ağu 2026 — çalışır durumda)

Kelimebaz'ı Android'e paketlemek için **Capacitor** kullanıldı. Uygulama Angular
(web) → WebView içinde çalışır; sunucuya bağlı özellikler (oda/ipucu/denge) gerçek
sunucuya (34.158.136.9) gider.

### Kurulum

```
npm install @capacitor/core @capacitor/cli @capacitor/android    # v8.5.0
npx cap init "Kelimebaz" "com.berk.kelimebaz" --web-dir "dist/kelimebaz/browser"
npx cap add android
```

`capacitor.config.ts` (kritik ayarlar):
```ts
server: {
  androidScheme: 'http',  // WebView kökeni http://localhost → http backend'e mixed-content YOK
  cleartext: true,        // sunucu HTTPS değil
}
```
+ `android/app/src/main/AndroidManifest.xml` `<application>` içine
`android:usesCleartextTraffic="true"` (http sunucuya izin).

### ⚠️ EN BÜYÜK TUZAK: base href (boş/koyu ekran)

Yayın (web) derlemesi `angular.json`'da `baseHref: "/berk/kelimebaz/"` kullanır.
APK içinde uygulama `http://localhost/`'ta çalışır → JS/CSS'i
`http://localhost/berk/kelimebaz/...`'tan arar, **bulamaz** → sadece koyu arka plan
görünür, içerik gelmez. **Çözüm:** mobil derlemede base href `/` olmalı. Bunun için
`build:mobile` scripti eklendi:
```
"build:mobile": "ng build --base-href / && npx cap sync android"
```
Belirti: APK açılıyor ama boş/koyu ekran + logcat'te asset 404 → base href yanlış.

### Kod tarafı değişiklikleri

- **`src/app/core/server-base.ts` (YENİ):** tek kaynak `serverBase()`. Native APK'da
  (`window.Capacitor.isNativePlatform()`) sunucuya **mutlak adres** (`http://34.158.136.9/berk/rooms`);
  web'de eskisi gibi (`/berk/rooms` ya da `localhost:4243`). 6 servis (room, telemetry,
  word, balance, ai-hint, ai-behavior) buna bağlandı — yoksa APK'da göreli `/berk/rooms`
  telefonda çözülemez.
- **Service worker native'de KAPALI** (`app.config.ts`, `isCapacitorNative()`): Capacitor
  içinde SW gereksiz + beyaz-ekran/güncelleme sorunu çıkarabilir.

### APK derleme

```
npm run build:mobile                                  # base-href / + sync
cd android && ./gradlew.bat assembleDebug --no-daemon # → app/build/outputs/apk/debug/app-debug.apk (~8.8 MB)
```
Emülatöre/cihaza kur + başlat:
```
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.berk.kelimebaz -c android.intent.category.LAUNCHER 1
```

### 🖱️ Android Studio'da tek tık APK

1. Android Studio → **Open** → projedeki **`android/`** klasörünü aç (kök değil).
2. Önce `npm run build:mobile` (web varlıklarını güncelle) — kod değişince her sefer.
3. Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)** → biten APK linkine tıkla.
4. Ya da ▶ (Run) ile bağlı cihaza/emülatöre doğrudan kur+çalıştır.

### Sonuç (doğrulandı)

`BUILD SUCCESSFUL`, `app-debug.apk` (8.8 MB) emülatöre (Pixel 8) kuruldu; uygulama
**eksiksiz açıldı** — ana menü, Günün Kelimesi, Serbest/Arkadaşlarla/YZ'ye Karşı,
Tema, Ustalık, istatistikler, ayarlar hepsi render oldu. JS hatası yok. (Logcat'te
tek zararsız uyarı: Capacitor "safe area CSS" enjeksiyonu — işlevi etkilemiyor.)

### Notlar

- **Kod değişince:** `npm run build:mobile` şart (web'i yeniden derler + `cap sync`).
  Sadece Gradle build yeni JS'i almaz.
- **Tablet:** uygulama responsive (ortalanmış kapsayıcı) → telefon + tablette düzgün.
- **HTTPS gelirse:** `androidScheme`'i `https` yapıp `serverBase` native adresini
  `https://...` yapmak daha güvenli olur (o zaman cleartext gerekmez).
