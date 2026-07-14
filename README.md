<div align="center">

# 🎯 Kelimebaz

**Türkçe kelime bulmaca oyunu.** 5 harfli gizli kelimeyi 6 tahminde bul.

### ▶️ [**Oyna: 34.158.136.9/berk/kelimebaz**](http://34.158.136.9/berk/kelimebaz/)

![Kelimebaz](docs/screenshots/2-oyun.png)

</div>

---

## Nasıl oynanır

Gizli kelimeyi tahmin et. Her tahminden sonra harfler renklenir:

| | Anlamı |
| --- | --- |
| 🟩 **Yeşil** | Harf doğru ve **doğru konumda** |
| 🟨 **Sarı** | Harf kelimede **var** ama yeri yanlış |
| ⬜ **Gri** | Harf kelimede **hiç yok** |

**6 hakkın var.** Bitmeden bulursan kazanırsın; bulamazsan doğru kelime gösterilir.

**İki mod:**
- **Günün Kelimesi** — herkes aynı kelimeyi oynar, her gün yenilenir, günde bir hak
- **Serbest Oyna** — rastgele kelime, sınırsız

---

## Ekran görüntüleri

| Ana menü | Oyun sonu |
| --- | --- |
| ![](docs/screenshots/menu-2-masaustu-dolu.png) | ![](docs/screenshots/sonuc-1-kazanma.png) |

| Profil | Ayarlar |
| --- | --- |
| ![](docs/screenshots/menu-3-profil.png) | ![](docs/screenshots/menu-4-ayarlar.png) |

| Renk körü modu | Mobil |
| --- | --- |
| ![](docs/screenshots/6-renk-koru-modu.png) | <img src="docs/screenshots/menu-5-mobil.png" width="260"> |

---

## Özellikler

- 📚 **12.500+ kelimelik Türkçe sözlük** — çekimli biçimler dâhil (`GELDİ`, `OLSUN`, `BABAM`)
- 🎯 **Doğru renk mantığı** — harf tekrarlarında bile (Wordle klonlarının en sık hata yaptığı yer)
- ⌨️ **Tam Türk alfabesi** — 29 harf; `İ`/`I` ayrımı doğru. Türkçe klavyesi olmayanlar da `Ç Ğ Ö Ş Ü` yazabilir
- 📅 **Günün kelimesi** — tarihe göre deterministik, herkese aynı, geri sayımlı
- 📊 **İstatistikler** — oynanan, kazanma %, seri, tahmin dağılımı
- 👤 **Profil** — oyuncu adı ve avatar (tamamen yerel, hesap yok)
- ⚙️ **Ayarlar** — tema, renk körü modu, veri sıfırlama
- 📋 **Spoiler'sız paylaşım** — 🟩🟨⬜ emoji ızgarası
- 🌙 **Karanlık + aydınlık tema** — sistem tercihine uyar
- 👁 **Renk körü modu** — mavi/turuncu palet
- ♿ **Erişilebilir** — sadece klavyeyle oynanabilir, ekran okuyucu her hamleyi okur
- 📱 **Responsive** — 320px'den 4K'ya
- 💾 **Kalıcı** — yarım oyun, istatistik ve tercihler `localStorage`'da
- 🚫 **Backend yok** — kelime listesi JSON, tamamen istemci tarafı

---

## Kurulum

**Gereksinim:** Node.js 20+

```bash
git clone https://github.com/berk74988-ctrl/kelimebaz.git
cd kelimebaz
npm install

npm start          # geliştirme sunucusu → http://localhost:4200
```

```bash
npm run build      # üretim derlemesi → dist/kelimebaz/browser/
npm test           # birim testler
```

---

## Teknoloji

**Angular 22** — standalone bileşenler (NgModule yok), **signals** ile durum yönetimi, `OnPush`, TypeScript, SCSS.

### Proje yapısı

```
src/app/
├── core/                    # SAF mantık — Angular'a bağımsız, kolay test edilir
│   ├── evaluate.ts          #   renk algoritması (oyunun kalbi)
│   ├── share.ts             #   emoji ızgarası
│   ├── a11y.ts              #   ekran okuyucu metinleri
│   ├── clipboard.ts         #   panoya kopyalama (HTTP yedekli)
│   └── turkish.ts           #   Türkçe büyük harf (i → İ)
├── components/              # standalone bileşenler
│   ├── board/  tile/  keyboard/  toast/
│   ├── game/   title-screen/  error-screen/
│   ├── result-modal/  stats-modal/  stats-panel/  countdown/
├── services/                # durum ve kalıcılık (signals)
│   ├── game.service.ts      #   oyun akışı
│   ├── word.service.ts      #   kelime havuzu, günün kelimesi
│   ├── stats.service.ts     #   istatistikler
│   ├── theme.service.ts     #   koyu/açık tema
│   └── contrast.service.ts  #   renk körü modu
├── models/                  # TypeScript tipleri
├── data/
│   ├── words.json           # CEVAPLAR — elle seçilmiş 230 kelime
│   └── valid-words.json     # GEÇERLİ TAHMİNLER — 12.581 kelime
```

