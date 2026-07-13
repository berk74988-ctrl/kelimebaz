# 🎯 Kelimebaz

Türkçe kelime bulmaca oyunu. Angular ile geliştiriliyor.

> **Durum:** İskelet hazır — başlık ekranı çalışıyor, oyun mantığı henüz eklenmedi.

---

## 🚀 Başlarken

**Gereksinim:** Node.js 20+ ve npm

```bash
npm install        # bağımlılıkları kur
npm start          # geliştirme sunucusu (ng serve)
```

Tarayıcıda **http://localhost:4200** adresini aç. Kaynak dosyaları değiştikçe sayfa otomatik yenilenir.

```bash
npm run build      # üretim derlemesi -> dist/
npm test           # birim testler
```

---

## 📁 Proje yapısı

```
src/
├── app/
│   ├── components/          # standalone bileşenler (UI)
│   │   └── title-screen/
│   ├── services/            # iş mantığı, veri erişimi
│   │   └── word.service.ts
│   ├── models/              # TypeScript tipleri / arayüzler
│   │   └── game.model.ts
│   ├── data/                # statik veri (kelime havuzu)
│   │   └── words.ts
│   ├── app.ts               # kök bileşen
│   └── app.config.ts        # uygulama sağlayıcıları
├── styles/
│   ├── _variables.scss      # renkler, ölçüler, tipografi (SCSS değişkenleri)
│   └── _reset.scss          # global reset + :root CSS değişkenleri
├── styles.scss              # global stil giriş noktası
└── index.html
```

### Mimari notlar

- **Standalone bileşenler** kullanılıyor — `NgModule` yok.
- Bileşenler `ChangeDetectionStrategy.OnPush` ve **signal** tabanlı durum kullanır.
- Renkler iki katmanlı: `_variables.scss` (SCSS, derleme zamanı) → `:root` CSS değişkenleri (çalışma zamanı, tema değişimine açık).
- Bileşen stillerinde değişkenlere erişim:
  ```scss
  @use '../../../styles/variables' as v;

  .kutu {
    padding: v.$space-3;
    color: var(--text);
  }
  ```

---

## 🎨 Renk paleti

| Değişken | Renk | Kullanım |
| --- | --- | --- |
| `--correct` | `#4caf82` | Harf doğru, yeri doğru |
| `--present` | `#d9a441` | Harf var, yeri yanlış |
| `--absent` | `#3a4150` | Harf kelimede yok |
| `--accent` | `#6c8cff` | Vurgu, butonlar |
| `--bg` / `--surface` | `#10131a` / `#191e28` | Zemin ve kartlar |

---

## 🗺️ Yol haritası

- [x] Angular iskeleti, standalone yapı, global SCSS
- [x] Başlık ekranı
- [ ] Oyun tahtası (harf kutuları)
- [ ] Ekran klavyesi + harf durumu renklendirme
- [ ] Tahmin değerlendirme mantığı
- [ ] Kelime havuzunu genişletme
- [ ] Skor / istatistik ekranı

---

## 🧰 Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm start` | Geliştirme sunucusu (http://localhost:4200) |
| `npm run build` | Üretim derlemesi |
| `npm run watch` | Değişiklikleri izleyerek derle |
| `npm test` | Birim testler |
| `ng generate component components/ad` | Yeni bileşen üret |
