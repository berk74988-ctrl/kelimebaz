# 🧪 Kelimebaz — Test Notları

Son çalıştırma: **13 Temmuz 2026** · Sürüm: `main`

---

## Özet

| Katman | Kapsam | Sonuç |
| --- | --- | --- |
| **Birim testler** | 159 test / 18 dosya | ✅ Tamamı geçiyor |
| **Senaryo testleri** | 22 senaryo × 3 tarayıcı = 66 | ✅ Tamamı geçiyor |
| **Responsive** | 8 ekran boyutu | ✅ |
| **Erişilebilirlik** | Klavye + ekran okuyucu + odak | ✅ |
| **Kontrast (WCAG)** | 4 mod (koyu/açık × normal/yüksek) | ✅ |
| **Paylaşım** | Panoya kopyalama (HTTP dahil) | ✅ |

**Bilinen kritik hata: yok.**

---

## Çalıştırma

```bash
npm test                     # birim testler
npm run check:scenarios      # uçtan uca senaryolar (3 tarayıcı)
npm run check:responsive     # 8 ekran boyutu
npm run check:a11y           # erişilebilirlik
npm run check:contrast       # WCAG kontrast
npm run check:share          # panoya kopyalama

# canlı siteye karşı:
npm run check:scenarios -- http://34.158.136.9/berk/kelimebaz/
```

---

## ✅ Senaryo checklist

Aşağıdakiler **Chromium, Firefox ve WebKit** (Safari motoru) üzerinde otomatik doğrulanıyor.

### Kazanma
- [x] Doğru tahminde 5 kutu da yeşil oluyor
- [x] Kutlama ekranı açılıyor, kaç tahminde bulunduğu yazıyor
- [x] İstatistiklere kazanma olarak işleniyor