### Mimari notlar

**Sözlük iki katmandan üretilir** (`scripts/build-dictionary.mjs`):

1. **Sözlük katmanı** — TDK tabanlı listeler + Zemberek + Hunspell → 10.023 kelime
2. **Korpus katmanı** — OpenSubtitles frekans listesi, **biçimbilim süzgecinden** geçirilmiş → 2.558 kelime

İkinci katman şart: kök sözlükleri `GEL` içerir ama oyuncu `GELDİ` yazar. `GELDİ`, `OLSUN`, `BABAM`, `YERDE` — hiçbiri kök sözlüğünde **yok**. Ham korpus ise çöp dolu (`FROST`, `MİKEY`, `ALDİM`).

`scripts/turkish-morph.mjs` her adayı çözümlemeye çalışır — kelime, bilinen bir kökten geçerli bir ekle, **ünlü uyumuna ve ek sırasına uyarak** türetilebiliyor mu?

| Aday | Karar | Neden |
| --- | --- | --- |
| `GELDİ` | ✅ | `GEL`(fiil) + `-di` — uyum doğru |
| `YOKTU` | ✅ | `YOK`(isim) + `-tu` — ek-fiil isme de gelir |
| `ALDİM` | ❌ | uyum bozuk (`AL` kalın → `ALDIM` olmalı) |
| `MORAN` | ❌ | `MOR` isim; `-an` yalnızca fiile gelir |
| `FROST` | ❌ | çözümlenemiyor |
| `SİMDİ` | ❌ | `ŞİMDİ`nin yazım hatası (tek harf düzeltmesi çok daha sık) |

**Renk mantığı `core/`'da, Angular'dan tamamen bağımsız.** İki geçişli algoritma:

1. Önce **tam isabetler** (🟩) işaretlenir ve o harfler cevabın havuzundan **düşülür**
2. Kalan harfler için havuzda hâlâ varsa 🟨, yoksa ⬜

Bu sıra sayesinde bir harf **asla iki kez sayılmaz**. Örnek — cevap `KALEM`, tahmin `ARABA`: tahminde 3 A var ama cevapta 1 A → **sadece biri** sarı olur.

**Renkler iki katmanlı:** `_variables.scss` (SCSS, derleme zamanı) → `:root` CSS değişkenleri (çalışma zamanı). Tema ve renk körü modu tek satır değişimiyle geçiş yapar — hiçbir bileşen yeniden çizilmez.

---

## Test

```bash
npm test                     # 209 birim test
npm run check:scenarios      # 22 uçtan uca senaryo × 3 tarayıcı
npm run check:dictionary     # 29 harf + sözlük kabul/ret (gerçek tarayıcı)
npm run check:responsive     # 8 ekran boyutu
npm run check:a11y           # klavye + ekran okuyucu + odak
npm run check:contrast       # WCAG kontrast (4 mod)
npm run check:share          # panoya kopyalama
```

Tüm kontroller hem yerelde hem **canlı sitede** çalıştırılıyor. Ayrıntılı checklist ve bulunan hatalar: **[TESTING.md](TESTING.md)**

| Katman | Sonuç |
| --- | --- |
| Birim testler | ✅ 209/209 |
| Senaryolar (Chromium + Firefox + WebKit) | ✅ 66/66 |
| Harf + sözlük · Responsive · Erişilebilirlik · Kontrast · Paylaşım | ✅ |

---

## Deploy

Üretim derlemesi statik dosyalardan ibaret — herhangi bir statik barındırmaya konabilir.

```bash
npm run build
# dist/kelimebaz/browser/ içeriğini sunucuya kopyala
```

Alt klasöre kuruluyorsa `base-href` gerekir. Bu proje `/berk/kelimebaz/` altında yayında, bu yüzden `angular.json`'ın **production** yapılandırmasına gömülü:

```json
"baseHref": "/berk/kelimebaz/"
```

Böylece düz `ng build` her zaman doğru yolu üretir.

---

## Yol haritası

- [x] Oyun tahtası, Türkçe klavye, renk mantığı
- [x] Kazanma / kaybetme, geçersiz kelime uyarıları
- [x] Animasyonlar, responsive, karanlık mod
- [x] İstatistikler, günün kelimesi, paylaşım
- [x] Erişilebilirlik ve renk körü modu
- [x] Uçtan uca test takımı, canlı deploy
- [x] Sözlüğü genişlet (205 → 5.520 kelime)
- [x] Giriş menüsünü yenile (hareketli arka plan, mod kartları)
- [x] Biçimbilim süzgeci + çekimli biçimler (5.520 → 12.581 kelime)
- [x] Ana menü: cam panel, profil + ayarlar, istatistik kartları
- [x] Oyun sonu ekranı: kart hâlinde istatistikler, okunur dağılım, büyük butonlar
- [ ] HTTPS (özel alan adı)
