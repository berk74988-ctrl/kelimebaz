# İçerik Denetim Aracı

LLM ile üretilen içeriği (ipucu, kelime kartı, tema kelimesi, cevap adayı) insan
onayından **hızlıca** geçirmek için yerelde çalışan basit bir araç. Sunucu yok,
veritabanı yok, kimlik doğrulama yok, dağıtım yok — küçük bir Node betiği + tek
sayfalık arayüz.

## Çalıştırma

```bash
npm run review:content      # → http://localhost:4517
```

Tarayıcıda aç. Üstten bir **kaynak** seç; kayıtları ✓/✗/✎ ile denet.

## Denetlenen kaynaklar

| Kaynak | Tür | Dosya |
| --- | --- | --- |
| İpuçları TR/EN | hint | `src/app/data/hints-tr-native.json`, `hints-en.json` |
| Kelime kartları TR/EN | wordcard | `src/app/data/word-cards-tr.json`, `word-cards-en.json` |
| Tema kelimeleri TR/EN | themeword | `src/app/data/themes-tr.json`, `themes-en.json` |
| Cevap adayları TR | answer | `src/app/data/words.json` |

Yeni kaynak eklemek: `tools/content-review/sources.mjs` içindeki `SOURCES`'a bir
satır ekle (var olan bir tür adaptörünü kullan veya yeni tür yaz).

## Kısayollar (dakikada 20+ kayıt)

| Tuş | Eylem |
| --- | --- |
| <kbd>a</kbd> | Onayla (ve sonraki) |
| <kbd>r</kbd> | Reddet (gerekçe kutusu doluysa onu, boşsa ön-işaretleri kaydeder) |
| <kbd>e</kbd> | Düzelt (metni değiştir → "düzeltildi" olarak işaretlenir) |
| <kbd>j</kbd> / <kbd>k</kbd> | Sonraki / önceki |
| <kbd>u</kbd> | Kararı geri al (denetlenmemişe döndür) |

**Filtre:** denetlenmemişler · tümü · reddedilenler · ön-işaretliler.
**İlerleme:** üstte çubuk + "kaç denetlendi / kaç kaldı / kaç red".

## Otomatik ön denetim

Araç, açılışta bazı kayıtları ⚠ ile işaretler (elle bakmadan önce dikkat çeker):

- **İpucu:** cevabı (kelimeyi) İÇEREN ipuçları, boş/çok kısa metinler.
- **Kelime kartı:** tanımı boş/çok kısa olanlar.
- **Cevap adayı:** uzunluğu 4–7 dışında olanlar.

## Kararlar nerede saklanır

`tools/content-review/reviews/<kaynak>.json` — her kayıt için durum
(`approved`/`rejected`/`edited`), düzeltilmiş metin ve denetim tarihi. Araç
kapanıp açılınca **kaldığı yerden** devam eder. Bu dosyalar repoya commit
edilebilir (ekip paylaşımı + geçmiş).

**Reddedilen SİLİNMEZ, işaretlenir.** Üretime uygularken gerekçeleriyle
`rejected/<kaynak>.json`'a arşivlenir — yeniden üretimde aynı hata tekrarlanırsa
fark edilir ve istem (prompt) iyileştirilebilir.

## Üretime uygulama (yalnızca onaylı içerik paketlenir)

Denetim bitince kararları gerçek veri dosyasına uygula:

```bash
npm run review:apply -- hints-tr            # red çıkar (arşivle) + düzeltmeleri uygula
npm run review:apply -- hints-tr --strict   # denetlenmemişleri de çıkar (kesin: yalnız onaylı)
npm run review:apply -- hints-tr --dry      # yazma, yalnız raporla
```

- **Reddedilenler** veri dosyasından çıkarılır, `rejected/<kaynak>.json`'a
  gerekçeleriyle yazılır (silinmez).
- **Düzeltmeler** uygulanır.
- Varsayılan: onaylı **+ henüz denetlenmemiş** tutulur (kısmi denetim veriyi
  yok etmesin). `--strict` ile yalnızca onaylı içerik kalır.
- Cevap havuzu/tema gibi app'in beklediği JSON biçimi korunur.

Böylece oyuna paketlenen içerik denetimden geçmiş olur.