### Kaybetme
- [x] Tam 6. hakta bitiyor (5.'de erken bitmiyor)
- [x] **Doğru kelime gösteriliyor**
- [x] Seri sıfırlanıyor, en iyi seri korunuyor

### Geçersiz kelime
- [x] Sözlükte olmayan kelime kabul edilmiyor → "Sözlükte yok"
- [x] Eksik harfle onaylanmıyor → "5 harf girin"
- [x] Satır ilerlemiyor, **satır kilitlenmiyor** (oyuncu düzeltebiliyor)
- [x] Uyarı birkaç saniyede kendiliğinden kayboluyor
- [x] Satır sallanıyor (görsel geri bildirim)

### 🔴 Harf tekrarı (en kritik alan)
Renk algoritmasının en sık yanlış yapılan kısmı. **Sözlükteki gerçek kelimelerle** test edildi:

| Cevap | Tahmin | Beklenen | Neden zor |
| --- | --- | --- | --- |
| KALEM | ARABA | 🟨⬜⬜⬜⬜ | Tahminde **3 A**, cevapta **1 A** → sadece biri sarı |
| ARABA | KALEM | ⬜🟨⬜⬜⬜ | Tersi: cevapta 3 A, tahminde 1 A |
| EKMEK | ŞEKER | ⬜🟨🟨🟩⬜ | Çift E + çift K, **yeşil önce sayılır** |
| HAMAM | MASAL | 🟨🟩⬜🟩⬜ | İki yeşil + bir sarı, çift A ve M |
| ÇİÇEK | ÇİÇEK | 🟩🟩🟩🟩🟩 | Çift Ç, tam isabet |
| EKMEK | KİTAP | 🟨⬜⬜⬜⬜ | Cevapta 2 K, tahminde 1 K |

Ayrıca **birim testte** bir değişmez (invariant) doğrulanıyor:
> *Herhangi bir harf için işaretlenen (yeşil + sarı) sayısı, cevaptaki adedini asla aşamaz.*

### localStorage
- [x] Yarım kalan oyun sayfa yenilenince kaldığı yerden devam ediyor
- [x] İstatistikler korunuyor
- [x] Tema tercihi korunuyor
- [x] Bozuk/eksik kayıt oyunu çökertmiyor (güvenle tamamlanıyor)

### Günün kelimesi
- [x] Aynı gün aynı cevap (saatten bağımsız)
- [x] Bitmiş günlük oyun **tekrar oynanamıyor**
- [x] **Serbest oyun günlük kaydı ezmiyor** (bu bir hataydı, düzeltildi)
- [x] Bir sonraki kelimeye geri sayım çalışıyor

### Responsive (8 ekran)
- [x] 320×568 (çok dar telefon) — yatay kaydırma yok
- [x] 360×640, 375×667, 393×852 (telefonlar)
- [x] 740×360 (telefon yatay)
- [x] 768×1024 (tablet)
- [x] 1366×768, 1920×1080 (masaüstü)
- [x] En dar ekranda bile tuşlar **≥46px** (44px dokunma eşiğinin üstünde)
- [x] Tahta her boyutta ortalı

### Erişilebilirlik
- [x] **Fare hiç kullanmadan** oyun bitirilebiliyor
- [x] Odak halkası her elemanda görünür (≥3px)
- [x] Ekran okuyucu her tahmini okuyor: *"K doğru yerde, A kelimede var..."*
- [x] Oyun sonucu ve doğru kelime duyuruluyor
- [x] Escape ile pencereler kapanıyor
- [x] Renk körü modu (mavi/turuncu) çalışıyor

### Kontrast (WCAG AA)
- [x] Koyu tema — 9 renk çifti
- [x] Açık tema — 9 renk çifti
- [x] Koyu + yüksek kontrast
- [x] Açık + yüksek kontrast

### Paylaşım
- [x] Emoji ızgarası sonuca birebir uyuyor
- [x] Metinde **hiç harf yok** (spoiler yok)
- [x] **HTTP üzerinde bile** panoya kopyalanıyor (yedek yöntem)

### Harf ve sözlük sistemi (`check:dictionary`)
- [x] Ekran klavyesinde **29 harfin hepsi** var ve tahtaya yazılıyor
- [x] Türkçe fiziksel klavyede 29 harfin hepsi tuşlanıyor
- [x] **Türkçe olmayan klavyede** (US QWERTY) `Ç Ğ Ö Ş Ü İ` tuşlanabiliyor (`event.code` konum eşlemesi)
- [x] `i` → `İ`, `Shift+I` → `I` (noktasız) ayrımı doğru
- [x] Oyuncu **istediği harf dizisini** yazabiliyor; doğrulama sadece ENTER'da
- [x] Çekimli biçimler kabul: `GELDİ` `OLSUN` `BABAM` `YERDE` `EVDEN` `ALDIM` `YOKTU` `ADINI` `MUSUN`
- [x] Uydurma diziler reddediliyor: `ZZZZZ` `ABCDE` `AAAAA` `ÇÇÇÇÇ`
- [x] Yazım hataları reddediliyor: `ALDİM` `SİMDİ` `DEGİL`
- [x] Kural dışı türetmeler reddediliyor: `MORAN` (isim + fiil eki), `JETER`
- [x] İngilizce özel adlar reddediliyor: `PETER` `FROST`

---

## 🐛 Geliştirme sırasında bulunan ve düzeltilen hatalar

| # | Hata | Nasıl bulundu |
| --- | --- | --- |
| 1 | **Boş sayfa** — `base-href` yanlış, JS 404 alıyordu | Canlıda gözlendi |
| 2 | **Serbest oyun günlük kaydı eziyordu** → günlük tekrar oynanabiliyordu | Kod incelemesi |
| 3 | **"Tekrar oyna" günlük modda aynı kelimeyi veriyordu** | Kod incelemesi |
| 4 | **HTTP'de kopyalama hiç çalışmıyordu** (`navigator.clipboard` yok) | Gerçek tarayıcı testi |
| 5 | **Açık temada kutular okunmuyordu** (kontrast 2.25:1) | WCAG ölçümü |
| 6 | **Açılışta koyu tema flaşı** (FOUC) | Kod incelemesi |
| 7 | **Kazanma zıplaması hiç oynamıyordu** (CSS özgüllük çakışması) | Kod incelemesi |
| 8 | **Flip sahteydi** — renk anında değişiyordu | Görsel inceleme |
| 9 | **Ekran okuyucu durumu okumuyordu** — oyun görme engelliler için oynanamazdı | Erişilebilirlik denetimi |
| 10 | **Renk körleri oynayamıyordu** — bilgi sadece yeşil/sarı ayrımında | Erişilebilirlik denetimi |
| 11 | **Çift ENTER** → yanlış "5 harf girin" uyarısı | Kenar durum incelemesi |
| 12 | **Bozuk kelime listesi** oyunu çökertiyordu | Kenar durum incelemesi |
| 13 | **Frekans listesi üzerine yazılıyordu** — korpus `şimdi`/`Şimdi`/`ŞİMDİ` satırlarını ayrı tutar ve sıklığa göre azalan sıralıdır; `Map.set` ile en *nadir* varyant kazanıyordu. `ŞİMDİ`nin sayısı 500.000 yerine **2** görünüyordu, bu da hem eşik denetimini hem yazım hatası oranını çürütüyordu. Toplama yapılacak şekilde düzeltildi | Sözlük testi (`SİMDİ` kabul ediliyordu) |
| 14 | **Fiil ekleri isim köküne yapışıyordu** — `MOR`+`-an` → `MORAN`, `JET`+`-er` → `JETER` sözlüğe sızıyordu. Köklere sözcük türü etiketi eklendi | Kabul edilenlerin gözden geçirilmesi |
| 15 | **Ek sırası denetlenmiyordu** — `MOR`+`-a`(hâl)+`-n`(iyelik) gibi imkânsız türetmeler geçiyordu. Türkçede sıra kök→çoğul→iyelik→hâl; ihlal eden çözümlemeler elendi | Kabul edilenlerin gözden geçirilmesi |
| 16 | **Ek-fiil yalnızca fiile geliyordu** — `YOKTU` `ZORDU` `GÜNDÜ` `BENSE` haksız yere reddediliyordu; ek-fiil isme de gelir | Reddedilenlerin sıklığa göre incelenmesi |
| 17 | **Türkçe olmayan klavyede 6 harf yazılamıyordu** — US QWERTY'de `Ç Ğ Ö Ş Ü İ` tuşu yok; `event.code` konum eşlemesi eklendi | Alfabe denetimi |
| 18 | **"Sonucu Paylaş" butonu bembeyaz çıkıyordu** — `--accent-2` CSS değişkeni hiç tanımlanmamıştı; geçersiz `linear-gradient` sessizce düşünce buton tarayıcının varsayılan rengine kalıyordu | Ekran görüntüsü incelemesi |
| 19 | **Buton yazıları WCAG'ı geçmiyordu** — beyaz yazı ham vurgu renginde **3.07:1**, koyu yazı koyulaştırılmış yeşilde **3.21:1** (AA normal metin için 4.5 ister; 14px kalın "büyük metin" sayılmaz). Gradyan uçları düz hex değişkenlere çevrilip koyulaştırıldı, yeşil buton düz renge alındı → 4.78 / 4.86 / 6.35. `contrast-check` artık bu üç çifti de ölçüyor | Kontrast ölçümü |

---

## Elle test edilmesi önerilenler

Otomatik testlerin kapsamadığı, insan gözü isteyen kısımlar:

- [ ] Gerçek bir telefonda dokunma hissi (tuş boyutu, gecikme)
- [ ] Gerçek bir ekran okuyucuyla (NVDA / VoiceOver) dinleme
- [ ] Animasyonların "hızlı mı, yavaş mı" hissi
- [ ] Kelime havuzunun genişletilmesi (şu an 205 kelime)
